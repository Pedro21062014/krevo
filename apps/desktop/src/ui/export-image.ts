/**
 * Exportação da página como imagem (PNG) — desenho direto no Canvas 2D.
 *
 * Usamos o modelo do projeto (não o DOM), então o resultado sai na resolução
 * nativa da página, sem depender de html2canvas e sem borrar texto.
 */

import type { Element, Page } from "../types";
import { toCss } from "../util";

function fillToCss(value: Element["fill"] | Page["background"], ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!value) return;
  if (typeof value === "string") {
    ctx.fillStyle = value;
    return;
  }
  const angle = ((value.angle ?? 0) * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.max(w, h);
  const x0 = cx - Math.cos(angle) * len * 0.5;
  const y0 = cy - Math.sin(angle) * len * 0.5;
  const x1 = cx + Math.cos(angle) * len * 0.5;
  const y1 = cy + Math.sin(angle) * len * 0.5;
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const stop of value.stops ?? []) {
    gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
  }
  ctx.fillStyle = gradient;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Desenha a página inteira em um canvas e devolve o data URL do PNG. */
/** Desenha a página num canvas (base do PNG e das miniaturas). */
export async function renderPageCanvas(page: Page, scale = 2): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(page.width * scale);
  canvas.height = Math.round(page.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível.");
  ctx.scale(scale, scale);

  fillToCss(page.background, ctx, page.width, page.height);
  ctx.fillRect(0, 0, page.width, page.height);

  for (const el of page.elements) {
    if (el.hidden) continue;
    ctx.save();
    ctx.globalAlpha = el.opacity ?? 1;

    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    ctx.translate(cx, cy);
    if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
    if (el.flipH || el.flipV) ctx.scale(el.flipH ? -1 : 1, el.flipV ? -1 : 1);
    ctx.translate(-cx, -cy);

    if (el.shadow) {
      ctx.shadowColor = el.shadow.color;
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowOffsetX = el.shadow.x;
      ctx.shadowOffsetY = el.shadow.y;
    }

    if (el.kind === "text" && el.text) {
      const t = el.text;
      ctx.font = `${t.italic ? "italic " : ""}${t.fontWeight} ${t.fontSize}px "${t.fontFamily}", Inter, system-ui, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.textBaseline = "top";
      const lines = wrapLines(ctx, t.underline ? t.content : t.content, el.w);
      const lineHeight = t.fontSize * t.lineHeight;
      const totalHeight = lines.length * lineHeight;
      let y = el.y + Math.max(0, (el.h - totalHeight) / 2);
      for (const line of lines) {
        const width = ctx.measureText(line).width;
        const x =
          t.align === "center" ? el.x + (el.w - width) / 2 : t.align === "right" ? el.x + el.w - width : el.x;
        ctx.fillText(line, x, y);
        if (t.underline) {
          ctx.fillRect(x, y + t.fontSize * 0.92, width, Math.max(1, t.fontSize * 0.05));
        }
        y += lineHeight;
      }
    } else if (el.kind === "rect") {
      ctx.fillStyle = "#000000";
      fillToCss(el.fill ?? "#000000", ctx, el.w, el.h);
      roundRect(ctx, el.x, el.y, el.w, el.h, el.radius ?? 0);
      ctx.fill();
      if (el.stroke && el.stroke.width > 0) {
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = el.stroke.color;
        ctx.lineWidth = el.stroke.width;
        ctx.stroke();
      }
    } else if (el.kind === "ellipse") {
      fillToCss(el.fill ?? "#000000", ctx, el.w, el.h);
      ctx.beginPath();
      ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (el.stroke && el.stroke.width > 0) {
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = el.stroke.color;
        ctx.lineWidth = el.stroke.width;
        ctx.stroke();
      }
    } else if (el.kind === "line") {
      fillToCss(el.fill ?? el.stroke?.color ?? "#000000", ctx, el.w, el.h);
      const thickness = el.stroke?.width ?? 2;
      ctx.fillRect(el.x, el.y, el.w, Math.max(1, thickness));
    } else if (el.kind === "image" || el.kind === "icon" || el.kind === "video") {
      const src = el.kind === "video" ? el.poster : el.src;
      const img = src ? await loadImage(src) : null;
      if (img) {
        const fit = el.kind === "icon" ? "contain" : (el.fit ?? "cover");
        const ratio = img.width / img.height;
        let dw = el.w;
        let dh = el.h;
        if (fit === "cover") {
          const scaleFactor = Math.max(el.w / img.width, el.h / img.height);
          dw = img.width * scaleFactor;
          dh = img.height * scaleFactor;
        } else if (fit === "contain") {
          const scaleFactor = Math.min(el.w / img.width, el.h / img.height);
          dw = img.width * scaleFactor;
          dh = img.height * scaleFactor;
        } else if (fit === "fill") {
          dw = el.w;
          dh = el.h;
        }
        void ratio;
        const dx = el.x + (el.w - dw) / 2;
        const dy = el.y + (el.h - dh) / 2;
        ctx.save();
        if ((el.radius ?? 0) > 0) {
          roundRect(ctx, el.x, el.y, el.w, el.h, el.radius ?? 0);
          ctx.clip();
        }
        if (el.filters) {
          const f = el.filters;
          ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) grayscale(${f.grayscale}%) blur(${f.blur}px)`;
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = "#1a1d21";
        roundRect(ctx, el.x, el.y, el.w, el.h, el.radius ?? 0);
        ctx.fill();
        ctx.fillStyle = "#8b8e92";
        ctx.font = `500 ${Math.max(12, el.w * 0.03)}px Inter, system-ui, sans-serif`;
        ctx.fillText(el.name || "mídia", el.x + 12, el.y + 12);
      }
    }

    ctx.restore();
  }

  return canvas;
}

/** PNG da página em data URL. */
export async function renderPageToPng(page: Page, scale = 2): Promise<string> {
  const canvas = await renderPageCanvas(page, scale);
  return canvas.toDataURL("image/png");
}

/**
 * Miniatura leve para os cartões de "Projetos recentes" (JPEG pequeno).
 * Assim a tela inicial não precisa montar a página inteira em DOM.
 */
export async function pageThumbnail(page: Page, maxWidth = 520): Promise<string> {
  const scale = Math.min(1, maxWidth / Math.max(1, page.width));
  const canvas = await renderPageCanvas(page, scale);
  return canvas.toDataURL("image/jpeg", 0.62);
}

/** Baixa o PNG da página. */
export async function downloadPagePng(page: Page, name = "design", scale = 2): Promise<void> {
  const dataUrl = await renderPageToPng(page, scale);
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${name || "design"}.png`;
  link.click();
}
