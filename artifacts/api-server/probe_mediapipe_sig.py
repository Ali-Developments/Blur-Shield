import inspect
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
print('mp version', mp.__version__)
print('ImageSegmenter', vision.ImageSegmenter)
print('create_from_options sig', inspect.signature(vision.ImageSegmenter.create_from_options))
print('ImageSegmenterOptions init sig', inspect.signature(vision.ImageSegmenterOptions))
print('BaseOptions init sig', inspect.signature(python.BaseOptions))
print('VisionTaskRunningMode attrs', [a for a in dir(vision.RunningMode) if not a.startswith('_')])
