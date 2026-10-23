#!/usr/bin/env python3
"""Inlina as imagens de site/assets/ em site/index.html (sem dependências externas).

Uso:  python3 site/build.py
"""
import base64
import pathlib

ROOT = pathlib.Path(__file__).parent
IMAGES = {
    "{{HOME}}": "app-home.jpg",
    "{{EDITOR}}": "app-editor.jpg",
    "{{AGENT}}": "app-agent.jpg",
}


def main() -> None:
    template = (ROOT / "index.template.html").read_text(encoding="utf-8")
    html = template
    for token, filename in IMAGES.items():
        data = (ROOT / "assets" / filename).read_bytes()
        html = html.replace(token, "data:image/jpeg;base64," + base64.b64encode(data).decode())
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print(f"site/index.html gerado ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
