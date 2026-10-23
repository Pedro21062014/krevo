/**
 * Ponte entre a interface e o backend.
 *
 * No app desktop (Tauri) tudo passa pelo Rust. No navegador (preview/dev) os
 * comandos caem em implementações equivalentes em TypeScript — assim a mesma
 * interface roda nos dois lugares.
 */

import type { Photo, Project } from "./types";
import { placeholderImage } from "./assets";
import { slug } from "./util";

type Invoker = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let invoker: Invoker | null = null;
let detected = false;

export function isDesktop(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    "undefined";
}

async function getInvoker(): Promise<Invoker | null> {
  if (detected) return invoker;
  detected = true;
  if (!isDesktop()) return (invoker = null);
  try {
    const mod = await import("@tauri-apps/api/core");
    invoker = mod.invoke as unknown as Invoker;
  } catch (error) {
    console.warn("Tauri indisponível, usando modo navegador", error);
    invoker = null;
  }
  return invoker;
}

async function call<T>(cmd: string, args: Record<string, unknown>, fallback: () => Promise<T>): Promise<T> {
  const invoke = await getInvoker();
  if (!invoke) return fallback();
  return invoke<T>(cmd, args);
}

/* ------------------------------------------------------------------ */
/* Info do app                                                         */
/* ------------------------------------------------------------------ */

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  engine: string;
  pdfEngine: string;
  offline: boolean;
}

export async function appInfo(): Promise<AppInfo> {
  return call(
    "app_info",
    {},
    async () => ({
      name: "Krevo",
      version: "0.1.0",
      platform: "web",
      arch: navigator.platform || "browser",
      engine: "krevo-core (modo navegador)",
      pdfEngine: "Impressão do navegador / motor Rust no app desktop",
      offline: true,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* IA                                                                  */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  role: string;
  content: string;
}

export interface AiChatArgs {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResult {
  text: string;
  provider: string;
  model: string;
  ms: number;
}

const ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  ollama: "http://localhost:11434/v1/chat/completions",
};

/** Chamada direta no navegador (mesmo dialeto do backend Rust). */
async function browserChat(args: AiChatArgs): Promise<AiChatResult> {
  const started = performance.now();
  const base = args.baseUrl?.trim() || ENDPOINTS[args.provider] || ENDPOINTS.openai;
  const model = args.model || "gpt-4o-mini";
  const key = args.apiKey?.trim() ?? "";

  if (args.provider === "anthropic") {
    const system = args.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const res = await fetch(base, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens ?? 4096,
        temperature: args.temperature ?? 0.7,
        system,
        messages: args.messages.filter((m) => m.role !== "system"),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    const text = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    return { text, provider: args.provider, model, ms: performance.now() - started };
  }

  if (args.provider === "gemini") {
    const system = args.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const res = await fetch(`${base}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: args.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: {
          temperature: args.temperature ?? 0.7,
          maxOutputTokens: args.maxTokens ?? 4096,
          responseMimeType: args.jsonMode ? "application/json" : "text/plain",
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    return { text, provider: args.provider, model, ms: performance.now() - started };
  }

  const res = await fetch(base, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: args.temperature ?? 0.7,
      max_tokens: args.maxTokens ?? 4096,
      messages: args.messages,
      ...(args.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, provider: args.provider, model, ms: performance.now() - started };
}

export async function aiChat(args: AiChatArgs): Promise<AiChatResult> {
  return call("ai_chat", { args }, () => browserChat(args));
}

export async function designSystemPrompt(
  width: number,
  height: number,
  brief: string,
  brand: unknown,
): Promise<string> {
  return call("design_system_prompt", { width, height, brief, brand }, async () =>
    [
      `Você é o Agente Krevo. A página tem ${width}x${height} px.`,
      "Responda SOMENTE com JSON no formato:",
      '{"title":"","rationale":"","background":"#0B1020","palette":[],"elements":[{"type":"text","x":0,"y":0,"w":100,"h":50,"content":"","fontSize":48,"fontWeight":700,"color":"#fff","align":"left"}]}',
      `Briefing: ${brief}`,
    ].join("\n"),
  );
}

export interface DesignNode {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  align?: string;
  color?: string;
  fill?: string;
  radius?: number;
  opacity?: number;
  rotation?: number;
  stroke?: string;
  src?: string;
  fit?: string;
}

export interface DesignPlan {
  title: string;
  rationale: string;
  background?: string | { angle: number; stops: { offset: number; color: string }[] };
  palette: string[];
  elements: DesignNode[];
}

/** Gerador local (mesma ideia do `demo_plan` em Rust) para o modo navegador. */
export function localDemoPlan(brief: string, width: number, height: number): DesignPlan {
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  };
  const lower = brief.toLowerCase();
  const palettes: [string, string, string, string, string][] = [
    ["#0B1020", "#241B4D", "#F7F7FB", "#B9B7D6", "#6C5CE7"],
    ["#FAF7F2", "#EFE7DC", "#1A1714", "#6B6259", "#E4572E"],
    ["#06231F", "#0E3B33", "#ECFFF8", "#9FD8C8", "#3ED598"],
    ["#160B0B", "#3A1414", "#FFF3EC", "#D8B4A6", "#FF6B35"],
    ["#F4F6FF", "#E4E9FF", "#101433", "#5A5F86", "#4361EE"],
  ];
  const kw = (words: string[]) => words.some((w) => lower.includes(w));
  let palette = palettes[hash(brief) % palettes.length];
  if (kw(["finan", "tech", "saas", "startup", "ia", "app"])) palette = palettes[0];
  else if (kw(["comida", "restaurante", "café", "cafe", "receita"])) palette = palettes[1];
  else if (kw(["saúde", "saude", "yoga", "eco", "natural"])) palette = palettes[2];
  else if (kw(["festa", "show", "evento", "esporte"])) palette = palettes[3];
  else if (kw(["curso", "aula", "escola", "educação", "educacao"])) palette = palettes[4];

  const [bg, bg2, fg, muted, accent] = palette;
  const m = Math.round(Math.min(width, height) * 0.08);
  const portrait = height > width;
  const titleSize = portrait ? width * 0.105 : height * 0.115;
  const words = brief.trim().split(/\s+/).slice(0, 6).join(" ");
  const title = words
    ? words.charAt(0).toUpperCase() + words.slice(1)
    : "Ideias que\nviram forma.";

  const elements: DesignNode[] = [
    { type: "rect", x: m, y: m, w: titleSize * 0.6, h: 6, fill: accent, radius: 3 },
    {
      type: "text",
      x: m,
      y: Math.round(height * 0.3),
      w: width - m * 2,
      h: Math.round(titleSize * 2.6),
      content: title,
      fontSize: Math.round(titleSize),
      fontWeight: 700,
      color: fg,
      align: "left",
      lineHeight: 1.02,
    },
    {
      type: "text",
      x: m,
      y: Math.round(height * 0.3 + titleSize * 2.9),
      w: Math.round(width * (portrait ? 0.84 : 0.52)),
      h: Math.round(titleSize * 1.2),
      content: brief.trim() ? `Gerado a partir de: ${brief.trim()}` : "Um design gerado pelo agente do Krevo",
      fontSize: Math.round(titleSize * 0.3),
      fontWeight: 400,
      color: muted,
      align: "left",
      lineHeight: 1.4,
    },
    {
      type: "rect",
      x: m,
      y: Math.round(height * 0.3 + titleSize * 4.4),
      w: Math.round(width * 0.26),
      h: Math.round(titleSize * 0.9),
      fill: accent,
      radius: Math.round(titleSize * 0.45),
    },
    {
      type: "ellipse",
      x: width - m - titleSize * 2,
      y: Math.round(height * 0.5),
      w: titleSize * 2.4,
      h: titleSize * 2.4,
      fill: accent,
      opacity: 0.5,
    },
  ];

  if (!portrait) {
    elements.push({
      type: "image",
      x: Math.round(width * 0.62),
      y: 0,
      w: Math.round(width * 0.38),
      h: height,
      src: `unsplash:${lower.includes("finan") ? "finance" : "abstract gradient"}`,
      fit: "cover",
    });
  }

  return {
    title: title.replace(/\n/g, " "),
    rationale: "Título dominante, apoio curto e um gesto de cor da marca — hierarquia antes de ornamento.",
    background: { angle: 135, stops: [{ offset: 0, color: bg }, { offset: 1, color: bg2 }] },
    palette: [bg, accent, fg, muted],
    elements,
  };
}

export async function designDemoPlan(brief: string, width: number, height: number): Promise<DesignPlan> {
  return call("design_demo_plan", { brief, width, height }, async () =>
    localDemoPlan(brief, width, height),
  );
}

/* ------------------------------------------------------------------ */
/* Fotos                                                              */
/* ------------------------------------------------------------------ */

const LOCAL_TERMS: [string, string, string][] = [
  ["Abstrato", "#6C5CE7", "#00D4B8"],
  ["Gradiente", "#F72585", "#4361EE"],
  ["Textura", "#111214", "#F5A524"],
  ["Escritório", "#0B2C46", "#22A7F0"],
  ["Natureza", "#2A9D8F", "#E9C46A"],
  ["Cidade", "#1B1B1B", "#8A8FAE"],
  ["Pessoas", "#FF5D8F", "#FFD166"],
  ["Produto", "#0B1020", "#6C5CE7"],
  ["Tecnologia", "#04121F", "#7BD389"],
  ["Arquitetura", "#FAF7F2", "#B9B7D6"],
  ["Comida", "#E4572E", "#FFC857"],
  ["Viagem", "#22A7F0", "#7BD389"],
];

export function localPhotos(query = ""): Photo[] {
  const q = query.trim().toLowerCase();
  const terms = q
    ? LOCAL_TERMS.filter(([name]) => name.toLowerCase().includes(q) || q.includes(name.toLowerCase()))
    : LOCAL_TERMS;
  const list = terms.length ? terms : LOCAL_TERMS;
  return list.map(([name, c1, c2], i) => ({
    id: `local-${i}`,
    description: `${name} — gerado localmente`,
    thumb: placeholderImage(name, c1, c2, 480, 320),
    regular: placeholderImage(name, c1, c2, 1280, 853),
    full: placeholderImage(name, c1, c2, 1920, 1280),
    author: "Krevo",
    authorUrl: "https://github.com/Pedro21062014/krevo",
    link: "",
    color: c1,
    width: 1920,
    height: 1280,
    provider: "local",
  }));
}

export async function unsplashSearch(
  query: string,
  accessKey: string,
  orientation = "all",
): Promise<{ photos: Photo[]; provider: string; hint: string }> {
  return call(
    "unsplash_search",
    { query, page: 1, perPage: 24, orientation, accessKey },
    async () => ({
      photos: localPhotos(query),
      provider: "local",
      hint: "Modo navegador: acervo local do Krevo. No app desktop, adicione sua chave do Unsplash para buscar milhões de fotos.",
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Arquivos                                                           */
/* ------------------------------------------------------------------ */

async function saveWithDialog(
  suggested: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const path = await dialog.save({ defaultPath: suggested, filters });
    return path ?? null;
  } catch {
    return null;
  }
}

export async function exportPdf(project: Project): Promise<string> {
  const invoke = await getInvoker();
  if (invoke) {
    const path = await saveWithDialog(`${slug(project.name) || "krevo"}.pdf`, [
      { name: "PDF", extensions: ["pdf"] },
    ]);
    if (!path) throw new Error("Exportação cancelada.");
    return invoke<string>("export_pdf", { project, path });
  }
  // Navegador: usa a impressão vetorial do próprio navegador.
  throw new Error("__PRINT__");
}

export async function saveProjectFile(project: Project): Promise<string> {
  const invoke = await getInvoker();
  const json = JSON.stringify({ format: "krevo", version: 1, project }, null, 2);
  if (invoke) {
    const path = await saveWithDialog(`${slug(project.name) || "krevo"}.krevo`, [
      { name: "Projeto Krevo", extensions: ["krevo"] },
    ]);
    if (!path) throw new Error("Salvamento cancelado.");
    return invoke<string>("save_project", { project, path });
  }
  const { download } = await import("./util");
  download(`${slug(project.name) || "krevo"}.krevo`, json, "application/json");
  return "download";
}

export async function saveBinary(name: string, data: string): Promise<string> {
  const invoke = await getInvoker();
  if (invoke) {
    const path = await saveWithDialog(name, [{ name: "Arquivo", extensions: [name.split(".").pop() ?? "bin"] }]);
    if (!path) throw new Error("Cancelado.");
    return invoke<string>("save_binary", { payload: { path, data } });
  }
  const { download } = await import("./util");
  const blob = await (await fetch(data)).blob();
  download(name, blob);
  return "download";
}
