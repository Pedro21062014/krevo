#!/usr/bin/env python3
"""Reject AppImages missing the GStreamer runtime that WebKitGTK needs.

Tauri: https://v2.tauri.app/distribute/appimage/#multimedia-support-via-gstreamer
Usage: python3 scripts/verify_appimage_media.py path/to/Krevo.AppImage
"""
from pathlib import Path
import subprocess
import sys
import tempfile

required = [
    'libgstcoreelements.so',
    'libgstapp.so',          # appsrc/appsink
    'libgstplayback.so',     # playbin/decodebin
    'libgstautodetect.so',   # autoaudiosink: previously crashed WebKit
    'libgstisomp4.so',       # MP4/MOV demuxing
    'libgstmatroska.so',     # WebM/MKV demuxing
    'libgstlibav.so',        # H.264/AAC and additional decoders
    'libgstpulseaudio.so',
    'libgstalsa.so',
    'gst-plugin-scanner',
]
for filename in sys.argv[1:]:
    image = Path(filename).resolve()
    with tempfile.TemporaryDirectory(prefix='krevo-media-check-') as tmp:
        subprocess.run([str(image), '--appimage-extract'], cwd=tmp,
                       stdout=subprocess.DEVNULL, check=True)
        root = Path(tmp) / 'squashfs-root'
        files = {p.name for p in root.rglob('*') if p.is_file()}
        missing = sorted(set(required) - files)
        if missing:
            raise SystemExit(f'{image.name}: missing media plugins: {missing}')
        print(f'PASS {image.name}: all {len(required)} media components are bundled.')
if len(sys.argv) < 2:
    raise SystemExit('Pass one or more AppImage files.')
