/** Tela inicial do Krevo: criar novo, templates, elementos, fotos, IA e ajustes. */

import {
  FORMATS,
  GRADIENTS,
  ICONS,
  PALETTES,
  STOCK_CATEGORIES,
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  baseElement,
  gradient,
  iconDataUri,
  placeholderImage,
  shapeEl,
  templateToPage,
  textEl,
  type Template,
} from "../assets";
import { appInfo, isDesktop, unsplashSearch, type AppInfo } from "../bridge";
import { store } from "../store";
import type { Photo } from "../types";
import { esc, formatDate, uid } from "../util";
import { icons } from "./icons";
import { renderThumbFill } from "./render";

let photoCache: { query: string; photos: Photo[]; hint: string } | null = null;
let photoQuery = "";
let templateFilter = "Todos";
let info: AppInfo | null = null;

void appInfo().then((i) => {
  info = i;
});

const PROMPT_IDEAS = [
  "Pitch deck para startup de energia solar",
  "Post de lançamento de app de finanças",
  "Relatório anual minimalista com gráficos",
  "Story de promoção 50% off para loja de cosméticos",
  "Currículo para vaga de product designer",
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/* ------------------------------------------------------------------ */
/* Blocos                                                              */
/* ------------------------------------------------------------------ */

function rail(active: string): string {
  const items: [string, string, string][] = [
    ["inicio", "Início", icons.home],
    ["templates", "Templates", icons.template],
    ["elementos", "Elementos", icons.elements],
    ["fotos", "Fotos & Unsplash", icons.photo],
    ["ia", "Agente de IA", icons.sparkles],
  ];
  return `
  <aside class="rail">
    <div class="brand">
      <div class="brand-mark">${icons.logo}</div>
      <div>
        <div class="brand-name">Krevo</div>
      </div>
      <span class="brand-badge">BETA</span>
    </div>
    ${items
      .map(
        ([id, label, icon]) => `
      <button class="rail-item ${active === id ? "active" : ""}" data-action="tab" data-tab="${id}">
        ${icon}<span>${label}</span>
      </button>`,
      )
      .join("")}
    <div class="rail-spacer"></div>
    <button class="btn primary" data-action="new-blank" style="justify-content:center;margin-bottom:10px">
      ${icons.plus} Novo projeto
    </button>
    <div class="rail-foot">
      <button class="rail-item ${active === "ajustes" ? "active" : ""}" data-action="tab" data-tab="ajustes">
        ${icons.settings}<span>Ajustes</span>
      </button>
      <div class="rail-user">
        <span class="dot ${store.state.settings.apiKey || store.state.settings.provider === "ollama" ? "" : "off"}"></span>
        <span>${info ? `${info.platform} · v${info.version}` : "conectando…"}</span>
      </div>
    </div>
  </aside>`;
}

function skeletons(count: number): string {
  return Array.from({ length: count })
    .map(
      () => `
    <div class="sk-card">
      <div class="skeleton sk-thumb"></div>
      <div class="skeleton sk-line w70"></div>
      <div class="skeleton sk-line w40"></div>
    </div>`,
    )
    .join("");
}

function templateCard(t: Template): string {
  const page = templateToPage(t);
  const holder = document.createElement("div");
  holder.appendChild(renderThumbFill(page, 480, 300));
  const preview = holder.innerHTML;
  return `
    <button class="card" data-action="use-template" data-id="${t.id}">
      <div class="card-thumb">${preview}<span class="card-badge">${esc(t.category)}</span></div>
      <div class="card-body">
        <div class="card-title">${esc(t.name)}</div>
        <div class="card-sub">${t.w}×${t.h}</div>
      </div>
    </button>`;
}

function recentCard(item: { id: string; name: string; updatedAt: string; pages: number; page: unknown }): string {
  const holder = document.createElement("div");
  holder.appendChild(renderThumbFill(item.page as never, 480, 300));
  return `
    <div class="card" style="cursor:pointer" data-action="open-recent" data-id="${item.id}">
      <div class="card-thumb">
        ${holder.innerHTML}
        <span class="card-badge">${item.pages} ${item.pages === 1 ? "página" : "páginas"}</span>
        <button class="card-remove" data-action="delete-recent" data-id="${item.id}" title="Remover da lista">
          ${icons.trash}
        </button>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(item.name)}</div>
        <div class="card-sub">${formatDate(item.updatedAt)}</div>
      </div>
    </div>`;
}

function formatGrid(): string {
  return `<div class="grid formats">
    ${FORMATS.map(
      (f) => `
      <button class="card" data-action="new-format" data-id="${f.id}">
        <div class="card-thumb" style="aspect-ratio:4/3;display:grid;place-items:center">
          <div style="width:44px;height:${Math.round((44 * f.h) / f.w)}px;border-radius:4px;background:var(--surface-3);border:1px solid var(--line-strong)"></div>
        </div>
        <div class="card-body">
          <div class="card-title">${esc(f.name)}</div>
          <div class="card-sub">${esc(f.hint)}</div>
        </div>
      </button>`,
    ).join("")}
  </div>`;
}

function promptBox(): string {
  return `
  <div class="promptbox">
    <textarea id="brief" placeholder="Descreva o que você quer criar. Ex.: “pitch deck de 6 slides para uma marca de café artesanal, tons terrosos”"></textarea>
    <div class="prompt-actions">
      <span class="tiny muted">Formato:</span>
      ${FORMATS.slice(0, 5)
        .map(
          (f, i) =>
            `<button class="chip ${i === 0 ? "active" : ""}" data-action="pick-format" data-id="${f.id}">${esc(f.name)}</button>`,
        )
        .join("")}
      <div class="spacer"></div>
      <button class="btn" data-action="new-blank">${icons.plus} Em branco</button>
      <button class="btn primary" data-action="generate">${icons.sparkles} Gerar com IA</button>
    </div>
  </div>`;
}

function homeTab(): string {
  const loading = store.state.loadingHome;
  const recent = store.state.recent;
  return `
  <div class="hero">
    <h1>${greeting()}. O que vamos criar hoje?</h1>
    <p>PDF, apresentações, imagens, vídeo e muito mais — em um editor nativo em Rust, com um agente de IA ao lado e a sua própria API.</p>
    ${promptBox()}
  </div>

  <div class="section-head">
    <h2>Seus projetos</h2>
    <span class="hint">${recent.length ? `${recent.length} recentes` : "tudo fica salvo na sua máquina"}</span>
  </div>
  <div class="grid">
    ${
      loading
        ? skeletons(4)
        : recent.length
          ? recent.map((r) => recentCard(r)).join("")
          : `<div class="card" style="padding:26px;grid-column:1/-1;align-items:center;text-align:center">
               <div style="font-size:15px;font-weight:650;margin-bottom:6px">Nenhum projeto por aqui ainda</div>
               <div class="tiny muted" style="max-width:420px">Escreva um briefing acima ou escolha um template abaixo. O Krevo abre em menos de um segundo.</div>
             </div>`
    }
  </div>

  <div class="section-head">
    <h2>Templates prontos</h2>
    <button class="chip" data-action="tab" data-tab="templates">Ver todos ${TEMPLATES.length}</button>
  </div>
  <div class="grid">${TEMPLATES.slice(0, 4).map(templateCard).join("")}</div>

  <div class="section-head">
    <h2>Comece por um formato</h2>
    <span class="hint">páginas em px reais, prontas para exportar</span>
  </div>
  ${formatGrid()}
  `;
}

function templatesTab(): string {
  const list = TEMPLATES.filter((t) => templateFilter === "Todos" || t.category === templateFilter);
  return `
  <div class="section-head" style="margin-top:0">
    <h2>Templates</h2>
    <span class="hint">${list.length} modelos · feitos para editar</span>
  </div>
  <div class="chips" style="margin-bottom:18px">
    ${TEMPLATE_CATEGORIES.map(
      (c) =>
        `<button class="chip ${c === templateFilter ? "active" : ""}" data-action="filter-templates" data-id="${esc(c)}">${esc(c)}</button>`,
    ).join("")}
  </div>
  <div class="grid">${list.map(templateCard).join("")}</div>`;
}

function elementGrid(): string {
  const shapes = [
    { label: "Retângulo", kind: "rect" as const },
    { label: "Círculo", kind: "ellipse" as const },
    { label: "Linha", kind: "line" as const },
    { label: "Texto", kind: "text" as const },
  ];
  return `
  <div class="section-head" style="margin-top:0"><h2>Formas e textos</h2></div>
  <div class="grid tight">
    ${shapes
      .map(
        (s) => `
      <button class="card" data-action="use-element" data-kind="${s.kind}">
        <div class="card-thumb" style="aspect-ratio:3/2;display:grid;place-items:center;color:var(--muted)">
          ${s.kind === "rect" ? icons.square : s.kind === "ellipse" ? icons.circle : s.kind === "line" ? icons.line : icons.text}
        </div>
        <div class="card-body"><div class="card-title">${s.label}</div></div>
      </button>`,
      )
      .join("")}
  </div>

  <div class="section-head"><h2>Gradientes</h2></div>
  <div class="grid tight">
    ${GRADIENTS.map(
      (g) => `
      <button class="card" data-action="use-gradient" data-id="${g.id}">
        <div class="card-thumb" style="aspect-ratio:3/2;background:linear-gradient(${g.value.angle}deg, ${g.value.stops
          .map((s) => s.color)
          .join(",")})"></div>
        <div class="card-body"><div class="card-title">${esc(g.name)}</div></div>
      </button>`,
    ).join("")}
  </div>

  <div class="section-head"><h2>Ícones</h2><span class="hint">${ICONS.length} vetores</span></div>
  <div class="grid tight">
    ${ICONS.map(
      (icon) => `
      <button class="card" data-action="use-icon" data-id="${icon.name}" title="${icon.name}">
        <div class="card-thumb" style="aspect-ratio:1;display:grid;place-items:center">
          <img src="${iconDataUri(icon.name, "#cfc8ff")}" style="width:34px;height:34px" alt="${icon.name}" />
        </div>
      </button>`,
    ).join("")}
  </div>

  <div class="section-head"><h2>Paletas</h2></div>
  <div class="grid">
    ${PALETTES.map(
      (p) => `
      <div class="card">
        <div style="display:flex;height:64px">
          ${p.colors.map((c) => `<div style="flex:1;background:${c}"></div>`).join("")}
        </div>
        <div class="card-body row">
          <div class="card-title grow">${esc(p.name)}</div>
          <button class="btn small" data-action="use-palette" data-id="${p.id}">Aplicar</button>
        </div>
      </div>`,
    ).join("")}
  </div>`;
}

function photosTab(): string {
  const query = photoQuery;
  const photos = photoCache?.photos ?? [];
  const hint = photoCache?.hint ?? "";
  return `
  <div class="section-head" style="margin-top:0">
    <h2>Fotos</h2>
    <span class="hint">${isDesktop() ? "Unsplash com a sua chave · acervo local sempre disponível" : "acervo local (o Unsplash funciona no app desktop)"}</span>
  </div>
  <div class="row" style="margin-bottom:16px;gap:8px;flex-wrap:wrap">
    <input class="input" id="photo-q" placeholder="Buscar fotos: café, montanha, escritório…" value="${esc(query)}" style="max-width:340px" />
    <button class="btn" data-action="search-photos">${icons.photo} Buscar</button>
    <div class="spacer grow"></div>
    ${STOCK_CATEGORIES.slice(0, 5)
      .map((c) => `<button class="chip" data-action="photo-tag" data-id="${esc(c)}">${esc(c)}</button>`)
      .join("")}
  </div>
  ${hint ? `<div class="tiny muted" style="margin-bottom:12px">${esc(hint)}</div>` : ""}
  <div class="grid tight">
    ${
      photos.length
        ? photos
            .map(
              (p) => `
      <button class="card" data-action="use-photo" data-id="${esc(p.id)}" title="${esc(p.description)}">
        <div class="card-thumb" style="aspect-ratio:3/2">
          <img src="${p.thumb}" alt="${esc(p.description)}" loading="lazy" />
          <span class="card-badge">${esc(p.provider === "unsplash" ? p.author : "Krevo")}</span>
        </div>
      </button>`,
            )
            .join("")
        : skeletons(8)
    }
  </div>`;
}

function providerOptions(current: string): string {
  const list: [string, string][] = [
    ["openai", "OpenAI (GPT)"],
    ["anthropic", "Anthropic (Claude)"],
    ["gemini", "Google Gemini"],
    ["openrouter", "OpenRouter"],
    ["groq", "Groq"],
    ["deepseek", "DeepSeek"],
    ["mistral", "Mistral"],
    ["ollama", "Ollama (local, sem chave)"],
    ["custom", "Endpoint compatível (custom)"],
  ];
  return list
    .map(([id, label]) => `<option value="${id}" ${id === current ? "selected" : ""}>${label}</option>`)
    .join("");
}

function iaTab(): string {
  const s = store.state.settings;
  return `
  <div class="section-head" style="margin-top:0">
    <h2>Agente de IA</h2>
    <span class="hint">traga a sua chave — o Krevo não cobra nem repassa tokens</span>
  </div>
  <div class="grid" style="grid-template-columns:1.15fr 0.85fr">
    <div class="card" style="padding:18px;gap:14px;display:flex;flex-direction:column">
      <div class="field">
        <label>Provedor</label>
        <select class="select" id="set-provider">${providerOptions(s.provider)}</select>
      </div>
      <div class="field">
        <label>Chave de API ${s.provider === "ollama" ? "(dispensada no Ollama)" : ""}</label>
        <input class="input" id="set-key" type="password" placeholder="sk-…" value="${esc(s.apiKey)}" autocomplete="off" />
        <span class="tiny muted">Fica só no seu computador (cofre local do app). Nunca sobe para nossos servidores.</span>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Modelo (opcional)</label>
          <input class="input" id="set-model" placeholder="padrão do provedor" value="${esc(s.model)}" />
        </div>
        <div class="field">
          <label>URL base (opcional)</label>
          <input class="input" id="set-base" placeholder="para proxies/custom" value="${esc(s.baseUrl)}" />
        </div>
      </div>
      <div class="row">
        <button class="btn primary" data-action="save-ai">${icons.check} Salvar</button>
        <button class="btn" data-action="test-ai">${icons.refresh} Testar conexão</button>
        <a class="btn ghost" href="https://github.com/Pedro21062014/krevo#chaves-de-api" target="_blank" rel="noreferrer">Onde pegar minha chave</a>
      </div>
    </div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px">
      <div class="group-title" style="margin:0">Como funciona</div>
      <div class="tiny muted" style="line-height:1.75">
        1. Você conecta a sua chave (ou o Ollama local).<br />
        2. O agente recebe o grid da página, a paleta da marca e o seu briefing.<br />
        3. Ele devolve um <b>plano de design em JSON</b> — nada de código.<br />
        4. O Krevo aplica os elementos no canvas: você arrasta, edita e exporta.
      </div>
      <div class="divider"></div>
      <div class="group-title" style="margin:0">Modo demo</div>
      <label class="row tiny muted" style="gap:8px">
        <input type="checkbox" id="set-demo" ${s.autoDemo ? "checked" : ""} />
        Gerar layouts localmente quando não houver chave (offline).
      </label>
      <div class="divider"></div>
      <div class="row wrap">
        <span class="pill ok">${info?.pdfEngine ? "PDF vetorial em Rust" : "PDF vetorial"}</span>
        <span class="pill">${info?.platform ?? "desktop"}</span>
        <span class="pill">${info?.version ? `v${info.version}` : "v0.1.0"}</span>
      </div>
    </div>
  </div>`;
}

function settingsTab(): string {
  const s = store.state.settings;
  return `
  <div class="section-head" style="margin-top:0"><h2>Ajustes</h2></div>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:14px">
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
        <span class="tiny muted">Crie grátis em unsplash.com/developers. Sem chave, o Krevo usa o acervo local.</span>
      </div>
      <div class="row">
        <button class="btn" data-action="save-unsplash">${icons.check} Salvar chave</button>
        <button class="btn ghost" data-action="clear-data">${icons.trash} Limpar dados locais</button>
      </div>
    </div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px">
      <div class="group-title" style="margin:0">Sobre</div>
      <div class="tiny muted" style="line-height:1.8">
        <b>Krevo</b> ${info?.version ? `v${info.version}` : "v0.1.0"} · ${info?.platform ?? "desktop"} ${info?.arch ?? ""}<br />
        Motor: ${esc(info?.engine ?? "krevo-core")}<br />
        PDF: ${esc(info?.pdfEngine ?? "Rust nativo")}<br />
        Interface: TypeScript + Vite · App: Tauri 2
      </div>
      <div class="divider"></div>
      <div class="row wrap">
        <a class="btn small" href="https://github.com/Pedro21062014/krevo" target="_blank" rel="noreferrer">GitHub</a>
        <a class="btn small" href="https://github.com/Pedro21062014/krevo/releases" target="_blank" rel="noreferrer">Downloads</a>
        <a class="btn small" href="https://github.com/Pedro21062014/krevo/issues" target="_blank" rel="noreferrer">Reportar bug</a>
      </div>
      <div class="tiny muted">Feito com Rust, carinho e um pouco de café. Licença MIT.</div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Montagem                                                            */
/* ------------------------------------------------------------------ */

function tabContent(tab: string): string {
  switch (tab) {
    case "templates":
      return templatesTab();
    case "elementos":
      return elementGrid();
    case "fotos":
      return photosTab();
    case "ia":
      return iaTab();
    case "ajustes":
      return settingsTab();
    default:
      return homeTab();
  }
}

export function mountHome(root: HTMLElement): void {
  const state = store.state;
  document.documentElement.dataset.theme = state.settings.theme;
  root.innerHTML = `
    <div class="shell">
      ${rail(state.homeTab)}
      <div class="main"><div class="page">${tabContent(state.homeTab)}</div></div>
    </div>
    <div class="toasts">
      ${state.toasts
        .map((t) => `<div class="toast ${t.kind}">${esc(t.text)}</div>`)
        .join("")}
    </div>`;

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

async function generateFromPrompt(brief: string): Promise<void> {
  const { generateDesign } = await import("./agent");
  const formatId = pendingFormat;
  const format = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  store.createProject(brief.slice(0, 42) || "Design com IA", format.w, format.h);
  await generateDesign(brief);
}

let pendingFormat = "slide-hd";

async function runPhotoSearch(query: string): Promise<void> {
  photoQuery = query;
  photoCache = null;
  mountHome(document.getElementById("app") as HTMLElement);
  const result = await unsplashSearch(query, store.state.settings.unsplashKey);
  photoCache = { query, photos: result.photos, hint: result.hint };
  if (store.state.homeTab === "fotos") mountHome(document.getElementById("app") as HTMLElement);
}

function createWithElement(build: (page: { width: number; height: number }) => void): void {
  store.createProject("Novo projeto", 1920, 1080);
  build({ width: 1920, height: 1080 });
  store.patch({ screen: "editor" });
}

function onAction(event: Event, node: HTMLElement): void {
  const action = node.dataset.action;
  const id = node.dataset.id ?? "";
  if (action === "tab") {
    const tab = node.dataset.tab as never;
    store.patch({ homeTab: tab });
    if (node.dataset.tab === "fotos" && !photoCache) {
      photoQuery = "";
      void runPhotoSearch("");
    }
    return;
  }
  if (action === "new-blank") {
    const format = FORMATS.find((f) => f.id === pendingFormat) ?? FORMATS[0];
    store.createProject("Novo projeto", format.w, format.h);
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
  if (action === "new-format") {
    const format = FORMATS.find((f) => f.id === id);
    if (format) store.createProject(format.name, format.w, format.h);
    return;
  }
  if (action === "generate") {
    const brief = (document.getElementById("brief") as HTMLTextAreaElement | null)?.value ?? "";
    if (!brief.trim()) {
      store.toast("Escreva um briefing para o agente — ou use o modo demo.", "info");
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
          shapeEl(kind, page.width / 2 - 180, page.height / 2 - 180, 360, 360, "#6C5CE7", {
            radius: kind === "rect" ? 28 : 0,
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
      const el = baseElement("icon", 0, 0, 240, 240);
      el.src = iconDataUri(id, "#6C5CE7");
      el.name = id;
      el.x = 840;
      el.y = 420;
      store.addElement(el);
    });
    return;
  }
  if (action === "use-palette") {
    const palette = PALETTES.find((p) => p.id === id);
    if (!palette) return;
    store.updateSettings({ brand: { ...store.state.settings.brand, palette: palette.colors } });
    store.toast(`Paleta ${palette.name} aplicada à sua marca.`, "success");
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
    });
    if (photo.provider === "unsplash") {
      store.toast(`Foto de ${photo.author} — mantenha o crédito ao publicar.`, "info");
    }
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
    store.toast("Configuração de IA salva no seu cofre local.", "success");
    return;
  }
  if (action === "test-ai") {
    void testAi();
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

async function testAi(): Promise<void> {
  const { aiChat } = await import("../bridge");
  const s = store.state.settings;
  store.toast("Falando com o provedor…", "info");
  try {
    const result = await aiChat({
      provider: s.provider,
      apiKey: s.apiKey,
      model: s.model,
      baseUrl: s.baseUrl,
      messages: [{ role: "user", content: "Responda apenas: ok" }],
      maxTokens: 20,
    });
    store.toast(`Conexão OK (${result.model || s.provider}) em ${Math.round(result.ms)} ms.`, "success");
  } catch (error) {
    store.toast(`Falhou: ${(error as Error).message}`, "error");
  }
}

/** Miniatura usada em "elementos" quando não há foto. */
export function samplePhotoTile(color: string): string {
  return placeholderImage("Krevo", color, "#00D4B8", 320, 200);
}

export { gradient, uid };
