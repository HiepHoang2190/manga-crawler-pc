#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wrapper script để gọi kindleunpack đúng cách với relative imports.
Tương thích Python 3.13+ (imghdr bị xóa).
Usage: python3 kindleunpack_wrapper.py <input_file> <output_dir>
"""
import sys
import os

# --- Polyfill imghdr cho Python 3.13+ ---
try:
    import imghdr
except ImportError:
    import types
    imghdr = types.ModuleType('imghdr')

    def _what(file, h=None):
        if h is None:
            if isinstance(file, str):
                with open(file, 'rb') as f:
                    h = f.read(32)
            else:
                h = file.read(32)
                file.seek(0)
        if h[:2] == b'\xff\xd8':
            return 'jpeg'
        if h[:8] == b'\x89PNG\r\n\x1a\n':
            return 'png'
        if h[:6] in (b'GIF87a', b'GIF89a'):
            return 'gif'
        if h[:4] == b'RIFF' and h[8:12] == b'WEBP':
            return 'webp'
        if h[:4] in (b'MM\x00*', b'II*\x00'):
            return 'tiff'
        if h[:2] == b'BM':
            return 'bmp'
        return None

    imghdr.what = _what
    sys.modules['imghdr'] = imghdr
# --- end polyfill ---


def main():
    if len(sys.argv) < 3:
        print("Usage: kindleunpack_wrapper.py <input_file> <output_dir>", file=sys.stderr)
        sys.exit(1)

    infile = sys.argv[1]
    outdir = sys.argv[2]

    # loaders/ -> reader/ -> lib/ -> electron/ -> repo root
    pkg_parent = os.environ.get('KINDLEUNPACK_DIR')
    if not pkg_parent or not os.path.isdir(pkg_parent):
        pkg_parent = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  '..', '..', '..', '..', 'node_modules', 'kindleunpack')
        pkg_parent = os.path.normpath(pkg_parent)
        if not os.path.isdir(pkg_parent) and 'app.asar' in pkg_parent:
            unpacked = pkg_parent.replace('app.asar', 'app.asar.unpacked')
            if os.path.isdir(unpacked):
                pkg_parent = unpacked

    sys.path.insert(0, pkg_parent)

    try:
        from lib.kindleunpack import unpackBook
    except ImportError as e:
        print(f"Import error: {e}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(outdir, exist_ok=True)
    unpackBook(infile, outdir, epubver='3', use_hd=True)


if __name__ == '__main__':
    main()
