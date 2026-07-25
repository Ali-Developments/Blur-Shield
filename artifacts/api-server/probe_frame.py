import cv2
from pathlib import Path
video_path = Path('..') / 'blurshield-ai' / 'test-harness' / 'debug-video.mp4'
cap = cv2.VideoCapture(str(video_path))
ret, frame = cap.read()
cap.release()
print('frame read', ret, frame.shape if frame is not None else None)
if ret:
    out = Path('probe_frame.jpg')
    cv2.imwrite(str(out), frame)
    print('wrote', out.resolve())
