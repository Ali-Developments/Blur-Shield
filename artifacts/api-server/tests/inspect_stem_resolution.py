import os
import tempfile
from audio_separator.separator import Separator

input_path = r"C:\Users\foren\OneDrive\Desktop\free-lance\last\Blur-Shield\Blur-Shield\Blur-Shield\Blur-Shield\artifacts\api-server\tests\sample.mp3"
work_dir = tempfile.mkdtemp(prefix='debug_worker_')
model_dir = r"C:\Users\foren\OneDrive\Desktop\free-lance\last\Blur-Shield\Blur-Shield\Blur-Shield\Blur-Shield\artifacts\api-server\models"
os.makedirs(model_dir, exist_ok=True)
sep = Separator(output_dir=work_dir, model_file_dir=model_dir, output_format='WAV', mdx_params={'hop_length':1024, 'segment_size':256, 'overlap':0.25, 'batch_size':1, 'enable_denoise':True})
sep.load_model('1_HP-UVR.pth')
output_files = sep.separate(input_path)
print('output_files', output_files)

for path_value in output_files:
    candidate = os.path.join(work_dir, path_value)
    print(path_value, '->', candidate, os.path.exists(candidate))
    if os.path.exists(candidate):
        print('size', os.path.getsize(candidate))

print('work_dir', work_dir)
for root, _, files in os.walk(work_dir):
    print('root', root, 'files', files)
