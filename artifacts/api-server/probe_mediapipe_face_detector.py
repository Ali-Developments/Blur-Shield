import cv2
from pathlib import Path
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks import python as mp_python

print('mp.version', mp.__version__)
print('vision attrs', [a for a in dir(vision) if 'FaceDetector' in a or 'FaceLandmarker' in a])
print('has FaceDetector', hasattr(vision, 'FaceDetector'))
print('has FaceLandmarker', hasattr(vision, 'FaceLandmarker'))
print('has BaseOptions', hasattr(mp_python, 'BaseOptions'))

try:
    options = vision.FaceDetectorOptions(
        base_options=mp_python.BaseOptions(),
        score_threshold=0.5,
        output_pose_landmarks=False,
    )
    detector = vision.FaceDetector.create_from_options(options)
    print('detector created', detector)
except Exception as e:
    print('face detector init failed', e)

video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('frame read', ret, frame.shape if frame is not None else None)
if ret:
    try:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = detector.detect(rgb)
        print('result type', type(result), 'has detections', hasattr(result, 'detections'))
        if hasattr(result, 'detections') and result.detections:
            print('num detections', len(result.detections))
            for d in result.detections:
                print('detection', d)
    except Exception as e:
        print('detect failed', e)
