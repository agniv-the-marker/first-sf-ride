import json
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MEDIA_DIR = ROOT / 'peak-bikeride' / 'peak-bikeride'
excluded = {'5760BC20-79C9-4422-9C67-7BC8D62BB921_1_105_c.jpeg'}
files = sorted((p for p in MEDIA_DIR.iterdir() if p.name not in excluded and p.suffix.lower() in {'.jpg', '.jpeg', '.mp4'}), key=lambda p: p.name.lower())

def capture_time(path):
    if path.suffix.lower() in {'.jpg', '.jpeg'}:
        try:
            exif = Image.open(path).getexif()
            value = exif.get(36867) or exif.get(306)
            if value:
                return value.replace(':', '', 2)
        except Exception:
            pass
    return ''

images = sorted((p for p in files if p.suffix.lower() != '.mp4'), key=lambda p: (capture_time(p) or '99999999999999', p.name.lower()))
videos = sorted((p for p in files if p.suffix.lower() == '.mp4'), key=lambda p: p.name.lower())
sequence = []
video_index = 0
for image_index, path in enumerate(images):
    sequence.append(path)
    target = round((image_index + 1) * len(videos) / (len(images) + 1))
    while video_index < target:
        sequence.append(videos[video_index])
        video_index += 1
sequence.extend(videos[video_index:])

manifest = [{
    'id': f'media-{index + 1:03d}',
    'filename': path.name,
    'src': f'peak-bikeride/peak-bikeride/{path.name}',
    'type': 'video' if path.suffix.lower() == '.mp4' else 'image',
    'audio': False if path.suffix.lower() == '.mp4' else None,
    'at': 0 if len(sequence) == 1 else index / (len(sequence) - 1),
    'order': index,
    'span': 2 if index % 9 == 0 else 1,
} for index, path in enumerate(sequence)]
(ROOT / 'media-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'generated {len(manifest)} media entries')
