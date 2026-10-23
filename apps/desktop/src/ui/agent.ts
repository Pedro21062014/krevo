/**
 * Agente de design do Krevo — lado da interface.
 *
 * Fluxo real: briefing → system prompt (grid + marca + briefing) → provedor
 * escolhido (grátis sem chave, sua chave, ou Ollama local) → plano JSON →
 * elementos aplicados no canvas. Se o modelo devolver lixo, tentamos reparar e,
 * em último caso, pedimos de novo uma vez.
 */

import { baseElement, iconDataUri, placeholderImage } from "../assets";
import {
  aiChat,
  aiTest,
  designDemoPlan,
  designSystemPrompt,
  type DesignPlan,
  type DesignNode,
  type AiTestResult,
} from "../bridge";
import { store } from "../store";
import type { Element, Fill, TextAlign } from "../types";
import { esc } from "../util";
import { icons } from "./icons";

const QUICK_ACTIONS: { id: string; label: string; prompt: string }[] = [
  { id: "create", label: "Criar página", prompt: "__CREATE__" },
  { id: "improve", label: "Refinar layout", prompt: "__IMPROVE__" },
  { id: "palette", label: "Trocar paleta", prompt: "Troque a paleta desta página por algo mais sofisticado, mantendo o conteúdo e a hierarquia." },
  { id: "copy", label: "Melhorar copy", prompt: "Reescreva os textos desta página com copy mais direta e persuasiva, mantendo o tom da marca." },
  { id: "image", label: "Adicionar imagem", prompt: "Adicione uma imagem de fundo coerente com o tema e reorganize o texto para manter a legibilidade." },
];

/* ------------------------------------------------------------------ */
/* Conversão plano → elementos                                         */
/* ------------------------------------------------------------------ */

function toFill(value: string | undefined): Fill | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("unsplash:") || trimmed.startsWith("linear-gradient") || trimmed.startsWith("url(")) {
    return null;
  }
  return trimmed;
}

function nodeToElement(node: DesignNode, pageWidth: number, pageHeight: number): Element {
  const allowed = ["text", "rect", "ellipse", "line", "image", "icon"] as const;
  const kind = (allowed as readonly string[]).includes(node.type)
    ? (node.type as (typeof allowed)[number])
    : "rect";

  const el = baseElement(kind, 0, 0, 100, 100);
  el.x = Math.round(Math.max(-pageWidth, Math.min(pageWidth * 2, node.x ?? 0)));
  el.y = Math.round(Math.max(-pageHeight, Math.min(pageHeight * 2, node.y ?? 0)));
  el.w = Math.round(Math.max(4, node.w ?? 100));
  el.h = Math.round(Math.max(4, node.h ?? 100));
  el.opacity = typeof node.opacity === "number" ? Math.max(0, Math.min(1, node.opacity)) : 1;
  el.rotation = node.rotation ?? 0;
  el.radius = node.radius ?? 0;
  el.name = (node.content ?? node.type ?? "").slice(0, 28) || kind;

  if (kind === "text") {
    el.text = {
      content: node.content ?? "",
      fontFamily: "Inter",
      fontSize: Math.round(node.fontSize ?? 32),
      fontWeight: node.fontWeight ?? 500,
      lineHeight: node.lineHeight ?? 1.25,
      letterSpacing: 0,
      align: (["left", "center", "right"].includes(node.align ?? "") ? node.align : "left") as TextAlign,
      color: node.color ?? "#111111",
      italic: false,
      underline: false,
    };
    el.h = Math.max(el.h, Math.round((node.fontSize ?? 32) * 1.6));
  } else {
    el.fill = toFill(node.fill) ?? "#111214";
    if (node.stroke) el.stroke = { color: node.stroke, width: 2 };
    if (kind === "image") {
      el.fit = "cover";
      const src = node.src ?? "";
      if (src.startsWith("unsplash:")) {
        const term = src.replace("unsplash:", "").trim() || "abstract";
        el.src = placeholderImage(term, "#1c1f24", "#35d39f", 1200, 800);
        el.name = `Imagem · ${term}`;
      } else {
        el.src = src || placeholderImage("imagem", "#1c1f24", "#3a3f47", 1200, 800);
      }
    }
  }
  return el;
}

export function planToElements(plan: DesignPlan, pageWidth: number, pageHeight: number): Element[] {
  return (plan.elements ?? []).slice(0, 40).map((node) => nodeToElement(node, pageWidth, pageHeight));
}

function normalizeBackground(plan: DesignPlan): Fill | undefined {
  const bg = plan.background;
  if (!bg) return undefined;
  if (typeof bg === "string") return bg;
  if (bg.stops?.length) return bg;
  return undefined;
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** Conserta JSON truncado pela IA (resposta cortada no meio do último elemento). */
export function repairPlanJson(raw: string): string {
  const elementsAt = raw.search(/"elements"\s*:\s*\[/);
  if (elementsAt < 0) return raw;
  const open = raw.indexOf("[", elementsAt);
  const prefix = raw.slice(0, open + 1);

  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = open + 1; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(raw.slice(start, i + 1));
        start = -1;
      }
      continue;
    }
    if (char === "]" && depth === 0) break;
  }

  if (!objects.length) return raw;
  return `${prefix}${objects.join(",")}]}`;
}

/** Lê um plano da IA mesmo quando a resposta veio cortada ou com texto em volta. */
export function readPlan(text: string): DesignPlan | null {
  const json = extractJson(text);
  if (!json) return null;
  for (const candidate of [json, repairPlanJson(json)]) {
    try {
      const plan = JSON.parse(candidate) as DesignPlan;
      if (plan && Array.isArray(plan.elements) && plan.elements.length) return plan;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

function pageContext(): string {
  const page = store.page;
  const lines = page.elements
    .slice(0, 24)
    .map(
      (el) =>
        `- ${el.kind} "${(el.text?.content ?? el.name ?? "").replace(/\n/g, " ").slice(0, 60)}" em (${Math.round(el.x)},${Math.round(el.y)}) ${Math.round(el.w)}×${Math.round(el.h)}`,
    );
  return `Página atual: ${page.width}×${page.height}px.\nElementos:\n${lines.join("\n") || "- (vazia)"}`;
}

/* ------------------------------------------------------------------ */
/* Estado do agente                                                    */
/* ------------------------------------------------------------------ */

export type AgentMode = "free" | "key" | "local" | "demo";

export function agentMode(): AgentMode {
  const s = store.state.settings;
  if (s.provider === "pollinations") return "free";
  if (s.provider === "ollama") return "local";
  if (s.apiKey.trim()) return "key";
  return "demo";
}

function modeLabel(mode: AgentMode): string {
  switch (mode) {
    case "free":
      return "IA grátis · sem chave";
    case "key":
      return "sua chave";
    case "local":
      return "Ollama local";
    default:
      return "modo demo";
  }
}

/* ------------------------------------------------------------------ */
/* Geração                                                             */
/* ------------------------------------------------------------------ */

export async function generateDesign(
  brief: string,
  options: { replace?: boolean } = {},
): Promise<void> {
  const settings = store.state.settings;
  const page = store.page;
  const mode = agentMode();
  store.addChat({ role: "user", content: brief });
  store.patch({ agentBusy: true, rightPanel: "agent" });

  try {
    // Sem nenhum provedor utilizável: gerador local (offline).
    if (mode === "demo") {
      const plan = await designDemoPlan(brief, page.width, page.height);
      applyPlan(plan, options.replace ?? true);
      store.addChat({
        role: "assistant",
        content: `Montei um ${page.width}×${page.height} com ${plan.elements.length} elementos usando o gerador local (modo demo).\n\n${plan.rationale}\n\nPara resultados sob medida, escolha "Grátis, sem chave" ou cole a sua API em Ajustes → Agente de IA.`,
        meta: "gerador local · offline",
      });
      return;
    }

    const prompt = await designSystemPrompt(page.width, page.height, brief, settings.brand);
    const history = store.state.chat
      .filter((m) => m.role !== "system" && m.content !== brief)
      .slice(-4)
      .map((m) => ({ role: m.role, content: m.content }));

    let lastError = "";
    let best: { plan: DesignPlan; model: string; ms: number } | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const extra =
        attempt === 1
          ? ""
          : "\n\nSua resposta anterior não era um JSON válido. Responda AGORA apenas com o objeto JSON do design, sem texto antes ou depois.";
      let result;
      try {
        result = await aiChat({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        baseUrl: settings.baseUrl,
        jsonMode: settings.provider !== "pollinations",
        temperature: 0.8,
        maxTokens: 6000,
        messages: [
          { role: "system", content: prompt },
          ...history,
          {
            role: "user",
            content: `${brief}${options.replace ? `\n\n${pageContext()}` : ""}${extra}`,
          },
        ],
        });
      } catch (error) {
        // Erro do provedor (limite grátis, chave, rede): não insiste, cai para o rascunho local.
        lastError = (error as Error).message;
        break;
      }

      store.patch({ agentModel: `${result.model || settings.provider} · ${Math.round(result.ms)} ms` });

      const plan = readPlan(result.text);
      if (!plan) {
        lastError = "o modelo não devolveu um JSON de design válido";
        continue;
      }
      if (!plan.elements?.length) {
        lastError = "o plano veio sem elementos";
        continue;
      }
      if (plan.elements.length < 4) {
        // O modelo às vezes entrega um rascunho magro: guardamos como reserva e
        // pedimos uma composição mais completa na segunda tentativa.
        if (!best || plan.elements.length > best.plan.elements.length) {
          best = { plan, model: result.model || settings.provider, ms: Math.round(result.ms) };
        }
        lastError = "o modelo entregou uma composição incompleta";
        continue;
      }

      applyPlan(plan, options.replace ?? true);
      store.addChat({
        role: "assistant",
        content: `${plan.title || "Design aplicado"} — ${plan.elements.length} elementos no canvas.${plan.rationale ? `\n\n${plan.rationale}` : ""}`,
        meta: `${result.model || settings.provider} · ${Math.round(result.ms)} ms · ${modeLabel(mode)}`,
      });
      store.toast("Design aplicado no canvas.", "success");
      return;
    }

    // Segunda tentativa também veio magra: aplicamos a melhor resposta real.
    if (best) {
      applyPlan(best.plan, options.replace ?? true);
      store.addChat({
        role: "assistant",
        content: `${best.plan.title || "Design aplicado"} — ${best.plan.elements.length} elementos no canvas.${best.plan.rationale ? `\n\n${best.plan.rationale}` : ""}\n\nPedir mais detalhes (imagem, subtítulo, selo) costuma render uma composição mais rica.`,
        meta: `${best.model} · ${best.ms} ms · ${modeLabel(mode)}`,
      });
      store.toast("Design aplicado no canvas.", "success");
      return;
    }

    // Falhou o provedor: cai para o gerador local em vez de deixar o usuário na mão.
    const plan = await designDemoPlan(brief, page.width, page.height);
    applyPlan(plan, options.replace ?? true);
    store.addChat({
      role: "assistant",
      content: `Aplicado um rascunho local (${lastError}). Refine no canvas ou tente o agente de novo.`,
      meta: "fallback local",
    });
  } catch (error) {
    store.addChat({ role: "assistant", content: (error as Error).message, meta: "erro" });
    store.toast((error as Error).message, "error");
  } finally {
    store.patch({ agentBusy: false });
  }
}

export function applyPlan(plan: DesignPlan, replace = true): void {
  const page = store.page;
  const elements = planToElements(plan, page.width, page.height);
  if (!elements.length) {
    store.toast("O plano veio vazio — tente outro briefing.", "error");
    return;
  }
  const background = normalizeBackground(plan);
  if (replace) {
    store.replacePageElements(elements, background ?? page.background);
  } else {
    store.addElements(elements);
    if (background) store.setPageBackground(background);
  }
  if (plan.palette?.length) {
    store.updateSettings({
      brand: { ...store.state.settings.brand, palette: plan.palette.slice(0, 6) },
    });
  }
}

export async function improveLayout(): Promise<void> {
  await generateDesign(
    "Refine esta página: melhore hierarquia, espaçamento e contraste, mantendo o conteúdo.",
    { replace: true },
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

export function agentPanelHtml(): string {
  const state = store.state;
  const mode = agentMode();
  const log = state.chat
    .map(
      (message) => `
      <div class="msg ${message.role}${message.meta === "erro" ? " error" : ""}">
        <span class="who">${message.role === "user" ? "Você" : "Agente"}</span>
        <div class="bubble">${esc(message.content)}</div>
        ${message.meta ? `<span class="meta">${esc(message.meta)}</span>` : ""}
      </div>`,
    )
    .join("");

  const intro =
    mode === "demo"
      ? `Sem provedor conectado eu uso o **gerador local** (offline), que monta um layout honesto a partir do briefing.

Para IA de verdade: escolha **Grátis, sem chave** (Pollinations) ou cole a sua API em Ajustes.`
      : `Pronto. Descreva o que você quer e eu desenho no canvas desta página (${store.page.width}×${store.page.height}), respeitando grid, margem e a paleta da marca.

Depois de aplicar, você edita tudo à mão normalmente.`;

  return `
  <div class="agent">
    <div class="agent-status">
      <span class="dot ${mode === "demo" ? "off" : ""}"></span>
      <span>${esc(modeLabel(mode))}</span>
      <span class="grow"></span>
      <span class="pill">${esc(state.settings.provider)}</span>
    </div>
    <div class="agent-log" id="agent-log">
      ${
        log ||
        `<div class="msg assistant">
          <span class="who">Agente Krevo</span>
          <div class="bubble">${esc(intro)}</div>
        </div>`
      }
      ${
        state.agentBusy
          ? `<div class="msg assistant"><span class="who">Agente</span><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div><span class="meta">${esc(state.agentModel || "pensando…")}</span></div>`
          : ""
      }
    </div>
    <div class="agent-input">
      <div class="quick-actions">
        ${QUICK_ACTIONS.map((a) => `<button class="chip" data-agent="${a.id}">${esc(a.label)}</button>`).join("")}
      </div>
      <textarea id="agent-text" placeholder="Ex.: capa de proposta para consultoria de dados, fundo escuro, título grande"></textarea>
      <div class="agent-row">
        <button class="btn small ghost icon" data-agent="clear" title="Limpar conversa">${icons.trash}</button>
        <button class="btn small ghost icon" data-agent="settings" title="Configurar IA">${icons.settings}</button>
        <span class="grow"></span>
        <button class="btn primary small" data-agent="send">${icons.sparkles} Gerar</button>
      </div>
    </div>
  </div>`;
}

export function bindAgentPanel(root: HTMLElement): void {
  const repaint = (): void => {
    const host = root.querySelector<HTMLElement>("#agent-host");
    if (host) {
      host.innerHTML = agentPanelHtml();
      bindAgentPanel(root);
    }
  };

  root.querySelectorAll<HTMLElement>(".agent [data-agent]").forEach((node) => {
    node.addEventListener("click", () => {
      const action = node.dataset.agent;
      const textarea = root.querySelector<HTMLTextAreaElement>("#agent-text");

      if (action === "send" || action === "create") {
        const value =
          textarea?.value.trim() ||
          (action === "create"
            ? "Crie uma capa minimalista para apresentação da minha marca, tipografia grande e paleta neutra"
            : "");
        if (!value) {
          store.toast("Escreva o que você quer que o agente faça.", "info");
          return;
        }
        if (textarea) textarea.value = "";
        void generateDesign(value).then(repaint);
        repaint();
        return;
      }
      if (action === "clear") {
        store.patch({ chat: [] });
        repaint();
        return;
      }
      if (action === "settings") {
        store.toast("Configure o provedor em Ajustes → Agente de IA.", "info");
        return;
      }
      if (action === "improve") {
        void improveLayout().then(repaint);
        repaint();
        return;
      }
      const found = QUICK_ACTIONS.find((a) => a.id === action);
      if (found) {
        void generateDesign(found.prompt).then(repaint);
        repaint();
      }
    });
  });

  const textarea = root.querySelector<HTMLTextAreaElement>("#agent-text");
  if (textarea) {
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const value = textarea.value.trim();
        if (!value) return;
        textarea.value = "";
        void generateDesign(value).then(repaint);
        repaint();
      }
    });
  }

  const log = root.querySelector<HTMLElement>("#agent-log");
  if (log) log.scrollTop = log.scrollHeight;
}

/** Teste de conexão vindo do painel de Ajustes / IA. */
export async function testAiConnection(): Promise<AiTestResult> {
  const s = store.state.settings;
  const result = await aiTest({
    provider: s.provider,
    apiKey: s.apiKey,
    model: s.model,
    baseUrl: s.baseUrl,
  });
  store.toast(result.message, result.ok ? "success" : "error");
  return result;
}

export { iconDataUri };
