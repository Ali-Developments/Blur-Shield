import mediapipe as mp
import importlib
from pathlib import Path
print('mp version', mp.__version__)
print('has solutions', hasattr(mp, 'solutions'))
print('has tasks', hasattr(mp, 'tasks'))
if hasattr(mp, 'tasks'):
    print('mp.tasks module', mp.tasks)
    print('tasks attrs', [a for a in dir(mp.tasks) if 'python' in a.lower() or 'vision' in a.lower() or 'segmentation' in a.lower() or 'face' in a.lower()][:100])
    try:
        import mediapipe.tasks as tasks
        print('import mediapipe.tasks ok', tasks)
    except Exception as e:
        print('import mediapipe.tasks failed', e)
    try:
        import mediapipe.tasks.python as tasks_python
        print('import mediapipe.tasks.python ok', tasks_python)
        print('tasks python attrs', [a for a in dir(tasks_python) if 'vision' in a.lower() or 'base' in a.lower() or 'model' in a.lower()][:100])
    except Exception as e:
        print('import mediapipe.tasks.python failed', e)
    try:
        from mediapipe.tasks.python import vision
        print('import vision ok', vision)
        print('vision attrs', [a for a in dir(vision) if 'Selfie' in a or 'Face' in a or 'Segment' in a or 'Landmarker' in a or 'Detector' in a][:100])
    except Exception as e:
        print('import vision failed', e)

print('sys.path', mp.__file__)
