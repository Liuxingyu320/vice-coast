"""Extract only the Shiba-area mesh cells from the official 2025 Minato CityGML ZIP."""

import argparse
import concurrent.futures
import io
from pathlib import Path
import struct
import time
import zipfile
import zlib
import requests

ARCHIVE = "https://assets.cms.plateau.reearth.io/assets/ea/d75459-6d62-4a1f-8081-317603bd5f8d/13103_minato-ku_pref_2025_citygml_1_op.zip"
ARCHIVE_SIZE = 2040970206


def byte_range(start, end):
    error = None
    for attempt in range(6):
        try:
            with requests.get(
                ARCHIVE,
                headers={"Range": f"bytes={start}-{end}"},
                timeout=(12, 45),
                stream=True,
            ) as r:
                if r.status_code != 206 or not r.headers.get(
                    "Content-Range", ""
                ).startswith(f"bytes {start}-{end}/"):
                    raise IOError(
                        f"Unexpected range {r.status_code} {r.headers.get('Content-Range')}"
                    )
                data = r.content
                if len(data) != end - start + 1:
                    raise IOError("Truncated range")
                return data
        except (requests.RequestException, OSError) as exc:
            error = exc
            time.sleep(0.4 + attempt * 0.35)
    raise IOError(f"Range {start}..{end}: {error}")


def directory(cache):
    dest = cache / "central.zip"
    if not dest.exists():
        tail = byte_range(ARCHIVE_SIZE - 22, ARCHIVE_SIZE - 1)
        magic, _, _, _, _, size, offset, _ = struct.unpack("<4s4H2LH", tail)
        assert magic == b"PK\x05\x06"
        # zipfile accounts for prepended data. Restore member offsets after reading.
        dest.write_bytes(byte_range(offset, offset + size - 1) + tail)
    raw = dest.read_bytes()
    off = struct.unpack_from("<I", raw, len(raw) - 6)[0]
    items = zipfile.ZipFile(io.BytesIO(raw)).infolist()
    for item in items:
        item.header_offset += off
    return items


def unpack(cache, item):
    name = item.filename.split("udx/", 1)[1]
    path = cache / "udx" / name
    if path.is_file() and path.stat().st_size == item.file_size:
        return path
    if not item.compress_size:
        return
    # Read a single span including local extra data and the compressed payload.
    start = item.header_offset
    end = min(
        ARCHIVE_SIZE - 1,
        start + 30 + len(item.filename.encode()) + 512 + item.compress_size,
    )
    data = byte_range(start, end)
    if data[:4] != b"PK\x03\x04":
        raise ValueError("Invalid local header " + name)
    fn, extra = struct.unpack_from("<HH", data, 26)
    pos = 30 + fn + extra
    block = data[pos : pos + item.compress_size]
    if len(block) < item.compress_size:
        block = byte_range(start + pos, start + pos + item.compress_size - 1)
    raw = zlib.decompress(block, -15) if item.compress_type == 8 else block
    if len(raw) != item.file_size or zlib.crc32(raw) != item.CRC:
        raise IOError("CRC mismatch " + name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return path


def mesh(lat, lon):
    a = lat * 1.5
    b = lon - 100
    return f"{int(a):02}{int(b):02}{int(a * 8) % 8}{int(b * 8) % 8}{int(a * 80) % 10}{int(b * 80) % 10}"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    args.cache.mkdir(exist_ok=True, parents=True)
    items = directory(args.cache)
    cells = {
        mesh(35.651 + y * 0.001, 139.740 + x * 0.001)
        for x in range(18)
        for y in range(13)
    }
    selected = [
        i
        for i in items
        if "udx/" in i.filename
        and i.filename.endswith(".gml")
        and any(
            "udx/" + kind + "/" in i.filename
            for kind in ["bldg", "tran", "veg", "frn", "dem"]
        )
        and (
            Path(i.filename).name[:8] in cells
            or "/dem/" in i.filename
            and Path(i.filename).name[:6] in {c[:6] for c in cells}
        )
    ]
    print("Cells", sorted(cells), "members", len(items), flush=True)
    for i in selected:
        print(i.filename.split("udx/")[-1], i.compress_size, flush=True)
    if not args.list:
        with concurrent.futures.ThreadPoolExecutor(5) as ex:
            list(ex.map(lambda i: unpack(args.cache, i), selected))
