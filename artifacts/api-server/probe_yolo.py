from pathlib import Path
try:
    from ultralytics import YOLO
    print('ultralytics imported')
    try:
        model = YOLO('yolov8n.pt')
        print('YOLO model loaded', model)
    except Exception as e:
        print('YOLO model load failed', e)
except Exception as e:
    print('ultralytics import failed', e)
