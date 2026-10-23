#!/usr/bin/env python3
"""Inlina imagens e logos de site/assets/ em site/index.html (sem dependências externas).

As imagens entram como data URI para o HTML funcionar sozinho, sem rede.
Uso:  python3 site/build.py
"""
import base64
import pathlib

ROOT = pathlib.Path(__file__).parent
ASSETS = ROOT / "assets"

# token -> (arquivo, mime)
IMAGES = {
    "{{HOME}}": ("app-home.jpg", "image/jpeg"),
    "{{EDITOR}}": ("app-editor.jpg", "image/jpeg"),
    "{{AGENT}}": ("app-agent.jpg", "image/jpeg"),
    "{{AI}}": ("app-ai.jpg", "image/jpeg"),
    "{{ELEMENTS}}": ("app-elements.jpg", "image/jpeg"),
    "{{CREATE}}": ("app-create.jpg", "image/jpeg"),
    "{{RECORD}}": ("app-record.jpg", "image/jpeg"),
    "{{MENU}}": ("app-menu.jpg", "image/jpeg"),
    "{{SHORTCUTS}}": ("app-shortcuts.jpg", "image/jpeg"),
    "{{LOGO_WORD}}": ("logo-light.png", "image/png"),
    "{{LOGO_K}}": ("logo-k.png", "image/png"),
    "{{FAVICON}}": ("logo-icon.png", "image/png"),
}


def main() -> None:
    html = (ROOT / "index.template.html").read_text(encoding="utf-8")
    for token, (filename, mime) in IMAGES.items():
        data = (ASSETS / filename).read_bytes()
        html = html.replace(token, f"data:{mime};base64," + base64.b64encode(data).decode())
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print(f"site/index.html gerado ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
