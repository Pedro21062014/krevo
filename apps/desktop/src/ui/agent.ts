/**
 * Agente de design do Krevo — lado da interface.
 *
 * Fluxo: briefing → system prompt (com grid e marca) → provedor escolhido →
 * plano de design em JSON → elementos no canvas.
 * Sem chave de API cai no modo demo (gerador local determinístico).
 */

import { baseElement, iconDataUri, placeholderImage } from "../assets";
import { aiChat, designDemoPlan, designSystemPrompt, type DesignPlan, type DesignNode } from "../bridge";
import { store } from "../store";
import type { Element, Fill, TextAlign } from "../types";
import { esc } from "../util";
import { icons } from "./icons";

const QUICK_ACTIONS: { id: string; label: string; prompt: string }[] = [
  { id: "create", label: "Criar página", prompt: "__CREATE__" },
  { id: "improve", label: "Melhorar layout", prompt: "__IMPROVE__" },
  { id: "palette", label: "Trocar paleta", prompt: "Troque a paleta desta página por algo mais sofisticado, mantendo o conteúdo." },
  { id: "copy", label: "Escrever copy", prompt: "Reescreva os textos desta página com copy mais persuasiva e direta." },
  { id: "image", label: "Adicionar imagem", prompt: "Adicione uma imagem de fundo coerente com o tema e reorganize o texto para manter a leitura." },
];

/* ------------------------------------------------------------------ */
/* Conversão plano → elementos                                         */
/* ------------------------------------------------------------------ */

function toFill(value: string | undefined): Fill | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("unsplash:")) return null;
  if (trimmed.startsWith("linear-gradient") || trimmed.startsWith("url(")) return null;
  return trimmed;
}

function nodeToElement(node: DesignNode, pageWidth: number, pageHeight: number): Element {
  const kind =
    node.type === "text" || node.type === "rect" || node.type === "ellipse" || node.type === "line" || node.type === "image" || node.type === "icon"
      ? node.type
      : "rect";

  const el = baseElement(kind, 0, 0, 100, 100);
  el.x = Math.round(Math.max(-pageWidth, Math.min(pageWidth * 2, node.x ?? 0)));
  el.y = Math.round(Math.max(-pageHeight, Math.min(pageHeight * 2, node.y ?? 0)));
  el.w = Math.round(Math.max(4, node.w ?? 100));
  el.h = Math.round(Math.max(4, node.h ?? 100));
  el.opacity = typeof node.opacity === "number" ? Math.max(0, Math.min(1, node.opacity)) : 1;
  el.rotation = node.rotation ?? 0;
  el.radius = node.radius ?? 0;
  el.name = node.content ? node.content.slice(0, 20) : kind;

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
    el.fill = toFill(node.fill) ?? (kind === "ellipse" ? "#6C5CE7" : "#6C5CE7");
    if (node.stroke) el.stroke = { color: node.stroke, width: 2 };
    if (kind === "image") {
      el.fit = "cover";
      const src = node.src ?? "";
      if (src.startsWith("unsplash:")) {
        const term = src.replace("unsplash:", "").trim() || "abstract";
        el.src = placeholderImage(term, "#6C5CE7", "#00D4B8", 1200, 800);
        el.name = `Imagem: ${term}`;
      } else if (src) {
        el.src = src;
      } else {
        el.src = placeholderImage("imagem", "#241B4D", "#6C5CE7", 1200, 800);
      }
    }
  }
  return el;
}

export function planToElements(plan: DesignPlan, pageWidth: number, pageHeight: number): Element[] {
  return (plan.elements ?? [])
    .slice(0, 40)
    .map((node) => nodeToElement(node, pageWidth, pageHeight));
}

function normalizeBackground(plan: DesignPlan): Fill | undefined {
  const bg = plan.background;
  if (!bg) return undefined;
  if (typeof bg === "string") return bg;
  if (bg.stops?.length) return bg;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Geração                                                             */
/* ------------------------------------------------------------------ */

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function pageContext(): string {
  const page = store.page;
  const lines = page.elements
    .slice(0, 24)
    .map((el) => `- ${el.kind} "${(el.text?.content ?? el.name ?? "").slice(0, 60)}" em (${Math.round(el.x)},${Math.round(el.y)}) ${Math.round(el.w)}×${Math.round(el.h)}`);
  return `Página atual: ${page.width}×${page.height}px, fundo ${JSON.stringify(page.background)}.\nElementos:\n${lines.join("\n") || "- (vazia)"}`;
}

export async function generateDesign(brief: string, options: { replace?: boolean } = {}): Promise<void> {
  const settings = store.state.settings;
  const page = store.page;
  const prompt = await designSystemPrompt(page.width, page.height, brief, settings.brand);
  store.addChat({ role: "user", content: brief });
  store.patch({ agentBusy: true, rightPanel: "agent" });

  const hasKey = settings.apiKey.trim().length > 0 || settings.provider === "ollama";
  try {
    if (!hasKey && settings.autoDemo) {
      const plan = await designDemoPlan(brief, page.width, page.height);
      applyPlan(plan, options.replace ?? true);
      store.addChat({
        role: "assistant",
        content: `Criei um ${page.width}×${page.height} com ${plan.elements.length} elementos usando o gerador local (modo demo, sem chave de API).\n\n${plan.rationale}\n\nDica: conecte sua API em Ajustes → Agente de IA para resultados sob medida.`,
        meta: "modo demo · offline",
      });
      store.toast("Design gerado no modo demo. Conecte sua API para refinar.", "success");
      return;
    }
    if (!hasKey) {
      store.addChat({
        role: "assistant",
        content: "Preciso de uma chave de API para gerar (ou ative o modo demo em Ajustes → Agente de IA). Funciona com OpenAI, Claude, Gemini, Groq, DeepSeek, Mistral, OpenRouter e Ollama local.",
      });
      return;
    }

    const history = store.state.chat
      .filter((m) => m.role !== "system")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const result = await aiChat({
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      baseUrl: settings.baseUrl,
      jsonMode: true,
      temperature: 0.8,
      messages: [
        { role: "system", content: prompt },
        ...history,
        { role: "user", content: `${brief}\n\n${options.replace ? pageContext() : ""}` },
      ],
    });

    store.patch({ agentModel: result.model });
    const json = extractJson(result.text);
    if (!json) {
      store.addChat({ role: "assistant", content: result.text.slice(0, 1200), meta: `${result.model} · ${Math.round(result.ms)} ms` });
      return;
    }
    const plan = JSON.parse(json) as DesignPlan;
    applyPlan(plan, options.replace ?? true);
    store.addChat({
      role: "assistant",
      content: `${plan.title || "Design pronto"} — ${plan.elements.length} elementos aplicados.${plan.rationale ? `\n\n${plan.rationale}` : ""}`,
      meta: `${result.model} · ${Math.round(result.ms)} ms`,
    });
    store.toast("Design aplicado no canvas.", "success");
  } catch (error) {
    const message = (error as Error).message;
    store.addChat({ role: "assistant", content: `Não consegui concluir: ${message}` });
    store.toast(message, "error");
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
  await generateDesign("Melhore a hierarquia, o espaçamento e o contraste desta página, mantendo o conteúdo.", {
    replace: true,
  });
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

export function agentPanelHtml(): string {
  const state = store.state;
  const settings = state.settings;
  const hasKey = settings.apiKey.trim().length > 0 || settings.provider === "ollama";
  const log = state.chat
    .map(
      (message) => `
      <div class="msg ${message.role}">
        <span class="who">${message.role === "user" ? "Você" : "Agente Krevo"}</span>
        <div class="bubble">${esc(message.content)}</div>
        ${message.meta ? `<span class="meta">${esc(message.meta)}</span>` : ""}
      </div>`,
    )
    .join("");

  return `
  <div class="agent">
    <div class="panel-head">
      <span>${icons.sparkles} Agente</span>
      <span class="pill ${hasKey ? "ok" : ""}">${hasKey ? esc(settings.provider) : "modo demo"}</span>
    </div>
    <div class="agent-log" id="agent-log">
      ${
        log ||
        `<div class="msg assistant">
          <span class="who">Agente Krevo</span>
          <div class="bubble">Olá! Eu monto e ajusto layouts direto no canvas.
Diga o que você quer criar — ou use um atalho abaixo.

${
  hasKey
    ? "Sua chave está conectada. Vou desenhar com o grid desta página e a paleta da sua marca."
    : "Sem chave de API eu uso o gerador local (modo demo). Conecte a sua em Ajustes → Agente de IA."
}</div>
        </div>`
      }
      ${state.agentBusy ? `<div class="msg assistant"><span class="who">Agente Krevo</span><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>` : ""}
    </div>
    <div class="agent-input">
      <div class="chips" style="margin-bottom:2px">
        ${QUICK_ACTIONS.map((a) => `<button class="chip" data-agent="${a.id}">${esc(a.label)}</button>`).join("")}
      </div>
      <textarea id="agent-text" placeholder="Ex.: crie um slide de capa para uma consultoria de dados, fundo escuro, tipografia grande"></textarea>
      <div class="agent-row">
        <button class="btn small ghost" data-agent="clear">${icons.trash} Limpar</button>
        <div class="spacer"></div>
        <span class="tiny muted">${state.agentModel ? esc(state.agentModel) : ""}</span>
        <button class="btn primary small" data-agent="send">${icons.send} Gerar</button>
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
      if (action === "send") {
        const value = textarea?.value.trim() ?? "";
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
      if (action === "create") {
        const brief = textarea?.value.trim() || "Crie um design profissional para redes sociais com o tema da minha marca";
        if (textarea) textarea.value = "";
        void generateDesign(brief).then(repaint);
        repaint();
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
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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

export { iconDataUri };
