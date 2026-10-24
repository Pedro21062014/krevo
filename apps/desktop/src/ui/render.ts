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
  const transforms: string[] = [];
  if (el.rotation) transforms.push(`rotate(${el.rotation}deg)`);
  if (el.flipH) transforms.push("scaleX(-1)");
  if (el.flipV) transforms.push("scaleY(-1)");
  if (transforms.length) css.push(`transform:${transforms.join(" ")}`);
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
  const f = el.filters;
  if (f) {
    const parts: string[] = [];
    if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
    if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
    if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
    if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
    if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
    if (parts.length) css.push(`filter:${parts.join(" ")}`);
  }
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
    t.uppercase ? "text-transform:uppercase" : "",
    t.underline ? "text-decoration:underline" : "",
    "align-items:" +
      (t.align === "center" ? "center" : t.align === "right" ? "flex-end" : "flex-start"),
  ]
    .filter(Boolean)
    .join(";");
}

/**
 * Aplica um elemento em um nó já existente, reaproveitando mídia e texto.
 *
 * O canvas repinta a cada movimento do mouse; recriar o nó faria as imagens
 * recarregarem (era o que fazia os elementos "sumirem" durante o arraste).
 */
export function applyElement(
  node: HTMLElement,
  el: Element,
  interactive = false,
  thumb = false,
): void {
  const kindChanged = node.dataset.kind !== el.kind;
  if (kindChanged) node.replaceChildren();
  node.classList.add("kf-el");
  if (node.dataset.kind && kindChanged) node.classList.remove(node.dataset.kind);
  node.classList.add(el.kind);
  node.dataset.id = el.id;
  node.dataset.kind = el.kind;
  node.style.cssText = elementCss(el);

  switch (el.kind) {
    case "text": {
      let span = node.querySelector<HTMLElement>(":scope > span");
      if (!span) {
        span = document.createElement("span");
        node.appendChild(span);
      }
      span.style.cssText = `display:block;width:100%;${textCss(el)}`;
      node.style.cssText += `;${textCss(el)}`;
      const content = el.text?.uppercase
        ? (el.text?.content ?? "").toUpperCase()
        : (el.text?.content ?? "");
      if (span.getAttribute("contenteditable") !== "true" && span.textContent !== content) {
        span.textContent = content;
      }
      break;
    }
    case "image":
    case "video": {
      const src = el.src ?? "";
      if (!src) {
        node.classList.remove("playing", "media-error");
        node.replaceChildren();
        node.style.background =
          "repeating-linear-gradient(45deg,#20232e,#20232e 10px,#272b38 10px,#272b38 20px)";
        node.dataset.src = "";
        break;
      }
      if (node.dataset.src !== src || kindChanged) {
        node.replaceChildren();
        node.classList.remove("media-error", "playing");
        if (el.kind === "video" && thumb) {
          // Miniaturas (páginas, faixa e início) mostram o quadro congelado:
          // colocar <video> ali criava um decodificador por miniatura e era
          // isso que travava o app no AppImage.
          if (el.poster) {
            const img = document.createElement("img");
            img.src = el.poster;
            img.alt = el.name || "Vídeo";
            img.draggable = false;
            node.appendChild(img);
          }
        } else if (el.kind === "video") {
          const video = document.createElement("video");
          video.src = src;
          video.muted = true;
          video.loop = false;
          video.autoplay = false;
          video.playsInline = true;
          video.preload = "none";
          video.setAttribute("playsinline", "");
          if (el.poster) video.setAttribute("poster", el.poster);
          node.dataset.name = el.name || "vídeo";
          video.addEventListener("error", () => node.classList.add("media-error"));
          // Um vídeo tocando por vez: dois decodificadores simultâneos já
          // deixam a interface aos soluços em máquinas sem aceleração.
          video.addEventListener("play", () => {
            document.querySelectorAll<HTMLVideoElement>(".kf-el.video video").forEach((other) => {
              if (other !== video) other.pause();
            });
            node.classList.add("playing");
          });
          video.addEventListener("pause", () => node.classList.remove("playing"));
          video.addEventListener("ended", () => node.classList.remove("playing"));
          node.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = src;
          img.alt = el.name || "Imagem";
          img.draggable = false;
          node.appendChild(img);
        }
        node.dataset.src = src;
      }
      node.querySelectorAll<HTMLElement>("img, video").forEach((media) => {
        media.style.objectFit = el.fit ?? "cover";
      });
      // Mídia estática (miniaturas) não precisa de filtro/overflow caro.
      if (thumb && el.kind === "video") node.style.filter = "none";
      if (el.radius) node.style.overflow = "hidden";
      break;
    }
    case "line": {
      const thickness = el.stroke?.width ?? 2;
      node.style.height = `${Math.max(1, thickness)}px`;
      node.style.background = el.fill ? toCss(el.fill as never) : (el.stroke?.color ?? "#000");
      break;
    }
    case "icon": {
      if (el.src) {
        let img = node.querySelector<HTMLImageElement>("img");
        if (!img || img.getAttribute("src") !== el.src) {
          node.replaceChildren();
          img = document.createElement("img");
          img.src = el.src;
          img.draggable = false;
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "contain";
          node.appendChild(img);
        }
      }
      break;
    }
    default:
      break;
  }

  if (!interactive) node.style.pointerEvents = "none";
  else node.style.pointerEvents = "";
}

/** Cria o nó DOM de um elemento (usado no canvas e nas miniaturas). */
export function renderElement(el: Element, interactive = false, thumb = false): HTMLElement {
  const node = document.createElement("div");
  applyElement(node, el, interactive, thumb);
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
    inner.appendChild(renderElement(el, false, true));
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
    inner.appendChild(renderElement(el, false, true));
  }
  wrap.appendChild(inner);
  return wrap;
}
