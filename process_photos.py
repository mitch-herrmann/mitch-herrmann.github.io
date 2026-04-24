#!/usr/bin/env python3
"""
process_photos.py — drop photos in inbox/, run script, done.
Groups into albums by location + date. Updates only photography array in content.json.
Requirements: pip install Pillow
Usage: python3 process_photos.py --location "Berlin, Germany"
albums can be added to by using the same --album value, even if location/date are different
"""
import os, sys, re, json, argparse
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image, ExifTags
except ImportError:
    print("\n  Run: pip install Pillow\n"); sys.exit(1)

INBOX_DIR       = Path("photo folder path") #replace this with path to folder with photos to be processed
THUMBS_DIR      = Path("photos/thumbs")
FULL_DIR        = Path("photos/full")
CONTENT_JSON    = Path("content.json")
THUMB_LONG_EDGE = 1400
THUMB_QUALITY   = 88
FULL_LONG_EDGE  = 4200
FULL_QUALITY    = 92
SUPPORTED_EXTS  = {".jpg", ".jpeg", ".tiff", ".tif", ".heic", ".png"}

def ensure_dirs():
    for d in [INBOX_DIR, THUMBS_DIR, FULL_DIR]:
        d.mkdir(parents=True, exist_ok=True)

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    return re.sub(r'[\s_]+', '-', text.strip())

def resize_image(img, long_edge):
    w, h = img.size
    if w >= h: nw, nh = long_edge, int(h * long_edge / w)
    else:       nw, nh = int(w * long_edge / h), long_edge
    return img.resize((nw, nh), Image.LANCZOS)

def fix_orientation(img):
    try:
        tag_map = {v: k for k, v in ExifTags.TAGS.items()}
        ot = tag_map.get("Orientation")
        if ot:
            exif = img._getexif()
            if exif and ot in exif:
                rot = {3:180, 6:270, 8:90}.get(exif[ot])
                if rot: img = img.rotate(rot, expand=True)
    except: pass
    return img

def get_exif_date(img):
    try:
        tag_map = {v: k for k, v in ExifTags.TAGS.items()}
        dt_tag = tag_map.get("DateTimeOriginal")
        if dt_tag:
            exif = img._getexif()
            if exif and dt_tag in exif:
                return datetime.strptime(exif[dt_tag], "%Y:%m:%d %H:%M:%S").strftime("%B %Y")
    except: pass
    return None

def get_aspect(img):
    w, h = img.size
    return round(h / w, 2)

def process_photo(src_path, default_location=""):
    stem = src_path.stem
    out_name = stem + ".jpg"
    thumb_path = THUMBS_DIR / out_name
    full_path  = FULL_DIR / out_name
    try:
        img = Image.open(src_path); img.load()
    except Exception as e:
        print(f"  x Could not open {src_path.name}: {e}"); return None
    img = fix_orientation(img)
    if img.mode != "RGB": img = img.convert("RGB")
    date_str = get_exif_date(img)
    aspect   = get_aspect(img)
    if not thumb_path.exists():
        t = resize_image(img, THUMB_LONG_EDGE)
        t.save(str(thumb_path), "JPEG", quality=THUMB_QUALITY, optimize=True)
        print(f"  thumb  -> {thumb_path}  ({thumb_path.stat().st_size // 1024}KB)")
    else:
        print(f"  thumb  -> {thumb_path}  (exists)")
    if not full_path.exists():
        f = resize_image(img, FULL_LONG_EDGE)
        f.save(str(full_path), "JPEG", quality=FULL_QUALITY, optimize=True)
        print(f"  full   -> {full_path}  ({full_path.stat().st_size // 1024}KB)")
    else:
        print(f"  full   -> {full_path}  (exists)")
    return {"src": "photos/thumbs/"+out_name, "full": "photos/full/"+out_name,
            "date": date_str or "", "location": default_location, "aspect": aspect}

def album_key(loc, date): return (loc.strip() + "|" + (date or "")).strip("|")
def album_id(loc, date):  return slugify((loc + " " + (date or "")).strip())
def album_title(loc):     return loc.split(",")[0].strip() if loc else "Untitled"

def update_content_json(new_photos, location, default_date="", album_name=""):
    if not CONTENT_JSON.exists():
        data = {}
    else:
        with open(CONTENT_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
    existing = data.get("photography", [])
    existing_srcs = {p.get("src") for a in existing for p in a.get("photos",[]) if p.get("src")}
    added = 0

    if album_name:
        # Force all photos into a single named album regardless of location/date
        aid = slugify(album_name)
        target = next((a for a in existing if a.get("id") == aid), None)
        if not target:
            target = {"id": aid, "title": album_name, "date": default_date, "location": location, "photos": []}
            existing.append(target)
            print(f"  New album: '{album_name}'")
        for photo in new_photos:
            if photo["src"] in existing_srcs: continue
            target["photos"].append(photo)
            existing_srcs.add(photo["src"]); added += 1
    else:
        lookup = {album_key(a.get("location",""), a.get("date","")): a for a in existing}
        for photo in new_photos:
            if photo["src"] in existing_srcs: continue
            loc  = photo["location"] or location
            date = photo["date"]     or default_date
            key  = album_key(loc, date)
            if key not in lookup:
                album = {"id": album_id(loc, date), "title": album_title(loc),
                         "date": date, "location": loc, "photos": []}
                existing.append(album); lookup[key] = album
                print(f"  New album: '{album['title']} - {date}'")
            lookup[key]["photos"].append(photo)
            existing_srcs.add(photo["src"]); added += 1

    data["photography"] = existing
    with open(CONTENT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return added

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--location", "-l", default="")
    parser.add_argument("--date",     "-d", default="")
    parser.add_argument("--inbox",    "-i", default=str(INBOX_DIR))
    parser.add_argument("--album",    "-a", default="",
                        help='Force all photos into one album with this title, e.g. --album "Europe 2026"')
    args = parser.parse_args()
    inbox = Path(args.inbox)
    ensure_dirs()
    photos_in = sorted([p for p in inbox.iterdir()
                        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS])
    if not photos_in:
        print(f"\n  No photos found in {inbox}/\n"); return
    print(f"\n  Processing {len(photos_in)} photo(s) from {inbox}/\n")
    entries = []
    for photo in photos_in:
        print(f"  {photo.name}")
        e = process_photo(photo, default_location=args.location)
        if e:
            if args.date: e["date"] = args.date
            entries.append(e)
        print()
    if entries:
        added = update_content_json(entries, args.location, args.date, args.album)
        print(f"  Done — {added} new photo(s) added to content.json.\n")
    print("  Next: git add -A && git commit -m 'Add photos' && git push\n")

if __name__ == "__main__":
    main()