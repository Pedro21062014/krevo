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

/** Tempo de espera sugerido por limites de plano grátis ("Retry after 4s"). */
export function retryAfterMs(message: string): number | null {
  const match = /retry after (\d+)\s*s/i.exec(message ?? "");
  return match ? Math.min(45, Number(match[1])) * 1000 : null;
}

/** Traduz erros de provedor em mensagens acionáveis, em português. */
export function friendlyAiError(status: number, raw: string, provider: string): string {
  const message = String(raw ?? "").trim();
  if (status === 402 || /free limit|FREE_LIMIT/i.test(message)) {
    const wait = retryAfterMs(message);
    return `O plano grátis do Pollinations libera 1 resposta a cada 30 s — ${
      wait ? `aguarde ~${Math.ceil(wait / 1000)} s` : "aguarde ~30 s"
    } e gere de novo. Para uso sem limite, cole a sua chave em Ajustes → Agente de IA (OpenAI, Gemini, Groq…).`;
  }
  if (status === 429) {
    return `O provedor está limitando as requisições (429).${
      provider === "pollinations" ? " O plano grátis aceita 1 resposta a cada 30 s." : ""
    } Espere alguns segundos ou use a sua chave.`;
  }
  if (status === 401 || status === 403) {
    return "A chave foi recusada (401/403). Confira a chave, o modelo e a URL base em Ajustes → Agente de IA.";
  }
  if (status === 404) {
    return "Modelo ou endpoint não encontrado (404). Confira o nome do modelo em Ajustes → Agente de IA.";
  }
  if (status >= 500) {
    return `O provedor está instável (HTTP ${status}). Tente de novo em instantes ou troque de provedor.`;
  }
  return message || `O provedor recusou o pedido (HTTP ${status}).`;
}

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
      version: "0.3.0",
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
  pollinations: "https://text.pollinations.ai/openai",
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
const DEFAULT_MODELS: Record<string, string> = {
  pollinations: "openai",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
  openrouter: "openai/gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  deepseek: "deepseek-chat",
  mistral: "mistral-large-latest",
  ollama: "llama3.1",
};

async function browserChat(args: AiChatArgs): Promise<AiChatResult> {
  const started = performance.now();
  const base = args.baseUrl?.trim() || ENDPOINTS[args.provider] || ENDPOINTS.openai;
  const model = args.model || DEFAULT_MODELS[args.provider] || "gpt-4o-mini";
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
        max_tokens: args.maxTokens ?? 6000,
        temperature: args.temperature ?? 0.7,
        system,
        messages: args.messages.filter((m) => m.role !== "system"),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(friendlyAiError(res.status, data?.error?.message ?? "", args.provider));
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
    if (!res.ok) throw new Error(friendlyAiError(res.status, data?.error?.message ?? "", args.provider));
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    return { text, provider: args.provider, model, ms: performance.now() - started };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(base, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(args.provider === "pollinations"
          ? { referer: "https://github.com/Pedro21062014/krevo" }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: args.temperature ?? 0.7,
        max_tokens: args.maxTokens ?? 6000,
        messages: args.messages,
        ...(args.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const message = data.choices?.[0]?.message ?? {};
      // Alguns modelos de raciocínio devolvem o texto em `reasoning` e deixam
      // `content` vazio — aproveitamos o que existir.
      const text = String(message.content ?? "").trim() || String(message.reasoning ?? "").trim();
      if (text) return { text, provider: args.provider, model, ms: performance.now() - started };
      lastError = "O provedor devolveu uma resposta vazia. Tente de novo em alguns segundos.";
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        continue;
      }
      break;
    }

    const raw =
      typeof data?.error === "string"
        ? data.error
        : (data?.error?.message ?? `HTTP ${res.status}`);
    lastError = friendlyAiError(res.status, raw, args.provider);

    // Plano grátis: o provedor diz em quantos segundos libera de novo.
    // Se o intervalo for curto, esperamos e tentamos uma única vez.
    const wait = res.status === 402 || res.status === 429 ? retryAfterMs(raw) : null;
    if (wait !== null && wait <= 32000 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, wait + 900));
      continue;
    }
    break;
  }
  throw new Error(lastError || "Não consegui falar com o provedor de IA.");
}

export async function aiChat(args: AiChatArgs): Promise<AiChatResult> {
  return call("ai_chat", { args }, () => browserChat(args));
}

export interface AiTestResult {
  ok: boolean;
  message: string;
  model: string;
  ms: number;
}

/** Valida provedor/chave/modelo com um pedido mínimo. */
export async function aiTest(args: Omit<AiChatArgs, "messages" | "jsonMode" | "temperature" | "maxTokens">): Promise<AiTestResult> {
  return call(
    "ai_test",
    { args: { ...args, messages: [], jsonMode: false, temperature: 0.1, maxTokens: 12 } },
    async () => {
      const started = performance.now();
      try {
        const result = await browserChat({
          ...args,
          messages: [{ role: "user", content: "Responda apenas: ok" }],
          maxTokens: 12,
          temperature: 0.1,
        });
        return {
          ok: true,
          message: `Conexão funcionando (${result.model || args.provider}) em ${Math.round(result.ms)} ms.`,
          model: result.model,
          ms: Math.round(performance.now() - started),
        };
      } catch (error) {
        return { ok: false, message: (error as Error).message, model: "", ms: 0 };
      }
    },
  );
}

export async function designSystemPrompt(
  width: number,
  height: number,
  brief: string,
  brand: unknown,
): Promise<string> {
  const palette =
    (brand as { palette?: string[] } | undefined)?.palette?.join(", ") ??
    "#0B1020, #34D39F, #F7F7FB";
  const margin = Math.round(Math.min(width, height) * 0.07);
  const titleSize = Math.round(Math.min(120, Math.max(36, height * 0.085)));

  return call(
    "design_system_prompt",
    { width, height, brief, brand },
    async () =>
      `Você é o Agente Krevo: diretor de arte sênior que desenha dentro de um editor de design vetorial. Você NÃO escreve código nem CSS — você posiciona elementos.

SAÍDA: um único objeto JSON válido. Sem markdown, sem comentários, sem texto fora do JSON.

A página tem ${width} x ${height} px (origem no canto superior esquerdo, y cresce para baixo).
Margem segura: ${margin}px em todos os lados. Nada pode cruzar essa margem.

Formato exato:
{"title":"nome curto do design","rationale":"1 frase sobre a decisão de design","background":"#RRGGBB" ou {"angle":135,"stops":[{"offset":0,"color":"#111111"},{"offset":1,"color":"#1E2A44"}]},"palette":["#hex","#hex","#hex"],"elements":[{"type":"text","x":${margin},"y":260,"w":900,"h":200,"content":"Título","fontSize":${titleSize},"fontWeight":700,"lineHeight":1.05,"color":"#F5F5F3","align":"left"},{"type":"rect","x":${margin},"y":200,"w":72,"h":6,"fill":"#34D39F","radius":3},{"type":"image","x":${Math.round(width * 0.62)},"y":0,"w":${Math.round(width * 0.38)},"h":${height},"src":"unsplash:abstract","fit":"cover"}]}

Chaves permitidas em cada elemento: type, x, y, w, h, content, fontSize, fontWeight, lineHeight, align, color, fill, radius, opacity, rotation, stroke, src, fit.
type aceita: text | rect | ellipse | line | image | icon.

REGRA DE OURO — entregue um design COMPLETO, nunca um rascunho:
- Mínimo 8 e máximo 14 elementos. Um único texto é considerado resposta inválida.
- Sempre inclua: (1) fundo em "background", (2) título grande (${titleSize}px ou mais), (3) subtítulo de 20-30px, (4) uma linha de apoio ou dado, (5) um detalhe gráfico da marca (barra, filete ou selo) e (6) uma imagem ou forma geométrica que dê profundidade.
- Hierarquia: título ${titleSize}px · subtítulo 24-30px · corpo 16-18px · rodapé 12-14px.
- Contraste AA obrigatório: texto claro sobre fundo escuro ou vice-versa.
- Se usar imagem, aplique scrim (retângulo semi-transparente, opacity 0.25-0.6) entre a foto e o texto.
- Alinhe à esquerda por padrão; centro só em capas simétricas.
- Coordenadas inteiras, dentro de 0..${width} e 0..${height}.
- Máximo 3 famílias de cor + neutros. Paleta da marca: ${palette}.
- Imagens: use src "unsplash:termo em inglês".
- Escreva o conteúdo no idioma do briefing (português, se for português).
- Nada de Lorem ipsum nem "seu texto aqui": escreva copy real e específica.
- Responda o JSON em uma única linha, compacto (sem indentação nem quebras), para caber inteiro.
- Entregue a peça final. Não faça perguntas.

Checklist antes de responder: o JSON é válido? tem 8+ elementos? o título está grande? o fundo está definido? nada saiu da margem? o texto tem contraste?

Briefing do usuário: ${brief.trim() || "(livre — proponha algo sofisticado)"}`,
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

/** Provedores exibidos em Ajustes (ordem = recomendação). */
export const PROVIDERS: { id: string; label: string; hint: string; needsKey: boolean }[] = [
  { id: "pollinations", label: "Grátis, sem chave", hint: "Pollinations · funciona na hora", needsKey: false },
  { id: "openai", label: "OpenAI (GPT)", hint: "gpt-4o-mini", needsKey: true },
  { id: "anthropic", label: "Anthropic (Claude)", hint: "claude-sonnet", needsKey: true },
  { id: "gemini", label: "Google Gemini", hint: "gemini-2.0-flash", needsKey: true },
  { id: "openrouter", label: "OpenRouter", hint: "vários modelos", needsKey: true },
  { id: "groq", label: "Groq", hint: "llama-3.3-70b", needsKey: true },
  { id: "deepseek", label: "DeepSeek", hint: "deepseek-chat", needsKey: true },
  { id: "mistral", label: "Mistral", hint: "mistral-large", needsKey: true },
  { id: "ollama", label: "Ollama (local)", hint: "roda na sua máquina", needsKey: false },
  { id: "custom", label: "Endpoint compatível", hint: "URL base própria", needsKey: false },
];

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
