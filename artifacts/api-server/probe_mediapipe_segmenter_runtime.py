import cv2
from video_blur_worker import MediaPipeSelfieSegmenter

frame = cv2.imread('probe_frame.jpg')
print('frame loaded', frame is not None)
seg = MediaPipeSelfieSegmenter(0.5)
print('initialize', seg.initialize())
mask = seg.segment(frame)
print('mask', type(mask), None if mask is None else mask.shape)
if mask is not None:
    print('mask min/max', mask.min(), mask.max())
