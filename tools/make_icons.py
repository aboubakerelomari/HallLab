#!/usr/bin/env python3
"""Génère les icônes PNG de HallLab sans dépendance (zlib + struct).

Dessin : une barre de Hall blanche (barre + 4 bras) avec des contacts dorés,
sur un fond bleu. Lancement : python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")

TOP = (17, 112, 214)
BOTTOM = (8, 70, 150)
WHITE = (255, 255, 255)
GOLD = (255, 196, 84)


def rounded_rect(x, y, x0, y0, x1, y1, r):
    """Vrai si (x, y) est dans le rectangle arrondi."""
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r and x0 <= x <= x1 and y0 <= y <= y1


def shade(u, v, maskable):
    """Couleur RGBA du point (u, v) dans [0, 1]²."""
    if maskable:
        inside_bg = True
        # zone sûre des icônes masquables : cercle central de rayon 0,4
        s = 0.72
        u, v = (u - 0.5) / s + 0.5, (v - 0.5) / s + 0.5
    else:
        inside_bg = rounded_rect(u, v, 0.0, 0.0, 1.0, 1.0, 0.22)
    if not inside_bg:
        return (0, 0, 0, 0)

    t = min(max(v, 0.0), 1.0)
    bg = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))

    # contacts aux extrémités et au bout des bras
    pads = [
        (0.10, 0.38, 0.22, 0.62),
        (0.78, 0.38, 0.90, 0.62),
        (0.33, 0.18, 0.45, 0.30),
        (0.55, 0.18, 0.67, 0.30),
        (0.33, 0.70, 0.45, 0.82),
        (0.55, 0.70, 0.67, 0.82),
    ]
    for p in pads:
        if rounded_rect(u, v, *p, 0.03):
            return GOLD + (255,)

    bar = rounded_rect(u, v, 0.16, 0.43, 0.84, 0.57, 0.025)
    arms = any(
        rounded_rect(u, v, x0, y0, x1, y1, 0.015)
        for (x0, y0, x1, y1) in [
            (0.36, 0.27, 0.42, 0.45),
            (0.58, 0.27, 0.64, 0.45),
            (0.36, 0.55, 0.42, 0.73),
            (0.58, 0.55, 0.64, 0.73),
        ]
    )
    if bar or arms:
        return WHITE + (255,)
    return bg + (255,)


def render(size, maskable=False, ss=3):
    rows = []
    for y in range(size):
        row = bytearray([0])  # filtre PNG « None »
        for x in range(size):
            acc = [0, 0, 0, 0]
            for j in range(ss):
                for i in range(ss):
                    u = (x + (i + 0.5) / ss) / size
                    v = (y + (j + 0.5) / ss) / size
                    r, g, b, a = shade(u, v, maskable)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            n = ss * ss
            a = acc[3] / n
            if a > 0:
                row += bytes((round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(a)))
            else:
                row += bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size, raw):
    def chunk(kind, data):
        c = struct.pack(">I", len(data)) + kind + data
        return c + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, size, maskable in [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ]:
        write_png(os.path.join(OUT, name), size, render(size, maskable))
        print("écrit", name)
