import cv2
from pathlib import Path

video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
print('opened', cap.isOpened())
frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print('frame_count', frame_count)
for i in range(min(10, frame_count)):
    cap.set(cv2.CAP_PROP_POS_FRAMES, i)
    ret, frame = cap.read()
    if not ret:
        print('frame', i, 'read failed')
        continue
    out = Path(f'frame_{i}.jpg')
    cv2.imwrite(str(out), frame)
    print('saved', out, 'mean', frame.mean(), 'shape', frame.shape)
cap.release()
