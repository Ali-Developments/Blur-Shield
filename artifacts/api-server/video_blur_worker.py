#!/usr/bin/env python3
"""
Video Privacy Protection Worker
Offline AI-powered face and body blurring for videos
"""

import argparse
import json
import logging
import sys
import time
import subprocess
import tempfile
import shutil
import signal
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any, Union, Iterator
from dataclasses import dataclass, field
from enum import Enum
from collections import deque

import cv2
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / 'models'

try:
    import onnxruntime as ort
except ImportError:
    ort = None

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

try:
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
except ImportError:
    mp = None
    python = None
    vision = None


def is_tool_available(name: str) -> bool:
    """Return True if an external CLI tool is available on PATH."""
    try:
        subprocess.run([name, '-version'], capture_output=True, text=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DetectorType(Enum):
    """Available detector types"""
    YUNET = "yunet"
    YOLO_FACE = "yolo_face"
    YOLO_PERSON = "yolo_person"
    YOLO_SEGMENT = "yolo_segment"
    MEDIAPIPE = "mediapipe"
    MEDIAPIPE_SEGMENT = "mediapipe_segment"
    OPENCV_SSD = "opencv_ssd"
    HAAR_CASCADE = "haar_cascade"
    HOG = "hog"
    HOG_HEAD = "hog_head"


@dataclass
class Detection:
    """Represents a detected object"""
    x: int
    y: int
    width: int
    height: int
    confidence: float
    class_name: str
    detector_type: DetectorType
    tracker_id: Optional[int] = None
    mask: Optional[np.ndarray] = field(default=None, repr=False)

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def center(self) -> Tuple[int, int]:
        return (self.x + self.width // 2, self.y + self.height // 2)


@dataclass
class Track:
    """Track state for an object tracker"""
    id: int
    bbox: Tuple[int, int, int, int]
    tracker: Any
    confidence: float
    detector_type: DetectorType
    class_name: str = 'face'
    missed_frames: int = 0
    last_seen: int = 0

    @property
    def x(self) -> int:
        return self.bbox[0]

    @property
    def y(self) -> int:
        return self.bbox[1]

    @property
    def width(self) -> int:
        return self.bbox[2]

    @property
    def height(self) -> int:
        return self.bbox[3]


@dataclass
class VideoMetadata:
    """Video metadata"""
    path: Path
    width: int
    height: int
    fps: float
    total_frames: int
    duration: float
    codec: str
    has_audio: bool = False

    @property
    def resolution(self) -> str:
        return f"{self.width}x{self.height}"


@dataclass
class ProcessingStats:
    """Processing statistics"""
    total_frames: int = 0
    processed_frames: int = 0
    faces_detected: int = 0
    people_detected: int = 0
    start_time: float = 0.0
    end_time: float = 0.0
    last_update_time: float = 0.0
    
    @property
    def elapsed_time(self) -> float:
        return self.end_time - self.start_time
    
    @property
    def average_fps(self) -> float:
        if self.elapsed_time > 0:
            return self.processed_frames / self.elapsed_time
        return 0.0
    
    @property
    def remaining_estimate(self) -> float:
        if self.processed_frames > 0 and self.total_frames > 0:
            elapsed = time.time() - self.start_time
            fps = self.processed_frames / elapsed if elapsed > 0 else 0
            if fps > 0:
                remaining_frames = self.total_frames - self.processed_frames
                return remaining_frames / fps
        return 0.0


class ModelCache:
    """Lazy-loaded model cache"""
    _instance = None
    _models: Dict[str, Any] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @classmethod
    def get_model(cls, key: str, loader: callable) -> Any:
        """Get or load a model"""
        if key not in cls._models:
            try:
                cls._models[key] = loader()
                logger.info(f"Loaded model: {key}")
            except Exception as e:
                logger.warning(f"Failed to load model {key}: {e}")
                cls._models[key] = None
        return cls._models[key]


class BaseDetector:
    """Base detector class"""
    
    def __init__(self, detector_type: DetectorType, confidence_threshold: float = 0.5):
        self.detector_type = detector_type
        self.confidence_threshold = confidence_threshold
        self._initialized = False
    
    def initialize(self) -> bool:
        """Initialize the detector"""
        raise NotImplementedError
    
    def detect(self, frame: np.ndarray) -> List[Detection]:
        """Detect objects in frame"""
        raise NotImplementedError
    
    def is_available(self) -> bool:
        """Check if detector is available"""
        return self._initialized


class YOLOFaceDetector(BaseDetector):
    """YOLOv8 Face Detector"""
    
    def __init__(self, model_path: Path, confidence_threshold: float = 0.5):
        super().__init__(DetectorType.YOLO_FACE, confidence_threshold)
        self.model_path = model_path
        self.model = None
    
    def initialize(self) -> bool:
        if YOLO is None:
            logger.warning("YOLO not installed")
            return False
        
        if not self.model_path.exists():
            logger.warning(f"YOLO face model not found: {self.model_path}")
            return False
        
        try:
            self.model = YOLO(str(self.model_path))
            self._initialized = True
            logger.info(f"YOLO Face detector initialized from {self.model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load YOLO face model: {e}")
            return False
    
    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized or self.model is None:
            return []
        
        detections = []
        try:
            results = self.model(frame, conf=self.confidence_threshold, verbose=False)
            if results and len(results) > 0:
                boxes = results[0].boxes
                if boxes is not None:
                    for box in boxes:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        conf = float(box.conf[0].cpu().numpy())
                        if conf >= self.confidence_threshold:
                            detections.append(Detection(
                                x=x1,
                                y=y1,
                                width=x2 - x1,
                                height=y2 - y1,
                                confidence=conf,
                                class_name="face",
                                detector_type=self.detector_type
                            ))
        except Exception as e:
            logger.error(f"YOLO face detection failed: {e}")
        
        return detections


class YOLOPersonDetector(BaseDetector):
    """YOLOv8 Person Detector"""
    
    def __init__(self, model_path: Path, confidence_threshold: float = 0.5):
        super().__init__(DetectorType.YOLO_PERSON, confidence_threshold)
        self.model_path = model_path
        self.model = None
    
    def initialize(self) -> bool:
        if YOLO is None:
            logger.warning("YOLO not installed")
            return False
        
        if not self.model_path.exists():
            logger.warning(f"YOLO person model not found: {self.model_path}")
            return False
        
        try:
            self.model = YOLO(str(self.model_path))
            self._initialized = True
            logger.info(f"YOLO Person detector initialized from {self.model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load YOLO person model: {e}")
            return False
    
    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized or self.model is None:
            return []
        
        detections = []
        try:
            results = self.model(frame, conf=self.confidence_threshold, verbose=False)
            if results and len(results) > 0:
                boxes = results[0].boxes
                if boxes is not None:
                    for box in boxes:
                        class_id = int(box.cls[0].cpu().numpy())
                        if class_id == 0:  # Person class
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                            conf = float(box.conf[0].cpu().numpy())
                            if conf >= self.confidence_threshold:
                                detections.append(Detection(
                                    x=x1,
                                    y=y1,
                                    width=x2 - x1,
                                    height=y2 - y1,
                                    confidence=conf,
                                    class_name="person",
                                    detector_type=self.detector_type
                                ))
        except Exception as e:
            logger.error(f"YOLO person detection failed: {e}")
        
        return detections


class YOLOSegmentationDetector(BaseDetector):
    """YOLOv8 Segmentation Detector for person masks."""

    def __init__(self, model_path: Union[Path, str], confidence_threshold: float = 0.5):
        super().__init__(DetectorType.YOLO_SEGMENT, confidence_threshold)
        self.model_path = model_path
        self.model = None

    def initialize(self) -> bool:
        if YOLO is None:
            logger.warning("YOLO not installed; segmentation unavailable")
            return False

        try:
            self.model = YOLO(str(self.model_path))
            self._initialized = True
            logger.info(f"YOLO segmentation model initialized from {self.model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load YOLO segmentation model: {e}")
            return False

    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized or self.model is None:
            return []

        detections: List[Detection] = []
        try:
            results = self.model(frame, classes=0, conf=self.confidence_threshold, verbose=False)
            if not results or len(results) == 0:
                return []

            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue

                classes = boxes.cls.cpu().numpy() if hasattr(boxes.cls, 'cpu') else np.array(boxes.cls)
                xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, 'cpu') else np.array(boxes.xyxy)
                confs = boxes.conf.cpu().numpy() if hasattr(boxes.conf, 'cpu') else np.array(boxes.conf)

                for idx, cls_id in enumerate(classes):
                    if int(cls_id) != 0:
                        continue
                    conf = float(confs[idx])
                    if conf < self.confidence_threshold:
                        continue
                    x1, y1, x2, y2 = xyxy[idx].astype(int)
                    detections.append(Detection(
                        x=x1,
                        y=y1,
                        width=max(1, x2 - x1),
                        height=max(1, y2 - y1),
                        confidence=conf,
                        class_name="person",
                        detector_type=self.detector_type
                    ))
        except Exception as e:
            logger.error(f"YOLO segmentation detect failed: {repr(e)}")

        return detections

    def segment(self, frame: np.ndarray) -> Optional[np.ndarray]:
        if not self._initialized or self.model is None:
            return None

        try:
            results = self.model(frame, classes=0, conf=self.confidence_threshold, verbose=False)
            if not results or len(results) == 0:
                return None

            mask_accum = None
            for result in results:
                boxes = result.boxes
                masks = result.masks
                if masks is None or getattr(masks, 'data', None) is None:
                    continue

                classes = boxes.cls.cpu().numpy() if hasattr(boxes.cls, 'cpu') else np.array(boxes.cls)
                mask_data = masks.data
                if hasattr(mask_data, 'cpu'):
                    mask_data = mask_data.cpu().numpy()
                else:
                    mask_data = np.asarray(mask_data)

                if mask_data.ndim == 3:
                    for idx in range(mask_data.shape[0]):
                        if int(classes[idx]) != 0:
                            continue
                        mask = mask_data[idx].astype(np.float32)
                        if mask_accum is None:
                            mask_accum = mask
                        else:
                            mask_accum = np.maximum(mask_accum, mask)
                elif mask_data.ndim == 2 and int(classes[0]) == 0:
                    mask_accum = mask_data.astype(np.float32)

            if mask_accum is None:
                return None

            height, width = frame.shape[:2]
            if mask_accum.shape[:2] != (height, width):
                mask_accum = cv2.resize(mask_accum, (width, height), interpolation=cv2.INTER_LINEAR)

            return np.clip(mask_accum, 0.0, 1.0)

        except Exception as e:
            logger.error(f"YOLO segmentation failed: {e}")
            return None


class MediaPipeFaceDetector(BaseDetector):
    """MediaPipe Face Detector"""
    
    def __init__(self, model_path: Optional[Path], confidence_threshold: float = 0.5):
        super().__init__(DetectorType.MEDIAPIPE, confidence_threshold)
        self.model_path = model_path
        self.detector = None
        self.use_solutions = False
    
    def initialize(self) -> bool:
        if mp is None:
            logger.warning("MediaPipe not installed")
            return False

        if hasattr(mp, 'solutions') and hasattr(mp.solutions, 'face_detection'):
            try:
                FaceDetection = mp.solutions.face_detection.FaceDetection
                self.detector = FaceDetection(
                    model_selection=0,
                    min_detection_confidence=self.confidence_threshold
                )
                self.use_solutions = True
                self._initialized = True
                logger.info("MediaPipe solutions face_detection initialized")
                return True
            except Exception as e:
                logger.warning(f"MediaPipe solutions face_detection failed: {e}")

        if python is not None and vision is not None and self.model_path is not None:
            if not self.model_path.exists():
                logger.warning(f"MediaPipe model not found: {self.model_path}")
                return False
            try:
                base_options = python.BaseOptions(model_asset_path=str(self.model_path))
                options = vision.FaceLandmarkerOptions(
                    base_options=base_options,
                    output_face_blendshapes=True,
                    output_facial_transformation_matrixes=True,
                    num_faces=5
                )
                self.detector = vision.FaceLandmarker.create_from_options(options)
                self._initialized = True
                logger.info(f"MediaPipe detector initialized from {self.model_path}")
                return True
            except Exception as e:
                logger.error(f"Failed to load MediaPipe model: {e}")
                return False

        logger.warning("No supported MediaPipe face detection API available")
        return False
    
    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized or self.detector is None:
            return []
        
        detections = []
        try:
            h, w = frame.shape[:2]
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            if self.use_solutions:
                results = self.detector.process(rgb_frame)
                if results is None or not getattr(results, 'detections', None):
                    return []
                for detection in results.detections:
                    bbox = detection.location_data.relative_bounding_box
                    x_min = int(max(0, bbox.xmin) * w)
                    y_min = int(max(0, bbox.ymin) * h)
                    box_w = int(min(1.0, bbox.width) * w)
                    box_h = int(min(1.0, bbox.height) * h)
                    x_max = min(w, x_min + box_w)
                    y_max = min(h, y_min + box_h)
                    pad_w = int(box_w * 0.1)
                    pad_h = int(box_h * 0.1)
                    x_min = max(0, x_min - pad_w)
                    y_min = max(0, y_min - pad_h)
                    x_max = min(w, x_max + pad_w)
                    y_max = min(h, y_max + pad_h)
                    detections.append(Detection(
                        x=x_min,
                        y=y_min,
                        width=max(1, x_max - x_min),
                        height=max(1, y_max - y_min),
                        confidence=float(getattr(detection, 'score', [self.confidence_threshold])[0]),
                        class_name="face",
                        detector_type=self.detector_type
                    ))
            else:
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                result = self.detector.detect(mp_image)
                if result and result.face_landmarks:
                    for landmarks in result.face_landmarks:
                        x_coords = [lm.x for lm in landmarks]
                        y_coords = [lm.y for lm in landmarks]
                        x_min = int(min(x_coords) * w)
                        x_max = int(max(x_coords) * w)
                        y_min = int(min(y_coords) * h)
                        y_max = int(max(y_coords) * h)
                        pad_w = int((x_max - x_min) * 0.2)
                        pad_h = int((y_max - y_min) * 0.2)
                        x_min = max(0, x_min - pad_w)
                        x_max = min(w, x_max + pad_w)
                        y_min = max(0, y_min - pad_h)
                        y_max = min(h, y_max + pad_h)
                        detections.append(Detection(
                            x=x_min,
                            y=y_min,
                            width=x_max - x_min,
                            height=y_max - y_min,
                            confidence=0.9,
                            class_name="face",
                            detector_type=self.detector_type
                        ))
        except Exception as e:
            logger.error(f"MediaPipe detection failed: {e}")
        
        return detections


class MediaPipeSelfieSegmenter(BaseDetector):
    """MediaPipe Image Segmenter for full-body masks."""

    def __init__(self, confidence_threshold: float = 0.5):
        super().__init__(DetectorType.MEDIAPIPE_SEGMENT, confidence_threshold)
        self.segmenter = None
        self.use_solutions = False

    def initialize(self) -> bool:
        if mp is None:
            logger.warning("MediaPipe not installed; selfie segmentation unavailable")
            return False

        if python is not None and vision is not None and hasattr(vision, 'ImageSegmenter'):
            try:
                base_options = python.BaseOptions()
                options = vision.ImageSegmenterOptions(
                    base_options=base_options,
                    output_confidence_masks=True,
                )
                self.segmenter = vision.ImageSegmenter.create_from_options(options)
                self._initialized = True
                logger.info("MediaPipe ImageSegmenter initialized")
                return True
            except Exception as e:
                logger.warning(f"MediaPipe ImageSegmenter initialization failed: {e}")

        logger.warning("No supported MediaPipe ImageSegmenter API available")
        return False

    def segment(self, frame: np.ndarray) -> Optional[np.ndarray]:
        if not self._initialized or self.segmenter is None:
            return None

        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result = self.segmenter.segment(mp_image)
            if result is None or getattr(result, 'confidence_mask', None) is None:
                return None

            mask = np.array(result.confidence_mask, dtype=np.float32)
            height, width = frame.shape[:2]
            if mask.shape[:2] != (height, width):
                mask = cv2.resize(mask, (width, height), interpolation=cv2.INTER_LINEAR)
            return np.clip(mask, 0.0, 1.0)
        except Exception as e:
            logger.error(f"Image segmentation failed: {e}")
            return None


class OpenCVSSDDetector(BaseDetector):
    """OpenCV SSD Face Detector"""
    
    def __init__(self, prototxt_path: Path, model_path: Path, confidence_threshold: float = 0.5):
        super().__init__(DetectorType.OPENCV_SSD, confidence_threshold)
        self.prototxt_path = prototxt_path
        self.model_path = model_path
        self.net = None
    
    def initialize(self) -> bool:
        if not self.prototxt_path.exists():
            logger.warning(f"SSD prototxt not found: {self.prototxt_path}")
            return False
        
        if not self.model_path.exists():
            logger.warning(f"SSD model not found: {self.model_path}")
            return False
        
        try:
            self.net = cv2.dnn.readNetFromCaffe(
                str(self.prototxt_path),
                str(self.model_path)
            )
            self._initialized = True
            logger.info(f"OpenCV SSD detector initialized")
            return True
        except Exception as e:
            logger.error(f"Failed to load SSD model: {e}")
            return False
    
    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized or self.net is None:
            return []
        
        detections = []
        try:
            h, w = frame.shape[:2]
            blob = cv2.dnn.blobFromImage(
                cv2.resize(frame, (300, 300)),
                1.0,
                (300, 300),
                (104.0, 177.0, 123.0)
            )
            self.net.setInput(blob)
            detections_result = self.net.forward()
            logger.info(f"OpenCV SSD raw detections shape: {detections_result.shape}")
            
            for i in range(detections_result.shape[2]):
                confidence = detections_result[0, 0, i, 2]
                if confidence > self.confidence_threshold:
                    box = detections_result[0, 0, i, 3:7] * np.array([w, h, w, h])
                    x1, y1, x2, y2 = box.astype(int)
                    detections.append(Detection(
                        x=x1,
                        y=y1,
                        width=x2 - x1,
                        height=y2 - y1,
                        confidence=float(confidence),
                        class_name="face",
                        detector_type=self.detector_type
                    ))
        except Exception as e:
            logger.error(f"SSD detection failed: {e}")
        
        return detections


class YuNetFaceDetector(BaseDetector):
    """YuNet face detector using ONNXRuntime or OpenCV FaceDetectorYN."""

    def __init__(self, model_path: Path, confidence_threshold: float = 0.5, input_size: Tuple[int, int] = (320, 320)):
        super().__init__(DetectorType.YUNET, confidence_threshold)
        self.model_path = model_path
        self.detector = None
        self.session = None
        self.input_name = None
        self.nms_threshold = 0.3
        self.input_size = input_size
        self.top_k = 100
        self.use_onnxruntime = False
        self.use_opencv = False

    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        blob = cv2.dnn.blobFromImage(image, scalefactor=1.0, size=(image.shape[1], image.shape[0]), mean=(0, 0, 0), swapRB=False, crop=False)
        return blob.astype(np.float32)

    def _generate_priors(self, input_size: Tuple[int, int]) -> np.ndarray:
        w, h = input_size
        feature_map_2th = [int(int((h + 1) / 2) / 2), int(int((w + 1) / 2) / 2)]
        feature_map_3th = [int(feature_map_2th[0] / 2), int(feature_map_2th[1] / 2)]
        feature_map_4th = [int(feature_map_3th[0] / 2), int(feature_map_3th[1] / 2)]
        feature_map_5th = [int(feature_map_4th[0] / 2), int(feature_map_4th[1] / 2)]
        feature_map_6th = [int(feature_map_5th[0] / 2), int(feature_map_5th[1] / 2)]

        feature_maps = [feature_map_3th, feature_map_4th, feature_map_5th, feature_map_6th]
        min_sizes = [[10, 16, 24], [32, 48], [64, 96], [128, 192, 256]]
        steps = [8, 16, 32, 64]
        priors = []

        for k, f in enumerate(feature_maps):
            step = steps[k]
            for i in range(f[0]):
                for j in range(f[1]):
                    for min_size in min_sizes[k]:
                        s_kx = min_size / w
                        s_ky = min_size / h
                        cx = (j + 0.5) * step / w
                        cy = (i + 0.5) * step / h
                        priors.append([cx, cy, s_kx, s_ky])

        return np.array(priors, dtype=np.float32)

    def _decode(self, outputs: List[np.ndarray], input_size: Tuple[int, int]) -> np.ndarray:
        loc, conf, iou = outputs
        if loc.ndim == 3 and loc.shape[0] == 1:
            loc = np.squeeze(loc, axis=0)
        if conf.ndim == 3 and conf.shape[0] == 1:
            conf = np.squeeze(conf, axis=0)
        if iou.ndim == 3 and iou.shape[0] == 1:
            iou = np.squeeze(iou, axis=0)

        scores = np.sqrt(np.clip(conf[:, 1], 0.0, 1.0) * np.clip(iou[:, 0], 0.0, 1.0))
        priors = self._generate_priors(input_size)
        scale = np.array(input_size, dtype=np.float32)

        bboxes = np.hstack((
            (priors[:, 0:2] + loc[:, 4:6] * 0.1 * priors[:, 2:4]) * scale,
            (priors[:, 0:2] + loc[:, 6:8] * 0.1 * priors[:, 2:4]) * scale,
            (priors[:, 0:2] + loc[:, 10:12] * 0.1 * priors[:, 2:4]) * scale,
            (priors[:, 0:2] + loc[:, 12:14] * 0.1 * priors[:, 2:4]) * scale
        ))

        return np.hstack((bboxes, scores[:, np.newaxis]))

    def _nms(self, dets: np.ndarray, iou_threshold: float = 0.3) -> np.ndarray:
        if dets.size == 0:
            return np.empty((0, dets.shape[1]), dtype=np.float32)

        x_coords = dets[:, [0, 2, 4, 6]]
        y_coords = dets[:, [1, 3, 5, 7]]
        x1 = np.min(x_coords, axis=1)
        y1 = np.min(y_coords, axis=1)
        x2 = np.max(x_coords, axis=1)
        y2 = np.max(y_coords, axis=1)
        scores = dets[:, 8]

        areas = np.maximum(0.0, x2 - x1) * np.maximum(0.0, y2 - y1)
        order = scores.argsort()[::-1]
        keep = []

        while order.size > 0:
            i = order[0]
            keep.append(i)
            if order.size == 1:
                break
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h
            iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)

            inds = np.where(iou <= iou_threshold)[0]
            order = order[inds + 1]

        return dets[keep]

    def initialize(self) -> bool:
        if not self.model_path.exists():
            logger.warning(f"YuNet model not found: {self.model_path}")
            return False

        if ort is not None:
            try:
                self.session = ort.InferenceSession(str(self.model_path), providers=['CPUExecutionProvider'])
                self.input_name = self.session.get_inputs()[0].name
                self.use_onnxruntime = True
                self._initialized = True
                logger.info(f"YuNet ONNXRuntime initialized from {self.model_path}")
                return True
            except Exception as e:
                logger.warning(f"YuNet ONNXRuntime initialization failed: {e}")

        detector_creator = None
        if hasattr(cv2, 'FaceDetectorYN_create'):
            detector_creator = cv2.FaceDetectorYN_create
        elif hasattr(cv2.legacy, 'FaceDetectorYN_create'):
            detector_creator = cv2.legacy.FaceDetectorYN_create

        if detector_creator is None:
            logger.warning("YuNet face detector creation function not found")
            return False

        try:
            self.detector = detector_creator(
                str(self.model_path),
                '',
                self.input_size,
                self.confidence_threshold,
                0.4
            )
            self.use_opencv = True
            self._initialized = True
            logger.info(f"YuNet OpenCV FaceDetectorYN initialized from {self.model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize YuNet detector: {e}")
            return False

    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized:
            logger.debug("YuNet detection skipped because detector is not initialized")
            return []

        detections = []
        try:
            if self.use_onnxruntime and self.session is not None:
                input_blob = self._preprocess(frame)
                outputs = self.session.run(None, {self.input_name: input_blob})
                dets = self._decode(outputs, (frame.shape[1], frame.shape[0]))
                dets = dets[dets[:, 8] >= self.confidence_threshold]
                dets = self._nms(dets, iou_threshold=self.nms_threshold)
                for det_row in dets[:self.top_k]:
                    x1 = float(np.min(det_row[[0, 2, 4, 6]]))
                    y1 = float(np.min(det_row[[1, 3, 5, 7]]))
                    x2 = float(np.max(det_row[[0, 2, 4, 6]]))
                    y2 = float(np.max(det_row[[1, 3, 5, 7]]))
                    score = float(det_row[8])
                    x = int(max(0, x1))
                    y = int(max(0, y1))
                    w = int(min(frame.shape[1] - 1, x2) - x)
                    h = int(min(frame.shape[0] - 1, y2) - y)
                    if w > 0 and h > 0:
                        detections.append(Detection(
                            x=x,
                            y=y,
                            width=w,
                            height=h,
                            confidence=score,
                            class_name='face',
                            detector_type=self.detector_type
                        ))
                logger.info(f"YuNet ONNXRuntime detection returned {len(detections)} faces")
                return detections

            if self.use_opencv and self.detector is not None:
                if hasattr(self.detector, 'setInputSize'):
                    try:
                        self.detector.setInputSize((frame.shape[1], frame.shape[0]))
                    except Exception as e:
                        logger.warning(f"YuNet setInputSize failed during detection: {e}")
                result = self.detector.detect(frame)
                if result is None or len(result) == 0:
                    logger.info("YuNet detection returned zero faces")
                    return []
                for face in result:
                    x, y, w, h, score = [float(v) for v in face[:5]]
                    if score >= self.confidence_threshold:
                        detections.append(Detection(
                            x=int(x),
                            y=int(y),
                            width=int(w),
                            height=int(h),
                            confidence=float(score),
                            class_name='face',
                            detector_type=self.detector_type
                        ))
                logger.info(f"YuNet detection returned {len(detections)} faces")
                return detections

        except Exception as e:
            logger.error(f"YuNet detection failed: {e}")

        return detections


class HaarCascadeDetector(BaseDetector):
    """Haar Cascade Face Detector"""
    
    def __init__(self, cascade_path: Path, confidence_threshold: float = 0.5):
        super().__init__(DetectorType.HAAR_CASCADE, confidence_threshold)
        self.cascade_path = cascade_path
        self.cascade = None
    
    def initialize(self) -> bool:
        if not self.cascade_path.exists():
            logger.warning(f"Haar cascade not found: {self.cascade_path}")
            return False
        
        try:
            self.cascade = cv2.CascadeClassifier(str(self.cascade_path))
            self._initialized = True
            logger.info(f"Haar cascade detector initialized from {self.cascade_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load Haar cascade: {e}")
            return False
    
    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized or self.cascade is None:
            return []
        
        detections = []
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )
            
            for (x, y, w, h) in faces:
                detections.append(Detection(
                    x=x,
                    y=y,
                    width=w,
                    height=h,
                    confidence=0.8,
                    class_name="face",
                    detector_type=self.detector_type
                ))
        except Exception as e:
            logger.error(f"Haar cascade detection failed: {e}")
        
        return detections


class HOGPersonDetector(BaseDetector):
    """HOG Person Detector"""
    
    def __init__(self, confidence_threshold: float = 0.5):
        super().__init__(DetectorType.HOG, confidence_threshold)
        self.hog = None
        self.win_stride = (8, 8)
        self.padding = (8, 8)
        self.scale = 1.05
    
    def initialize(self) -> bool:
        try:
            self.hog = cv2.HOGDescriptor()
            self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            self._initialized = True
            logger.info("HOG person detector initialized")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize HOG detector: {e}")
            return False
    
    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized or self.hog is None:
            return []
        
        detections = []
        try:
            rects, weights = self.hog.detectMultiScale(
                frame,
                winStride=self.win_stride,
                padding=self.padding,
                scale=self.scale
            )
            
            for (x, y, w, h), weight in zip(rects, weights):
                if weight > self.confidence_threshold:
                    detections.append(Detection(
                        x=int(x),
                        y=int(y),
                        width=int(w),
                        height=int(h),
                        confidence=float(weight),
                        class_name="person",
                        detector_type=self.detector_type
                    ))
        except Exception as e:
            logger.error(f"HOG detection failed: {e}")
        
        return detections


class HeadApproximationDetector(BaseDetector):
    """Approximate face regions from detected person bounding boxes."""

    def __init__(self, confidence_threshold: float = 0.5):
        super().__init__(DetectorType.HOG_HEAD, confidence_threshold)
        self.person_detector = HOGPersonDetector(confidence_threshold)

    def initialize(self) -> bool:
        if self.person_detector.initialize():
            self._initialized = True
            logger.info("Head approximation detector initialized")
            return True
        return False

    def detect(self, frame: np.ndarray) -> List[Detection]:
        if not self._initialized:
            return []

        detections = []
        person_boxes = self.person_detector.detect(frame)

        for person in person_boxes:
            x, y, w, h = person.x, person.y, person.width, person.height
            face_height = max(30, int(h * 0.35))
            face_width = max(30, int(w * 0.55))
            face_x = x + max(0, int((w - face_width) / 2))
            face_y = y

            detections.append(Detection(
                x=face_x,
                y=face_y,
                width=face_width,
                height=face_height,
                confidence=person.confidence,
                class_name="face",
                detector_type=self.detector_type
            ))

        return detections


class DetectionPipeline:
    """Detection pipeline with automatic fallback"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.face_detectors: List[BaseDetector] = []
        self.person_detectors: List[BaseDetector] = []
        self.active_face_detector: Optional[BaseDetector] = None
        self.active_person_detector: Optional[BaseDetector] = None
        
        self._initialize_face_detectors()
        self._initialize_person_detectors()
        self._initialize_segmenter()
        
        # Activate first available detector
        self._activate_detectors()
    
    def _initialize_face_detectors(self):
        """Initialize face detectors in priority order."""
        confidence = self.config.get('confidence_threshold', 0.5)
        logger.info("Starting face detector initialization.")

        # Legacy face detectors are intentionally disabled in favor of segmentation-based blur.
        logger.info("Skipping legacy OpenCV/Haar/HOG/YuNet face detectors; using AI segmentation for full-body blur")

        # MediaPipe face detection may still be used if available for fallback on faces-only mode.
        if not self.config.get('disable_mediapipe', False):
            default_mediapipe = MODEL_DIR / 'face_landmarker.task'
            model_path = self.config.get('mediapipe_model', default_mediapipe)
            logger.info(f"Attempting MediaPipe face detector from {model_path if model_path is not None else 'built-in API'}")
            detector = MediaPipeFaceDetector(model_path, confidence)
            if detector.initialize():
                self.face_detectors.append(detector)
                logger.info("MediaPipe face detector loaded successfully")
            else:
                logger.warning("MediaPipe face detector failed to initialize")

        if not self.face_detectors:
            logger.warning("No face detectors available; face-only mode may not work, but fullBody segmentation can still be used")
    
    def _initialize_person_detectors(self):
        """Initialize body/person detectors for full-body blur fallback."""
        self.person_detectors = []
        self.active_person_detector = None
        confidence = self.config.get('confidence_threshold', 0.5)

        if not self.config.get('disable_yolo', False):
            default_yolo_person = 'yolov8n-seg.pt'
            model_path = self.config.get('yolo_person_model', default_yolo_person)
            detector = YOLOSegmentationDetector(model_path, confidence)
            if detector.initialize():
                self.person_detectors.append(detector)
                logger.info("YOLO segmentation detector loaded successfully")
            else:
                logger.warning("YOLO segmentation detector failed to initialize")

        if not self.person_detectors:
            logger.warning("No YOLO segmentation detector available; full-body blur will attempt MediaPipe selfie segmentation")

    def _initialize_segmenter(self):
        """Initialize MediaPipe selfie segmentation for full-body masks."""
        self.selfie_segmenter = None
        if self.config.get('disable_mediapipe', False):
            logger.info("MediaPipe selfie segmentation disabled by configuration")
            return

        detector = MediaPipeSelfieSegmenter(self.config.get('confidence_threshold', 0.5))
        if detector.initialize():
            self.selfie_segmenter = detector
            logger.info("MediaPipe selfie segmentation initialized")
        else:
            logger.warning("MediaPipe selfie segmentation not available")

    def _activate_detectors(self):
        """Activate the first available detector for each type"""
        for detector in self.face_detectors:
            if detector.is_available():
                self.active_face_detector = detector
                logger.info(f"Selected active face detector: {detector.detector_type.value}")
                break
        if self.active_face_detector is None:
            logger.warning("No active face detector could be selected; all face detectors are unavailable")
        else:
            available = [d.detector_type.value for d in self.face_detectors if d.is_available()]
            logger.info(f"Face detectors ready: {available}")

        for detector in self.person_detectors:
            if detector.is_available():
                self.active_person_detector = detector
                logger.info(f"Active person detector: {detector.detector_type.value}")
                break
    
    def detect_faces(self, frame: np.ndarray) -> List[Detection]:
        """Detect faces using active detector with fallback."""
        detector_names = [d.detector_type.value for d in self.face_detectors if d.is_available()]
        logger.debug(f"detect_faces: available detectors={detector_names}, active={self.active_face_detector.detector_type.value if self.active_face_detector else 'none'}")

        detections: List[Detection] = []
        detectors_to_try = []

        if self.active_face_detector and self.active_face_detector.is_available():
            detectors_to_try.append(self.active_face_detector)

        for detector in self.face_detectors:
            if detector is self.active_face_detector:
                continue
            if detector.is_available():
                detectors_to_try.append(detector)
        logger.debug(f"Face detectors to try in order: {[d.detector_type.value for d in detectors_to_try]}")

        if not detectors_to_try and self.face_detectors:
            logger.warning("detect_faces: active detector missing but face detectors are configured")
            for detector in self.face_detectors:
                if detector.is_available():
                    detectors_to_try.append(detector)

        if not detectors_to_try:
            logger.warning("detect_faces: no available face detectors")
            return []

        try:
            for detector in detectors_to_try:
                try:
                    detections = detector.detect(frame)
                except Exception as inner_error:
                    logger.error(f"Face detection failed for {detector.detector_type.value}: {inner_error}")
                    detections = []

                logger.info(f"Face detection with {detector.detector_type.value}: {len(detections)} faces")

                if detections:
                    if self.active_face_detector is not detector:
                        logger.info(f"Fallback detector selected: {detector.detector_type.value}")
                        self.active_face_detector = detector
                    return detections
        except Exception as e:
            logger.error(f"Face detection pipeline failed: {e}")

        return []
    
    def detect_people(self, frame: np.ndarray) -> List[Detection]:
        """Detect people using the active person detector with fallback."""
        detections: List[Detection] = []
        detectors_to_try = []

        if self.active_person_detector and self.active_person_detector.is_available():
            detectors_to_try.append(self.active_person_detector)

        for detector in self.person_detectors:
            if detector is self.active_person_detector:
                continue
            if detector.is_available():
                detectors_to_try.append(detector)

        for detector in detectors_to_try:
            try:
                detections = detector.detect(frame)
            except Exception as e:
                logger.error(f"Person detection failed for {detector.detector_type.value}: {e}")
                detections = []

            if detections:
                if self.active_person_detector is not detector:
                    logger.info(f"Fallback person detector selected: {detector.detector_type.value}")
                    self.active_person_detector = detector
                return detections

        logger.debug("No person detections found")
        return []

    def segment_mask(self, frame: np.ndarray) -> Optional[np.ndarray]:
        for detector in self.person_detectors:
            if isinstance(detector, YOLOSegmentationDetector) and detector.is_available():
                mask = detector.segment(frame)
                if mask is not None:
                    logger.debug("segment_mask: YOLO segmentation returned mask")
                    return mask

        if self.selfie_segmenter and self.selfie_segmenter.is_available():
            mask = self.selfie_segmenter.segment(frame)
            if mask is not None:
                logger.debug("segment_mask: MediaPipe selfie segmentation returned mask")
                return mask

        logger.debug("segment_mask: no segmentation mask available")
        return None


class ObjectTracker:
    """Object tracking using OpenCV trackers with re-detection and recovery."""
    
    def __init__(self, max_trackers: int = 50, max_missed_frames: int = 6, reid_iou_threshold: float = 0.25):
        self.tracks: Dict[int, Track] = {}
        self.tracker_id_counter = 0
        self.max_trackers = max_trackers
        self.max_missed_frames = max_missed_frames
        self.reid_iou_threshold = reid_iou_threshold
        self.min_confidence = 0.25
        self.smoothing_alpha = 0.55
        self.tracker_factories = [
            'TrackerCSRT_create',
            'TrackerKCF_create',
            'TrackerMOSSE_create',
            'TrackerMIL_create',
            'TrackerNano_create',
            'TrackerVit_create',
            'TrackerDaSiamRPN_create',
            'legacy.TrackerCSRT_create',
            'legacy.TrackerKCF_create',
            'legacy.TrackerMOSSE_create',
            'legacy.TrackerMIL_create',
            'legacy.TrackerNano_create',
            'legacy.TrackerVit_create',
            'legacy.TrackerDaSiamRPN_create'
        ]

    def _create_tracker(self) -> Optional[Any]:
        for name in self.tracker_factories:
            try:
                parts = name.split('.')
                creator = cv2
                for part in parts:
                    creator = getattr(creator, part)
                return creator()
            except Exception:
                continue
        return None

    def _iou(self, bbox_a: Tuple[int, int, int, int], bbox_b: Tuple[int, int, int, int]) -> float:
        ax, ay, aw, ah = bbox_a
        bx, by, bw, bh = bbox_b
        x1 = max(ax, bx)
        y1 = max(ay, by)
        x2 = min(ax + aw, bx + bw)
        y2 = min(ay + ah, by + bh)
        inter_w = max(0, x2 - x1)
        inter_h = max(0, y2 - y1)
        inter_area = inter_w * inter_h
        union_area = aw * ah + bw * bh - inter_area
        return inter_area / union_area if union_area > 0 else 0.0

    def _initialize_tracker(self, frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> Optional[Any]:
        tracker = self._create_tracker()
        if tracker is None:
            return None
        tracker.init(frame, bbox)
        return tracker

    def _smooth_bbox(self, previous: Tuple[int, int, int, int], current: Tuple[int, int, int, int]) -> Tuple[int, int, int, int]:
        prev_x, prev_y, prev_w, prev_h = previous
        curr_x, curr_y, curr_w, curr_h = current
        return (
            int(prev_x + (curr_x - prev_x) * self.smoothing_alpha),
            int(prev_y + (curr_y - prev_y) * self.smoothing_alpha),
            int(prev_w + (curr_w - prev_w) * self.smoothing_alpha),
            int(prev_h + (curr_h - prev_h) * self.smoothing_alpha),
        )

    def _register_track(self, frame: np.ndarray, detection: Detection) -> None:
        if len(self.tracks) >= self.max_trackers or detection.confidence < self.min_confidence:
            logger.debug(f"Skipping track registration: max_tracks={len(self.tracks)} min_conf={self.min_confidence} det_conf={detection.confidence}")
            return

        bbox = (detection.x, detection.y, detection.width, detection.height)
        tracker = None
        try:
            tracker = self._initialize_tracker(frame, bbox)
        except Exception as e:
            logger.debug(f"Failed to initialize tracker: {e}")

        track = Track(
            id=self.tracker_id_counter,
            bbox=bbox,
            tracker=tracker,
            confidence=detection.confidence,
            detector_type=detection.detector_type,
            class_name=detection.class_name,
            missed_frames=0,
            last_seen=0
        )
        detection.tracker_id = track.id
        self.tracks[track.id] = track
        self.tracker_id_counter += 1

    def reconcile_tracks(self, frame: np.ndarray, detections: List[Detection]) -> None:
        unmatched_detections = []
        available_tracks = list(self.tracks.values())

        for detection in detections:
            if detection.confidence < self.min_confidence:
                logger.debug(f"Skipping low-confidence detection: {detection.confidence}")
                continue

            best_track = None
            best_iou = 0.0
            target_bbox = (detection.x, detection.y, detection.width, detection.height)

            for track in available_tracks:
                iou_score = self._iou(track.bbox, target_bbox)
                dx = abs(track.bbox[0] - detection.x) + abs(track.bbox[1] - detection.y)
                distance_score = max(0.0, 1.0 - (dx / max(1, track.bbox[2] + track.bbox[3] + target_bbox[2] + target_bbox[3])))
                score = iou_score + (distance_score * 0.2)
                if score > best_iou:
                    best_track = track
                    best_iou = score

            if best_track and best_iou >= self.reid_iou_threshold:
                best_track.bbox = self._smooth_bbox(best_track.bbox, target_bbox)
                best_track.confidence = max(best_track.confidence, detection.confidence)
                best_track.detector_type = detection.detector_type
                best_track.missed_frames = 0
                best_track.last_seen = 0
                if best_track.tracker is None:
                    try:
                        best_track.tracker = self._initialize_tracker(frame, best_track.bbox)
                    except Exception as e:
                        logger.debug(f"Failed to initialize tracker for track {best_track.id}: {e}")
                available_tracks.remove(best_track)
            else:
                unmatched_detections.append(detection)

        for detection in unmatched_detections:
            self._register_track(frame, detection)

        self._cleanup_stale_tracks()

    def _cleanup_stale_tracks(self) -> None:
        stale_ids = [track_id for track_id, track in self.tracks.items()
                     if track.missed_frames > self.max_missed_frames]
        for track_id in stale_ids:
            del self.tracks[track_id]

    def update_tracks(self, frame: np.ndarray) -> List[Detection]:
        tracked = []
        for track_id, track in list(self.tracks.items()):
            try:
                if track.tracker is not None:
                    success, bbox = track.tracker.update(frame)
                    if success:
                        x, y, w, h = [int(v) for v in bbox]
                        logger.debug(f"Tracker {track_id} success bbox={x},{y},{w},{h}")
                        track.bbox = self._smooth_bbox(track.bbox, (x, y, w, h))
                        track.missed_frames = 0
                        track.last_seen += 1
                        tracked.append(Detection(
                            x=x,
                            y=y,
                            width=w,
                            height=h,
                            confidence=track.confidence,
                            class_name='face',
                            detector_type=track.detector_type,
                            tracker_id=track_id
                        ))
                    else:
                        track.missed_frames += 1
                        logger.info(f"Tracker {track_id} lost frame, missed_frames={track.missed_frames}")
                        if track.missed_frames <= self.max_missed_frames:
                            tracked.append(Detection(
                                x=track.bbox[0],
                                y=track.bbox[1],
                                width=track.bbox[2],
                                height=track.bbox[3],
                                confidence=track.confidence * 0.7,
                                class_name='face',
                                detector_type=track.detector_type,
                                tracker_id=track_id
                            ))
                else:
                    track.missed_frames += 1
                    logger.debug(f"No tracker object for track {track_id}; returning last known bbox")
                    if track.missed_frames <= self.max_missed_frames:
                        tracked.append(Detection(
                            x=track.bbox[0],
                            y=track.bbox[1],
                            width=track.bbox[2],
                            height=track.bbox[3],
                            confidence=track.confidence * 0.7,
                            class_name=track.class_name,
                            detector_type=track.detector_type,
                            tracker_id=track_id
                        ))
            except Exception as e:
                logger.debug(f"Tracker update failed for track {track_id}: {e}")
                track.missed_frames += 1

        self._cleanup_stale_tracks()
        return tracked

    def get_active_detections(self) -> List[Detection]:
        return [Detection(
            x=track.bbox[0],
            y=track.bbox[1],
            width=track.bbox[2],
            height=track.bbox[3],
            confidence=track.confidence,
            class_name=track.class_name,
            detector_type=track.detector_type,
            tracker_id=track.id
        ) for track in self.tracks.values() if track.missed_frames <= self.max_missed_frames]


class BlurEngine:
    """Blur engine for applying adaptive blur to validated face regions only."""
    
    def __init__(self, blur_strength: float = 1.0, confidence_threshold: float = 0.5):
        self.blur_strength = blur_strength
        self.confidence_threshold = confidence_threshold
        self.min_kernel = 9
        self.max_kernel = 199
    
    def apply_blur(self, frame: np.ndarray, detections: List[Detection], mask: Optional[np.ndarray] = None) -> np.ndarray:
        """Apply blur to either a mask or a list of detected regions."""
        if mask is not None:
            return self.apply_blur_mask(frame, mask)

        if not detections:
            logger.debug("apply_blur: no detections to blur")
            return frame
        
        output = frame.copy()
        
        for detection in detections:
            if detection.class_name not in {"face", "person"}:
                continue

            roi = self._prepare_roi(output, detection)
            if roi is None:
                logger.info(f"Blur skipped for detection with invalid ROI or low confidence: {detection}")
                continue

            x, y, w, h = roi
            logger.info(f"Applying blur ROI x={x} y={y} w={w} h={h} conf={detection.confidence} detector={detection.detector_type.value} class={detection.class_name}")
            size = min(w, h)
            kernel_size = int(size * 0.16 * self.blur_strength)
            kernel_size = max(self.min_kernel, min(self.max_kernel, kernel_size))
            kernel_size = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
            
            output = self._apply_blur_to_region(output, x, y, w, h, kernel_size)
        
        return output

    def apply_blur_mask(self, frame: np.ndarray, mask: np.ndarray) -> np.ndarray:
        if mask is None or mask.size == 0:
            logger.debug("apply_blur_mask: empty mask")
            return frame

        output = frame.copy()
        height, width = frame.shape[:2]
        mask_image = mask
        if mask_image.shape[:2] != (height, width):
            mask_image = cv2.resize(mask_image, (width, height), interpolation=cv2.INTER_LINEAR)

        binary_mask = (mask_image >= self.confidence_threshold).astype(np.uint8)
        if not np.any(binary_mask):
            logger.debug("apply_blur_mask: no mask region above threshold")
            return frame

        blurred = cv2.GaussianBlur(frame, (self.max_kernel, self.max_kernel), 0)
        alpha = cv2.GaussianBlur(binary_mask.astype(np.float32), (21, 21), 0)
        alpha = np.clip(alpha[..., None], 0.0, 1.0)

        output = (output.astype(np.float32) * (1.0 - alpha) + blurred.astype(np.float32) * alpha).astype(np.uint8)
        return output

    def _prepare_roi(self, frame: np.ndarray, detection: Detection) -> Optional[Tuple[int, int, int, int]]:
        """Validate a detection and expand it slightly without allowing oversized boxes."""
        if detection.confidence < self.confidence_threshold:
            return None
        if detection.width <= 0 or detection.height <= 0:
            return None

        height, width = frame.shape[:2]
        max_width = max(1, int(width * 0.6))
        max_height = max(1, int(height * 0.6))

        if detection.width > max_width or detection.height > max_height:
            logger.debug(
                "Skipping oversized object box: width=%s height=%s max=(%s,%s)",
                detection.width,
                detection.height,
                max_width,
                max_height,
            )
            return None

        x1 = int(detection.x)
        y1 = int(detection.y)
        x2 = int(detection.x + detection.width)
        y2 = int(detection.y + detection.height)

        x1 = max(0, min(x1, width - 1))
        y1 = max(0, min(y1, height - 1))
        x2 = max(x1 + 1, min(width, x2))
        y2 = max(y1 + 1, min(height, y2))

        roi_width = x2 - x1
        roi_height = y2 - y1
        if roi_width <= 0 or roi_height <= 0:
            return None

        pad_x = max(12, int(roi_width * 0.2))
        pad_y = max(12, int(roi_height * 0.2))

        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(width, x2 + pad_x)
        y2 = min(height, y2 + pad_y)

        return x1, y1, x2 - x1, y2 - y1
    
    def _apply_blur_to_region(
        self,
        frame: np.ndarray,
        x: int,
        y: int,
        w: int,
        h: int,
        kernel_size: int
    ) -> np.ndarray:
        """Apply blur to a specific ROI without spilling outside that region."""
        height, width = frame.shape[:2]
        
        x1 = max(0, min(x, width - 1))
        y1 = max(0, min(y, height - 1))
        x2 = max(x1 + 1, min(width, x1 + w))
        y2 = max(y1 + 1, min(height, y1 + h))
        
        if x2 <= x1 or y2 <= y1:
            return frame
        
        region = frame[y1:y2, x1:x2]
        if region.size == 0:
            return frame
        
        blurred = cv2.GaussianBlur(region, (kernel_size, kernel_size), 0)
        blurred = cv2.GaussianBlur(blurred, (kernel_size, kernel_size), 0)
        frame[y1:y2, x1:x2] = blurred
        
        return frame


class VideoProcessor:
    """Main video processing engine"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.detection_pipeline = DetectionPipeline(config)
        self.object_tracker = ObjectTracker(
            max_trackers=config.get('max_trackers', 50),
            max_missed_frames=config.get('tracking_max_misses', 6),
            reid_iou_threshold=config.get('tracking_reid_iou', 0.25)
        )
        self.blur_engine = BlurEngine(
            config.get('blur_strength', 1.0),
            config.get('confidence_threshold', 0.5)
        )
        self.stats = ProcessingStats()
        self.temp_dir: Optional[Path] = None
        self.temp_video_path: Optional[Path] = None
        self.temp_audio_path: Optional[Path] = None
    
    def get_video_metadata(self, video_path: Path) -> VideoMetadata:
        """Extract video metadata"""
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")
        
        try:
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames / fps if fps > 0 else 0
            codec = int(cap.get(cv2.CAP_PROP_FOURCC))
            codec_str = "".join([chr((codec >> 8 * i) & 0xFF) for i in range(4)])
            
            if not self.config.get('ffprobe_available', False):
                logger.error("ffprobe unavailable; cannot determine audio track presence. Install ffprobe and ensure it is on PATH.")
                has_audio = False
            else:
                has_audio = self._check_audio(video_path)

            return VideoMetadata(
                path=video_path,
                width=width,
                height=height,
                fps=fps,
                total_frames=total_frames,
                duration=duration,
                codec=codec_str,
                has_audio=has_audio
            )
        finally:
            cap.release()
    
    def _check_audio(self, video_path: Path) -> bool:
        """Check if video has audio track"""
        try:
            cmd = ['ffprobe', '-v', 'error', '-select_streams', 'a:0', 
                   '-show_entries', 'stream=codec_type', '-of', 'default=noprint_wrappers=1:nokey=1',
                   str(video_path)]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return bool(result.stdout.strip())
        except:
            return False
    
    def extract_audio(self, video_path: Path, output_path: Path) -> bool:
        """Extract audio from video"""
        if not self.config.get('ffmpeg_available', False):
            logger.error("ffmpeg unavailable; cannot extract audio. Install ffmpeg and ensure it is on PATH.")
            return False

        try:
            cmd = [
                'ffmpeg',
                '-i', str(video_path),
                '-vn',
                '-acodec', 'pcm_s16le',
                '-ar', '44100',
                '-ac', '2',
                str(output_path),
                '-y'
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            return True
        except Exception as e:
            logger.warning(f"Failed to extract audio: {e}")
            return False
    
    def merge_audio(self, video_path: Path, audio_path: Path, output_path: Path) -> bool:
        """Merge audio back into video"""
        if not self.config.get('ffmpeg_available', False):
            logger.error("ffmpeg unavailable; cannot merge audio. Install ffmpeg and ensure it is on PATH.")
            return False

        try:
            cmd = [
                'ffmpeg',
                '-i', str(video_path),
                '-i', str(audio_path),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-shortest',
                '-y',
                str(output_path)
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            return True
        except Exception as e:
            logger.warning(f"Failed to merge audio: {e}")
            return False
    
    def update_status(self, status_path: Path, stage: str, progress: int, message: str):
        """Update progress status file"""
        status = {
            "stage": stage,
            "progress": progress,
            "message": message,
            "frames_processed": self.stats.processed_frames,
            "total_frames": self.stats.total_frames,
            "fps": round(self.stats.average_fps, 2),
            "elapsed_time": round(self.stats.elapsed_time, 2),
            "remaining_time": round(self.stats.remaining_estimate, 2)
        }
        
        try:
            with open(status_path, 'w') as f:
                json.dump(status, f)
        except Exception as e:
            logger.error(f"Failed to write status file: {e}")
    
    def _matches_target(self, detection: Detection) -> bool:
        target = self.config.get('target', 'everyone')
        if target == 'everyone':
            return True
        # Gender classification is not available in this pipeline yet.
        logger.debug("Target filtering requested (%s) but gender classification is unavailable; blurring all detections", target)
        return True

    def process_frame(self, frame: np.ndarray, frame_idx: int) -> np.ndarray:
        """Process a single frame"""
        method = self.config.get('method', 'faces')
        detection_interval = max(1, self.config.get('frame_step', 2))
        detections: List[Detection] = []
        mask: Optional[np.ndarray] = None

        if method == 'fullBody':
            mask = self.detection_pipeline.segment_mask(frame)
            if mask is not None:
                logger.info(f"Frame {frame_idx}: segmentation mask obtained for full-body blur")
            else:
                detections = self.detection_pipeline.detect_people(frame)
                self.stats.people_detected += len(detections)
                logger.info(f"Frame {frame_idx}: detected {len(detections)} person(s) for full-body blur")
                detections = [d for d in detections if self._matches_target(d)]

            if not mask and not detections:
                faces = self.detection_pipeline.detect_faces(frame)
                self.stats.faces_detected += len(faces)
                logger.info(f"Frame {frame_idx}: fallback face detection returned {len(faces)} faces")
                self.object_tracker.reconcile_tracks(frame, faces)
                detections = self.object_tracker.get_active_detections()
                if not detections and faces:
                    detections = faces
                logger.info(f"Frame {frame_idx}: active tracks after fallback reconcile {len(detections)}")
        else:
            if frame_idx % detection_interval == 0:
                faces = self.detection_pipeline.detect_faces(frame)
                self.stats.faces_detected += len(faces)
                self.stats.people_detected += 0
                logger.info(f"Frame {frame_idx}: detected {len(faces)} face(s) by detection pass")
                self.object_tracker.reconcile_tracks(frame, faces)
                detections = self.object_tracker.get_active_detections()
                if not detections and faces:
                    detections = faces
                logger.info(f"Frame {frame_idx}: active tracks after reconcile {len(detections)}")
            else:
                detections = self.object_tracker.update_tracks(frame)
                logger.info(f"Frame {frame_idx}: tracker returned {len(detections)} detections")
                if not detections and frame_idx % (detection_interval * 2) == 0:
                    faces = self.detection_pipeline.detect_faces(frame)
                    self.stats.faces_detected += len(faces)
                    self.stats.people_detected += 0
                    logger.info(f"Frame {frame_idx}: fallback detection pass returned {len(faces)} faces")
                    self.object_tracker.reconcile_tracks(frame, faces)
                    detections = self.object_tracker.get_active_detections()
                    if not detections and faces:
                        detections = faces
                    logger.info(f"Frame {frame_idx}: active tracks after fallback reconcile {len(detections)}")

        if mask is not None:
            frame = self.blur_engine.apply_blur(frame, [], mask)
        elif detections:
            frame = self.blur_engine.apply_blur(frame, detections)
        else:
            logger.debug(f"Frame {frame_idx}: no detections to blur")

        self.stats.processed_frames += 1
        return frame
    
    def process_video(self, input_path: Path, output_path: Path, status_path: Path) -> Dict[str, Any]:
        """Process the video"""
        logger.info(f"Starting video processing: {input_path}")
        
        try:
            # Create temp directory
            self.temp_dir = Path(tempfile.mkdtemp(prefix='video_privacy_'))
            self.temp_video_path = self.temp_dir / 'temp_video.mp4'
            self.temp_audio_path = self.temp_dir / 'audio.wav'
            
            # Get video metadata
            metadata = self.get_video_metadata(input_path)
            self.stats.total_frames = metadata.total_frames
            self.stats.start_time = time.time()
            self.stats.last_update_time = time.time()
            
            logger.info(f"Video: {metadata.resolution}, {metadata.fps:.2f}fps, {metadata.total_frames} frames")
            
            # Extract audio
            has_audio = False
            if metadata.has_audio:
                if self.config.get('ffmpeg_available', False):
                    has_audio = self.extract_audio(input_path, self.temp_audio_path)
                else:
                    raise RuntimeError(
                        "ffmpeg is required to extract audio. Install ffmpeg from https://ffmpeg.org/download.html and add it to PATH."
                    )
            
            # Open video
            cap = cv2.VideoCapture(str(input_path))
            if not cap.isOpened():
                raise RuntimeError(f"Failed to open video: {input_path}")
            
            # Setup video writer
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(
                str(self.temp_video_path),
                fourcc,
                metadata.fps,
                (metadata.width, metadata.height)
            )
            
            if not writer.isOpened():
                cap.release()
                raise RuntimeError("Failed to create video writer")
            
            try:
                frame_idx = 0
                status_update_interval = max(1, int(metadata.fps))
                
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    
                    # Process frame
                    processed_frame = self.process_frame(frame, frame_idx)
                    writer.write(processed_frame)
                    
                    frame_idx += 1
                    
                    # Update status periodically
                    if frame_idx % status_update_interval == 0:
                        progress = int((frame_idx / metadata.total_frames) * 100)
                        self.update_status(
                            status_path,
                            'processing',
                            min(progress, 99),
                            f"Processing frame {frame_idx}/{metadata.total_frames}"
                        )
                        
                        # Update stats
                        self.stats.last_update_time = time.time()
                        
                        # Log progress
                        fps = self.stats.average_fps
                        if fps > 0:
                            logger.info(
                                f"Progress: {progress}% ({frame_idx}/{metadata.total_frames}) - "
                                f"FPS: {fps:.2f} - Faces: {self.stats.faces_detected} - "
                                f"People: {self.stats.people_detected}"
                            )
            
            finally:
                cap.release()
                writer.release()
            
            self.stats.end_time = time.time()
            
            # Merge audio if available
            if has_audio and self.temp_audio_path.exists():
                logger.info("Merging audio...")
                self.update_status(status_path, 'merging', 99, "Merging audio...")
                
                if not self.merge_audio(self.temp_video_path, self.temp_audio_path, output_path):
                    # Fallback: use video without audio
                    shutil.move(str(self.temp_video_path), str(output_path))
                    logger.warning("Audio merge failed, using video without audio")
            else:
                # Move temp video to output
                shutil.move(str(self.temp_video_path), str(output_path))
            
            # Final status
            self.update_status(status_path, 'done', 100, "Processing complete")
            
            # Return result
            return {
                "success": True,
                "message": "Processing complete",
                "frames_processed": self.stats.processed_frames,
                "faces_detected": self.stats.faces_detected,
                "people_detected": self.stats.people_detected,
                "processing_time": round(self.stats.elapsed_time, 2),
                "average_fps": round(self.stats.average_fps, 2)
            }
            
        except Exception as e:
            logger.error(f"Processing failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        
        finally:
            self._cleanup()
    
    def _cleanup(self):
        """Clean up temporary files"""
        if self.temp_dir and self.temp_dir.exists():
            try:
                shutil.rmtree(self.temp_dir)
                logger.info("Temporary files cleaned up")
            except Exception as e:
                logger.warning(f"Failed to clean up temp files: {e}")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Video Privacy Protection Worker - Offline AI-powered face and body blurring"
    )
    parser.add_argument('--input', required=True, help="Input video path")
    parser.add_argument('--output', required=True, help="Output video path")
    parser.add_argument('--status-file', required=True, help="Status file path")
    parser.add_argument('--frame-step', type=int, default=2, help="Frames between detections")
    parser.add_argument('--blur-strength', type=float, default=30.0, help="Blur strength")
    parser.add_argument('--method', choices=['faces', 'fullBody'], default='faces', help="Blur method")
    parser.add_argument('--target', choices=['everyone', 'males', 'females'], default='everyone', help="Blur target group")
    parser.add_argument('--faces-only', action='store_true', default=False, help="Blur only faces, not bodies")
    parser.add_argument('--confidence', type=float, default=0.5, help="Detection confidence")
    parser.add_argument('--disable-yolo', action='store_true', help="Disable YOLO detectors")
    parser.add_argument('--disable-yunet', action='store_true', help="Disable YuNet face detector")
    parser.add_argument('--disable-mediapipe', action='store_true', help="Disable MediaPipe")
    parser.add_argument('--disable-opencv', action='store_true', help="Disable OpenCV detectors")
    parser.add_argument('--disable-hog-fallback', action='store_true', help="Disable HOG person-based head approximation fallback")
    parser.add_argument('--tracking-max-misses', type=int, default=6, help="Consecutive tracker misses before a face is removed")
    parser.add_argument('--tracking-reid-iou', type=float, default=0.25, help="IoU threshold for matching detections back to existing tracks")
    
    args = parser.parse_args()
    
    # Signal handling
    def signal_handler(sig, frame):
        logger.info("Process interrupted")
        print(json.dumps({"success": False, "error": "Interrupted"}))
        sys.exit(1)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Validate input
    input_path = Path(args.input)
    if not input_path.exists():
        error = {"success": False, "error": f"Input file not found: {input_path}"}
        print(json.dumps(error))
        sys.exit(1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Configuration
    script_dir = Path(__file__).resolve().parent
    ffmpeg_available = is_tool_available('ffmpeg')
    ffprobe_available = is_tool_available('ffprobe')
    if not ffmpeg_available or not ffprobe_available:
        missing_tools = []
        if not ffmpeg_available:
            missing_tools.append('ffmpeg')
        if not ffprobe_available:
            missing_tools.append('ffprobe')
        logger.warning(
            "Missing external tools: %s. Audio extraction and merge will be disabled. Install ffmpeg/ffprobe and ensure they are on PATH.",
            ', '.join(missing_tools)
        )

    if not ffprobe_available:
        error = {
            "success": False,
            "error": (
                "Missing required external tool: ffprobe. ffprobe is required to determine whether the video has an audio track. "
                "Install ffmpeg/ffprobe from https://ffmpeg.org/download.html and add them to PATH."
            )
        }
        print(json.dumps(error))
        sys.exit(1)

    config = {
        'frame_step': args.frame_step,
        'blur_strength': args.blur_strength,
        'method': args.method,
        'target': args.target,
        'faces_only': args.faces_only,
        'confidence_threshold': args.confidence,
        'disable_yolo': args.disable_yolo,
        'disable_yunet': args.disable_yunet,
        'disable_mediapipe': args.disable_mediapipe,
        'disable_opencv': args.disable_opencv,
        'disable_hog_fallback': args.disable_hog_fallback,
        'tracking_max_misses': args.tracking_max_misses,
        'tracking_reid_iou': args.tracking_reid_iou,
        'ffmpeg_available': ffmpeg_available,
        'ffprobe_available': ffprobe_available,
        'yolo_face_model': script_dir / 'models' / 'yolov8n-face.pt',
        'yolo_person_model': 'yolov8n-seg.pt',
        'yunet_model': script_dir / 'models' / 'face_detection_yunet_2022mar.onnx',
        'mediapipe_model': script_dir / 'models' / 'face_landmarker.task',
        'ssd_prototxt': script_dir / 'models' / 'deploy.prototxt',
        'ssd_model': script_dir / 'models' / 'res10_300x300_ssd_iter_140000.caffemodel',
        'haar_cascade': script_dir / 'models' / 'haarcascade_frontalface_default.xml'
    }

    try:
        # Initialize processor
        processor = VideoProcessor(config)
        
        # Process video
        result = processor.process_video(
            input_path,
            output_path,
            Path(args.status_file)
        )
        
        # Output result
        print(json.dumps(result))
        
        if result.get('success', False):
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()