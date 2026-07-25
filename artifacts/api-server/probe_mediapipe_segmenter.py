import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks import python as mp_python
from pathlib import Path

print('mp version', mp.__version__)
print('vision', vision)
print('vision attrs', [a for a in dir(vision) if 'ImageSegment' in a or 'FaceDetector' in a or 'BaseOptions' in a or 'Image' in a])
print('BaseOptions', mp_python.BaseOptions)
print('ImageSegmenterOptions sig', vision.ImageSegmenterOptions)
print('FaceDetectorOptions sig', vision.FaceDetectorOptions)

# instantiate FaceDetector
try:
    options = vision.FaceDetectorOptions(
        base_options=mp_python.BaseOptions(),
        min_detection_confidence=0.5
    )
    detector = vision.FaceDetector.create_from_options(options)
    print('FaceDetector created', detector)
    print('FaceDetector methods', [m for m in dir(detector) if not m.startswith('_')][:60])
except Exception as e:
    print('FaceDetector create failed', e)

# instantiate ImageSegmenter
try:
    options = vision.ImageSegmenterOptions(
        base_options=mp_python.BaseOptions(),
        output_confidence_masks=True,
        output_category_mask=False
    )
    segmenter = vision.ImageSegmenter.create_from_options(options)
    print('ImageSegmenter created', segmenter)
    print('ImageSegmenter methods', [m for m in dir(segmenter) if not m.startswith('_')][:60])
except Exception as e:
    print('ImageSegmenter create failed', e)

video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('frame', ret, frame.shape if frame is not None else None)
if ret:
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    try:
        result = detector.detect(img)
        print('FaceDetector result type', type(result))
        print('result attrs', [a for a in dir(result) if not a.startswith('_')])
        if hasattr(result, 'detections'):
            print('detections len', len(result.detections))
            for d in result.detections:
                print('detection', d)
    except Exception as e:
        print('FaceDetector detect failed', e)
    try:
        seg_res = segmenter.segment(img)
        print('Segmenter result type', type(seg_res))
        print('result attrs', [a for a in dir(seg_res) if not a.startswith('_')])
        if hasattr(seg_res, 'confidence_mask'):
            mask = seg_res.confidence_mask
            print('confidence_mask shape', mask.shape if mask is not None else None)
        if hasattr(seg_res, 'category_mask'):
            print('category_mask', type(seg_res.category_mask), getattr(seg_res.category_mask, 'shape', None))
    except Exception as e:
        print('ImageSegmenter detect failed', e)
