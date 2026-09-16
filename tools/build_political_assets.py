#!/usr/bin/env -S uv run --script
"""Build deterministic political map assets from Natural Earth 50m vectors.

Usage: uv run tools/build_political_assets.py
Dependencies are declared in the script so the build is isolated and reproducible.
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["Pillow==11.3.0", "pyshp==2.3.1", "shapely==2.1.1"]
# ///

from __future__ import annotations

import hashlib
import json
import math
import os
import urllib.request
from pathlib import Path

import shapefile
from PIL import Image, ImageDraw
from shapely.geometry import box, shape as make_shape

ROOT = Path(__file__).resolve().parents[1]
# Keep downloaded archives outside the repository; set NE_CACHE to persist elsewhere.
CACHE = Path(os.environ.get("NE_CACHE", "/tmp/equal-earth-natural-earth-5.1.2"))
W, H = 8192, 4096
VERSION = "5.1.2"
BASE = f"https://naturalearth.s3.amazonaws.com/{VERSION}/50m_cultural/"
SOURCES = {
    "countries": BASE + "ne_50m_admin_0_countries.zip",
    "boundaries": BASE + "ne_50m_admin_0_boundary_lines_land.zip",
    "places": BASE + "ne_50m_populated_places.zip",
}
OCEAN = (218, 234, 240, 255)
# Natural Earth MAPCOLOR9 values 1..9, with muted country colors.
PALETTE = {
    1: (181, 198, 182, 255), 2: (213, 188, 161, 255), 3: (193, 184, 211, 255),
    4: (221, 196, 143, 255), 5: (182, 204, 218, 255), 6: (216, 180, 180, 255),
    7: (196, 201, 164, 255), 8: (222, 190, 158, 255), 9: (185, 192, 210, 255),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / url.rsplit("/", 1)[-1]
    if not path.exists():
        print(f"download {url}")
        urllib.request.urlretrieve(url, path)
    return path


def reader(zip_path: Path) -> shapefile.Reader:
    return shapefile.Reader(str(zip_path))


def xy(lon: float, lat: float) -> tuple[int, int]:
    return round((lon + 180.0) * W / 360.0), round((90.0 - lat) * H / 180.0)


def polygons(geom):
    if geom.geom_type == "Polygon":
        yield geom
    elif geom.geom_type == "MultiPolygon":
        yield from geom.geoms


def draw_polygon(draw: ImageDraw.ImageDraw, poly, fill):
    draw.polygon([xy(*p) for p in poly.exterior.coords], fill=fill)
    for hole in poly.interiors:
        draw.polygon([xy(*p) for p in hole.coords], fill=OCEAN)


def build_map(countries: shapefile.Reader) -> Path:
    image = Image.new("RGBA", (W, H), OCEAN)
    draw = ImageDraw.Draw(image)
    world = box(-180, -90, 180, 90)
    fields = countries.fields[1:]
    names = [f[0] for f in fields]
    for record, shp in zip(countries.iterRecords(), countries.iterShapes()):
        row = dict(zip(names, record))
        geom = make_shape(shp.__geo_interface__).intersection(world)
        color = PALETTE.get(int(row.get("MAPCOLOR9") or 1), PALETTE[1])
        for poly in polygons(geom):
            draw_polygon(draw, poly, color)
    out = ROOT / "public/textures/political.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, format="PNG", optimize=False, compress_level=9)
    return out


def build_borders(boundaries: shapefile.Reader) -> Path:
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    fields = boundaries.fields[1:]
    names = [f[0] for f in fields]
    # This source is specifically admin-0 boundary_lines_land, so coastlines are excluded.
    for record, shp in zip(boundaries.iterRecords(), boundaries.iterShapes()):
        row = dict(zip(names, record))
        points = shp.points
        starts = list(shp.parts) + [len(points)]
        category = str(row.get("FEATURECLA") or "").lower()
        dashed = any(term in category for term in ("disputed", "line of control", "indefinite", "indeterminant"))
        for a, b in zip(starts, starts[1:]):
            line = [xy(*p) for p in points[a:b]]
            if not dashed:
                draw.line(line, fill=(255, 255, 255, 255), width=4, joint="curve")
            else:
                # Keep dash lengths consistent across vertices and short segments.
                phase = 0.0
                for (x0, y0), (x1, y1) in zip(line, line[1:]):
                    length = math.hypot(x1 - x0, y1 - y0)
                    used = 0.0
                    while used < length:
                        visible = phase < 10.0
                        step = min((10.0 if visible else 16.0) - phase, length - used)
                        if visible:
                            start, end = used / length, (used + step) / length
                            draw.line([(x0 + (x1-x0)*start, y0 + (y1-y0)*start),
                                       (x0 + (x1-x0)*end, y0 + (y1-y0)*end)],
                                      fill=(255, 255, 255, 255), width=4)
                        used += step
                        phase = (phase + step) % 16.0
    out = ROOT / "public/layers/borders.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, format="PNG", optimize=False, compress_level=9)
    return out


def field(row: dict, *keys):
    for key in keys:
        value = row.get(key)
        if value not in (None, "", "-99.0", -99.0):
            return value
    return None


def build_labels(countries: shapefile.Reader, places: shapefile.Reader) -> Path:
    result = {"labels": []}
    cfields = [f[0] for f in countries.fields[1:]]
    for record in countries.iterRecords():
        row = dict(zip(cfields, record))
        lon, lat = field(row, "LABEL_X", "LABELX"), field(row, "LABEL_Y", "LABELY")
        if lon is None or lat is None:
            continue
        result["labels"].append({
            "id": field(row, "ADM0_A3", "ADM0_A3_US"), "kind": "country",
            "longitude": float(lon), "latitude": float(lat),
            "name_en": field(row, "NAME_EN", "NAME"), "name_ko": field(row, "NAME_KO"),
            "rank": int(field(row, "LABELRANK") or 0),
            **({"minZoom": float(row["MIN_ZOOM"])} if field(row, "MIN_ZOOM") is not None else {}),
        })
    pfields = [f[0] for f in places.fields[1:]]
    for record, shp in zip(places.iterRecords(), places.iterShapes()):
        row = dict(zip(pfields, record))
        if str(field(row, "FEATURECLA") or "") != "Admin-0 capital":
            continue
        lon, lat = field(row, "LONGITUDE"), field(row, "LATITUDE")
        if lon is None or lat is None:
            continue
        result["labels"].append({
            "id": field(row, "WIKIDATAID", "NE_ID"), "kind": "capital",
            "longitude": float(lon), "latitude": float(lat),
            "name_en": field(row, "NAME_EN", "NAME"), "name_ko": field(row, "NAME_KO"),
            "rank": int(field(row, "LABELRANK", "RANK") or 0),
            **({"minZoom": float(row["MIN_ZOOM"])} if field(row, "MIN_ZOOM") is not None else {}),
        })
    out = ROOT / "public/layers/labels.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")
    return out


def main():
    paths = {name: download(url) for name, url in SOURCES.items()}
    countries, boundaries, places = reader(paths["countries"]), reader(paths["boundaries"]), reader(paths["places"])
    outputs = [build_map(countries), build_borders(boundaries), build_labels(countries, places)]
    manifest = {"natural_earth_version": VERSION, "sources": {}, "outputs": {}}
    for name, url in SOURCES.items():
        manifest["sources"][name] = {"url": url, "sha256": sha256(paths[name])}
    for path in outputs:
        manifest["outputs"][str(path.relative_to(ROOT))] = {"sha256": sha256(path), "bytes": path.stat().st_size}
    (ROOT / "public/layers/sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
