import cv2
from ultralytics import YOLO

frame = cv2.imread('probe_frame.jpg')
model = YOLO('yolov8n-seg.pt')
result = model(frame, conf=0.25, verbose=False)[0]
print('result type', type(result))
print('has boxes', hasattr(result, 'boxes'))
boxes = result.boxes
print('boxes type', type(boxes))
print('boxes attrs', [a for a in dir(boxes) if not a.startswith('_')])
print('cls', getattr(boxes, 'cls', None))
print('xyxy', getattr(boxes, 'xyxy', None))
print('conf', getattr(boxes, 'conf', None))
print('masks', getattr(result, 'masks', None))
print('mask attrs', [a for a in dir(result.masks) if not a.startswith('_')])
print('mask data type', type(result.masks.data))
print('mask data shape', result.masks.data.shape if hasattr(result.masks.data, 'shape') else None)
print('mask data sample', result.masks.data[0, :5, :5] if hasattr(result.masks.data, 'shape') else None)
print('classes', boxes.cls.cpu().numpy() if hasattr(boxes.cls, 'cpu') else boxes.cls)
print('xyxy numpy', boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, 'cpu') else boxes.xyxy)
print('conf numpy', boxes.conf.cpu().numpy() if hasattr(boxes.conf, 'cpu') else boxes.conf)
