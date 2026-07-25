import mediapipe as mp
from mediapipe import tasks
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
print('mp version', mp.__version__)
print('mp attr keys', [k for k in dir(mp) if not k.startswith('_')])
print('tasks attr keys', [k for k in dir(tasks) if not k.startswith('_')])
print('python attr keys', [k for k in dir(python) if not k.startswith('_')])
print('vision attr keys', [k for k in dir(vision) if not k.startswith('_')])
print('vision classes containing Segment', [name for name in dir(vision) if 'Segment' in name])
print('vision classes containing Face', [name for name in dir(vision) if 'Face' in name])
print('vision classes containing Selfie', [name for name in dir(vision) if 'Selfie' in name])
