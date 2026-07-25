import cv2
import os
from pathlib import Path
print('cv2 version', cv2.__version__)
print('cv2 file', cv2.__file__)
print('has dnn', hasattr(cv2, 'dnn'))
if hasattr(cv2, 'dnn'):
    print('has readNetFromCaffe', hasattr(cv2.dnn, 'readNetFromCaffe'))
    print('has readNet', hasattr(cv2.dnn, 'readNet'))
print('has FaceDetectorYN_create', hasattr(cv2, 'FaceDetectorYN_create'))
print('has legacy.FaceDetectorYN_create', hasattr(cv2.legacy, 'FaceDetectorYN_create') if hasattr(cv2, 'legacy') else False)
print('has CascadeClassifier', hasattr(cv2, 'CascadeClassifier'))
print('has HOGDescriptor', hasattr(cv2, 'HOGDescriptor'))
print('functions:', [name for name in dir(cv2) if 'Face' in name or 'HOG' in name or 'dnn' in name or 'Detector' in name][:80])
