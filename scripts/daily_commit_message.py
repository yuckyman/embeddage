#!/usr/bin/env python3
"""
produce a commit message for today's daily word if it exists.

outputs GitHub Actions-compatible key=value lines:
- should_commit: true/false
- message: commit message
- date: YYYY-MM-DD
- secret_word: word (if present)
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


def _today_ny() -> str:
    try:
        from zoneinfo import ZoneInfo

        ny = ZoneInfo("America/New_York")
        return datetime.now(ny).strftime("%Y-%m-%d")
    except ImportError:
        return datetime.utcnow().strftime("%Y-%m-%d")


def main() -> None:
    date_str = _today_ny()
    meta_path = Path("docs/data") / f"{date_str}.meta.json"
    if not meta_path.exists():
        print("should_commit=false")
        print(f"message=daily word not found for {date_str}")
        print(f"date={date_str}")
        print("secret_word=")
        return

    with meta_path.open("r", encoding="utf-8") as meta_file:
        meta = json.load(meta_file)

    secret_word = meta.get("secret_word", "").strip()
    # commit message doesn't include secret word to keep it hidden
    message = f"daily word: {date_str}"

    print("should_commit=true")
    print(f"message={message}")
    print(f"date={date_str}")
    print(f"secret_word={secret_word}")


if __name__ == "__main__":
    main()
