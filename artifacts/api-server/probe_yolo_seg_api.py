import cv2
from ultralytics import YOLO
model = YOLO('yolov8n-seg.pt')
frame = cv2.imread('probe_frame.jpg')
print('frame', frame.shape if frame is not None else None)
results = model(frame, conf=0.25, verbose=False)
print('results len', len(results))
res = results[0]
print('res attrs', [a for a in dir(res) if not a.startswith('_')][:50])
print('boxes', hasattr(res, 'boxes'), res.boxes)
print('masks', hasattr(res, 'masks'), res.masks)
try:
    print('masks data type', type(res.masks.data), len(res.masks.data))
    print('mask shape first', res.masks.data[0].shape if len(res.masks.data) else None)
except Exception as e:
    print('mask data inspect failed', e)
try:
    print('mask xy', getattr(res.masks, 'xy', None))
except Exception as e:
    print('mask xy failed', e)
try:
    print('res.boxes.data shape', res.boxes.data.shape)
except Exception as e:
    print('boxes data failed', e)
