import os
import cv2
import numpy as np
from pathlib import Path

video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
print('video exists', video_path.exists(), video_path)
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('read', ret, frame.shape if frame is not None else None)

cascade_path = Path('models') / 'haarcascade_frontalface_default.xml'
print('cascade exists', cascade_path.exists(), cascade_path)
classifier = cv2.CascadeClassifier(str(cascade_path))
for min_neighbors in [2, 3, 4, 5, 6]:
    faces = classifier.detectMultiScale(
        cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY),
        scaleFactor=1.05,
        minNeighbors=min_neighbors,
        minSize=(20, 20),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    print('minNeighbors', min_neighbors, faces)

for min_size in [(10, 10), (20, 20), (30, 30), (40, 40)]:
    faces = classifier.detectMultiScale(
        cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY),
        scaleFactor=1.05,
        minNeighbors=3,
        minSize=min_size,
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    print('minSize', min_size, faces)

face_alt = cv2.CascadeClassifier(str(cascade_path))
faces = face_alt.detectMultiScale(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), scaleFactor=1.1, minNeighbors=3, minSize=(15, 15))
print('alt detect', faces)

# HOG person detection probe
hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
rects, weights = hog.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)
print('hog rects', rects, weights)
