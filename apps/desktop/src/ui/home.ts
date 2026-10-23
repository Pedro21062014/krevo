/** Tela inicial do Krevo — layout enxuto: navegação no topo, conteúdo denso. */

import {
  FILTER_PRESETS,
  FORMATS,
  GRADIENTS,
  ICONS,
  PALETTES,
  SHAPES,
  STOCK_CATEGORIES,
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEXT_PRESETS,
  shapeDataUri,
  baseElement,
  gradient,
  iconDataUri,
  shapeEl,
  templateToPage,
  textEl,
  type Template,
} from "../assets";
import { appInfo, isDesktop, PROVIDERS, unsplashSearch, type AppInfo } from "../bridge";
import { store } from "../store";
import type { Photo, ProjectSummary } from "../types";
import { esc, formatDate } from "../util";
import { agentMode, testAiConnection } from "./agent";
import { kMark, logoLockup } from "./brand";
import { icons } from "./icons";
import { renderThumbFill } from "./render";
import { openCreateDialog } from "./create";

let photoCache: { query: string; photos: Photo[]; hint: string } | null = null;
let photoQuery = "";
let templateFilter = "Todos";
let info: AppInfo | null = null;

void appInfo().then((i) => {
  info = i;
});

const IDEAS = [
  "Capa de pitch deck para startup de energia solar",
  "Post de lançamento para app de finanças pessoais",
  "Relatório mensal minimalista em A4",
  "Story de promoção para loja de cosméticos",
  "Currículo para vaga de product designer",
];

const TABS: [string, string][] = [
  ["inicio", "Projetos"],
  ["templates", "Templates"],
  ["elementos", "Elementos"],
  ["ia", "Agente de IA"],
];

const theme = (): "dark" | "light" => store.state.settings.theme;

/* ------------------------------------------------------------------ */
/* Cromo                                                               */
/* ------------------------------------------------------------------ */

function topbar(active: string): string {
  const mode = agentMode();
  const dot = mode === "demo" ? "off" : "";
  const label = mode === "demo" ? "Modo demo" : mode === "free" ? "IA grátis ativa" : mode === "local" ? "Ollama local" : "API conectada";
  return `
  <header class="app-top">
    <a class="logo" href="#" data-action="tab" data-tab="inicio" title="Krevo">
      ${logoLockup(theme(), 19)}
    </a>
    <nav class="nav">
      ${TABS.map(
        ([id, label]) =>
          `<button class="${active === id ? "active" : ""}" data-action="tab" data-tab="${id}">${label}</button>`,
      ).join("")}
    </nav>
    <div class="spacer"></div>
    <div class="top-actions">
      <button class="pill ${mode === "demo" ? "" : "ok"}" data-action="tab" data-tab="ia" title="Estado do agente">
        <span class="dot ${dot}"></span>${esc(label)}
      </button>
      <button class="btn ghost icon" data-action="tab" data-tab="ajustes" title="Ajustes">${icons.settings}</button>
      <button class="btn primary" data-action="new-blank">${icons.plus} Novo</button>
    </div>
  </header>`;
}

function skeletons(count: number): string {
  return Array.from({ length: count })
    .map(
      () => `
    <div class="sk-card">
      <div class="skeleton sk-thumb"></div>
      <div class="skeleton sk-line w60"></div>
      <div class="skeleton sk-line w35"></div>
    </div>`,
    )
    .join("");
}

function templateCard(t: Template): string {
  const holder = document.createElement("div");
  holder.appendChild(renderThumbFill(templateToPage(t), 480, 300));
  return `
    <button class="card" data-action="use-template" data-id="${t.id}">
      <div class="card-thumb">${holder.innerHTML}<span class="card-badge">${esc(t.category)}</span></div>
      <div class="card-body">
        <div class="meta"><div class="card-title">${esc(t.name)}</div><div class="card-sub">${t.w}×${t.h}</div></div>
      </div>
    </button>`;
}

function recentCard(item: ProjectSummary): string {
  let holder = document.createElement("div");
  if (item.thumb) {
    holder.innerHTML = `<img src="${item.thumb}" alt="${esc(item.name)}" style="width:100%;height:100%;object-fit:cover;display:block" />`;
  } else {
    holder = document.createElement("div");
    holder.appendChild(renderThumbFill(item.page as never, 480, 300));
  }
  return `
    <div class="card" style="cursor:pointer" data-action="open-recent" data-id="${item.id}">
      <div class="card-thumb">
        ${holder.innerHTML}
        <span class="card-badge">${item.pages} ${item.pages === 1 ? "pág." : "págs."}</span>
        <button class="card-remove" data-action="delete-recent" data-id="${item.id}" title="Remover da lista">${icons.trash}</button>
      </div>
      <div class="card-body">
        <div class="meta"><div class="card-title">${esc(item.name)}</div><div class="card-sub">${formatDate(item.updatedAt)}</div></div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Abas                                                                */
/* ------------------------------------------------------------------ */

function inicioTab(): string {
  const loading = store.state.loadingHome;
  const recent = store.state.recent;
  return `
  <section class="hero">
    <span class="eyebrow"><span class="dot"></span> Krevo 0.2 · estúdio de design com IA</span>
    <h1>O que você quer criar agora?</h1>
    <p>PDF, apresentações, imagens, vídeo e mais — um editor nativo em Rust com um agente de IA ao lado. Descreva o design e ele monta no canvas.</p>

    <div class="composer">
      <textarea id="brief" rows="2" placeholder="Ex.: proposta comercial em A4, tipografia grande, paleta neutra com um detalhe verde"></textarea>
      <div class="composer-bar">
        <div class="chips" id="format-chips">
          ${FORMATS.slice(0, 4)
            .map(
              (f, i) =>
                `<button class="chip ${i === 0 ? "active" : ""}" data-action="pick-format" data-id="${f.id}">${esc(f.name)}</button>`,
            )
            .join("")}
        </div>
        <span class="sep"></span>
        <button class="btn small ghost" data-action="new-blank">${icons.plus} Em branco</button>
        <div class="spacer"></div>
        <button class="btn primary" data-action="generate">${icons.sparkles} Gerar com IA</button>
      </div>
    </div>

    <div class="quick-row">
      ${IDEAS.slice(0, 3)
        .map((idea) => `<button class="quick-chip" data-action="use-idea" data-id="${esc(idea)}">${icons.sparkles} ${esc(idea)}</button>`)
        .join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>Recentes</h2>
      <span class="hint">${recent.length ? `${recent.length} projeto(s) neste computador` : "tudo fica salvo localmente"}</span>
    </div>
    <div class="grid">
      ${
        loading
          ? skeletons(4)
          : recent.length
            ? recent.map((r) => recentCard(r)).join("")
            : `<div class="empty-state" style="grid-column:1/-1">
                 <b>Nenhum projeto ainda</b>
                 Escreva um briefing acima, escolha um template ou comece por um formato.
               </div>`
      }
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>Comece por um formato</h2>
      <span class="hint">páginas em pixels reais</span>
    </div>
    <div class="grid formats">
      ${FORMATS.map(
        (f) => `
        <button class="card" data-action="new-format" data-id="${f.id}">
          <div class="card-thumb" style="aspect-ratio:4/3;display:grid;place-items:center;background:var(--surface-2)">
            <div style="width:34px;height:${Math.round((34 * f.h) / f.w)}px;border-radius:3px;background:color-mix(in srgb, var(--text) 12%, transparent);border:1px solid color-mix(in srgb, var(--text) 18%, transparent)"></div>
          </div>
          <div class="card-body"><div class="meta"><div class="card-title">${esc(f.name)}</div><div class="card-sub">${f.w}×${f.h}</div></div></div>
        </button>`,
      ).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>Templates</h2>
      <button class="chip" data-action="tab" data-tab="templates">Ver todos · ${TEMPLATES.length}</button>
    </div>
    <div class="grid">${TEMPLATES.slice(0, 4).map(templateCard).join("")}</div>
  </section>`;
}

function templatesTab(): string {
  const list = TEMPLATES.filter((t) => templateFilter === "Todos" || t.category === templateFilter);
  return `
  <section class="section" style="margin-top:8px">
    <div class="section-head">
      <h2>Templates</h2>
      <span class="hint">${list.length} modelos editáveis</span>
    </div>
    <div class="chips" style="margin-bottom:16px">
      ${TEMPLATE_CATEGORIES.map(
        (c) => `<button class="chip ${c === templateFilter ? "active" : ""}" data-action="filter-templates" data-id="${esc(c)}">${esc(c)}</button>`,
      ).join("")}
    </div>
    <div class="grid">${list.map(templateCard).join("")}</div>
  </section>`;
}

function elementosTab(): string {
  const shapes: { label: string; kind: "rect" | "ellipse" | "line" | "text"; icon: string }[] = [
    { label: "Retângulo", kind: "rect", icon: icons.square },
    { label: "Elipse", kind: "ellipse", icon: icons.circle },
    { label: "Linha", kind: "line", icon: icons.line },
    { label: "Texto", kind: "text", icon: icons.text },
  ];
  return `
  <section class="section" style="margin-top:8px">
    <div class="section-head"><h2>Formas e textos</h2><span class="hint">clique para inserir no design aberto</span></div>
    <div class="grid dense">
      ${shapes
        .map(
          (s) => `
        <button class="card" data-action="use-element" data-kind="${s.kind}">
          <div class="card-thumb" style="aspect-ratio:3/2;display:grid;place-items:center;color:var(--muted)">${s.icon}</div>
          <div class="card-body"><div class="meta"><div class="card-title">${s.label}</div></div></div>
        </button>`,
        )
        .join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Formas extras</h2><span class="hint">${SHAPES.length} vetores</span></div>
    <div class="grid dense">
      ${SHAPES.map(
        (shape) => `
        <button class="card" data-action="use-shape" data-id="${shape.id}" title="${shape.name}">
          <div class="card-thumb" style="aspect-ratio:1;display:grid;place-items:center">
            <img src="${shapeDataUri(shape.id, "#c9cbcd")}" style="width:30px;height:30px" alt="${shape.name}" />
          </div>
          <div class="card-body"><div class="meta"><div class="card-title">${shape.name}</div></div></div>
        </button>`,
      ).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Estilos de texto</h2><span class="hint">combinações prontas de tipografia</span></div>
    <div class="grid dense">
      ${TEXT_PRESETS.map(
        (preset) => `
        <button class="card" data-action="use-text-preset" data-id="${preset.id}">
          <div class="card-thumb" style="aspect-ratio:2/1;display:grid;place-items:center;background:var(--surface-2)">
            <span style="font-size:${Math.max(11, Math.min(22, preset.size / 5))}px;font-weight:${preset.weight};color:var(--text)">Aa</span>
          </div>
          <div class="card-body"><div class="meta"><div class="card-title">${preset.name}</div><div class="card-sub">${preset.size}px · ${preset.weight}</div></div></div>
        </button>`,
      ).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Filtros de imagem</h2><span class="hint">selecione uma imagem e aplique no inspetor</span></div>
    <div class="grid dense">
      ${FILTER_PRESETS.map(
        (preset) => `
        <div class="card">
          <div class="card-thumb" style="aspect-ratio:3/2;display:grid;place-items:center;background:linear-gradient(135deg,#243b34,#4a5f8c)">
            <span style="filter:brightness(${preset.filters.brightness}%) contrast(${preset.filters.contrast}%) saturate(${preset.filters.saturation}%) grayscale(${preset.filters.grayscale}%) blur(${preset.filters.blur}px);width:100%;height:100%;background:linear-gradient(135deg,#2f6f5a,#8fb4d8);display:block"></span>
          </div>
          <div class="card-body"><div class="meta"><div class="card-title">${preset.name}</div></div></div>
        </div>`,
      ).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Gradientes</h2><span class="hint">aplicam como fundo</span></div>
    <div class="grid dense">
      ${GRADIENTS.map(
        (g) => `
        <button class="card" data-action="use-gradient" data-id="${g.id}">
          <div class="card-thumb" style="aspect-ratio:3/2;background:linear-gradient(${g.value.angle}deg, ${g.value.stops.map((s) => s.color).join(",")})"></div>
          <div class="card-body"><div class="meta"><div class="card-title">${esc(g.name)}</div></div></div>
        </button>`,
      ).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Ícones</h2><span class="hint">${ICONS.length} vetores</span></div>
    <div class="grid dense">
      ${ICONS.map(
        (icon) => `
        <button class="card" data-action="use-icon" data-id="${icon.name}" title="${icon.name}">
          <div class="card-thumb" style="aspect-ratio:1;display:grid;place-items:center">
            <img src="${iconDataUri(icon.name, "#c9cbcd")}" style="width:26px;height:26px" alt="${icon.name}" />
          </div>
        </button>`,
      ).join("")}
    </div>
  </section>

  ${fotosSection()}

  <section class="section">
    <div class="section-head"><h2>Paletas</h2><span class="hint">definem a cor base da marca usada pela IA</span></div>
    <div class="grid">
      ${PALETTES.map(
        (p) => `
        <div class="card">
          <div style="display:flex;height:56px">
            ${p.colors.map((c) => `<div style="flex:1;background:${c}"></div>`).join("")}
          </div>
          <div class="card-body">
            <div class="meta grow"><div class="card-title">${esc(p.name)}</div><div class="card-sub">${p.colors.length} cores</div></div>
            <button class="btn small" data-action="use-palette" data-id="${p.id}">Aplicar</button>
          </div>
        </div>`,
      ).join("")}
    </div>
  </section>`;
}

function fotosSection(): string {
  const photos = photoCache?.photos ?? [];
  const hint = photoCache?.hint ?? "";
  return `
  <section class="section">
    <div class="section-head">
      <h2>Fotos</h2>
      <span class="hint">${isDesktop() ? "Unsplash com a sua chave · acervo local sempre disponível" : "acervo local · clique para inserir no design"}</span>
    </div>
    <div class="row wrap" style="margin-bottom:14px">
      <input class="input" id="photo-q" placeholder="Buscar: café, montanha, escritório…" value="${esc(photoQuery)}" style="max-width:320px" />
      <button class="btn" data-action="search-photos">${icons.photo} Buscar</button>
      <span class="sep" style="width:1px;height:18px;background:var(--line)"></span>
      ${STOCK_CATEGORIES.slice(0, 5)
        .map((c) => `<button class="chip" data-action="photo-tag" data-id="${esc(c)}">${esc(c)}</button>`)
        .join("")}
    </div>
    ${hint ? `<div class="tiny muted" style="margin-bottom:12px">${esc(hint)}</div>` : ""}
    <div class="grid dense">
      ${
        photos.length
          ? photos
              .map(
                (p) => `
          <button class="card" data-action="use-photo" data-id="${esc(p.id)}" title="${esc(p.description)}">
            <div class="card-thumb" style="aspect-ratio:3/2">
              <img src="${p.thumb}" alt="${esc(p.description)}" loading="lazy" />
              <span class="card-badge">${esc(p.provider === "unsplash" ? p.author : "local")}</span>
            </div>
          </button>`,
              )
              .join("")
          : skeletons(8)
      }
    </div>
  </section>`;
}

function iaTab(): string {
  const s = store.state.settings;
  const mode = agentMode();
  return `
  <section class="section" style="margin-top:8px">
    <div class="section-head">
      <h2>Agente de IA</h2>
      <span class="hint">escolha como o agente pensa — grátis, com a sua chave ou local</span>
    </div>

    <div class="grid" style="grid-template-columns:1.2fr 0.8fr;align-items:start">
      <div class="card" style="padding:16px;gap:14px;display:flex;flex-direction:column">
        <div class="field">
          <label>Provedor</label>
          <select class="select" id="set-provider">
            ${PROVIDERS.map(
              (p) => `<option value="${p.id}" ${p.id === s.provider ? "selected" : ""}>${esc(p.label)} — ${esc(p.hint)}</option>`,
            ).join("")}
          </select>
        </div>

        <div class="field">
          <label>Chave de API <span class="tiny muted" style="text-transform:none">${s.provider === "pollinations" || s.provider === "ollama" ? "· dispensada" : ""}</span></label>
          <input class="input" id="set-key" type="password" placeholder="sk-…" value="${esc(s.apiKey)}" autocomplete="off" />
          <span class="tiny muted">Fica só no seu computador, no armazenamento do app. Nunca passa por servidor nosso.</span>
        </div>

        <div class="field-row">
          <div class="field"><label>Modelo</label><input class="input" id="set-model" placeholder="padrão do provedor" value="${esc(s.model)}" /></div>
          <div class="field"><label>URL base</label><input class="input" id="set-base" placeholder="proxies/custom" value="${esc(s.baseUrl)}" /></div>
        </div>

        <div class="row wrap">
          <button class="btn primary" data-action="save-ai">${icons.check} Salvar</button>
          <button class="btn" data-action="test-ai">${icons.refresh} Testar conexão</button>
          <button class="btn ghost" data-action="tab" data-tab="ajustes">Mais ajustes</button>
        </div>
        <div class="empty-note" id="ai-test-result"></div>
      </div>

      <div class="card" style="padding:16px;gap:10px;display:flex;flex-direction:column">
        <div class="group-title">Como o agente trabalha</div>
        <div class="tiny muted" style="line-height:1.75">
          1. Recebe o grid, a margem segura e a paleta da sua marca.<br />
          2. Devolve um <b>plano de design em JSON</b> (elementos com x/y/w/h).<br />
          3. O Krevo aplica no canvas — você arrasta e refina.
        </div>
        <div class="divider"></div>
        <div class="row" style="justify-content:space-between">
          <span class="tiny muted">Estado</span>
          <span class="pill ${mode === "demo" ? "" : "ok"}">${esc(mode === "demo" ? "modo demo" : mode === "free" ? "IA grátis" : mode === "local" ? "local" : "chave própria")}</span>
        </div>
        <label class="row tiny muted" style="gap:8px">
          <input type="checkbox" id="set-demo" ${s.autoDemo ? "checked" : ""} />
          Usar gerador local quando nada estiver conectado
        </label>
        <div class="divider"></div>
        <div class="row wrap">
          <span class="pill">${esc(info?.pdfEngine ? "PDF vetorial Rust" : "PDF vetorial")}</span>
          <span class="pill">${esc(info?.platform ?? "desktop")}</span>
          <span class="pill">v${esc(info?.version ?? "0.2.0")}</span>
        </div>
      </div>
    </div>
  </section>`;
}

function ajustesTab(): string {
  const s = store.state.settings;
  return `
  <section class="section" style="margin-top:8px">
    <div class="section-head"><h2>Ajustes</h2></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:14px">
        <div class="field">
          <label>Aparência</label>
          <div class="seg">
            <button class="${s.theme === "dark" ? "active" : ""}" data-action="set-theme" data-id="dark">Escuro</button>
            <button class="${s.theme === "light" ? "active" : ""}" data-action="set-theme" data-id="light">Claro</button>
          </div>
        </div>
        <div class="field">
          <label>Chave do Unsplash (Access Key)</label>
          <input class="input" id="set-unsplash" placeholder="cole sua access key" value="${esc(s.unsplashKey)}" />
          <span class="tiny muted">Crie grátis em unsplash.com/developers. Sem chave, usamos o acervo local.</span>
        </div>
        <div class="row wrap">
          <button class="btn" data-action="save-unsplash">${icons.check} Salvar chave</button>
          <button class="btn ghost" data-action="clear-data">${icons.trash} Limpar dados locais</button>
        </div>
      </div>

      <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">
        <div class="group-title">Sobre</div>
        <div class="tiny muted" style="line-height:1.8">
          <b>Krevo</b> v${esc(info?.version ?? "0.2.0")} · ${esc(info?.platform ?? "desktop")} ${esc(info?.arch ?? "")}<br />
          Motor: ${esc(info?.engine ?? "krevo-core")}<br />
          PDF: ${esc(info?.pdfEngine ?? "Rust nativo")}<br />
          Interface: TypeScript + Vite · App: Tauri 2
        </div>
        <div class="divider"></div>
        <div class="row wrap">
          <a class="btn small" href="https://github.com/Pedro21062014/krevo" target="_blank" rel="noreferrer">GitHub</a>
          <a class="btn small" href="https://github.com/Pedro21062014/krevo/releases" target="_blank" rel="noreferrer">Downloads</a>
          <a class="btn small" href="https://github.com/Pedro21062014/krevo/issues" target="_blank" rel="noreferrer">Suporte</a>
        </div>
        <div class="tiny muted">MIT · feito com Rust e café.</div>
      </div>
    </div>
  </section>`;
}

function tabContent(tab: string): string {
  switch (tab) {
    case "templates":
      return templatesTab();
    case "elementos":
      return elementosTab();
    case "fotos":
      return elementosTab();
    case "ia":
      return iaTab();
    case "ajustes":
      return ajustesTab();
    default:
      return inicioTab();
  }
}

/* ------------------------------------------------------------------ */
/* Montagem                                                            */
/* ------------------------------------------------------------------ */

export function mountHome(root: HTMLElement): void {
  const state = store.state;
  document.documentElement.dataset.theme = state.settings.theme;
  root.innerHTML = `
    ${topbar(state.homeTab)}
    <div class="page"><div class="page-inner">${tabContent(state.homeTab)}</div></div>
    <div class="toasts">${state.toasts.map((t) => `<div class="toast ${t.kind}">${esc(t.text)}</div>`).join("")}</div>`;

  root.querySelectorAll<HTMLElement>("[data-action]").forEach((node) => {
    node.addEventListener("click", (event) => onAction(event, node));
  });

  const brief = root.querySelector<HTMLTextAreaElement>("#brief");
  if (brief) {
    brief.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void generateFromPrompt(brief.value);
      }
    });
  }

  const photoInput = root.querySelector<HTMLInputElement>("#photo-q");
  if (photoInput) {
    photoInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void runPhotoSearch(photoInput.value);
    });
  }

  bindSettingInputs(root);
}

function bindSettingInputs(root: HTMLElement): void {
  const pairs: [string, (value: string) => void][] = [
    ["#set-key", (v) => store.updateSettings({ apiKey: v.trim() })],
    ["#set-model", (v) => store.updateSettings({ model: v.trim() })],
    ["#set-base", (v) => store.updateSettings({ baseUrl: v.trim() })],
    ["#set-unsplash", (v) => store.updateSettings({ unsplashKey: v.trim() })],
  ];
  for (const [selector, apply] of pairs) {
    const node = root.querySelector<HTMLInputElement>(selector);
    if (node) node.addEventListener("change", () => apply(node.value));
  }
  const provider = root.querySelector<HTMLSelectElement>("#set-provider");
  if (provider) {
    provider.addEventListener("change", () => {
      store.updateSettings({ provider: provider.value });
      mountHome(document.getElementById("app") as HTMLElement);
    });
  }
  const demo = root.querySelector<HTMLInputElement>("#set-demo");
  if (demo) demo.addEventListener("change", () => store.updateSettings({ autoDemo: demo.checked }));
}

/* ------------------------------------------------------------------ */
/* Ações                                                               */
/* ------------------------------------------------------------------ */

let pendingFormat = "slide-hd";

async function generateFromPrompt(brief: string): Promise<void> {
  const { generateDesign } = await import("./agent");
  const format = FORMATS.find((f) => f.id === pendingFormat) ?? FORMATS[0];
  store.createProject(brief.slice(0, 42) || "Design com IA", format.w, format.h);
  await generateDesign(brief);
}

async function runPhotoSearch(query: string): Promise<void> {
  photoQuery = query;
  photoCache = null;
  const app = document.getElementById("app") as HTMLElement;
  mountHome(app);
  const result = await unsplashSearch(query, store.state.settings.unsplashKey);
  photoCache = { query, photos: result.photos, hint: result.hint };
  if (store.state.homeTab === "elementos" || store.state.homeTab === "fotos") mountHome(app);
}

/**
 * Insere um elemento no projeto atual. Se o projeto aberto já tem trabalho,
 * ele é preservado — só criamos um novo quando o atual está vazio.
 */
function createWithElement(build: (page: { width: number; height: number }) => void, name = "Novo projeto"): void {
  const project = store.state.project;
  const hasWork = project.pages.some((page) => page.elements.length > 0);
  if (!hasWork) store.createProject(name, 1920, 1080);
  const page = store.page;
  build({ width: page.width, height: page.height });
  store.patch({ screen: "editor" });
}

function onAction(event: Event, node: HTMLElement): void {
  const action = node.dataset.action;
  const id = node.dataset.id ?? "";

  if (action === "tab") {
    const tab = node.dataset.tab as never;
    store.patch({ homeTab: tab });
    if ((tab === "elementos" || node.dataset.tab === "fotos") && !photoCache) {
      photoQuery = "";
      void runPhotoSearch("");
    }
    return;
  }
  if (action === "new-blank") {
    // Passa pelo diálogo: tipo de mídia → formato.
    openCreateDialog();
    return;
  }
  if (action === "pick-format") {
    pendingFormat = id;
    node.parentElement?.querySelectorAll("[data-action='pick-format']").forEach((n) => {
      n.classList.toggle("active", n === node);
    });
    event.stopPropagation();
    return;
  }
  if (action === "use-idea") {
    pendingFormat = "slide-hd";
    void generateFromPrompt(id);
    return;
  }
  if (action === "new-format") {
    const format = FORMATS.find((f) => f.id === id);
    if (format) store.createProject(format.name, format.w, format.h);
    return;
  }
  if (action === "generate") {
    const brief = (document.getElementById("brief") as HTMLTextAreaElement | null)?.value ?? "";
    if (!brief.trim()) {
      store.toast("Descreva o que você quer criar — ou escolha uma ideia abaixo.", "info");
      return;
    }
    void generateFromPrompt(brief);
    return;
  }
  if (action === "use-template") {
    const template = TEMPLATES.find((t) => t.id === id);
    if (template) store.createProject(template.name, template.w, template.h, template);
    return;
  }
  if (action === "filter-templates") {
    templateFilter = id;
    mountHome(document.getElementById("app") as HTMLElement);
    return;
  }
  if (action === "open-recent") {
    const project = store.getRecentProject(id);
    if (project) store.openProject(project);
    else store.toast("Não encontrei esse projeto no armazenamento local.", "error");
    return;
  }
  if (action === "delete-recent") {
    event.stopPropagation();
    store.deleteRecent(id);
    mountHome(document.getElementById("app") as HTMLElement);
    return;
  }
  if (action === "use-element") {
    const kind = node.dataset.kind as "rect" | "ellipse" | "line" | "text";
    createWithElement((page) => {
      if (kind === "text") {
        store.addElement(
          textEl(160, page.height / 2 - 60, page.width - 320, 120, "Seu texto aqui", {
            size: 72,
            weight: 700,
            color: "#0B1020",
          }),
        );
      } else if (kind === "line") {
        const line = baseElement("line", 160, page.height / 2, page.width - 320, 4);
        line.fill = "#0B1020";
        line.stroke = { color: "#0B1020", width: 4 };
        store.addElement(line);
      } else {
        store.addElement(
          shapeEl(kind, page.width / 2 - 180, page.height / 2 - 180, 360, 360, "#1c1f24", {
            radius: kind === "rect" ? 24 : 0,
          }),
        );
      }
    });
    return;
  }
  if (action === "use-gradient") {
    const preset = GRADIENTS.find((g) => g.id === id);
    createWithElement((page) => {
      store.addElement(shapeEl("rect", 0, 0, page.width, page.height, preset?.value ?? "#000", { name: "Fundo" }));
    });
    return;
  }
  if (action === "use-icon") {
    createWithElement(() => {
      const el = baseElement("icon", 840, 420, 240, 240);
      el.src = iconDataUri(id, "#111214");
      el.name = id;
      store.addElement(el);
    });
    return;
  }
  if (action === "use-shape") {
    createWithElement((page) => {
      const size = Math.min(page.width, page.height) * 0.42;
      const el = baseElement("icon", (page.width - size) / 2, (page.height - size) / 2, size, size);
      el.src = shapeDataUri(id, "#F1F1EF");
      el.name = id;
      store.addElement(el);
    }, id);
    return;
  }
  if (action === "use-text-preset") {
    const preset = TEXT_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    createWithElement((page) => {
      const margin = Math.round(Math.min(page.width, page.height) * 0.08);
      const width = page.width - margin * 2;
      const height = Math.round(preset.size * 2.4);
      const node = textEl(margin, Math.round(page.height * 0.42), width, height, preset.name === "Botão" ? "Começar agora" : "Seu texto aqui", {
        size: preset.size,
        weight: preset.weight,
        color: "#F5F5F3",
        align: preset.align,
        lineHeight: preset.lineHeight,
      });
      node.name = preset.name;
      store.addElement(node);
    }, preset.name);
    return;
  }
  if (action === "use-palette") {
    const palette = PALETTES.find((p) => p.id === id);
    if (!palette) return;
    store.updateSettings({ brand: { ...store.state.settings.brand, palette: palette.colors } });
    store.toast(`Paleta ${palette.name} aplicada à marca.`, "success");
    return;
  }
  if (action === "use-photo") {
    const photo = photoCache?.photos.find((p) => p.id === id);
    if (!photo) return;
    const src = photo.provider === "unsplash" ? photo.regular : photo.full;
    createWithElement((page) => {
      const el = baseElement("image", 0, 0, page.width, page.height);
      el.src = src;
      el.fit = "cover";
      el.name = photo.description.slice(0, 30);
      store.addElement(el);
    }, photo.description.slice(0, 40) || "Foto");
    if (photo.provider === "unsplash") store.toast(`Foto de ${photo.author} — mantenha o crédito ao publicar.`, "info");
    return;
  }
  if (action === "photo-tag") {
    void runPhotoSearch(id);
    return;
  }
  if (action === "search-photos") {
    const value = (document.getElementById("photo-q") as HTMLInputElement | null)?.value ?? "";
    void runPhotoSearch(value);
    return;
  }
  if (action === "save-ai") {
    store.toast("Configuração de IA salva neste computador.", "success");
    return;
  }
  if (action === "test-ai") {
    const out = document.getElementById("ai-test-result");
    if (out) out.textContent = "Testando…";
    void testAiConnection().then((result) => {
      const node2 = document.getElementById("ai-test-result");
      if (node2) node2.textContent = result.message;
    });
    return;
  }
  if (action === "save-unsplash") {
    const value = (document.getElementById("set-unsplash") as HTMLInputElement | null)?.value ?? "";
    store.updateSettings({ unsplashKey: value.trim() });
    store.toast("Chave do Unsplash salva.", "success");
    return;
  }
  if (action === "set-theme") {
    store.updateSettings({ theme: id as "dark" | "light" });
    mountHome(document.getElementById("app") as HTMLElement);
    return;
  }
  if (action === "clear-data") {
    localStorage.removeItem("krevo.v1.recent");
    store.state.recent = [];
    mountHome(document.getElementById("app") as HTMLElement);
    store.toast("Projetos recentes apagados deste dispositivo.", "success");
  }
}

export { gradient, kMark };
