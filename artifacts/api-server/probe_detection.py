import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from video_blur_worker import VideoProcessor

input_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
config = {
    'frame_step': 1,
    'blur_strength': 30.0,
    'method': 'faces',
    'target': 'everyone',
    'faces_only': False,
    'confidence_threshold': 0.3,
    'disable_yolo': True,
    'disable_yunet': True,
    'disable_mediapipe': True,
    'disable_opencv': False,
    'disable_hog_fallback': False,
    'tracking_max_misses': 6,
    'tracking_reid_iou': 0.25,
    'ffmpeg_available': False,
    'ffprobe_available': False,
    'yolo_face_model': Path('models') / 'yolov8n-face.pt',
    'yolo_person_model': Path('models') / 'yolov8n.pt',
    'yunet_model': Path('models') / 'face_detection_yunet_2022mar.onnx',
    'mediapipe_model': Path('models') / 'face_landmarker.task',
    'ssd_prototxt': Path('models') / 'deploy.prototxt',
    'ssd_model': Path('models') / 'res10_300x300_ssd_iter_140000.caffemodel',
    'haar_cascade': Path('models') / 'haarcascade_frontalface_default.xml'
}
processor = VideoProcessor(config)
print('Face detectors:', [d.detector_type.value for d in processor.detection_pipeline.face_detectors if d.is_available()])
print('Person detectors:', [d.detector_type.value for d in processor.detection_pipeline.person_detectors if d.is_available()])
print('Selfie segmenter:', processor.detection_pipeline.selfie_segmenter is not None)

import cv2
cap = cv2.VideoCapture(str(input_path))
ret, frame = cap.read()
cap.release()
print('frame read', ret, frame.shape if frame is not None else None)
if ret:
    faces = processor.detection_pipeline.detect_faces(frame)
    print('faces detected', len(faces), faces)
    people = processor.detection_pipeline.detect_people(frame)
    print('people detected', len(people), people)
    if processor.detection_pipeline.selfie_segmenter:
        mask = processor.detection_pipeline.selfie_segmenter.segment(frame)
        print('mask', None if mask is None else mask.shape, mask.dtype if mask is not None else None)
