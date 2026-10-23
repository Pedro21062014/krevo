/**
 * Diálogo de criação: primeiro o tipo de mídia, depois o formato.
 *
 * O usuário escolhe o que vai criar (post, vídeo, apresentação, documento,
 * impressão ou tamanho próprio) e o formato exato em pixels — o projeto já
 * nasce com a mídia padrão na medida certa.
 */

import { store } from "../store";
import { esc } from "../util";
import { icons } from "./icons";

export interface FormatOption {
  id: string;
  name: string;
  hint: string;
  w: number;
  h: number;
}

export interface MediaKind {
  id: string;
  label: string;
  hint: string;
  /** Rótulo usado no nome padrão do projeto. */
  prefix: string;
  formats: FormatOption[];
}

export const MEDIA_KINDS: MediaKind[] = [
  {
    id: "imagem",
    label: "Imagem / social",
    hint: "posts, capas e artes para redes",
    prefix: "Post",
    formats: [
      { id: "ig-post", name: "Post quadrado", hint: "Instagram · 1:1", w: 1080, h: 1080 },
      { id: "ig-portrait", name: "Retrato 4:5", hint: "Instagram feed", w: 1080, h: 1350 },
      { id: "ig-story", name: "Story / Reels", hint: "9:16 vertical", w: 1080, h: 1920 },
      { id: "ig-landscape", name: "Paisagem 1.91:1", hint: "Feed horizontal", w: 1200, h: 628 },
      { id: "pin", name: "Pinterest", hint: "2:3 vertical", w: 1000, h: 1500 },
      { id: "capa", name: "Capa 16:9", hint: "1600×900", w: 1600, h: 900 },
    ],
  },
  {
    id: "video",
    label: "Vídeo",
    hint: "gravações de tela, reels e anúncios",
    prefix: "Vídeo",
    formats: [
      { id: "vid-fhd", name: "Full HD", hint: "16:9 · 1920×1080", w: 1920, h: 1080 },
      { id: "vid-vertical", name: "Vertical", hint: "9:16 · 1080×1920", w: 1080, h: 1920 },
      { id: "vid-square", name: "Quadrado", hint: "1:1 · 1080×1080", w: 1080, h: 1080 },
      { id: "vid-uhd", name: "4K", hint: "16:9 · 3840×2160", w: 3840, h: 2160 },
      { id: "vid-hd", name: "HD", hint: "16:9 · 1280×720", w: 1280, h: 720 },
    ],
  },
  {
    id: "apresentacao",
    label: "Apresentação",
    hint: "slides, pitch decks e aulas",
    prefix: "Apresentação",
    formats: [
      { id: "ap-hd", name: "Slide 16:9", hint: "1920×1080", w: 1920, h: 1080 },
      { id: "ap-hd-small", name: "Slide 16:9 leve", hint: "1280×720", w: 1280, h: 720 },
      { id: "ap-4x3", name: "Slide 4:3", hint: "1440×1080", w: 1440, h: 1080 },
      { id: "ap-a4l", name: "A4 paisagem", hint: "1123×794", w: 1123, h: 794 },
    ],
  },
  {
    id: "documento",
    label: "Documento",
    hint: "relatórios, propostas e currículos",
    prefix: "Documento",
    formats: [
      { id: "doc-a4", name: "A4 retrato", hint: "794×1123", w: 794, h: 1123 },
      { id: "doc-a4l", name: "A4 paisagem", hint: "1123×794", w: 1123, h: 794 },
      { id: "doc-carta", name: "Carta", hint: "816×1056", w: 816, h: 1056 },
      { id: "doc-oficio", name: "Ofício", hint: "1240×1754", w: 1240, h: 1754 },
    ],
  },
  {
    id: "impresso",
    label: "Impressão",
    hint: "flyers, cartões e pôsteres",
    prefix: "Impresso",
    formats: [
      { id: "imp-a5", name: "Flyer A5", hint: "559×794", w: 559, h: 794 },
      { id: "imp-a4", name: "Pôster A4", hint: "794×1123", w: 794, h: 1123 },
      { id: "imp-a3", name: "Pôster A3", hint: "1123×1587", w: 1123, h: 1587 },
      { id: "imp-cartao", name: "Cartão de visita", hint: "1050×600", w: 1050, h: 600 },
    ],
  },
  {
    id: "custom",
    label: "Tamanho próprio",
    hint: "defina largura e altura",
    prefix: "Design",
    formats: [],
  },
];

const STORE_KEY = "krevo.v1.create";

interface SavedChoice {
  kind: string;
  format: string;
  w: number;
  h: number;
}

function loadChoice(): SavedChoice {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedChoice;
      if (parsed && parsed.kind) return parsed;
    }
  } catch {
    /* noop */
  }
  return { kind: "imagem", format: "ig-post", w: 1080, h: 1080 };
}

function saveChoice(choice: SavedChoice): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(choice));
  } catch {
    /* noop */
  }
}

class CreateDialog {
  private root: HTMLDivElement | null = null;
  private kindId = loadChoice().kind;
  private formatId = loadChoice().format;
  private w = loadChoice().w;
  private h = loadChoice().h;

  private get kind(): MediaKind {
    return MEDIA_KINDS.find((k) => k.id === this.kindId) ?? MEDIA_KINDS[0];
  }

  private get format(): FormatOption | null {
    return this.kind.formats.find((f) => f.id === this.formatId) ?? this.kind.formats[0] ?? null;
  }

  open(): void {
    const choice = loadChoice();
    this.kindId = choice.kind;
    const saved = this.kind.formats.find((f) => f.id === choice.format);
    const format = saved ?? this.kind.formats[0] ?? null;
    this.formatId = format?.id ?? "custom";
    this.w = choice.w || format?.w || 1080;
    this.h = choice.h || format?.h || 1080;
    this.build();
  }

  private build(): void {
    this.root?.remove();
    const root = document.createElement("div");
    root.className = "mk-overlay";
    root.innerHTML = `
      <div class="mk-dialog" role="dialog" aria-modal="true" aria-label="Criar design">
        <div class="mk-head">
          <div>
            <h2>Criar design</h2>
            <p>1. escolha o tipo de mídia · 2. escolha o formato</p>
          </div>
          <button class="btn small icon ghost" data-mk="close" title="Fechar (Esc)">${icons.close}</button>
        </div>

        <div class="mk-body">
          <div class="mk-kinds">
            ${MEDIA_KINDS.map(
              (k) => `
              <button class="mk-kind ${k.id === this.kindId ? "active" : ""}" data-mk-kind="${k.id}">
                <strong>${esc(k.label)}</strong>
                <em>${esc(k.hint)}</em>
              </button>`,
            ).join("")}
          </div>

          <div class="mk-formats">
            ${
              this.kindId === "custom"
                ? this.customFields()
                : `
              <div class="mk-grid">
                ${this.kind.formats
                  .map(
                    (f) => `
                  <button class="mk-format ${f.id === this.formatId ? "active" : ""}" data-mk-format="${f.id}">
                    <span class="mk-shape" style="width:${Math.round(26 * Math.min(1, f.w / f.h))}px;height:${Math.round(
                      26 * Math.min(1, f.h / f.w),
                    )}px"></span>
                    <span class="mk-format-text">
                      <strong>${esc(f.name)}</strong>
                      <em>${esc(f.hint)}</em>
                    </span>
                  </button>`,
                  )
                  .join("")}
              </div>`
            }
            <div class="mk-summary">
              <span><strong>${this.w}×${this.h}</strong> px</span>
              <span>${esc(ratioLabel(this.w, this.h))}</span>
              <span>${esc(this.kind.label)}</span>
            </div>
          </div>
        </div>

        <div class="mk-foot">
          <label class="mk-name">
            <span>Nome do projeto</span>
            <input data-mk-input="name" value="${esc(this.defaultName())}" spellcheck="false" />
          </label>
          <button class="btn ghost" data-mk="close">Cancelar</button>
          <button class="btn primary" data-mk="create">${icons.plus} Criar design</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.bind();
  }

  private customFields(): string {
    return `
      <div class="mk-custom">
        <label class="mk-field">
          <span>Largura (px)</span>
          <input type="number" min="64" max="10000" step="1" data-mk-input="w" value="${this.w}" />
        </label>
        <label class="mk-field">
          <span>Altura (px)</span>
          <input type="number" min="64" max="10000" step="1" data-mk-input="h" value="${this.h}" />
        </label>
        <div class="mk-presets">
          ${[
            { label: "1:1", w: 1080, h: 1080 },
            { label: "9:16", w: 1080, h: 1920 },
            { label: "16:9", w: 1920, h: 1080 },
            { label: "4:5", w: 1080, h: 1350 },
            { label: "A4", w: 794, h: 1123 },
          ]
            .map((p) => `<button class="chip" data-mk-preset="${p.w}x${p.h}">${p.label}</button>`)
            .join("")}
        </div>
      </div>`;
  }

  private defaultName(): string {
    const format = this.format;
    if (this.kindId === "custom") return `${this.kind.prefix} ${this.w}×${this.h}`;
    return format ? format.name : `${this.kind.prefix} ${this.w}×${this.h}`;
  }

  private bind(): void {
    const root = this.root;
    if (!root) return;

    root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target === root) {
        this.close();
        return;
      }
      const kindBtn = target.closest<HTMLElement>("[data-mk-kind]");
      if (kindBtn?.dataset.mkKind) {
        this.kindId = kindBtn.dataset.mkKind;
        const first = this.kind.formats[0];
        if (first) {
          this.formatId = first.id;
          this.w = first.w;
          this.h = first.h;
        }
        this.build();
        return;
      }
      const formatBtn = target.closest<HTMLElement>("[data-mk-format]");
      if (formatBtn?.dataset.mkFormat) {
        const format = this.kind.formats.find((f) => f.id === formatBtn.dataset.mkFormat);
        if (format) {
          this.formatId = format.id;
          this.w = format.w;
          this.h = format.h;
        }
        this.build();
        return;
      }
      const preset = target.closest<HTMLElement>("[data-mk-preset]")?.dataset.mkPreset;
      if (preset) {
        const [w, h] = preset.split("x").map(Number);
        this.w = w;
        this.h = h;
        this.build();
        return;
      }
      const action = target.closest<HTMLElement>("[data-mk]")?.dataset.mk;
      if (action === "close") this.close();
      if (action === "create") this.create();
    });

    root.querySelectorAll<HTMLInputElement>("[data-mk-input]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.mkInput;
        if (key === "w") this.w = Math.max(64, Math.min(10000, Number(input.value) || this.w));
        if (key === "h") this.h = Math.max(64, Math.min(10000, Number(input.value) || this.h));
        if (key === "w" || key === "h") this.build();
      });
      if (input.dataset.mkInput === "name") {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") this.create();
        });
        queueMicrotask(() => input.select());
      }
    });

    window.setTimeout(() => {
      const onKey = (event: KeyboardEvent): void => {
        if (!this.root) {
          window.removeEventListener("keydown", onKey, true);
          return;
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          this.close();
        }
      };
      if (this.root) window.addEventListener("keydown", onKey, true);
    }, 0);
  }

  private create(): void {
    const nameInput = this.root?.querySelector<HTMLInputElement>('[data-mk-input="name"]');
    const name = nameInput?.value.trim() || this.defaultName();
    const w = Math.round(this.w);
    const h = Math.round(this.h);
    saveChoice({ kind: this.kindId, format: this.formatId, w, h });
    this.close();
    store.createProject(name, w, h);
    store.toast(`Design criado em ${w}×${h}.`, "success");
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }
}

function ratioLabel(w: number, h: number): string {
  if (!w || !h) return "—";
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(Math.round(w), Math.round(h));
  const rw = Math.round(w / d);
  const rh = Math.round(h / d);
  if (rw > 40 || rh > 40) return `${(w / h).toFixed(2)}:1`;
  return `${rw}:${rh}`;
}

let dialog: CreateDialog | null = null;

/** Abre o diálogo de criação (tipo de mídia + formato). */
export function openCreateDialog(): void {
  if (!dialog) dialog = new CreateDialog();
  dialog.open();
}
