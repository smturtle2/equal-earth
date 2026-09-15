# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==12.3.0"]
# ///
"""Download verified global sources and derive the two shipped raster textures.

Run: uv run tools/build_textures.py [--cache-dir /path/to/source-cache]
The downloaded archives remain outside the repository by default.
"""
import argparse
import hashlib
import json
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache-dir", type=Path, default=Path(tempfile.gettempdir()) / "equal-earth-texture-sources")
args = parser.parse_args()
args.cache_dir.mkdir(parents=True, exist_ok=True)
manifest = json.loads((ROOT / "public/textures/sources.json").read_text())
# The known, hash-verified source rasters contain 233.28 million pixels.
Image.MAX_IMAGE_PIXELS = 240_000_000

for item in manifest["textures"]:
    cached = args.cache_dir / item["download"].rsplit("/", 1)[1]
    if not cached.exists():
        temporary = cached.with_suffix(cached.suffix + ".partial")
        with urllib.request.urlopen(item["download"], timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(cached)
    with cached.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    if digest != item["sourceSha256"]:
        raise ValueError(f"Source hash mismatch: {cached}")
    source = cached
    if cached.suffix == ".zip":
        source = args.cache_dir / "NE2_HR_LC_SR_W.tif"
        with zipfile.ZipFile(cached) as archive:
            matches = [n for n in archive.namelist() if Path(n).name == source.name]
            if len(matches) != 1:
                raise ValueError("Expected one Natural Earth TIFF")
            with archive.open(matches[0]) as data, source.open("wb") as output:
                shutil.copyfileobj(data, output)
    with Image.open(source) as raster:
        if raster.size != (21600, 10800):
            raise ValueError(f"Unexpected source dimensions: {raster.size}")
        result = raster.convert("RGB").resize(tuple(manifest["dimensions"]), Image.Resampling.LANCZOS)
        destination = ROOT / "public/textures" / item["file"]
        result.save(destination, format="JPEG", quality=92, optimize=False, progressive=False)
        print(f"{destination.name}: {result.width}x{result.height}, {destination.stat().st_size:,} bytes")
