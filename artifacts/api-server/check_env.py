import os
import cv2
import mediapipe as mp
print('cv2', cv2.__version__)
print('mediapipe', mp.__version__)
print('has solutions', hasattr(mp, 'solutions'))
print('has face_detection', hasattr(mp.solutions, 'face_detection') if hasattr(mp, 'solutions') else False)
print('has selfie_segmentation', hasattr(mp.solutions, 'selfie_segmentation') if hasattr(mp, 'solutions') else False)
print('has MediaPipe tasks', hasattr(mp, 'tasks'))
print('has python tasks', hasattr(mp.tasks, 'python') if hasattr(mp, 'tasks') else False)
print('has vision', hasattr(mp.tasks.python, 'vision') if hasattr(mp, 'tasks') and hasattr(mp.tasks, 'python') else False)
try:
    if hasattr(mp, 'solutions') and hasattr(mp.solutions, 'face_detection'):
        FaceDetection = mp.solutions.face_detection.FaceDetection
        print('FaceDetection class ok', FaceDetection)
except Exception as e:
    print('FaceDetection init error', e)

try:
    if hasattr(mp, 'solutions') and hasattr(mp.solutions, 'selfie_segmentation'):
        SelfieSegmentation = mp.solutions.selfie_segmentation.SelfieSegmentation
        print('SelfieSegmentation class ok', SelfieSegmentation)
except Exception as e:
    print('SelfieSegmentation init error', e)

import subprocess
for prog in ['ffmpeg', 'ffprobe']:
    try:
        res = subprocess.run([prog, '-version'], capture_output=True, text=True)
        print(prog, 'found', res.returncode == 0)
        if res.returncode == 0:
            print(res.stdout.splitlines()[0])
    except Exception as exc:
        print(prog, 'missing', exc)

cap = cv2.VideoCapture(os.path.join('..','blurshield-ai','test-harness','debug-video.mp4'))
ret, frame = cap.read()
print('sample frame read', ret, None if frame is None else frame.shape)
cap.release()
if ret:
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    rects, weights = hog.detectMultiScale(frame, winStride=(8,8), padding=(8,8), scale=1.05)
    print('hog rects', rects)
    print('hog weights', weights)
