#!/usr/bin/env python3
"""
set up docs/ directory structure and copy vocab.

usage:
    python scripts/setup_docs.py

run this after preprocess_glove.py and before building frontend.
"""

import shutil
import sys
from pathlib import Path

# add parent dir to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from builder.config import DEFAULT_CONFIG


def main():
    docs_dir = Path("docs")
    data_dir = docs_dir / "data"
    
    # create directories
    print(f"creating {docs_dir}...")
    docs_dir.mkdir(exist_ok=True)
    
    print(f"creating {data_dir}...")
    data_dir.mkdir(exist_ok=True)
    
    # copy vocab
    src = DEFAULT_CONFIG.vocab_path
    dst = docs_dir / "words.json"
    
    if not src.exists():
        print(f"error: vocab not found at {src}")
        print("run scripts/preprocess_glove.py first!")
        sys.exit(1)
    
    print(f"copying {src} → {dst}...")
    shutil.copy(src, dst)
    
    print("\ndocs/ setup complete!")
    print(f"  {dst} ({dst.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

