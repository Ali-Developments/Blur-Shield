import cv2
import numpy as np
from pathlib import Path
import inspect

model_path = Path('models') / 'face_detection_yunet_2022mar.onnx'
print('face model exists', model_path.exists(), model_path)
print('FaceDetectorYN_create exists', hasattr(cv2, 'FaceDetectorYN_create'))
if hasattr(cv2, 'FaceDetectorYN_create'):
    print('signature', inspect.signature(cv2.FaceDetectorYN_create))
    try:
        detector = cv2.FaceDetectorYN_create(str(model_path), '', (320, 320), 0.5, 0.4)
        print('detector created', detector)
    except Exception as e:
        print('detector create failed', e)

try:
    import onnxruntime as ort
    print('onnxruntime version', ort.__version__)
    sess = ort.InferenceSession(str(model_path), providers=['CPUExecutionProvider'])
    print('onnx session created', sess)
except Exception as e:
    print('onnxruntime load failed', e)

video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('frame read', ret, None if frame is None else frame.shape)
if not ret:
    raise SystemExit('no frame')

if hasattr(cv2, 'FaceDetectorYN_create'):
    try:
        detector = cv2.FaceDetectorYN_create(str(model_path), '', (320, 320), 0.5, 0.4)
        if hasattr(detector, 'setInputSize'):
            detector.setInputSize((frame.shape[1], frame.shape[0]))
        result = detector.detect(frame)
        print('result type', type(result), 'len', len(result) if hasattr(result, '__len__') else 'n/a')
        print(result)
    except Exception as e:
        print('detect failed', e)

# test face cascade scaling
cascade = cv2.CascadeClassifier(str(Path('models') / 'haarcascade_frontalface_default.xml'))
gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
faces = cascade.detectMultiScale(gray, scaleFactor=1.01, minNeighbors=3, minSize=(10,10), flags=cv2.CASCADE_SCALE_IMAGE)
print('cascade faces', faces)

# test HOG with different params
hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
for scale in [1.02, 1.04, 1.06, 1.08, 1.1]:
    rects, weights = hog.detectMultiScale(frame, winStride=(8,8), padding=(8,8), scale=scale)
    print('hog scale', scale, 'rects', rects, 'weights', weights)
