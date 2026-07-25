import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
print('mp', mp.__version__)
print('vision attrs contains ImageSegmenter', hasattr(vision, 'ImageSegmenter'))
print('vision attrs contains ImageSegmenterOptions', hasattr(vision, 'ImageSegmenterOptions'))
print('vision attrs contains RunningMode', hasattr(vision, 'RunningMode'))
print('ImageSegmenter', vision.ImageSegmenter)
print('ImageSegmenterOptions', vision.ImageSegmenterOptions)
print('RunningMode', vision.RunningMode)
print('Options attrs', [a for a in dir(vision.ImageSegmenterOptions) if not a.startswith('_')])
print('ImageSegmenter methods', [a for a in dir(vision.ImageSegmenter) if not a.startswith('_')])
