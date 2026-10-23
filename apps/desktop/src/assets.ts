/**
 * Catálogo local do Krevo: formatos, templates, gradientes, paletas e ícones.
 * Tudo é gerado em código (SVG/data-URI) para funcionar 100% offline.
 */

import type { Element, ElementKind, Fill, LinearGradient, Page } from "./types";
import { uid } from "./util";

/* ------------------------------------------------------------------ */
/* Formatos de página                                                  */
/* ------------------------------------------------------------------ */

export interface FormatPreset {
  id: string;
  name: string;
  hint: string;
  w: number;
  h: number;
  icon: string;
}

export const FORMATS: FormatPreset[] = [
  { id: "slide-hd", name: "Apresentação", hint: "16:9 · 1920×1080", w: 1920, h: 1080, icon: "▭" },
  { id: "slide", name: "Slide 1280", hint: "16:9 · 1280×720", w: 1280, h: 720, icon: "▭" },
  { id: "a4", name: "Documento A4", hint: "Retrato · 794×1123", w: 794, h: 1123, icon: "▯" },
  { id: "a4-land", name: "A4 paisagem", hint: "Paisagem · 1123×794", w: 1123, h: 794, icon: "▭" },
  { id: "post", name: "Post quadrado", hint: "1080×1080", w: 1080, h: 1080, icon: "□" },
  { id: "story", name: "Story / Reels", hint: "1080×1920", w: 1080, h: 1920, icon: "▯" },
  { id: "portrait", name: "Retrato 4:5", hint: "1080×1350", w: 1080, h: 1350, icon: "▯" },
  { id: "banner", name: "Banner", hint: "1200×628", w: 1200, h: 628, icon: "▭" },
  { id: "video", name: "Vídeo Full HD", hint: "1920×1080 · frames", w: 1920, h: 1080, icon: "▶" },
  { id: "card", name: "Capa", hint: "1600×900", w: 1600, h: 900, icon: "▭" },
];

/* ------------------------------------------------------------------ */
/* Construtores                                                        */
/* ------------------------------------------------------------------ */

export function baseElement(kind: ElementKind, x: number, y: number, w: number, h: number): Element {
  return {
    id: uid(),
    kind,
    name: "",
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fill: null,
    stroke: null,
    radius: 0,
    shadow: null,
    text: null,
    src: null,
    fit: null,
  };
}

export function textEl(
  x: number,
  y: number,
  w: number,
  h: number,
  content: string,
  opts: Partial<{
    size: number;
    weight: number;
    color: string;
    align: "left" | "center" | "right";
    lineHeight: number;
    letterSpacing: number;
    family: string;
    name: string;
  }> = {},
): Element {
  const el = baseElement("text", x, y, w, h);
  el.name = opts.name ?? content.slice(0, 24);
  el.text = {
    content,
    fontFamily: opts.family ?? "Inter",
    fontSize: opts.size ?? 32,
    fontWeight: opts.weight ?? 500,
    lineHeight: opts.lineHeight ?? 1.2,
    letterSpacing: opts.letterSpacing ?? 0,
    align: opts.align ?? "left",
    color: opts.color ?? "#111111",
    italic: false,
    underline: false,
  };
  el.radius = 0;
  return el;
}

export function shapeEl(
  kind: ElementKind,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: Fill,
  opts: Partial<{
    radius: number;
    opacity: number;
    name: string;
    shadow: boolean;
    stroke: { color: string; width: number };
  }> = {},
): Element {
  const el = baseElement(kind, x, y, w, h);
  el.fill = fill;
  el.radius = opts.radius ?? 0;
  el.opacity = opts.opacity ?? 1;
  el.name = opts.name ?? (kind === "ellipse" ? "Elipse" : "Forma");
  if (opts.stroke) el.stroke = opts.stroke;
  if (opts.shadow) el.shadow = { color: "rgba(0,0,0,0.32)", blur: 40, x: 0, y: 18 };
  return el;
}

export function imageEl(
  x: number,
  y: number,
  w: number,
  h: number,
  src: string,
  name = "Imagem",
): Element {
  const el = baseElement("image", x, y, w, h);
  el.src = src;
  el.fit = "cover";
  el.name = name;
  return el;
}

/* ------------------------------------------------------------------ */
/* Gradientes e paletas                                                */
/* ------------------------------------------------------------------ */

export function gradient(angle: number, ...colors: string[]): LinearGradient {
  return {
    angle,
    stops: colors.map((color, i) => ({
      offset: colors.length === 1 ? 0 : i / (colors.length - 1),
      color,
    })),
  };
}

export const GRADIENTS: { id: string; name: string; value: LinearGradient }[] = [
  { id: "aurora", name: "Aurora", value: gradient(135, "#6C5CE7", "#00D4B8") },
  { id: "meia-noite", name: "Meia-noite", value: gradient(160, "#0B1020", "#241B4D") },
  { id: "poco", name: "Pôr do sol", value: gradient(135, "#FF6B35", "#FFC857") },
  { id: "oceano", name: "Oceano", value: gradient(120, "#0B2C46", "#22A7F0") },
  { id: "menta", name: "Menta", value: gradient(140, "#3ED598", "#0E3B33") },
  { id: "coral", name: "Coral", value: gradient(150, "#FF5D8F", "#FFD166") },
  { id: "grafite", name: "Grafite", value: gradient(180, "#111214", "#3A3F47") },
  { id: "papel", name: "Papel", value: gradient(180, "#FAF7F2", "#E4D9C8") },
  { id: "uva", name: "Uva", value: gradient(135, "#4A1B33", "#6C5CE7") },
  { id: "gelo", name: "Gelo", value: gradient(145, "#E4E9FF", "#F7F7FB") },
];

export const PALETTES: { id: string; name: string; colors: string[] }[] = [
  { id: "krevo", name: "Krevo", colors: ["#0B1020", "#6C5CE7", "#00D4B8", "#F6C177", "#F7F7FB"] },
  { id: "papel", name: "Papel", colors: ["#FAF7F2", "#1A1714", "#E4572E", "#2A9D8F", "#6B6259"] },
  { id: "menta", name: "Menta", colors: ["#06231F", "#3ED598", "#F2C14E", "#ECFFF8", "#9FD8C8"] },
  { id: "vulcao", name: "Vulcão", colors: ["#160B0B", "#FF6B35", "#FFC857", "#FFF3EC", "#D8B4A6"] },
  { id: "algodao", name: "Algodão", colors: ["#F4F6FF", "#4361EE", "#F72585", "#101433", "#5A5F86"] },
  { id: "grafite", name: "Grafite", colors: ["#111214", "#F5A524", "#38BDF8", "#F2F3F5", "#9AA0A6"] },
  { id: "coral", name: "Coral", colors: ["#1B0F1A", "#FF5D8F", "#FFD166", "#FFF1F4", "#E7B6C6"] },
  { id: "oceano", name: "Oceano", colors: ["#04121F", "#22A7F0", "#7BD389", "#EAF6FF", "#9EC5DE"] },
];

/* ------------------------------------------------------------------ */
/* Ícones (SVG inline, viram elementos de imagem)                      */
/* ------------------------------------------------------------------ */

const ICON_PATHS: Record<string, string> = {
  estrela: '<path d="M12 3l2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.8 6.5 20.2l1.1-6.2L3 9.6l6.3-.9z"/>',
  raio: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  coracao: '<path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  seta: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18-2.5-3-2.5-15 0-18z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  lua: '<path d="M20 14a8 8 0 11-10-10 7 7 0 0010 10z"/>',
  camera:
    '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-2.5h5L16 7"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pasta: '<path d="M3 7h6l2 2h10v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  lapis: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
  grafico: '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>',
  pessoas:
    '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 11a3 3 0 100-6"/><path d="M17 20a5.6 5.6 0 00-2-4.3"/>',
  cadeado:
    '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  sino: '<path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 18a2 2 0 004 0"/>',
  casa: '<path d="M3 11l9-8 9 8"/><path d="M6 10v10h12V10"/>',
  magia:
    '<path d="M4 20l9-9"/><path d="M14 3l1.4 3.6L19 8l-3.6 1.4L14 13l-1.4-3.6L9 8l3.6-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  cubo: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 21V12"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l4 2"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  link: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7L12.5 19"/>',
  musica: '<circle cx="7" cy="18" r="3"/><circle cx="18" cy="15" r="3"/><path d="M10 18V6l11-2v11"/>',
  nuvem: '<path d="M6 18a4 4 0 010-8 6 6 0 0111.5-1.5A4.2 4.2 0 0118 18z"/>',
};

export const ICONS = Object.entries(ICON_PATHS).map(([name, path]) => ({ name, path }));

/** Converte um ícone do catálogo em imagem aplicável a um elemento. */
export function iconDataUri(name: string, color = "#F7F7FB", stroke = 1.8): string {
  const path = ICON_PATHS[name] ?? ICON_PATHS.estrela;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ */
/* Imagens procedurais (sem rede)                                      */
/* ------------------------------------------------------------------ */

export function placeholderImage(
  label: string,
  c1 = "#6C5CE7",
  c2 = "#00D4B8",
  w = 960,
  h = 640,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.13"/></feComponentTransfer></filter>
</defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<rect width="${w}" height="${h}" filter="url(#n)" opacity="0.55"/>
<circle cx="${w * 0.78}" cy="${h * 0.22}" r="${Math.min(w, h) * 0.22}" fill="#fff" opacity="0.14"/>
<circle cx="${w * 0.2}" cy="${h * 0.85}" r="${Math.min(w, h) * 0.3}" fill="#000" opacity="0.1"/>
${label ? `<text x="50%" y="50%" font-family="Inter,Segoe UI,sans-serif" font-size="${Math.round(
    Math.min(w, h) * 0.07,
  )}" fill="#fff" opacity="0.85" text-anchor="middle" dominant-baseline="middle">${label}</text>` : ""}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const STOCK_CATEGORIES = [
  "Abstrato",
  "Natureza",
  "Cidade",
  "Pessoas",
  "Produto",
  "Escritório",
  "Tecnologia",
  "Comida",
  "Viagem",
  "Texturas",
  "Formas 3D",
  "Arquitetura",
];

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export interface Template {
  id: string;
  name: string;
  category: string;
  w: number;
  h: number;
  background: Fill;
  build: () => Element[];
}

function page(w: number, h: number, background: Fill, elements: Element[]): Page {
  return { id: uid("pg"), name: "Página 1", width: w, height: h, background, elements };
}

export function templateToPage(t: Template): Page {
  return page(t.w, t.h, t.background, t.build());
}

const ink = "#0B1020";

export const TEMPLATES: Template[] = [
  {
    id: "pitch-aurora",
    name: "Pitch · Aurora",
    category: "Apresentação",
    w: 1920,
    h: 1080,
    background: gradient(140, "#0B1020", "#241B4D"),
    build: () => [
      shapeEl("rect", 160, 150, 80, 8, "#00D4B8", { radius: 4, name: "Detalhe" }),
      textEl(160, 210, 1000, 90, "AURORA · SÉRIE A", {
        size: 28,
        weight: 600,
        color: "#9E9BC7",
        letterSpacing: 6,
      }),
      textEl(160, 320, 1100, 300, "O futuro do design\né conversacional.", {
        size: 108,
        weight: 700,
        color: "#F7F7FB",
        lineHeight: 1.02,
      }),
      textEl(160, 700, 780, 120, "Krevo une canvas, IA e exportação profissional em um único app nativo.", {
        size: 30,
        weight: 400,
        color: "#B9B7D6",
        lineHeight: 1.45,
      }),
      shapeEl("ellipse", 1420, 620, 360, 360, "#6C5CE7", { opacity: 0.75, name: "Ornamento" }),
      shapeEl("ellipse", 1560, 220, 200, 200, "#00D4B8", { opacity: 0.5, name: "Ornamento 2" }),
      textEl(160, 940, 400, 60, "2026 · Confidencial", { size: 22, color: "#6E6A99" }),
    ],
  },
  {
    id: "slide-agenda",
    name: "Slide · Agenda",
    category: "Apresentação",
    w: 1280,
    h: 720,
    background: "#F7F7FB",
    build: () => [
      shapeEl("rect", 0, 0, 18, 720, "#6C5CE7", { name: "Barra" }),
      textEl(96, 96, 700, 90, "Agenda", { size: 64, weight: 700, color: ink }),
      textEl(96, 200, 620, 50, "Três blocos, trinta minutos.", { size: 26, color: "#6B6F8A" }),
      ...[
        ["01", "Diagnóstico do produto", "10 min"],
        ["02", "Arquitetura do design system", "12 min"],
        ["03", "Próximos passos", "8 min"],
      ].flatMap(([num, title, time], i) => {
        const y = 310 + i * 110;
        return [
          shapeEl("rect", 96, y, 1088, 92, "#FFFFFF", { radius: 18, name: `Linha ${num}`, shadow: true }),
          textEl(130, y + 24, 80, 50, num, { size: 34, weight: 700, color: "#6C5CE7" }),
          textEl(220, y + 28, 700, 44, title, { size: 28, weight: 600, color: ink }),
          textEl(1010, y + 32, 140, 40, time, { size: 22, color: "#8A8FAE", align: "right" }),
        ];
      }),
    ],
  },
  {
    id: "post-lancamento",
    name: "Post · Lançamento",
    category: "Social",
    w: 1080,
    h: 1080,
    background: gradient(150, "#160B0B", "#3A1414"),
    build: () => [
      shapeEl("ellipse", 620, -120, 620, 620, "#FF6B35", { opacity: 0.85, name: "Círculo" }),
      shapeEl("ellipse", -140, 720, 420, 420, "#FFC857", { opacity: 0.5, name: "Círculo 2" }),
      textEl(90, 700, 700, 70, "NOVO · 12.11", { size: 26, weight: 700, color: "#FFC857", letterSpacing: 4 }),
      textEl(90, 780, 900, 220, "Chegou o\nKrevo 1.0", {
        size: 132,
        weight: 800,
        color: "#FFF3EC",
        lineHeight: 0.95,
      }),
      textEl(90, 1000, 760, 60, "design com IA, do rascunho ao arquivo final", {
        size: 30,
        color: "#D8B4A6",
      }),
    ],
  },
  {
    id: "story-promo",
    name: "Story · Promoção",
    category: "Social",
    w: 1080,
    h: 1920,
    background: gradient(180, "#06231F", "#0E3B33"),
    build: () => [
      shapeEl("ellipse", 140, 300, 800, 800, "#3ED598", { opacity: 0.16, name: "Halo" }),
      textEl(96, 240, 888, 60, "SEMANA DO CRIADOR", {
        size: 32,
        weight: 700,
        color: "#3ED598",
        letterSpacing: 6,
        align: "center",
      }),
      textEl(96, 760, 888, 420, "50%\noff", {
        size: 260,
        weight: 800,
        color: "#ECFFF8",
        lineHeight: 0.9,
        align: "center",
      }),
      textEl(120, 1250, 840, 120, "no plano anual do Krevo Studio", {
        size: 44,
        color: "#9FD8C8",
        align: "center",
        lineHeight: 1.3,
      }),
      shapeEl("rect", 290, 1450, 500, 110, "#F2C14E", { radius: 55, name: "Botão" }),
      textEl(290, 1478, 500, 60, "Quero agora", {
        size: 38,
        weight: 700,
        color: "#06231F",
        align: "center",
      }),
      textEl(96, 1740, 888, 60, "arraste para cima", { size: 28, color: "#5E9384", align: "center" }),
    ],
  },
  {
    id: "relatorio-a4",
    name: "Relatório A4",
    category: "Documento",
    w: 794,
    h: 1123,
    background: "#FFFFFF",
    build: () => [
      shapeEl("rect", 0, 0, 794, 12, "#6C5CE7", { name: "Fio superior" }),
      textEl(64, 80, 420, 40, "KREVO STUDIO", { size: 16, weight: 700, color: "#6C5CE7", letterSpacing: 3 }),
      textEl(64, 150, 660, 130, "Relatório de\ndesign · Q4", {
        size: 56,
        weight: 700,
        color: ink,
        lineHeight: 1.05,
      }),
      shapeEl("rect", 64, 320, 666, 2, "#E6E6F0", { name: "Divisor" }),
      textEl(64, 360, 660, 40, "Resumo", { size: 20, weight: 700, color: ink }),
      textEl(
        64,
        410,
        666,
        320,
        "O trimestre fechou com 42 artes aprovadas e um ganho de 18% na velocidade de entrega. O agente de IA gerou o primeiro rascunho de 70% dos materiais, e o time humano refinou tipografia, contraste e hierarquia — o melhor dos dois mundos.",
        { size: 15, color: "#3A3F52", lineHeight: 1.65 },
      ),
      ...[
        ["42", "artes entregues"],
        ["18%", "mais rápido"],
        ["7", "marcas"],
      ].flatMap(([big, label], i) => {
        const x = 64 + i * 224;
        return [
          textEl(x, 780, 200, 70, big, { size: 48, weight: 700, color: "#6C5CE7" }),
          textEl(x, 852, 200, 40, label, { size: 14, color: "#6B6F8A" }),
        ];
      }),
      textEl(64, 1040, 666, 30, "krevo.app · página 1", { size: 11, color: "#A0A4B8" }),
    ],
  },
  {
    id: "curriculo",
    name: "Currículo minimal",
    category: "Documento",
    w: 794,
    h: 1123,
    background: "#FAF7F2",
    build: () => [
      shapeEl("ellipse", 880, -140, 460, 460, "#7BD389", { opacity: 0.35, name: "Halo" }),
      textEl(72, 150, 700, 70, "E-BOOK GRATUITO", {
        size: 22,
        weight: 700,
        color: "#7BD389",
        letterSpacing: 5,
      }),
      textEl(72, 230, 760, 200, "Design com IA\nsem perder a mão.", {
        size: 76,
        weight: 800,
        color: "#EAF6FF",
        lineHeight: 1,
      }),
      textEl(72, 470, 620, 60, "32 páginas · download imediato", { size: 24, color: "#9EC5DE" }),
      shapeEl("rect", 860, 430, 268, 96, "#EAF6FF", { radius: 48, name: "Botão" }),
      textEl(860, 458, 268, 44, "Baixar", { size: 30, weight: 700, color: "#0B2C46", align: "center" }),
    ],
  },
  {
    id: "certificado",
    name: "Certificado",
    category: "Documento",
    w: 1123,
    h: 794,
    background: "#FBF8F2",
    build: () => [
      shapeEl("rect", 28, 28, 1067, 738, "#FBF8F2", {
        stroke: { color: "#C9A227", width: 3 },
        radius: 6,
        name: "Moldura",
      }),
      textEl(120, 130, 880, 50, "CERTIFICADO", {
        size: 30,
        weight: 700,
        color: "#C9A227",
        letterSpacing: 10,
        align: "center",
      }),
      textEl(120, 230, 880, 60, "Certificamos que", { size: 22, color: "#6B6259", align: "center" }),
      textEl(120, 300, 880, 100, "Ana Ribeiro", {
        size: 68,
        weight: 700,
        color: "#1A1714",
        align: "center",
      }),
      textEl(200, 430, 720, 110, "concluiu com êxito a formação em Direção de Arte Digital, com carga horária de 80 horas.", {
        size: 22,
        color: "#4A443B",
        align: "center",
        lineHeight: 1.5,
      }),
      shapeEl("rect", 360, 640, 400, 2, "#D9D0C1", { name: "Linha assinatura" }),
      textEl(360, 660, 400, 40, "Coordenação Krevo", { size: 16, color: "#6B6259", align: "center" }),
    ],
  },
  {
    id: "card-preco",
    name: "Card · Preço",
    category: "Marketing",
    w: 1080,
    h: 1080,
    background: "#0B1020",
    build: () => [
      shapeEl("ellipse", 300, -220, 700, 700, "#6C5CE7", { opacity: 0.35, name: "Halo" }),
      textEl(96, 140, 500, 40, "PLANO STUDIO", { size: 22, weight: 700, color: "#00D4B8", letterSpacing: 5 }),
      textEl(96, 210, 500, 120, "R$ 39", { size: 96, weight: 800, color: "#F7F7FB" }),
      textEl(320, 282, 200, 40, "/mês", { size: 26, color: "#9E9BC7" }),
      textEl(96, 380, 700, 300, "✓ Projetos ilimitados\n✓ Agente de IA incluído\n✓ Exportação PDF vetorial\n✓ Suas próprias chaves de API", {
        size: 28,
        color: "#B9B7D6",
        lineHeight: 1.9,
      }),
      shapeEl("rect", 96, 830, 420, 110, "#00D4B8", { radius: 55, name: "Botão" }),
      textEl(96, 860, 420, 60, "Começar agora", {
        size: 34,
        weight: 700,
        color: "#04121F",
        align: "center",
      }),
    ],
  },
  {
    id: "em-branco",
    name: "Em branco",
    category: "Básico",
    w: 1280,
    h: 720,
    background: "#FFFFFF",
    build: () => [],
  },
];

export const TEMPLATE_CATEGORIES = [
  "Todos",
  ...Array.from(new Set(TEMPLATES.map((t) => t.category))),
];

/* ------------------------------------------------------------------ */
/* Kit estilo Canva: formas, estilos de texto, ajustes e efeitos       */
/* ------------------------------------------------------------------ */

/** Formas vetoriais extras (preenchidas com a cor escolhida). */
export const SHAPES: { id: string; name: string; path: string; viewBox?: string }[] = [
  { id: "triangle", name: "Triângulo", path: "M50 4 96 92H4z" },
  { id: "star", name: "Estrela", path: "M50 3l14.6 29.6L97 37.2 71.5 62l6 34.5L50 80.2 22.6 96.5l6-34.5L3 37.2l32.4-4.6z" },
  { id: "arrow", name: "Seta", path: "M4 42h58V18l38 34-38 34V62H4z" },
  { id: "chevron", name: "Chevron", path: "M18 6l44 44-44 44H38l44-44L38 6z" },
  { id: "bubble", name: "Balão", path: "M8 12h84a8 8 0 018 8v44a8 8 0 01-8 8H60l-22 18V72H8a8 8 0 01-8-8V20a8 8 0 018-8z" },
  { id: "hexagon", name: "Hexágono", path: "M50 3l41 24v46L50 97 9 73V27z" },
  { id: "diamond", name: "Losango", path: "M50 4l46 46-46 46L4 50z" },
  { id: "cross", name: "Cruz", path: "M36 4h28v32h32v28H64v32H36V64H4V36h32z" },
  { id: "ring", name: "Anel", path: "M50 4a46 46 0 100 92 46 46 0 000-92zm0 18a28 28 0 110 56 28 28 0 010-56z" },
  { id: "pill", name: "Cápsula", path: "M26 10h48a40 40 0 010 80H26a40 40 0 010-80z" },
  { id: "quarter", name: "Arco", path: "M4 96V4a92 92 0 0192 92z" },
  { id: "burst", name: "Explosão", path: "M50 2l8 22 18-14 2 23 23-3-9 21 21 9-19 13 14 18-23 2 3 23-21-10-9 22-14-19-18 14-2-23-23 3 10-21L2 55l19-13L8 24l23-2L28 0z" },
];

/** SVG da forma como data URI (cor sólida). */
export function shapeDataUri(id: string, color = "#0B1020"): string {
  const shape = SHAPES.find((item) => item.id === id);
  if (!shape) return "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${shape.path}" fill="${color}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Estilos de texto prontos (como as combinações do Canva). */
export const TEXT_PRESETS: {
  id: string;
  name: string;
  size: number;
  weight: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  width?: number;
}[] = [
  { id: "titulo", name: "Título", size: 96, weight: 800, lineHeight: 1.02, align: "left" },
  { id: "subtitulo", name: "Subtítulo", size: 48, weight: 600, lineHeight: 1.15, align: "left" },
  { id: "corpo", name: "Corpo", size: 28, weight: 400, lineHeight: 1.5, align: "left" },
  { id: "citacao", name: "Citação", size: 40, weight: 300, lineHeight: 1.4, align: "center" },
  { id: "rotulo", name: "Rótulo", size: 18, weight: 600, lineHeight: 1.2, align: "left" },
  { id: "botao", name: "Botão", size: 24, weight: 600, lineHeight: 1, align: "center" },
  { id: "destaque", name: "Destaque", size: 140, weight: 800, lineHeight: 0.95, align: "center" },
  { id: "legenda", name: "Legenda", size: 16, weight: 400, lineHeight: 1.4, align: "left" },
];

/** Presets de ajuste de imagem. */
export const FILTER_PRESETS: {
  id: string;
  name: string;
  filters: { brightness: number; contrast: number; saturation: number; blur: number; grayscale: number };
}[] = [
  { id: "original", name: "Original", filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0 } },
  { id: "vivido", name: "Vívido", filters: { brightness: 104, contrast: 116, saturation: 138, blur: 0, grayscale: 0 } },
  { id: "suave", name: "Suave", filters: { brightness: 106, contrast: 92, saturation: 96, blur: 0, grayscale: 0 } },
  { id: "pb", name: "Preto e branco", filters: { brightness: 102, contrast: 112, saturation: 100, blur: 0, grayscale: 100 } },
  { id: "fosco", name: "Fosco", filters: { brightness: 104, contrast: 86, saturation: 78, blur: 0, grayscale: 0 } },
  { id: "quente", name: "Quente", filters: { brightness: 104, contrast: 104, saturation: 122, blur: 0, grayscale: 0 } },
  { id: "desfoque", name: "Desfoque", filters: { brightness: 100, contrast: 100, saturation: 100, blur: 8, grayscale: 0 } },
  { id: "escuro", name: "Escuro", filters: { brightness: 78, contrast: 118, saturation: 92, blur: 0, grayscale: 0 } },
];

/** Sombras prontas. */
export const SHADOW_PRESETS: { id: string; name: string; shadow: { x: number; y: number; blur: number; color: string } | null }[] = [
  { id: "none", name: "Sem sombra", shadow: null },
  { id: "suave", name: "Suave", shadow: { x: 0, y: 6, blur: 18, color: "rgba(0,0,0,0.22)" } },
  { id: "media", name: "Média", shadow: { x: 0, y: 12, blur: 30, color: "rgba(0,0,0,0.34)" } },
  { id: "alta", name: "Alta", shadow: { x: 0, y: 22, blur: 48, color: "rgba(0,0,0,0.45)" } },
  { id: "dura", name: "Dura", shadow: { x: 8, y: 8, blur: 0, color: "rgba(0,0,0,0.55)" } },
  { id: "menta", name: "Menta", shadow: { x: 0, y: 14, blur: 34, color: "rgba(52,211,159,0.38)" } },
];

/** Cantos prontos. */
export const RADIUS_PRESETS = [0, 4, 8, 16, 24, 36, 64];

/** Tamanhos de página para "redimensionar" (magic resize). */
export const RESIZE_PRESETS: { id: string; name: string; w: number; h: number }[] = [
  { id: "slide", name: "Slide 16:9", w: 1920, h: 1080 },
  { id: "slide-4-3", name: "Slide 4:3", w: 1440, h: 1080 },
  { id: "a4", name: "A4 retrato", w: 794, h: 1123 },
  { id: "a4-land", name: "A4 paisagem", w: 1123, h: 794 },
  { id: "post", name: "Post 1:1", w: 1080, h: 1080 },
  { id: "story", name: "Story 9:16", w: 1080, h: 1920 },
  { id: "retrato", name: "Retrato 4:5", w: 1080, h: 1350 },
  { id: "banner", name: "Banner 1200×628", w: 1200, h: 628 },
  { id: "capa", name: "Capa 1600×900", w: 1600, h: 900 },
];
