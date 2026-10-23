#!/usr/bin/env python3
"""Gera todos os assets da marca a partir dos recortes originais.

Entrada:  brand/src/k_cutout.png  (K sozinho, preto sobre transparente)
          brand/src/wordmark.png  (wordmark completo, preto sobre transparente)
Saída:    brand/*.png + apps/desktop/src-tauri/icons/* + site/assets/logo-*.png

Os originais são pretos com alpha suave; aqui a "tinta" é recolorida sem perder
o antialiasing (usamos o alpha como máscara).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "src"
OUT = ROOT / "brand"
ICONS = ROOT / "apps" / "desktop" / "src-tauri" / "icons"
SITE = ROOT / "site" / "assets"

INK = (8, 9, 10, 255)          # grafite quase preto
PAPER = (246, 246, 244, 255)   # branco osso
MINT = (52, 214, 160, 255)


def tint(path: Path, color: tuple[int, int, int, int], pad_ratio: float = 0.06) -> Image.Image:
    """Recolore a tinta do recorte e devolve recortado no bbox + padding."""
    im = Image.open(path).convert("RGBA")
    alpha = im.getchannel("A")
    # limpa halos (alpha < 8 vira 0, remapeia para ganhar corpo)
    alpha = alpha.point(lambda v: 0 if v < 8 else min(255, int(v * 1.06)))
    bbox = alpha.getbbox()
    alpha = alpha.crop(bbox)
    side = max(alpha.size)
    pad = int(side * pad_ratio)
    canvas = Image.new("L", (side + pad * 2, side + pad * 2), 0)
    canvas.paste(alpha, ((canvas.width - alpha.width) // 2, (canvas.height - alpha.height) // 2))
    solid = Image.new("RGBA", canvas.size, color)
    solid.putalpha(canvas)
    return solid


def wordmark(path: Path, color: tuple[int, int, int, int], pad: int = 40) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    alpha = im.getchannel("A").point(lambda v: 0 if v < 8 else min(255, int(v * 1.06)))
    bbox = alpha.getbbox()
    alpha = alpha.crop(bbox)
    out = Image.new("RGBA", (alpha.width + pad * 2, alpha.height + pad * 2), (0, 0, 0, 0))
    solid = Image.new("RGBA", out.size, color)
    shifted = Image.new("L", out.size, 0)
    shifted.paste(alpha, (pad, pad))
    solid.putalpha(shifted)
    return solid


def app_icon(k: Image.Image, size: int, bg=(247, 246, 243, 255), radius_ratio: float = 0.235) -> Image.Image:
    """Ícone do app: tile arredondado off-white com o K em grafite (minimalista)."""
    scale = 4
    s = size * scale
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    # fundo com micro-gradiente (papel → papel levemente mais escuro)
    grad = Image.new("RGBA", (s, s), bg)
    d = ImageDraw.Draw(grad)
    r0, g0, b0 = bg[0], bg[1], bg[2]
    for y in range(s):
        t = y / s
        shade = int(-10 * t)
        d.line([(0, y), (s, y)], fill=(max(0, r0 + shade), max(0, g0 + shade), max(0, b0 + shade), 255))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_ratio), fill=255)
    canvas.paste(grad, (0, 0), mask)

    # fio interno de 1px (profundidade discreta)
    line = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(line).rounded_rectangle(
        [1, 1, s - 2, s - 2], radius=int(s * radius_ratio), outline=(0, 0, 0, 26), width=max(2, s // 300)
    )
    canvas.alpha_composite(line)

    # K centralizado, ~60% do lado
    target = int(s * 0.62)
    kk = k.copy()
    kk.thumbnail((target, target), Image.LANCZOS)
    canvas.alpha_composite(kk, ((s - kk.width) // 2, (s - kk.height) // 2 + int(s * 0.005)))

    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    k_src = SRC / "k_cutout.png"
    wm_src = SRC / "wordmark.png"

    k_light = tint(k_src, PAPER)
    k_dark = tint(k_src, INK)
    k_mint = tint(k_src, MINT)

    for name, img in {"krevo-k-light": k_light, "krevo-k-dark": k_dark, "krevo-k-mint": k_mint}.items():
        img.resize((1024, 1024), Image.LANCZOS).save(OUT / f"{name}.png")

    wordmark(wm_src, PAPER).save(OUT / "krevo-wordmark-light.png")
    wordmark(wm_src, INK).save(OUT / "krevo-wordmark-dark.png")

    # ícones do app (Tauri/Win/macOS)
    ICONS.mkdir(parents=True, exist_ok=True)
    for name, size in {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
        "Square150x150Logo.png": 150,
        "Square44x44Logo.png": 44,
        "StoreLogo.png": 50,
    }.items():
        app_icon(k_dark, size).save(ICONS / name)
    big = app_icon(k_dark, 1024)
    big.save(ICONS / "icon-master.png")
    big.save(ICONS / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    big.save(ICONS / "icon.icns", format="ICNS")

    # site / README
    SITE.mkdir(parents=True, exist_ok=True)
    wordmark(wm_src, PAPER).save(SITE / "logo-light.png")
    k_light.resize((512, 512), Image.LANCZOS).save(SITE / "logo-k.png")
    k_dark.resize((512, 512), Image.LANCZOS).save(SITE / "logo-k-dark.png")
    app_icon(k_dark, 512).save(SITE / "logo-icon.png")
    app_icon(k_light, 512, bg=(18, 19, 22, 255)).save(SITE / "logo-icon-dark.png")

    # lockup horizontal (ícone + wordmark) para docs
    wm = wordmark(wm_src, PAPER)
    icon = app_icon(k_dark, 320)
    gap = 56
    lock = Image.new("RGBA", (icon.width + gap + wm.width, max(icon.height, wm.height)), (0, 0, 0, 0))
    lock.alpha_composite(icon, (0, (lock.height - icon.height) // 2))
    lock.alpha_composite(wm, (icon.width + gap, (lock.height - wm.height) // 2))
    lock.save(OUT / "krevo-logo.png")

    print("marca gerada:", sorted(p.name for p in OUT.glob("*.png")))


if __name__ == "__main__":
    main()
