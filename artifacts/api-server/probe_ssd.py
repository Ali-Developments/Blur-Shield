import cv2
from pathlib import Path
import numpy as np

prototxt = Path('models') / 'deploy.prototxt'
model = Path('models') / 'res10_300x300_ssd_iter_140000.caffemodel'
print('prototxt exists', prototxt.exists())
print('model exists', model.exists())
print('has readNetFromCaffe', hasattr(cv2.dnn, 'readNetFromCaffe'))
print('has readNet', hasattr(cv2.dnn, 'readNet'))
try:
    if hasattr(cv2.dnn, 'readNetFromCaffe'):
        net = cv2.dnn.readNetFromCaffe(str(prototxt), str(model))
        print('readNetFromCaffe ok', type(net))
    else:
        net = cv2.dnn.readNet(str(prototxt), str(model))
        print('readNet ok', type(net))
    cap = cv2.VideoCapture(str(Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'))
    ret, frame = cap.read()
    cap.release()
    print('frame read', ret, frame.shape if frame is not None else None)
    blob = cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 1.0, (300, 300), (104.0, 177.0, 123.0))
    net.setInput(blob)
    output = net.forward()
    print('output shape', output.shape)
except Exception as e:
    print('error', e)
