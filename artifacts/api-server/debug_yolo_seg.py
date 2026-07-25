import cv2
from pathlib import Path
import traceback

import video_blur_worker as vbw

frame = cv2.imread('probe_frame.jpg')
print('frame shape', frame.shape if frame is not None else None)
model = vbw.YOLOSegmentationDetector('yolov8n-seg.pt', 0.25)
print('init model', model.initialize())
try:
    mask = model.segment(frame)
    print('mask', type(mask), mask.shape if mask is not None else None)
    if mask is not None:
        print('mask min/max', mask.min(), mask.max())
except Exception as e:
    print('exception', repr(e))
    traceback.print_exc()
