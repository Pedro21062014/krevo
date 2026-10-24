/** Utilidades pequenas e sem dependências. */

let counter = 0;

export function uid(prefix = "el"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function round(v: number, step = 1): number {
  return Math.round(v / step) * step;
}

/** Escapa texto para uso seguro em HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "agora";
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `${min} min atrás`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `${days} dias atrás`;
  return date.toLocaleDateString("pt-BR");
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: number | undefined;
  return ((...args: never[]) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

export function download(name: string, data: Blob | string, mime = "application/octet-stream"): void {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Lado máximo de uma imagem importada (acima disso ela é reduzida). */
const MAX_IMAGE_SIDE = 3600;

/** Object URLs vivos nesta sessão, para liberar depois. */
const objectUrls = new Map<string, File>();

/** Converte um object URL de volta para data URL (ao salvar o projeto). */
export function isObjectUrl(src: string | null | undefined): boolean {
  return typeof src === "string" && src.startsWith("blob:");
}

export function fileForObjectUrl(src: string): File | undefined {
  return objectUrls.get(src);
}

export function releaseObjectUrl(src: string): void {
  if (objectUrls.has(src)) {
    objectUrls.delete(src);
    URL.revokeObjectURL(src);
  }
}

/**
 * Prepara a mídia de um arquivo para o canvas.
 *
 * Vídeos e arquivos grandes usam `blob:` (instantâneo, sem base64 na memória).
 * Imagens pequenas continuam como data URL, que já vai pronta para o PDF.
 */
export async function mediaSource(file: File): Promise<string> {
  // Tudo entra como object URL. Base64 no estado significaria copiar megabytes
  // a cada passo do histórico e a cada alteração — era isso que travava a
  // interface ao importar mídia. O data URL só nasce na hora de salvar/exportar.
  const prepared = file.type.startsWith("image/") ? await shrinkImage(file, MAX_IMAGE_SIDE) : file;
  const url = URL.createObjectURL(prepared);
  objectUrls.set(url, prepared);
  return url;
}

/**
 * Reduz fotos gigantes (ex.: 8000 px do celular) antes de entrar no canvas.
 * Mantém PNG/transparência como PNG e o resto como JPEG.
 */
export async function shrinkImage(file: File, maxDim = MAX_IMAGE_SIDE): Promise<File> {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxDim) {
      bitmap.close();
      return file;
    }
    const scale = maxDim / longest;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const keepPng = file.type === "image/png" || file.type === "image/webp";
    const type = keepPng ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, keepPng ? undefined : 0.92);
    });
    if (!blob) return file;
    const ext = keepPng ? (file.type === "image/webp" ? ".webp" : ".png") : ".jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ext, { type });
  } catch {
    return file;
  }
}

/** Troca todos os `blob:` de um projeto por data URLs (usado ao salvar). */
export async function materializeMedia<T>(project: T): Promise<T> {
  const clone = JSON.parse(JSON.stringify(project)) as T & {
    pages?: { elements?: { src?: string | null }[] }[];
  };
  for (const page of clone.pages ?? []) {
    for (const el of page.elements ?? []) {
      const src = el.src;
      if (!isObjectUrl(src)) continue;
      const file = fileForObjectUrl(src as string);
      if (!file) continue;
      el.src = await readFileAsDataUrl(file);
    }
  }
  return clone;
}

/** Miniatura leve (para salvar o projeto recente sem estourar o localStorage). */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Converte qualquer cor CSS em `{r,g,b,a}` (0-255). */
export function parseColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const value = input.trim().toLowerCase();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const expand = (h: string) => parseInt(h.length === 1 ? h + h : h, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]),
        g: expand(hex[1]),
        b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: expand(hex.slice(0, 2)),
        g: expand(hex.slice(2, 4)),
        b: expand(hex.slice(4, 6)),
        a: hex.length === 8 ? expand(hex.slice(6, 8)) / 255 : 1,
      };
    }
  }
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const parts = match[1].split(/[,/ ]+/).filter(Boolean).map(Number);
    if (parts.length >= 3) {
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    }
  }
  return null;
}

export function toCss(value: FillLike): string {
  if (typeof value === "string") return value;
  const stops = [...value.stops].sort((a, b) => a.offset - b.offset);
  const list = stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ");
  return `linear-gradient(${value.angle}deg, ${list})`;
}

type FillLike = string | { angle: number; stops: { offset: number; color: string }[] };

export function averageColor(value: FillLike | null | undefined, fallback = "#000000"): string {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  const stops = value.stops ?? [];
  if (!stops.length) return fallback;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const stop of stops) {
    const c = parseColor(stop.color);
    if (c) {
      r += c.r;
      g += c.g;
      b += c.b;
      n += 1;
    }
  }
  if (!n) return fallback;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

export function relativeLuminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0.5;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function isDark(color: string): boolean {
  return relativeLuminance(color) < 0.45;
}
