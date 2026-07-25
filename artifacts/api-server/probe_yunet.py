import cv2
from pathlib import Path
import numpy as np

model_path = Path('models') / 'face_detection_yunet_2022mar.onnx'
print('model exists', model_path.exists(), model_path)
print('cv2 has FaceDetectorYN_create', hasattr(cv2, 'FaceDetectorYN_create'))
if hasattr(cv2, 'FaceDetectorYN_create'):
    try:
        detector = cv2.FaceDetectorYN_create(str(model_path), '', (320, 320), 0.5, 0.4)
        print('FaceDetectorYN created', detector)
    except Exception as e:
        print('FaceDetectorYN create failed', e)

try:
    import onnxruntime as ort
    print('onnxruntime version', ort.__version__)
    sess = ort.InferenceSession(str(model_path), providers=['CPUExecutionProvider'])
    print('onnx session created', sess)
except Exception as e:
    print('onnxruntime or session failed', e)

video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('frame read', ret, frame.shape if frame is not None else None)
if ret and hasattr(cv2, 'FaceDetectorYN_create'):
    try:
        detector = cv2.FaceDetectorYN_create(str(model_path), '', (frame.shape[1], frame.shape[0]), 0.5, 0.4)
        result = detector.detect(frame)
        print('result type', type(result), 'result', result)
    except Exception as e:
        print('detect failed', e)
