import mediapipe as mp
import os

root = os.path.dirname(mp.__file__)
print('mediapipe root', root)
for dirpath, dirnames, filenames in os.walk(root):
    for name in filenames:
        if name.endswith('.tflite') or name.endswith('.task'):
            print(os.path.join(dirpath, name))
