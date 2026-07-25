from ultralytics import YOLO
print('ultralytics imported')
for model_name in ['yolov8n-seg.pt', 'yolov8s-seg.pt', 'yolov8n-seg', 'yolov8s-seg']:
    try:
        print('trying', model_name)
        model = YOLO(model_name)
        print('loaded', model_name, '->', type(model))
        break
    except Exception as e:
        print('failed', model_name, repr(e))
