/**
 * Estado global do Krevo (store minúsculo, sem framework).
 *
 * Regras:
 * - toda mutação passa por métodos daqui (nada de mexer no objeto direto);
 * - `patch` com `history: false` é usado durante arrastes (transiente);
 * - `commit()` fecha a transação de arraste e empilha um snapshot no histórico.
 */

import type {
  Element,
  HomeTab,
  Page,
  Project,
  ProjectSummary,
  Screen,
  Settings,
  Tool,
} from "./types";
import { FORMATS, baseElement, placeholderImage, templateToPage, type Template } from "./assets";
import { uid } from "./util";

const STORAGE_KEY = "krevo.v1";
const MAX_HISTORY = 80;
const MAX_THUMBS = 12;

export interface Toast {
  id: string;
  text: string;
  kind: "info" | "success" | "error";
}

export interface State {
  screen: Screen;
  homeTab: HomeTab;
  project: Project;
  pageIndex: number;
  selection: string[];
  editingId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  tool: Tool;
  settings: Settings;
  toasts: Toast[];
  loadingHome: boolean;
  recent: ProjectSummary[];
  chat: { role: "user" | "assistant" | "system"; content: string; meta?: string }[];
  agentBusy: boolean;
  agentModel: string;
  rightPanel: "inspector" | "agent";
  showGrid: boolean;
}

function defaultSettings(): Settings {
  return {
    provider: "pollinations",
    apiKey: "",
    model: "",
    baseUrl: "",
    unsplashKey: "",
    theme: "dark",
    autoDemo: true,
    brand: {
      palette: ["#0B1020", "#6C5CE7", "#00D4B8", "#F6C177", "#F7F7FB"],
      fontHeading: "Inter",
      fontBody: "Inter",
    },
  };
}

export function starterPage(w: number, h: number): Page {
  const art = baseElement("image", 0, 0, w, h);
  art.name = "Mídia padrão";
  art.src = placeholderImage("", "#0f1113", "#1f2e28", w, h);
  art.fit = "cover";
  art.opacity = 1;
  return {
    id: uid("pg"),
    name: "Página 1",
    width: w,
    height: h,
    background: "#0B1020",
    elements: [art],
  };
}

function newProject(name = "Novo projeto", w = 1920, h = 1080, withMedia = true): Project {
  const now = new Date().toISOString();
  return {
    id: uid("prj"),
    name,
    version: 1,
    createdAt: now,
    updatedAt: now,
    brand: defaultSettings().brand,
    pages: [withMedia ? starterPage(w, h) : { id: uid("pg"), name: "Página 1", width: w, height: h, background: "#0B1020", elements: [] }],
  };
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.settings`);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(raw) } as Settings;
  } catch {
    return defaultSettings();
  }
}

/**
 * Cópia do projeto sem as mídias pesadas (data:/blob:), usada só para a lista de
 * recentes — o projeto completo continua no arquivo `.krevo` salvo pelo usuário.
 */
function stripHeavyMedia(project: Project): Project {
  const clone = JSON.parse(JSON.stringify(project)) as Project;
  for (const page of clone.pages) {
    for (const el of page.elements) {
      const src = el.src;
      if (typeof src === "string" && (src.startsWith("data:") || src.startsWith("blob:")) && src.length > 4000) {
        el.src = null;
        el.name = `${el.name || "Mídia"} (arquivo no .krevo)`;
      }
    }
  }
  return clone;
}

/** Miniaturas por projeto (JPEG pequeno, guardado fora dos projetos). */
function loadThumbs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.thumbs`);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveThumbs(thumbs: Record<string, string>): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}.thumbs`, JSON.stringify(thumbs));
  } catch {
    /* sem espaço: as miniaturas são só um extra */
  }
}

function loadRecent(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.recent`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { projects: Project[] };
    return (parsed.projects ?? []).slice(0, 12).map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      pages: p.pages.length,
      page: p.pages[0],
    }));
  } catch {
    return [];
  }
}

class Store {
  state: State;
  private listeners = new Set<(s: State) => void>();
  private past: string[] = [];
  private clipboard: Element[] = [];
  private future: string[] = [];
  private thumbs: Record<string, string> = loadThumbs();

  constructor() {
    this.state = {
      screen: "home",
      homeTab: "inicio",
      project: newProject(),
      pageIndex: 0,
      selection: [],
      editingId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      tool: "select",
      settings: loadSettings(),
      toasts: [],
      loadingHome: true,
      recent: loadRecent().map((r) => ({ ...r, thumb: this.thumbs[r.id] })),
      chat: [],
      agentBusy: false,
      agentModel: "",
      rightPanel: "inspector",
      showGrid: false,
    };
  }

  subscribe(fn: (s: State) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  patch(partial: Partial<State>, rerender = true): void {
    this.state = { ...this.state, ...partial };
    if (rerender) this.emit();
  }

  /* ---------------- histórico ---------------- */

  private snapshot(): string {
    return JSON.stringify(this.state.project);
  }

  pushHistory(): void {
    this.past.push(this.snapshot());
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.snapshot());
    this.state.project = JSON.parse(prev) as Project;
    this.state.selection = [];
    this.emit();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot());
    this.state.project = JSON.parse(next) as Project;
    this.state.selection = [];
    this.emit();
  }

  /* ---------------- projeto ---------------- */

  get page(): Page {
    return this.state.project.pages[this.state.pageIndex] ?? this.state.project.pages[0];
  }

  get selected(): Element[] {
    const ids = new Set(this.state.selection);
    return this.page.elements.filter((el) => ids.has(el.id));
  }

  touch(): void {
    this.state.project.updatedAt = new Date().toISOString();
  }

  openProject(project: Project): void {
    this.past = [];
    this.future = [];
    this.state = {
      ...this.state,
      screen: "editor",
      project,
      pageIndex: 0,
      selection: [],
      editingId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      chat: [],
    };
    this.persistRecent();
    this.emit();
  }

  createProject(name: string, w: number, h: number, template?: Template, withMedia = true): void {
    const project = newProject(name, w, h, template ? false : withMedia);
    if (template) {
      project.pages = [templateToPage(template)];
      project.name = template.name;
    }
    this.openProject(project);
  }

  /* ---------------- páginas ---------------- */

  addPage(): void {
    this.pushHistory();
    const current = this.page;
    const page: Page = {
      id: uid("pg"),
      name: `Página ${this.state.project.pages.length + 1}`,
      width: current.width,
      height: current.height,
      background: current.background ?? "#FFFFFF",
      elements: [],
    };
    this.state.project.pages.splice(this.state.pageIndex + 1, 0, page);
    this.state.pageIndex += 1;
    this.state.selection = [];
    this.touch();
    this.emit();
  }

  duplicatePage(index = this.state.pageIndex): void {
    this.pushHistory();
    const page = this.state.project.pages[index];
    if (!page) return;
    const copy: Page = {
      ...structuredClone(page),
      id: uid("pg"),
      name: `${page.name} (cópia)`,
      elements: page.elements.map((el) => ({ ...structuredClone(el), id: uid() })),
    };
    this.state.project.pages.splice(index + 1, 0, copy);
    this.state.pageIndex = index + 1;
    this.state.selection = [];
    this.touch();
    this.emit();
  }

  deletePage(index = this.state.pageIndex): void {
    if (this.state.project.pages.length <= 1) {
      this.toast("O projeto precisa de pelo menos uma página.", "error");
      return;
    }
    this.pushHistory();
    this.state.project.pages.splice(index, 1);
    this.state.pageIndex = Math.max(0, Math.min(index, this.state.project.pages.length - 1));
    this.state.selection = [];
    this.touch();
    this.emit();
  }

  setPageIndex(index: number): void {
    if (index < 0 || index >= this.state.project.pages.length) return;
    this.patch({ pageIndex: index, selection: [], editingId: null, zoom: 0, pan: { x: 0, y: 0 } });
  }

  renamePage(index: number, name: string): void {
    const page = this.state.project.pages[index];
    if (!page) return;
    page.name = name;
    this.touch();
    this.emit();
  }

  setPageBackground(fill: Page["background"]): void {
    this.pushHistory();
    this.page.background = fill;
    this.touch();
    this.emit();
  }

  /* ---------------- elementos ---------------- */

  addElement(el: Element, select = true): void {
    this.pushHistory();
    this.page.elements.push(el);
    if (select) this.state.selection = [el.id];
    this.touch();
    this.emit();
  }

  addElements(els: Element[], select = true): void {
    if (!els.length) return;
    this.pushHistory();
    this.page.elements.push(...els);
    if (select) this.state.selection = els.map((e) => e.id);
    this.touch();
    this.emit();
  }

  /** Substitui todos os elementos da página (usado pelo agente de IA). */
  replacePageElements(elements: Element[], background?: Page["background"]): void {
    this.pushHistory();
    this.page.elements = elements;
    if (background !== undefined) this.page.background = background;
    this.state.selection = [];
    this.touch();
    this.emit();
  }

  updateElement(id: string, patch: Partial<Element>, history = true): void {
    const el = this.page.elements.find((e) => e.id === id);
    if (!el) return;
    if (history) this.pushHistory();
    Object.assign(el, patch);
    this.touch();
    this.emit();
  }

  updateMany(updates: { id: string; patch: Partial<Element> }[], history = true): void {
    if (!updates.length) return;
    if (history) this.pushHistory();
    for (const { id, patch } of updates) {
      const el = this.page.elements.find((e) => e.id === id);
      if (el) Object.assign(el, patch);
    }
    this.touch();
    this.emit();
  }

  /** Copia os elementos selecionados para a área de transferência interna. */
  copySelection(): number {
    const items = this.selected.map((el) => JSON.parse(JSON.stringify(el)) as Element);
    if (!items.length) return 0;
    this.clipboard = items;
    return items.length;
  }

  /** Cola a área de transferência interna, deslocando um pouco. */
  pasteClipboard(): number {
    if (!this.clipboard.length) return 0;
    this.pushHistory();
    const copies = this.clipboard.map((source, index) => ({
      ...(JSON.parse(JSON.stringify(source)) as Element),
      id: uid("el"),
      x: source.x + 24 + index * 4,
      y: source.y + 24 + index * 4,
      locked: false,
    }));
    this.page.elements.push(...copies);
    this.state.selection = copies.map((el) => el.id);
    this.touch();
    this.persistRecent();
    this.emit();
    return copies.length;
  }

  get hasClipboard(): boolean {
    return this.clipboard.length > 0;
  }

  deleteSelected(): void {
    if (!this.state.selection.length) return;
    this.pushHistory();
    const ids = new Set(this.state.selection);
    this.page.elements = this.page.elements.filter((el) => !ids.has(el.id) || el.locked);
    this.state.selection = [];
    this.touch();
    this.emit();
  }

  duplicateSelected(): void {
    const selected = this.selected;
    if (!selected.length) return;
    this.pushHistory();
    const copies = selected.map((el) => ({
      ...structuredClone(el),
      id: uid(),
      x: el.x + 24,
      y: el.y + 24,
    }));
    this.page.elements.push(...copies);
    this.state.selection = copies.map((c) => c.id);
    this.touch();
    this.emit();
  }

  select(ids: string[]): void {
    this.patch({ selection: ids, editingId: null });
  }

  toggleSelect(id: string): void {
    const set = new Set(this.state.selection);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.patch({ selection: [...set] });
  }

  moveSelection(dx: number, dy: number, history = true): void {
    const selected = this.selected;
    if (!selected.length) return;
    this.updateMany(
      selected.map((el) => ({ id: el.id, patch: { x: el.x + dx, y: el.y + dy } })),
      history,
    );
  }

  reorder(id: string, direction: "front" | "back" | "forward" | "backward"): void {
    const list = this.page.elements;
    const index = list.findIndex((e) => e.id === id);
    if (index < 0) return;
    this.pushHistory();
    const [el] = list.splice(index, 1);
    const target =
      direction === "front"
        ? list.length
        : direction === "back"
          ? 0
          : direction === "forward"
            ? Math.min(list.length, index + 1)
            : Math.max(0, index - 1);
    list.splice(target, 0, el);
    this.touch();
    this.emit();
  }

  alignSelection(mode: "left" | "center-h" | "right" | "top" | "center-v" | "bottom"): void {
    const selected = this.selected;
    if (selected.length < 1) return;
    const page = this.page;
    this.pushHistory();
    const bounds = {
      x: Math.min(...selected.map((e) => e.x)),
      y: Math.min(...selected.map((e) => e.y)),
      right: Math.max(...selected.map((e) => e.x + e.w)),
      bottom: Math.max(...selected.map((e) => e.y + e.h)),
    };
    for (const el of selected) {
      if (mode === "left") el.x = bounds.x;
      if (mode === "right") el.x = bounds.right - el.w;
      if (mode === "center-h") el.x = (bounds.x + bounds.right) / 2 - el.w / 2;
      if (mode === "top") el.y = bounds.y;
      if (mode === "bottom") el.y = bounds.bottom - el.h;
      if (mode === "center-v") el.y = (bounds.y + bounds.bottom) / 2 - el.h / 2;
      if (selected.length === 1) {
        if (mode === "left") el.x = 0;
        if (mode === "right") el.x = page.width - el.w;
        if (mode === "center-h") el.x = (page.width - el.w) / 2;
        if (mode === "top") el.y = 0;
        if (mode === "bottom") el.y = page.height - el.h;
        if (mode === "center-v") el.y = (page.height - el.h) / 2;
      }
    }
    this.touch();
    this.emit();
  }

  setTool(tool: Tool): void {
    this.patch({ tool, editingId: null });
  }

  /* ---------------- ajustes / persistência ---------------- */

  updateSettings(patch: Partial<Settings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
    localStorage.setItem(`${STORAGE_KEY}.settings`, JSON.stringify(this.state.settings));
    this.emit();
  }

  /** Guarda a miniatura de um projeto (JPEG pequeno). */
  setThumb(id: string, dataUrl: string): void {
    if (!id || !dataUrl) return;
    this.thumbs[id] = dataUrl;
    const keys = Object.keys(this.thumbs);
    if (keys.length > MAX_THUMBS) {
      for (const key of keys.slice(0, keys.length - MAX_THUMBS)) delete this.thumbs[key];
    }
    saveThumbs(this.thumbs);
    const item = this.state.recent.find((r) => r.id === id);
    if (item) item.thumb = dataUrl;
  }

  persistRecent(): void {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}.recent`);
      const parsed = raw ? (JSON.parse(raw) as { projects: Project[] }) : { projects: [] };
      const list = parsed.projects.filter((p) => p.id !== this.state.project.id);
      list.unshift(stripHeavyMedia(this.state.project));
      const trimmed = list.slice(0, 12);
      const payload = JSON.stringify({ projects: trimmed });
      // Nunca deixamos um projeto gigante travar a interface.
      if (payload.length > 3_500_000) {
        const lean = trimmed.slice(0, 4);
        localStorage.setItem(`${STORAGE_KEY}.recent`, JSON.stringify({ projects: lean }));
      } else {
        localStorage.setItem(`${STORAGE_KEY}.recent`, payload);
      }
      this.state.recent = trimmed.map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        pages: p.pages.length,
        page: p.pages[0],
        thumb: this.thumbs[p.id],
      }));
    } catch (error) {
      console.warn("não consegui salvar os recentes", error);
    }
  }

  getRecentProject(id: string): Project | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}.recent`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { projects: Project[] };
      return parsed.projects.find((p) => p.id === id) ?? null;
    } catch {
      return null;
    }
  }

  deleteRecent(id: string): void {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}.recent`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { projects: Project[] };
      parsed.projects = parsed.projects.filter((p) => p.id !== id);
      localStorage.setItem(`${STORAGE_KEY}.recent`, JSON.stringify(parsed));
      this.state.recent = parsed.projects.map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        pages: p.pages.length,
        page: p.pages[0],
      }));
      this.emit();
    } catch {
      /* noop */
    }
  }

  /* ---------------- utilidades de UI ---------------- */

  toast(text: string, kind: Toast["kind"] = "info"): void {
    const toast: Toast = { id: uid("t"), text, kind };
    this.state.toasts = [...this.state.toasts, toast];
    this.emit();
    window.setTimeout(() => {
      this.state.toasts = this.state.toasts.filter((t) => t.id !== toast.id);
      this.emit();
    }, 4200);
  }

  addChat(message: { role: "user" | "assistant" | "system"; content: string; meta?: string }): void {
    this.state.chat = [...this.state.chat, message];
    this.emit();
  }

  /** Cria elemento já posicionado no centro da página. */
  newElementAtCenter(kind: Element["kind"], w: number, h: number): Element {
    const page = this.page;
    const el = baseElement(kind, (page.width - w) / 2, (page.height - h) / 2, w, h);
    return el;
  }

  currentFormatId(): string {
    const page = this.page;
    return FORMATS.find((f) => f.w === page.width && f.h === page.height)?.id ?? "custom";
  }
}

export const store = new Store();
export type { Store };
