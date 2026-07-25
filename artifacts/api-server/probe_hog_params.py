import cv2
from pathlib import Path
video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('frame', ret, frame.shape if frame is not None else None)
hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
for win_stride in [(8,8), (4,4), (2,2)]:
    for scale in [1.01, 1.02, 1.04, 1.05, 1.08, 1.1]:
        rects, weights = hog.detectMultiScale(frame, winStride=win_stride, padding=(8,8), scale=scale)
        print('win', win_stride, 'scale', scale, 'rects', rects, 'weights', weights)
