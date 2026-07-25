import cv2
from pathlib import Path

print('FaceDetectorYN_create doc:')
print(cv2.FaceDetectorYN_create.__doc__)
print('FaceDetectorYN_create repr:', cv2.FaceDetectorYN_create)
print('signature unavailable for builtin functions, test create with empty path if supported')

video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('frame read', ret, frame.shape if frame is not None else None)

paths = [
    Path('models') / 'face_detection_yunet_2022mar.onnx',
    Path('temp_opencv_zoo') / 'models' / 'face_detection_yunet' / 'face_detection_yunet_2026may.onnx',
    Path('temp_opencv_zoo') / 'models' / 'face_detection_yunet' / 'face_detection_yunet_2023mar.onnx',
    Path('')
]
for p in paths:
    try:
        print('trying model', repr(str(p)))
        detector = cv2.FaceDetectorYN_create(str(p), '', (320, 320), 0.5, 0.4)
        print('created detector for', p, 'detector', detector)
        if frame is None:
            continue
        try:
            if hasattr(detector, 'setInputSize'):
                detector.setInputSize((frame.shape[1], frame.shape[0]))
            res = detector.detect(frame)
            print('detect result type', type(res), 'len', len(res) if hasattr(res, '__len__') else 'n/a')
            print(res)
        except Exception as e:
            print('detect failed for', p, e)
    except Exception as e:
        print('create failed for', p, e)
