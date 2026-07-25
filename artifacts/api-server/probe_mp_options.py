import inspect
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks import python as mp_python

print('FaceDetectorOptions:', vision.FaceDetectorOptions)
print('FaceDetectorOptions signature:', inspect.signature(vision.FaceDetectorOptions))
print('FaceDetector class:', vision.FaceDetector)
print('FaceDetector create_from_options', inspect.signature(vision.FaceDetector.create_from_options))
print('ImageSegmenterOptions:', vision.ImageSegmenterOptions)
print('ImageSegmenterOptions signature:', inspect.signature(vision.ImageSegmenterOptions))
print('ImageSegmenter class:', vision.ImageSegmenter)
print('ImageSegmenter create_from_options', inspect.signature(vision.ImageSegmenter.create_from_options))
print('BaseOptions signature:', inspect.signature(mp_python.BaseOptions))
print('vision attrs sample:', [a for a in dir(vision) if 'Face' in a or 'ImageSegmenter' in a or 'Selfie' in a or 'Landmarker' in a][:50])
