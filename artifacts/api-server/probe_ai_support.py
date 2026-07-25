import sys
import shutil
print('python', sys.version)
try:
    import mediapipe as mp
    print('mediapipe', mp.__version__)
    print('solutions attr', hasattr(mp, 'solutions'))
    if hasattr(mp, 'solutions'):
        print('selfie_segmentation attr', hasattr(mp.solutions, 'selfie_segmentation'))
except Exception as e:
    print('mediapipe import failed', repr(e))
try:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    print('mediapipe tasks import ok')
    print('vision SelfieSegmenter', hasattr(vision, 'SelfieSegmenter'))
    print('vision SelfieSegmenterOptions', hasattr(vision, 'SelfieSegmenterOptions'))
except Exception as e:
    print('mediapipe tasks import failed', repr(e))
try:
    from ultralytics import YOLO
    print('ultralytics installed')
except Exception as e:
    print('ultralytics import failed', repr(e))
import cv2
print('cv2', cv2.__version__)
print('dnn', hasattr(cv2, 'dnn'))
print('readNetFromCaffe', hasattr(cv2.dnn, 'readNetFromCaffe') if hasattr(cv2, 'dnn') else False)
print('FaceDetectorYN_create', hasattr(cv2, 'FaceDetectorYN_create'))
print('ffmpeg', 'ok' if shutil.which('ffmpeg') or shutil.which('ffprobe') else 'missing')
