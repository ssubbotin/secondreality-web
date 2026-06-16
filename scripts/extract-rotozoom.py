# scripts/extract-rotozoom.py — convert the original LENS background into the rotozoomer texture.
# Source: /home/sergey/SecondReality/LENS/_LENSEXB.OBK (OMF: 16B header + 768B 6-bit palette + 320x200).
# Output: apps/lab/public/textures/rotozoom.png (256x256 RGB, the rotpic crop from MAIN.C:359-368 with the
# authentic LENS palette applied — a warm/yellow/blue triad). Baked to RGB so the effect can linear-filter
# real colours (smooth) instead of interpolating palette indices (which would smear across the bands).
import os
import struct
import zlib

OBK = os.environ.get("LENS_OBK", "/home/sergey/SecondReality/LENS/_LENSEXB.OBK")
OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "lab", "public", "textures", "rotozoom.png")


def linear_from_obk(path):
    data = open(path, "rb").read()
    buf = bytearray(70000)
    i = 0
    while i < len(data):
        t = data[i]
        ln = data[i + 1] | (data[i + 2] << 8)
        body = data[i + 3 : i + 3 + ln - 1]
        i += 3 + ln
        if t == 0xA0:  # LEDATA: seg-index(1-2) offset(2) data...
            seg = body[0]
            p = 1
            if seg >= 0x80:
                p = 2
            off = body[p] | (body[p + 1] << 8)
            chunk = body[p + 2 :]
            buf[off : off + len(chunk)] = chunk
    return buf


def write_png(path, w, h, rgb):
    def chunk(tag, d):
        return struct.pack(">I", len(d)) + tag + d + struct.pack(">I", zlib.crc32(tag + d) & 0xFFFFFFFF)

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(rgb[y * w * 3 : (y + 1) * w * 3])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


buf = linear_from_obk(OBK)
pal = buf[16 : 16 + 768]  # 6-bit VGA palette
img = buf[784 : 784 + 64000]  # 320x200 palette indices
rgb = bytearray(256 * 256 * 3)
for y in range(256):
    a = (y * 10) // 11 - 18
    if a < 0 or a > 199:
        a = 0
    for x in range(256):
        c = img[x + 32 + a * 320]
        o = (x + y * 256) * 3
        rgb[o + 0] = min(255, pal[c * 3 + 0] * 4)
        rgb[o + 1] = min(255, pal[c * 3 + 1] * 4)
        rgb[o + 2] = min(255, pal[c * 3 + 2] * 4)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_png(OUT, 256, 256, rgb)
print("wrote", os.path.abspath(OUT))
