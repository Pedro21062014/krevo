/** Renderização de elementos — compartilhada pelo canvas e pelas miniaturas. */

import type { Element, Page } from "../types";
import { toCss } from "../util";

export function elementCss(el: Element): string {
  const css: string[] = [
    `left:${el.x}px`,
    `top:${el.y}px`,
    `width:${el.w}px`,
    `height:${el.h}px`,
  ];
  if (el.rotation) css.push(`transform:rotate(${el.rotation}deg)`);
  if (el.opacity !== 1) css.push(`opacity:${el.opacity}`);
  if (el.hidden) css.push("display:none");
  if (el.fill) css.push(`background:${toCss(el.fill as never)}`);
  if (el.radius) css.push(`border-radius:${el.radius}px`);
  if (el.stroke && el.stroke.width > 0) {
    css.push(`box-shadow:inset 0 0 0 ${el.stroke.width}px ${el.stroke.color}`);
  }
  if (el.shadow) {
    const s = el.shadow;
    const base = `box-shadow:${s.x}px ${s.y}px ${s.blur}px ${s.color}`;
    css.push(el.stroke ? `${base}, inset 0 0 0 ${el.stroke.width}px ${el.stroke.color}` : base);
  }
  if (el.kind === "ellipse") css.push("border-radius:50%");
  return css.join(";");
}

export function textCss(el: Element): string {
  const t = el.text;
  if (!t) return "";
  return [
    `font-family:"${t.fontFamily}",Inter,system-ui,sans-serif`,
    `font-size:${t.fontSize}px`,
    `font-weight:${t.fontWeight}`,
    `line-height:${t.lineHeight}`,
    `letter-spacing:${t.letterSpacing}px`,
    `color:${t.color}`,
    `text-align:${t.align}`,
    t.italic ? "font-style:italic" : "",
    t.underline ? "text-decoration:underline" : "",
    "align-items:" +
      (t.align === "center" ? "center" : t.align === "right" ? "flex-end" : "flex-start"),
  ]
    .filter(Boolean)
    .join(";");
}

/** Cria o nó DOM de um elemento (usado no canvas e nas miniaturas). */
export function renderElement(el: Element, interactive = false): HTMLElement {
  const node = document.createElement("div");
  node.className = `kf-el ${el.kind}`;
  node.dataset.id = el.id;
  node.style.cssText = elementCss(el);

  switch (el.kind) {
    case "text": {
      const span = document.createElement("span");
      span.style.cssText = `display:block;width:100%;${textCss(el)}`;
      span.textContent = el.text?.content ?? "";
      node.style.cssText += `;${textCss(el)}`;
      node.appendChild(span);
      break;
    }
    case "image":
    case "video": {
      if (el.src) {
        if (el.kind === "video" && el.src.startsWith("data:video")) {
          const video = document.createElement("video");
          video.src = el.src;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.autoplay = true;
          video.style.objectFit = el.fit ?? "cover";
          node.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = el.src;
          img.alt = el.name || "Imagem";
          img.style.objectFit = el.fit ?? "cover";
          img.draggable = false;
          node.appendChild(img);
        }
      } else {
        node.style.background =
          "repeating-linear-gradient(45deg,#20232e,#20232e 10px,#272b38 10px,#272b38 20px)";
      }
      if (el.radius) node.style.overflow = "hidden";
      break;
    }
    case "line": {
      const thickness = el.stroke?.width ?? 2;
      node.style.height = `${Math.max(1, thickness)}px`;
      node.style.background = el.fill ? toCss(el.fill as never) : el.stroke?.color ?? "#000";
      break;
    }
    case "icon": {
      if (el.src) {
        const img = document.createElement("img");
        img.src = el.src;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        node.appendChild(img);
      }
      break;
    }
    default:
      break;
  }

  if (!interactive) {
    node.style.pointerEvents = "none";
  }
  return node;
}

/** Miniatura estática de uma página (para grids, faixas e previews). */
export function renderThumb(page: Page, width: number): HTMLElement {
  const scale = width / page.width;
  const wrap = document.createElement("div");
  wrap.style.cssText = `width:${width}px;height:${Math.round(page.height * scale)}px;position:relative;overflow:hidden;flex-shrink:0;background:${page.background ? toCss(page.background as never) : "#fff"}`;
  const inner = document.createElement("div");
  inner.style.cssText = `position:absolute;left:0;top:0;width:${page.width}px;height:${page.height}px;transform:scale(${scale});transform-origin:top left;background:${page.background ? toCss(page.background as never) : "#fff"}`;
  for (const el of page.elements) {
    if (el.hidden) continue;
    inner.appendChild(renderElement(el));
  }
  wrap.appendChild(inner);
  return wrap;
}

/** Miniatura que preenche um container (usa a página inteira, com "cover"). */
export function renderThumbFill(page: Page, width: number, height: number): HTMLElement {
  const scale = Math.max(width / page.width, height / page.height);
  const wrap = document.createElement("div");
  wrap.style.cssText = `width:${width}px;height:${height}px;position:relative;overflow:hidden;background:${page.background ? toCss(page.background as never) : "#fff"}`;
  const inner = document.createElement("div");
  const offsetX = (width - page.width * scale) / 2;
  const offsetY = (height - page.height * scale) / 2;
  inner.style.cssText = `position:absolute;left:${offsetX}px;top:${offsetY}px;width:${page.width}px;height:${page.height}px;transform:scale(${scale});transform-origin:top left;background:${page.background ? toCss(page.background as never) : "#fff"}`;
  for (const el of page.elements) {
    if (el.hidden) continue;
    inner.appendChild(renderElement(el));
  }
  wrap.appendChild(inner);
  return wrap;
}
