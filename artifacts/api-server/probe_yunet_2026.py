import cv2
from pathlib import Path
import numpy as np

for model_name in [
    Path('models') / 'face_detection_yunet_2022mar.onnx',
    Path('temp_opencv_zoo') / 'models' / 'face_detection_yunet' / 'face_detection_yunet_2026may.onnx',
    Path('temp_opencv_zoo') / 'models' / 'face_detection_yunet' / 'face_detection_yunet_2023mar.onnx'
]:
    print('---', model_name, model_name.exists())
    if not model_name.exists():
        continue
    try:
        detector = cv2.FaceDetectorYN_create(str(model_name), '', (320, 320), 0.5, 0.4)
        print('created detector for', model_name)
    except Exception as e:
        print('create failed', e)
        continue
    cap = cv2.VideoCapture(str(Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'))
    ret, frame = cap.read()
    cap.release()
    print('frame read', ret, frame.shape if frame is not None else None)
    if not ret:
        continue
    try:
        detector.setInputSize((frame.shape[1], frame.shape[0]))
    except Exception as e:
        print('setInputSize failed', e)
    try:
        res = detector.detect(frame)
        print('detect result type', type(res), 'len', len(res) if hasattr(res, '__len__') else 'n/a')
        print(res)
    except Exception as e:
        print('detect failed', e)
