import cv2
from video_blur_worker import DetectionPipeline

config = {
    'confidence_threshold': 0.25,
    'disable_yolo': False,
    'disable_mediapipe': False,
    'disable_opencv': True,
    'disable_yunet': True,
    'disable_hog': True,
    'disable_hog_fallback': True,
}

pipeline = DetectionPipeline(config)
frame = cv2.imread('probe_frame.jpg')
print('frame shape', frame.shape if frame is not None else None)
print('active person detector', pipeline.active_person_detector.detector_type.value if pipeline.active_person_detector else None)
print('active face detector', pipeline.active_face_detector.detector_type.value if pipeline.active_face_detector else None)
print('segmenter', pipeline.selfie_segmenter)
try:
    detections = pipeline.detect_people(frame)
    print('person detections', len(detections), detections)
except Exception as e:
    print('person detect exception', repr(e))

try:
    mask = pipeline.segment_mask(frame)
    print('segment mask', type(mask), None if mask is None else mask.shape)
except Exception as e:
    print('segment mask exception', repr(e))
