import cv2
import traceback
from video_blur_worker import YOLOSegmentationDetector

frame = cv2.imread('probe_frame.jpg')
print('frame', frame.shape if frame is not None else None)
model = YOLOSegmentationDetector('yolov8n-seg.pt', 0.25)
print('init', model.initialize())
try:
    dets = model.detect(frame)
    print('dets', dets)
except Exception as e:
    print('exception', repr(e))
    traceback.print_exc()
