#!/usr/bin/env python3
"""Génère les icônes de lanceur Android de l'APK (dossier android-app).

Réutilise le dessin de make_icons.py. Lancement : python3 tools/make_android_icons.py
"""
import os

import make_icons as mi

RES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "android-app", "android", "app", "src", "main", "res")

# densité → (taille icône classique, taille avant-plan adaptatif)
DENSITIES = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}

# couleur de fond de l'icône adaptative (milieu du dégradé)
BACKGROUND = "#0B5DB4"


def scaled(u, v, s):
    return (u - 0.5) / s + 0.5, (v - 0.5) / s + 0.5


def foreground(u, v):
    """Barre de Hall seule, sur fond transparent, dans la zone sûre (66/108)."""
    u, v = scaled(u, v, 0.68)
    r, g, b, a = mi.shade(u, v, maskable=False)
    return (r, g, b, a) if (r, g, b) in (mi.WHITE, mi.GOLD) else (0, 0, 0, 0)


def round_icon(u, v):
    if (u - 0.5) ** 2 + (v - 0.5) ** 2 > 0.25:
        return (0, 0, 0, 0)
    return mi.shade(u, v, maskable=True)


def render(size, fn, ss=3):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0, 0]
            for j in range(ss):
                for i in range(ss):
                    r, g, b, a = fn((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            a = acc[3] / (ss * ss)
            row += bytes((round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(a))) if a else bytes(4)
        rows.append(bytes(row))
    return b"".join(rows)


if __name__ == "__main__":
    for dens, (icon, fg) in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{dens}")
        mi.write_png(os.path.join(folder, "ic_launcher.png"), icon, mi.render(icon))
        mi.write_png(os.path.join(folder, "ic_launcher_round.png"), icon, render(icon, round_icon))
        mi.write_png(os.path.join(folder, "ic_launcher_foreground.png"), fg, render(fg, foreground))
        print("écrit", dens)
    with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
        f.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BACKGROUND}</color>\n</resources>\n')
    print("couleur de fond :", BACKGROUND)
