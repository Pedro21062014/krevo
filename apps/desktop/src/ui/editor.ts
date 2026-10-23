/**
 * Editor: canvas, seleção, arraste, redimensionamento, camadas, páginas,
 * inspetor de propriedades e painel do agente.
 */

import {
  FILTER_PRESETS,
  GRADIENTS,
  RADIUS_PRESETS,
  RESIZE_PRESETS,
  SHADOW_PRESETS,
  baseElement,
  gradient,
  iconDataUri,
  shapeEl,
  textEl,
} from "../assets";
import { exportPdf, isDesktop, saveProjectFile } from "../bridge";
import { store } from "../store";
import type { Element, Page, TextAlign } from "../types";
import { clamp, esc, materializeMedia, mediaSource, toCss } from "../util";
import { agentPanelHtml, bindAgentPanel } from "./agent";
import { icons } from "./icons";
import { downloadPagePng, pageThumbnail } from "./export-image";
import { openMenuAt, openShortcuts } from "./menu";
import { displayCaptureSupported, openRecorder, recorderSupported, type RecordedVideo } from "./record";
import { applyElement, renderElement, renderThumb } from "./render";

type DragMode = "move" | "resize" | "rotate" | "pan" | "marquee";

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  handle?: string;
  originals: { id: string; x: number; y: number; w: number; h: number; rotation: number }[];
  centerX?: number;
  centerY?: number;
  startRotation?: number;
  startAngle?: number;
  panStart?: { x: number; y: number };
  moved: boolean;
}

export class EditorView {
  private root: HTMLElement;
  private stageWrap: HTMLElement | null = null;
  private stageInner: HTMLElement | null = null;
  private pageEl: HTMLElement | null = null;
  private drag: DragState | null = null;
  private spaceDown = false;
  private lastClick: { id: string; at: number } | null = null;
  private lastAgentKey = "";
  private nodes = new Map<string, HTMLElement>();
  private pagesKey = "";
  private layersKey = "";
  private inspectorKey = "";
  private moveFrame = 0;
  private thumbTimer = 0;
  private pendingMove: PointerEvent | null = null;
  private unsubscribe: (() => void) | null = null;
  private bound = false;
  private wantFit = true;
  private onResize = (): void => {
    if (this.wantFit) store.patch({ zoom: this.fitZoom() });
  };

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(): void {
    this.root.innerHTML = `
      <div class="editor">
        <aside class="toolrail">
          <button class="tool back" data-edit="home" title="Voltar ao início (Esc)">${icons.back}</button>
          <button class="tool ${store.state.tool === "select" ? "active" : ""}" data-tool="select" title="Selecionar (V)">${icons.cursor}</button>
          <button class="tool ${store.state.tool === "hand" ? "active" : ""}" data-tool="hand" title="Mover tela (H / espaço)">${icons.hand}</button>
          <button class="tool ${store.state.tool === "text" ? "active" : ""}" data-tool="text" title="Texto (T)">${icons.text}</button>
          <button class="tool ${store.state.tool === "rect" ? "active" : ""}" data-tool="rect" title="Retângulo (R)">${icons.square}</button>
          <button class="tool ${store.state.tool === "ellipse" ? "active" : ""}" data-tool="ellipse" title="Elipse (O)">${icons.circle}</button>
          <button class="tool" data-edit="add-image" title="Inserir imagem">${icons.image}</button>
          <button class="tool" data-edit="add-video" title="Inserir vídeo">${icons.video}</button>
          <button class="tool" data-edit="record-screen" title="Gravar tela ou câmera">${icons.record}</button>
          <span class="spacer"></span>
          <button class="tool" data-edit="undo" title="Desfazer (⌘Z)">${icons.undo}</button>
          <button class="tool" data-edit="redo" title="Refazer (⇧⌘Z)">${icons.redo}</button>
          <button class="tool" data-edit="export-pdf" title="Exportar PDF (⇧⌘E)">${icons.pdf}</button>
        </aside>

        <aside class="panel left">
          <div class="panel-head">
            <span>Páginas</span>
            <div class="head-actions">
              <button class="btn small icon ghost" data-edit="add-page" title="Nova página">${icons.plus}</button>
            </div>
          </div>
          <div class="panel-body tight" id="pages-list"></div>
          <div class="panel-head" style="border-top:1px solid var(--line)">
            <span>Camadas</span>
            <div class="head-actions">
              <button class="btn small icon ghost" data-edit="add-text" title="Adicionar texto">${icons.text}</button>
            </div>
          </div>
          <div class="panel-body tight" id="layers-list" style="flex:1"></div>
        </aside>

        <div class="workspace">
          <div class="topbar">
            <div class="crumbs">
              <button class="btn small icon ghost" data-edit="home" title="Projetos">${icons.home}</button>
              <span>/</span>
              <input class="doc-name" id="doc-name" value="${esc(store.state.project.name)}" spellcheck="false" />
              <span class="pill" id="format-pill"></span>
            </div>
            <div class="spacer"></div>
            <div class="zoom-pill">
              <button data-edit="zoom-out" title="Menos zoom">${icons.zoomOut}</button>
              <span id="zoom-label">—</span>
              <button data-edit="zoom-in" title="Mais zoom">${icons.zoomIn}</button>
              <button data-edit="zoom-fit" title="Ajustar à tela">${icons.fit}</button>
            </div>
            <button class="btn small ghost" data-edit="toggle-grid" title="Mostrar grade">${icons.grid}</button>
            <button class="btn small ghost" data-edit="export-png" title="Baixar PNG desta página">${icons.image} PNG</button>
            <button class="btn small" data-edit="save" title="Salvar (⌘S)">${icons.download} Salvar</button>
            <button class="btn primary small" data-edit="export-pdf" title="Exportar PDF (⇧⌘E)">${icons.pdf} PDF</button>
          </div>

          <div class="canvas-area">
            <div class="stage-wrap" id="stage-wrap">
              <div class="stage-inner" id="stage-inner"></div>
            </div>
            <div class="page-strip" id="page-strip"></div>
          </div>
        </div>

        <aside class="panel right">
          <div class="panel-tabs">
            <button class="panel-tab ${store.state.rightPanel === "inspector" ? "active" : ""}" data-tab-panel="inspector">Propriedades</button>
            <button class="panel-tab ${store.state.rightPanel === "agent" ? "active" : ""}" data-tab-panel="agent">${icons.sparkles} Agente</button>
          </div>
          <div class="panel-body" id="inspector-host" style="flex:1"></div>
          <div id="agent-host" class="${store.state.rightPanel === "agent" ? "" : "hidden"}" style="flex:1;min-height:0"></div>
        </aside>
      </div>
      <div class="toasts">
        ${store.state.toasts.map((t) => `<div class="toast ${t.kind}">${esc(t.text)}</div>`).join("")}
      </div>`;

    this.stageWrap = this.root.querySelector("#stage-wrap");
    this.stageInner = this.root.querySelector("#stage-inner");

    this.bindStatic();
    this.paintAll();
    requestAnimationFrame(() => {
      store.patch({ zoom: this.fitZoom() });
    });
    window.addEventListener("resize", this.onResize);

    this.unsubscribe = store.subscribe(() => {
      this.paintAll();
      this.scheduleThumb();
    });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.clearTimeout(this.thumbTimer);
    window.removeEventListener("resize", this.onResize);
    this.cleanupKeys();
  }

  /* ---------------- bindings estáticos ---------------- */

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (event.code === "Space" && !typing) {
      this.spaceDown = true;
      this.stageWrap?.classList.add("panning");
    }
    if (typing) return;

    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void this.save();
      return;
    }
    if (mod && event.key.toLowerCase() === "e" && event.shiftKey) {
      event.preventDefault();
      void this.exportPdf();
      return;
    }
    if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      store.duplicateSelected();
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      this.recordScreen();
      return;
    }
    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      store.select(store.page.elements.map((el) => el.id));
      return;
    }
    if (mod && event.key.toLowerCase() === "c") {
      const count = store.copySelection();
      if (count) store.toast(`${count} elemento(s) copiado(s).`, "success");
      return;
    }
    if (mod && event.key.toLowerCase() === "v") {
      const count = store.pasteClipboard();
      if (count) store.toast(`${count} elemento(s) colado(s).`, "success");
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      const el = store.selected[0];
      if (el) store.updateElement(el.id, { locked: !el.locked });
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      const el = store.selected[0];
      if (el) store.updateElement(el.id, { hidden: !el.hidden });
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      store.patch({ showGrid: !store.state.showGrid });
      return;
    }
    if (mod && (event.key === "]" || event.key === "}")) {
      event.preventDefault();
      const el = store.selected[0];
      if (el) store.reorder(el.id, event.shiftKey ? "front" : "forward");
      return;
    }
    if (mod && (event.key === "[" || event.key === "{")) {
      event.preventDefault();
      const el = store.selected[0];
      if (el) store.reorder(el.id, event.shiftKey ? "back" : "backward");
      return;
    }
    if (mod && event.key === "0") {
      event.preventDefault();
      this.wantFit = true;
      store.patch({ zoom: this.fitZoom(), pan: { x: 0, y: 0 } });
      return;
    }
    if (mod && (event.key === "+" || event.key === "=")) {
      event.preventDefault();
      this.wantFit = false;
      store.patch({ zoom: clamp(store.state.zoom * 1.15, 0.08, 4) });
      return;
    }
    if (mod && event.key === "-") {
      event.preventDefault();
      this.wantFit = false;
      store.patch({ zoom: clamp(store.state.zoom / 1.15, 0.08, 4) });
      return;
    }
    if (event.key === "?" || (event.shiftKey && event.key === "/")) {
      event.preventDefault();
      openShortcuts();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (store.state.selection.length) {
        event.preventDefault();
        store.deleteSelected();
      }
      return;
    }
    if (event.key === "Escape") {
      if (store.state.selection.length) store.select([]);
      else store.patch({ screen: "home" });
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      store.moveSelection(-step, 0);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      store.moveSelection(step, 0);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      store.moveSelection(0, -step);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      store.moveSelection(0, step);
    }
    const tools: Record<string, Element["kind"]> = { t: "text", r: "rect", o: "ellipse", l: "line" };
    const kind = tools[event.key.toLowerCase()];
    if (kind) this.addQuick(kind);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "Space") {
      this.spaceDown = false;
      this.stageWrap?.classList.remove("panning");
    }
  };

  private cleanupKeys(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private bindStatic(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.root.querySelectorAll<HTMLElement>("[data-edit]").forEach((node) => {
      node.addEventListener("click", () => this.onToolbar(node.dataset.edit ?? ""));
    });

    this.root.querySelectorAll<HTMLElement>("[data-tool]").forEach((node) => {
      node.addEventListener("click", () => store.setTool((node.dataset.tool ?? "select") as never));
    });

    this.root.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((node) => {
      node.addEventListener("click", () => {
        const panel = node.dataset.tabPanel;
        this.root.querySelectorAll("[data-tab-panel]").forEach((n) => n.classList.toggle("active", n === node));
        this.root.querySelector("#inspector-host")?.classList.toggle("hidden", panel !== "inspector");
        this.root.querySelector("#agent-host")?.classList.toggle("hidden", panel !== "agent");
        store.patch({ rightPanel: panel === "agent" ? "agent" : "inspector" }, false);
      });
    });

    const docName = this.root.querySelector<HTMLInputElement>("#doc-name");
    docName?.addEventListener("change", () => {
      store.state.project.name = docName.value.trim() || "Sem título";
      store.persistRecent();
      store.emit();
    });

    this.stageWrap?.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        this.wantFit = false;
        const next = clamp(store.state.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.08, 4);
        store.patch({ zoom: next });
      } else {
        store.patch({
          pan: { x: store.state.pan.x - event.deltaX, y: store.state.pan.y - event.deltaY },
        });
      }
    });

    this.stageWrap?.addEventListener("pointerdown", (event) => this.onStagePointerDown(event));
    this.stageWrap?.addEventListener("contextmenu", (event) => this.onContextMenu(event));
    this.stageWrap?.addEventListener("dblclick", (event) => {
      const target = event.target as HTMLElement;
      const node = target.closest<HTMLElement>(".kf-el");
      if (!node) return;
      const el = store.page.elements.find((e) => e.id === node.dataset.id);
      if (!el || el.kind !== "text" || el.locked) return;
      event.preventDefault();
      event.stopPropagation();
      this.startTextEdit(node, el);
    });
    window.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("pointerup", () => this.onPointerUp());

    this.stageWrap?.addEventListener("dragover", (event) => {
      event.preventDefault();
      this.stageWrap?.classList.add("drop-target");
    });
    this.stageWrap?.addEventListener("dragleave", () => this.stageWrap?.classList.remove("drop-target"));
    this.stageWrap?.addEventListener("drop", (event) => void this.onDrop(event));

    this.root.querySelector("#pages-list")?.addEventListener("click", (event) => {
      const node = (event.target as HTMLElement).closest<HTMLElement>("[data-page-index]");
      if (node) store.setPageIndex(Number(node.dataset.pageIndex));
      const dup = (event.target as HTMLElement).closest<HTMLElement>("[data-page-action]");
      if (dup) {
        event.stopPropagation();
        const index = Number(dup.dataset.pageIndex);
        if (dup.dataset.pageAction === "duplicate") store.duplicatePage(index);
        if (dup.dataset.pageAction === "delete") store.deletePage(index);
      }
    });

    this.root.querySelector("#layers-list")?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>("[data-layer-id]");
      if (!row) return;
      const id = row.dataset.layerId ?? "";
      if (target.closest("[data-layer-action='hide']")) {
        const el = store.page.elements.find((e) => e.id === id);
        if (el) store.updateElement(id, { hidden: !el.hidden });
        return;
      }
      if (target.closest("[data-layer-action='up']")) {
        store.reorder(id, "forward");
        return;
      }
      if (target.closest("[data-layer-action='down']")) {
        store.reorder(id, "backward");
        return;
      }
      if (target.closest("[data-layer-action='lock']")) {
        const el = store.page.elements.find((e) => e.id === id);
        if (el) store.updateElement(id, { locked: !el.locked });
        return;
      }
      if ((event as MouseEvent).shiftKey) store.toggleSelect(id);
      else store.select([id]);
    });

    this.root.querySelector("#inspector-host")?.addEventListener("click", (event) => this.onInspectorClick(event));
    this.root.querySelector("#inspector-host")?.addEventListener("change", (event) => this.onInspectorChange(event));
    this.root.querySelector("#inspector-host")?.addEventListener("input", (event) => this.onInspectorInput(event));

    bindAgentPanel(this.root);
  }

  /* ---------------- toolbar ---------------- */

  private async onToolbar(action: string): Promise<void> {
    switch (action) {
      case "home":
        await this.refreshThumb();
        store.persistRecent();
        store.patch({ screen: "home", loadingHome: false });
        break;
      case "undo":
        store.undo();
        break;
      case "redo":
        store.redo();
        break;
      case "zoom-in":
        this.wantFit = false;
        store.patch({ zoom: clamp(store.state.zoom * 1.15, 0.08, 4) });
        break;
      case "zoom-out":
        this.wantFit = false;
        store.patch({ zoom: clamp(store.state.zoom / 1.15, 0.08, 4) });
        break;
      case "zoom-fit":
        this.wantFit = true;
        store.patch({ zoom: this.fitZoom(), pan: { x: 0, y: 0 } });
        break;
      case "add-page":
        store.addPage();
        break;
      case "add-image":
        this.pickFile("image/*");
        break;
      case "add-video":
        this.pickFile("video/*");
        break;
      case "record-screen":
        this.recordScreen();
        break;
      case "toggle-grid":
        store.patch({ showGrid: !store.state.showGrid });
        break;
      case "save":
        await this.save();
        break;
      case "export-pdf":
        await this.exportPdf();
        break;
      case "export-png":
        await this.exportPng();
        break;
      default:
        break;
    }
  }

  /** Gera a miniatura do projeto (para a lista de recentes) sem travar a UI. */
  private scheduleThumb(): void {
    window.clearTimeout(this.thumbTimer);
    this.thumbTimer = window.setTimeout(() => {
      void this.refreshThumb();
    }, 2000);
  }

  private async refreshThumb(): Promise<void> {
    try {
      const page = store.page;
      if (!page) return;
      const dataUrl = await pageThumbnail(page, 520);
      store.setThumb(store.state.project.id, dataUrl);
    } catch {
      /* miniatura é opcional */
    }
  }

  private async save(): Promise<void> {
    try {
      const project = await materializeMedia(store.state.project);
      const result = await saveProjectFile(project);
      store.persistRecent();
      store.toast(result === "download" ? "Projeto baixado no navegador." : `Projeto salvo em ${result}`, "success");
    } catch (error) {
      const message = (error as Error).message;
      if (message !== "Salvamento cancelado.") store.toast(message, "error");
    }
  }

  private async exportPng(): Promise<void> {
    try {
      store.toast("Gerando PNG em 2×…", "info");
      const page = store.page;
      await downloadPagePng(page, store.state.project.name || page.name, 2);
      store.toast(`PNG ${Math.round(page.width * 2)}×${Math.round(page.height * 2)} baixado.`, "success");
    } catch (error) {
      store.toast(`Falha ao gerar o PNG: ${(error as Error).message}`, "error");
    }
  }

  private async exportPdf(): Promise<void> {
    try {
      store.toast("Preparando o PDF…", "info");
      const project = await materializeMedia(store.state.project);
      const result = await exportPdf(project);
      store.toast(`PDF gerado em ${result}`, "success");
    } catch (error) {
      const message = (error as Error).message;
      if (message === "__PRINT__") {
        this.printFallback();
        return;
      }
      if (message !== "Exportação cancelada.") store.toast(message, "error");
    }
  }

  /** No navegador, exporta via impressão (o usuário escolhe "Salvar como PDF"). */
  private printFallback(): void {
    const win = window.open("", "_blank");
    if (!win) {
      store.toast("Bloqueei o pop-up. Use o app desktop para PDF vetorial.", "error");
      return;
    }
    const pages = store.state.project.pages
      .map((page) => {
        const holder = document.createElement("div");
        holder.appendChild(renderThumb(page, Math.min(page.width, 1400)));
        return `<div style="page-break-after:always;width:100%;display:flex;justify-content:center">${holder.innerHTML}</div>`;
      })
      .join("");
    win.document.write(`<!doctype html><html><head><title>${esc(store.state.project.name)}</title>
      <style>@page{size:auto;margin:0}body{margin:0;background:#fff}div{transform-origin:top left}</style>
      </head><body>${pages}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }

  /* ---------------- criação rápida ---------------- */

  private addQuick(kind: Element["kind"]): void {
    const page = store.page;
    let el: Element;
    if (kind === "text") {
      el = textEl(page.width * 0.1, page.height * 0.42, page.width * 0.8, 120, "Novo texto", {
        size: Math.round(page.height * 0.09),
        weight: 700,
        color: "#0B1020",
      });
    } else if (kind === "line") {
      el = baseElement("line", page.width * 0.1, page.height / 2, page.width * 0.8, 4);
      el.fill = "#0B1020";
      el.stroke = { color: "#0B1020", width: 4 };
    } else {
      el = shapeEl(kind, page.width / 2 - 160, page.height / 2 - 160, 320, 320, "#6C5CE7", {
        radius: kind === "rect" ? 24 : 0,
      });
    }
    el.name = kind;
    store.addElement(el);
  }

  /* ---------------- interação no canvas ---------------- */

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const pageEl = this.pageEl;
    if (!pageEl) return { x: 0, y: 0 };
    const rect = pageEl.getBoundingClientRect();
    const scale = store.state.zoom || 1;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }

  private onStagePointerDown(event: PointerEvent): void {
    if (event.button === 1 || this.spaceDown) {
      this.drag = {
        mode: "pan",
        startX: event.clientX,
        startY: event.clientY,
        originals: [],
        moved: false,
        panStart: { ...store.state.pan },
      };
      return;
    }
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]");
    const elementNode = target.closest<HTMLElement>(".kf-el");

    if (handle) {
      const selected = store.selected;
      if (!selected.length) return;
      const point = this.canvasPoint(event);
      const bounds = this.selectionBounds();
      this.drag = {
        mode: handle.dataset.handle === "rotate" ? "rotate" : "resize",
        handle: handle.dataset.handle,
        startX: point.x,
        startY: point.y,
        originals: selected.map((el) => ({ id: el.id, x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation })),
        centerX: bounds.x + bounds.w / 2,
        centerY: bounds.y + bounds.h / 2,
        startRotation: selected.length === 1 ? selected[0].rotation : 0,
        startAngle: Math.atan2(point.y - (bounds.y + bounds.h / 2), point.x - (bounds.x + bounds.w / 2)),
        moved: false,
      };
      store.pushHistory();
      return;
    }

    if (elementNode) {
      const id = elementNode.dataset.id ?? "";
      const el = store.page.elements.find((e) => e.id === id);
      if (!el || el.locked) return;

      // Duplo clique em texto abre a edição no lugar (o DOM é recriado a cada
      // clique, então medimos o intervalo aqui em vez de confiar no evento).
      const now = performance.now();
      if (
        el.kind === "text" &&
        this.lastClick &&
        this.lastClick.id === id &&
        now - this.lastClick.at < 450
      ) {
        this.lastClick = null;
        event.preventDefault();
        // espera o mouseup/click terminar antes de roubar o foco
        window.setTimeout(() => this.startTextEdit(elementNode, el), 0);
        return;
      }
      this.lastClick = { id, at: now };
      const already = store.state.selection.includes(id);
      if ((event as MouseEvent).shiftKey) store.toggleSelect(id);
      else if (!already) store.select([id]);

      const point = this.canvasPoint(event);
      this.drag = {
        mode: "move",
        startX: point.x,
        startY: point.y,
        originals: store.selected.map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation })),
        moved: false,
      };
      store.pushHistory();
      return;
    }

    // clique no vazio: desseleciona
    if (!event.shiftKey) store.select([]);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    // Agrupa os eventos no próximo quadro: arraste suave mesmo em máquinas lentas.
    this.pendingMove = event;
    if (this.moveFrame) return;
    this.moveFrame = requestAnimationFrame(() => {
      this.moveFrame = 0;
      const pending = this.pendingMove;
      this.pendingMove = null;
      if (pending) this.applyPointerMove(pending);
    });
  }

  private applyPointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    const drag = this.drag;

    if (drag.mode === "pan" && drag.panStart) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      store.patch({ pan: { x: drag.panStart.x + dx, y: drag.panStart.y + dy } });
      return;
    }

    const point = this.canvasPoint(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    const snap = (value: number): number => (event.altKey ? value : Math.round(value));

    if (drag.mode === "move") {
      const updates = drag.originals.map((original) => {
        const el = store.page.elements.find((e) => e.id === original.id);
        let nx = original.x + dx;
        let ny = original.y + dy;
        if (el && !event.altKey) {
          const snapped = this.snapToGuides(el, nx, ny);
          nx = snapped.x;
          ny = snapped.y;
        }
        return { id: original.id, patch: { x: Math.round(nx), y: Math.round(ny) } };
      });
      store.updateMany(updates, false);
      return;
    }

    if (drag.mode === "resize" && drag.handle) {
      const handle = drag.handle;
      const updates = drag.originals.map((original) => {
        let { x, y, w, h } = original;
        if (handle.includes("e")) w = original.w + dx;
        if (handle.includes("s")) h = original.h + dy;
        if (handle.includes("w")) {
          w = original.w - dx;
          x = original.x + dx;
        }
        if (handle.includes("n")) {
          h = original.h - dy;
          y = original.y + dy;
        }
        if (event.shiftKey) {
          const ratio = original.w / original.h || 1;
          if (handle === "se" || handle === "nw" || handle === "ne" || handle === "sw") {
            h = w / ratio;
            if (handle.includes("n")) y = original.y + (original.h - h);
          }
        }
        return {
          id: original.id,
          patch: {
            x: Math.round(snap(x)),
            y: Math.round(snap(y)),
            w: Math.max(8, Math.round(w)),
            h: Math.max(8, Math.round(h)),
          },
        };
      });
      store.updateMany(updates, false);
      return;
    }

    if (drag.mode === "rotate" && drag.centerX !== undefined && drag.centerY !== undefined) {
      const angle = Math.atan2(point.y - drag.centerY, point.x - drag.centerX);
      const delta = ((angle - (drag.startAngle ?? 0)) * 180) / Math.PI;
      const updates = drag.originals.map((original) => ({
        id: original.id,
        patch: { rotation: Math.round((drag.startRotation ?? 0) + delta) },
      }));
      store.updateMany(updates, false);
    }
  }

  private onPointerUp(): void {
    if (this.moveFrame) {
      cancelAnimationFrame(this.moveFrame);
      this.moveFrame = 0;
      if (this.pendingMove) this.applyPointerMove(this.pendingMove);
      this.pendingMove = null;
    }
    const wasDragging = this.drag !== null;
    const moved = this.drag?.moved ?? false;
    this.drag = null;
    this.root.querySelectorAll(".guide").forEach((g) => g.remove());
    if (wasDragging && moved) {
      // Fecha a transação: atualiza painéis e salva o histórico uma única vez.
      this.inspectorKey = "";
      this.layersKey = "";
      store.emit();
    }
  }

  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>(".kf-el");
    const id = node?.dataset.id ?? "";
    const el = id ? store.page.elements.find((e) => e.id === id) : undefined;

    if (el) {
      if (!store.state.selection.includes(el.id)) store.select([el.id]);
      const single = store.selected.length === 1;
      openMenuAt(event.clientX, event.clientY, [
        { header: el.text?.content?.split("\n")[0].slice(0, 28) || el.name || el.kind },
        {
          label: "Editar texto",
          shortcut: "duplo clique",
          disabled: el.kind !== "text",
          action: () => {
            const live = this.stageInner?.querySelector<HTMLElement>(`.kf-el[data-id="${el.id}"]`);
            if (live) this.startTextEdit(live, el);
          },
        },
        { label: "Duplicar", shortcut: "⌘D", action: () => store.duplicateSelected() },
        { label: "Copiar", shortcut: "⌘C", action: () => store.copySelection() },
        { label: "Colar", shortcut: "⌘V", disabled: !store.hasClipboard, action: () => store.pasteClipboard() },
        { label: "Gravar tela / câmera", shortcut: "⌘⇧R", action: () => this.recordScreen() },
        { separator: true },
        { label: "Trazer para frente", shortcut: "⌘⇧]", action: () => store.reorder(el.id, "front") },
        { label: "Avançar", shortcut: "⌘]", action: () => store.reorder(el.id, "forward") },
        { label: "Recuar", shortcut: "⌘[", action: () => store.reorder(el.id, "backward") },
        { label: "Enviar para trás", shortcut: "⌘⇧[", action: () => store.reorder(el.id, "back") },
        { separator: true },
        {
          label: el.locked ? "Desbloquear" : "Bloquear",
          shortcut: "⌘⇧L",
          action: () => store.updateElement(el.id, { locked: !el.locked }),
        },
        {
          label: el.hidden ? "Mostrar" : "Ocultar",
          shortcut: "⌘⇧H",
          action: () => store.updateElement(el.id, { hidden: !el.hidden }),
        },
        {
          label: "Tamanho original",
          disabled: !single || el.kind !== "image",
          action: () => store.updateElement(el.id, { w: el.w, h: el.h }),
        },
        { separator: true },
        {
          label: "Excluir",
          shortcut: "Del",
          danger: true,
          action: () => store.deleteSelected(),
        },
      ]);
      return;
    }

    openMenuAt(event.clientX, event.clientY, [
      { header: "Canvas" },
      { label: "Inserir texto", shortcut: "T", action: () => this.addQuick("text") },
      { label: "Inserir retângulo", shortcut: "R", action: () => this.addQuick("rect") },
      { label: "Inserir elipse", shortcut: "O", action: () => this.addQuick("ellipse") },
      { label: "Inserir imagem…", action: () => this.pickFile("image/*") },
      { label: "Inserir vídeo…", action: () => this.pickFile("video/*") },
      { label: "Gravar tela / câmera", shortcut: "⌘⇧R", action: () => this.recordScreen() },
      { separator: true },
      { label: "Colar", shortcut: "⌘V", disabled: !store.hasClipboard, action: () => store.pasteClipboard() },
      { label: "Selecionar tudo", shortcut: "⌘A", action: () => store.select(store.page.elements.map((e) => e.id)) },
      { separator: true },
      {
        label: store.state.showGrid ? "Ocultar grade" : "Mostrar grade",
        shortcut: "⌘⇧G",
        action: () => store.patch({ showGrid: !store.state.showGrid }),
      },
      { label: "Ajustar à tela", shortcut: "⌘0", action: () => this.onToolbar("zoom-fit") },
      { separator: true },
      { label: "Baixar PNG da página", action: () => void this.exportPng() },
      { label: "Atalhos", shortcut: "?", action: () => openShortcuts() },
    ]);
  }

  private snapToGuides(el: Element, x: number, y: number): { x: number; y: number } {
    const page = store.page;
    const tolerance = 6 / (store.state.zoom || 1);
    const others = page.elements.filter((e) => !store.state.selection.includes(e.id));
    const targetsX = [0, page.width / 2 - el.w / 2, page.width - el.w];
    const targetsY = [0, page.height / 2 - el.h / 2, page.height - el.h];
    for (const other of others) {
      targetsX.push(other.x, other.x + other.w - el.w, other.x + other.w / 2 - el.w / 2);
      targetsY.push(other.y, other.y + other.h - el.h, other.y + other.h / 2 - el.h / 2);
    }
    let nx = x;
    let ny = y;
    for (const t of targetsX) if (Math.abs(x - t) < tolerance) nx = t;
    for (const t of targetsY) if (Math.abs(y - t) < tolerance) ny = t;
    return { x: nx, y: ny };
  }

  private selectionBounds(): { x: number; y: number; w: number; h: number } {
    const selected = store.selected;
    if (!selected.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...selected.map((e) => e.x));
    const y = Math.min(...selected.map((e) => e.y));
    const right = Math.max(...selected.map((e) => e.x + e.w));
    const bottom = Math.max(...selected.map((e) => e.y + e.h));
    return { x, y, w: right - x, h: bottom - y };
  }

  private async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.stageWrap?.classList.remove("drop-target");
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;
    let point = this.canvasPoint(event as unknown as PointerEvent);
    for (const file of files) {
      if (file.name.endsWith(".krevo") || file.type === "application/json") {
        const text = await file.text();
        try {
          const parsed = JSON.parse(text) as { project?: unknown };
          const project = (parsed.project ?? parsed) as never;
          store.openProject(project);
        } catch {
          store.toast("Arquivo .krevo inválido.", "error");
        }
        continue;
      }
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        await this.importPdf(file);
        continue;
      }
      if (file.type.startsWith("video/") || file.type.startsWith("image/")) {
        await this.importMedia(file, undefined, point);
        point = { x: point.x + 28, y: point.y + 28 };
        continue;
      }
    }
  }

  /** Importa um PDF como páginas editáveis (cada página vira uma imagem). */
  private async importPdf(file: File): Promise<void> {
    store.toast("Importando PDF…", "info");
    try {
      const pdfjs = (await import("pdfjs-dist")) as unknown as {
        GlobalWorkerOptions: { workerSrc: string };
        getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
      };
      try {
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
      } catch {
        /* usa o worker padrão */
      }
      const data = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data }).promise;
      const pages: Page[] = [];
      const total = Math.min(doc.numPages, 30);
      for (let index = 1; index <= total; index += 1) {
        const page = await doc.getPage(index);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvasContext: context, viewport } as never).promise;
        const src = canvas.toDataURL("image/png");
        const el = baseElement("image", 0, 0, Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
        el.src = src;
        el.fit = "fill";
        el.name = `Página ${index}`;
        pages.push({
          id: `pg_${Date.now()}_${index}`,
          name: `Página ${index}`,
          width: Math.floor(viewport.width / 2),
          height: Math.floor(viewport.height / 2),
          background: "#FFFFFF",
          elements: [el],
        });
      }
      if (!pages.length) throw new Error("Não consegui ler nenhuma página.");
      store.pushHistory();
      store.state.project.pages = pages;
      store.state.project.name = file.name.replace(/\.pdf$/i, "");
      store.patch({ pageIndex: 0, selection: [] });
      store.persistRecent();
      store.toast(`PDF importado: ${pages.length} páginas editáveis.`, "success");
    } catch (error) {
      store.toast(`Falha ao importar PDF: ${(error as Error).message}`, "error");
    }
  }

  /* ---------------- pintura ---------------- */

  private paintAll(): void {
    this.paintTopbar();
    this.paintStage();
    // Durante um arraste, repintar páginas/camadas/inspetor a cada movimento é o
    // que deixava tudo travado: só o canvas é atualizado até soltar o mouse.
    if (this.drag) return;
    this.paintPages();
    this.paintLayers();
    this.paintInspector();
    this.paintAgentIfIdle();
  }

  private paintTopbar(): void {
    const pill = this.root.querySelector("#format-pill");
    const page = store.page;
    if (pill) pill.textContent = `${Math.round(page.width)}×${Math.round(page.height)}`;
    const label = this.root.querySelector("#zoom-label");
    if (label) label.textContent = `${Math.round((store.state.zoom || 0) * 100) || 100}%`;
  }

  private fitZoom(): number {
    if (!this.stageWrap) return 1;
    const page = store.page;
    const rect = this.stageWrap.getBoundingClientRect();
    const padding = 72;
    const scale = Math.min(
      (rect.width - padding) / page.width,
      (rect.height - padding) / page.height,
    );
    return Math.max(0.05, Math.min(scale, 2.2));
  }

  private paintStage(): void {
    if (!this.stageInner) return;
    const state = store.state;
    if (!state.zoom) state.zoom = this.fitZoom();
    const page = store.page;

    const existing = this.stageInner.querySelector(".kf-page");
    const pageEl = existing instanceof HTMLElement ? existing : document.createElement("div");
    if (!existing) {
      pageEl.className = "kf-page";
      this.stageInner.appendChild(pageEl);
    }
    pageEl.style.width = `${page.width}px`;
    pageEl.style.height = `${page.height}px`;
    pageEl.style.background = page.background ? toCss(page.background as never) : "#FFFFFF";
    pageEl.classList.toggle("grid-on", state.showGrid);
    this.pageEl = pageEl;

    // Reaproveita os nós por id: nada de recriar (mídia não recarrega, arraste fica fluido).
    const desired: HTMLElement[] = [];
    const alive = new Set<string>();
    for (const el of page.elements) {
      alive.add(el.id);
      let node = this.nodes.get(el.id);
      if (!node || !node.isConnected) {
        node = document.createElement("div");
        applyElement(node, el, true);
        this.nodes.set(el.id, node);
      } else {
        applyElement(node, el, true);
      }
      desired.push(node);
    }
    for (const [id, node] of this.nodes) {
      if (!alive.has(id)) {
        node.remove();
        this.nodes.delete(id);
      }
    }

    // Remove sobras (overlay antigo, elementos apagados) e reordena só se preciso.
    const current = Array.from(pageEl.children).filter(
      (child) => !(child as HTMLElement).classList.contains("selection-box"),
    ) as HTMLElement[];
    const ordered = current.length === desired.length && current.every((n, i) => n === desired[i]);
    if (!ordered) {
      pageEl.replaceChildren(...desired);
    }

    // Overlay de seleção (sempre recriado: é leve e posicional).
    pageEl.querySelectorAll(".selection-box").forEach((box) => box.remove());
    if (state.selection.length) {
      const bounds = this.selectionBounds();
      const box = document.createElement("div");
      box.className = `selection-box ${state.selection.length > 1 ? "multi" : ""}`;
      box.style.cssText = `left:${bounds.x}px;top:${bounds.y}px;width:${bounds.w}px;height:${bounds.h}px`;
      if (state.selection.length === 1) {
        for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
          const h = document.createElement("div");
          h.className = `handle ${handle}`;
          h.dataset.handle = handle;
          box.appendChild(h);
        }
        const rotate = document.createElement("div");
        rotate.className = "handle rotate";
        rotate.dataset.handle = "rotate";
        box.appendChild(rotate);
      }
      pageEl.appendChild(box);
    }

    this.stageInner.style.transform = `translate(calc(-50% + ${state.pan.x}px), calc(-50% + ${
      state.pan.y
    }px)) scale(${state.zoom})`;
    const label = this.root.querySelector("#zoom-label");
    if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  private startTextEdit(passedNode: HTMLElement, el: Element): void {
    if (!el.text) return;

    // Seleciona primeiro (isso repinta o canvas) e só então trava a edição,
    // para o paintStage não recriar o nó embaixo do cursor.
    store.patch({ editingId: el.id }, false);
    store.select([el.id]);
    store.patch({ editingId: el.id }, false);

    const node =
      this.stageInner?.querySelector<HTMLElement>(`.kf-el[data-id="${el.id}"]`) ?? passedNode;
    if (!node.isConnected) return;

    // Trabalhamos sobre o <span> interno, que é quem carrega o texto.
    const span = node.querySelector<HTMLElement>("span") ?? node;
    node.classList.add("editing");
    span.setAttribute("contenteditable", "true");
    span.style.userSelect = "text";
    span.focus();

    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const startedAt = performance.now();
    let done = false;

    // Clique fora confirma a edição (era isso que fazia o texto "voltar").
    const onDocPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && (span.contains(target) || node.contains(target))) return;
      finish(true);
    };

    const finish = (commit: boolean): void => {
      if (done) return;
      done = true;
      const raw = span.innerText.replace(/\u00a0/g, " ").replace(/\n$/, "");
      span.removeAttribute("contenteditable");
      span.style.userSelect = "";
      node.classList.remove("editing");
      span.removeEventListener("blur", onBlur);
      span.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDocPointerDown, true);
      store.patch({ editingId: null }, false);
      const current = el.text?.content ?? "";
      if (commit && raw !== current) {
        store.updateElement(el.id, { text: { ...(el.text as NonNullable<typeof el.text>), content: raw } });
        store.toast("Texto atualizado.", "success");
      } else {
        store.emit();
      }
    };
    const onBlur = (): void => {
      // Um blur imediato (no mesmo clique) não deve encerrar a edição.
      if (performance.now() - startedAt < 250) {
        window.setTimeout(() => {
          if (document.activeElement !== span) span.focus();
        }, 0);
        return;
      }
      finish(true);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        // Esc confirma (perder o texto digitado é pior); Shift+Esc descarta.
        event.preventDefault();
        event.stopPropagation();
        finish(!event.shiftKey);
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        finish(true);
      }
    };
    span.addEventListener("blur", onBlur);
    span.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDocPointerDown, true);
  }

  private paintPages(): void {
    const host = this.root.querySelector("#pages-list");
    const signature = store.state.project.pages
      .map((page, index) => `${page.id}:${index === store.state.pageIndex ? 1 : 0}:${page.name}`)
      .join("|");
    if (signature === this.pagesKey) {
      this.paintPageStrip();
      return;
    }
    this.pagesKey = signature;
    if (host) {
      host.innerHTML = store.state.project.pages
        .map((page, index) => {
          const holder = document.createElement("div");
          holder.appendChild(renderThumb(page, 56));
          return `
        <div class="page-item ${index === store.state.pageIndex ? "active" : ""}" data-page-index="${index}">
          <span class="thumb">${holder.innerHTML}</span>
          <span class="label">
            <b>${esc(page.name)}</b>
            <span>${Math.round(page.width)}×${Math.round(page.height)}</span>
          </span>
          <span class="acts">
            <button data-page-action="duplicate" data-page-index="${index}" title="Duplicar">${icons.copy}</button>
            <button data-page-action="delete" data-page-index="${index}" title="Excluir">${icons.trash}</button>
          </span>
        </div>`;
        })
        .join("");
    }

    this.paintPageStrip();
  }

  private paintPageStrip(): void {
    const strip = this.root.querySelector("#page-strip");
    if (!strip) return;
    strip.innerHTML = "";
    store.state.project.pages.forEach((page, index) => {
      const chip = document.createElement("button");
      chip.className = `page-chip ${index === store.state.pageIndex ? "active" : ""}`;
      chip.title = page.name;
      chip.appendChild(renderThumb(page, 52));
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(index + 1);
      chip.appendChild(num);
      chip.addEventListener("click", () => store.setPageIndex(index));
      strip.appendChild(chip);
    });
    const add = document.createElement("button");
    add.className = "page-add";
    add.innerHTML = icons.plus;
    add.title = "Nova página";
    add.addEventListener("click", () => store.addPage());
    strip.appendChild(add);
  }

  private paintLayers(): void {
    const host = this.root.querySelector("#layers-list");
    if (!host) return;
    const page = store.page;
    const signature = `${store.state.selection.join(",")}|${page.elements
      .map((el) => `${el.id}${el.hidden ? "h" : ""}${el.locked ? "l" : ""}${el.text?.content ?? el.name ?? ""}`)
      .join("|")}`;
    if (signature === this.layersKey) return;
    this.layersKey = signature;
    if (!page.elements.length) {
      host.innerHTML = `<div class="empty-note">Sem elementos ainda.<br />Use <span class="kbd">T</span> texto, <span class="kbd">R</span> retângulo, <span class="kbd">O</span> elipse — ou peça ao agente.</div>`;
      return;
    }
    host.innerHTML = page.elements
      .slice()
      .reverse()
      .map((el) => {
        const label = el.text?.content?.split("\n")[0].slice(0, 22) || el.name || el.kind;
        return `
        <div class="layer-row ${store.state.selection.includes(el.id) ? "active" : ""}" data-layer-id="${el.id}">
          <span class="mini" data-layer-action="lock" title="${el.locked ? "Desbloquear" : "Bloquear"}">${el.locked ? icons.lock : icons.unlock}</span>
          <span class="grow">${esc(label)}</span>
          <span class="mini" data-layer-action="up" title="Subir uma camada">▲</span>
          <span class="mini" data-layer-action="down" title="Descer uma camada">▼</span>
          <span class="mini" data-layer-action="hide" title="${el.hidden ? "Mostrar" : "Ocultar"}">${el.hidden ? icons.eyeOff : icons.eye}</span>
        </div>`;
      })
      .join("");
  }

  private paintAgentIfIdle(): void {
    const host = this.root.querySelector<HTMLElement>("#agent-host");
    if (!host) return;

    // Só ignora a repintura quando nada mudou — assim a conversa continua
    // aparecendo mesmo com o cursor dentro da caixa de texto.
    const state = store.state;
    const key = `${state.chat.length}:${state.agentBusy ? 1 : 0}:${state.agentModel}:${state.rightPanel}`;
    if (key === this.lastAgentKey) return;
    this.lastAgentKey = key;

    const textarea = host.querySelector<HTMLTextAreaElement>("#agent-text");
    const draft = textarea?.value ?? "";
    const focused = document.activeElement === textarea;
    const caret = textarea?.selectionStart ?? 0;

    host.innerHTML = agentPanelHtml();
    bindAgentPanel(this.root);

    if (focused) {
      const next = host.querySelector<HTMLTextAreaElement>("#agent-text");
      if (next) {
        next.value = draft;
        next.focus();
        next.setSelectionRange(caret, caret);
      }
    }
  }

  /* ---------------- inspetor ---------------- */

  private paintInspector(): void {
    const host = this.root.querySelector("#inspector-host");
    if (!host) return;
    const active = document.activeElement;
    if (active && host.contains(active)) return;

    const selected = store.selected;
    const page = store.page;
    const signature = `${selected.map((el) => JSON.stringify(el) + el.id).join("~")}|${page.width}x${
      page.height
    }|${page.background ? toCss(page.background as never) : ""}|${page.name}`;
    if (signature === this.inspectorKey) return;
    this.inspectorKey = signature;

    if (!selected.length) {
      host.innerHTML = this.pageInspector(page);
      return;
    }
    if (selected.length > 1) {
      host.innerHTML = `
        ${this.alignSection()}
        <div class="divider"></div>
        <div class="empty-note">${selected.length} elementos selecionados. Arraste para mover, use as setas para ajuste fino (Shift = 10px).</div>
        <div class="row wrap">
          <button class="btn small" data-inspector="duplicate">${icons.copy} Duplicar</button>
          <button class="btn small danger" data-inspector="delete">${icons.trash} Excluir</button>
        </div>`;
      return;
    }

    const el = selected[0];
    host.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <span class="pill">${el.kind}</span>
        <div class="row" style="gap:2px">
          <button class="btn small icon ghost" data-inspector="order-front" title="Trazer para frente">⤒</button>
          <button class="btn small icon ghost" data-inspector="order-back" title="Enviar para trás">⤓</button>
        </div>
      </div>

      <div class="field-row">
        <div class="field"><label>X</label><input class="input" type="number" data-prop="x" value="${Math.round(el.x)}" /></div>
        <div class="field"><label>Y</label><input class="input" type="number" data-prop="y" value="${Math.round(el.y)}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Largura</label><input class="input" type="number" data-prop="w" value="${Math.round(el.w)}" /></div>
        <div class="field"><label>Altura</label><input class="input" type="number" data-prop="h" value="${Math.round(el.h)}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Rotação</label><input class="input" type="number" data-prop="rotation" value="${Math.round(el.rotation)}" /></div>
        <div class="field"><label>Opacidade</label><input class="input" type="number" min="0" max="100" data-prop="opacity" value="${Math.round(el.opacity * 100)}" /></div>
      </div>

      ${this.alignSection()}

      <div class="divider"></div>

      ${
        el.kind === "text" && el.text
          ? `
        <div class="group-title">Texto</div>
        <div class="field"><label>Conteúdo</label><textarea class="input" data-text="content">${esc(el.text.content)}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Tamanho</label><input class="input" type="number" data-text="fontSize" value="${el.text.fontSize}" /></div>
          <div class="field"><label>Peso</label>
            <select class="select" data-text="fontWeight">
              ${[300, 400, 500, 600, 700, 800].map((w) => `<option value="${w}" ${el.text?.fontWeight === w ? "selected" : ""}>${w}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Entrelinha</label><input class="input" type="number" step="0.05" data-text="lineHeight" value="${el.text.lineHeight}" /></div>
          <div class="field"><label>Kerning</label><input class="input" type="number" step="0.5" data-text="letterSpacing" value="${el.text.letterSpacing}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Fonte</label>
            <select class="select" data-text="fontFamily">
              ${["Inter", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Verdana"].map(
                (family) => `<option value="${family}" ${el.text?.fontFamily === family ? "selected" : ""}>${family}</option>`,
              ).join("")}
            </select>
          </div>
          <div class="field"><label>Estilo</label>
            <div class="seg">
              <button class="${el.text?.italic ? "active" : ""}" data-text-style="italic" title="Itálico"><i>I</i></button>
              <button class="${el.text?.underline ? "active" : ""}" data-text-style="underline" title="Sublinhado"><u>S</u></button>
              <button class="${el.text?.uppercase ? "active" : ""}" data-text-style="uppercase" title="CAIXA ALTA">AA</button>
            </div>
          </div>
        </div>
        <div class="field"><label>Alinhamento</label>
          <div class="seg">
            ${(["left", "center", "right"] as TextAlign[])
              .map((a) => `<button class="${el.text?.align === a ? "active" : ""}" data-align="${a}">${a === "left" ? "⯇" : a === "center" ? "≡" : "⯈"}</button>`)
              .join("")}
          </div>
        </div>
        <div class="field"><label>Cor do texto</label>${this.colorRow("textColor", el.text.color)}</div>
      `
          : ""
      }

      ${
        el.kind === "image" || el.kind === "video"
          ? `
        <div class="group-title">Mídia</div>
        <div class="field"><label>Ajuste</label>
          <div class="seg">
            ${(["cover", "contain", "fill"] as const)
              .map((f) => `<button class="${(el.fit ?? "cover") === f ? "active" : ""}" data-fit="${f}">${f}</button>`)
              .join("")}
          </div>
        </div>
        <div class="row wrap">
          <button class="btn small" data-inspector="replace-media">${icons.image} Trocar arquivo</button>
          <button class="btn small ghost" data-inspector="flip-h" title="Espelhar na horizontal">⇄ Virar</button>
          <button class="btn small ghost" data-inspector="flip-v" title="Espelhar na vertical">⇅ Virar</button>
          ${el.src ? `<button class="btn small ghost" data-inspector="clear-media">Remover</button>` : ""}
        </div>
        <div class="group-title">Ajustes de imagem</div>
        <div class="chips" style="margin-bottom:8px">
          ${FILTER_PRESETS.map(
            (preset) =>
              `<button class="chip" data-filter-preset="${preset.id}">${preset.name}</button>`,
          ).join("")}
        </div>
        ${this.filterSlider("brightness", "Brilho", "%", 20, 180)}
        ${this.filterSlider("contrast", "Contraste", "%", 40, 200)}
        ${this.filterSlider("saturation", "Saturação", "%", 0, 200)}
        ${this.filterSlider("grayscale", "P&B", "%", 0, 100)}
        ${this.filterSlider("blur", "Desfoque", "px", 0, 24)}
      `
          : ""
      }

      <div class="group-title">Cantos</div>
      <div class="chips" style="margin-bottom:6px">
        ${RADIUS_PRESETS.map(
          (value) => `<button class="chip ${Math.round(el.radius) === value ? "active" : ""}" data-radius="${value}">${value}</button>`,
        ).join("")}
      </div>
      <div class="group-title">Sombra</div>
      <div class="chips">
        ${SHADOW_PRESETS.map(
          (preset) => `<button class="chip ${(el.shadow?.blur ?? -1) === (preset.shadow?.blur ?? -1) ? "active" : ""}" data-shadow="${preset.id}">${preset.name}</button>`,
        ).join("")}
      </div>

      ${
        el.kind === "rect" || el.kind === "ellipse" || el.kind === "frame" || el.kind === "icon"
          ? `
        <div class="group-title">Aparência</div>
        <div class="field"><label>Preenchimento</label>${this.colorRow("fill", typeof el.fill === "string" ? el.fill : "#6C5CE7")}</div>
        <div class="field"><label>Cantos</label><input class="input" type="number" min="0" data-prop="radius" value="${Math.round(el.radius)}" /></div>
        <div class="field"><label>Contorno</label>${this.colorRow("strokeColor", el.stroke?.color ?? "#00000000")}</div>
        <div class="field"><label>Espessura do contorno</label><input class="input" type="number" min="0" data-prop="strokeWidth" value="${el.stroke?.width ?? 0}" /></div>
      `
          : ""
      }

      <div class="divider"></div>
      <div class="row wrap">
        <button class="btn small" data-inspector="duplicate">${icons.copy} Duplicar</button>
        <button class="btn small" data-inspector="lock">${el.locked ? icons.unlock : icons.lock} ${el.locked ? "Desbloquear" : "Bloquear"}</button>
        <button class="btn small danger" data-inspector="delete">${icons.trash} Excluir</button>
      </div>`;
  }

  /** Redimensiona a página mantendo os elementos proporcionais. */
  private resizePage(width: number, height: number): void {
    const page = store.page;
    if (page.width === width && page.height === height) return;
    store.pushHistory();
    const sx = width / page.width;
    const sy = height / page.height;
    const scale = Math.min(sx, sy);
    for (const el of page.elements) {
      el.x = Math.round(el.x * sx);
      el.y = Math.round(el.y * sy);
      el.w = Math.round(el.w * scale);
      el.h = Math.round(el.h * scale);
      el.radius = Math.round(el.radius * scale);
      if (el.text) {
        el.text = {
          ...el.text,
          fontSize: Math.max(6, Math.round(el.text.fontSize * scale)),
          letterSpacing: el.text.letterSpacing * scale,
        };
      }
    }
    page.width = width;
    page.height = height;
    this.inspectorKey = "";
    store.patch({ zoom: 0, selection: [] });
    store.toast(`Página redimensionada para ${width}×${height}.`, "success");
  }

  private alignSection(): string {
    return `
      <div class="group-title">Alinhar</div>
      <div class="seg">
        <button data-align-mode="left" title="Esquerda">⇤</button>
        <button data-align-mode="center-h" title="Centro">↔</button>
        <button data-align-mode="right" title="Direita">⇥</button>
        <button data-align-mode="top" title="Topo">⇡</button>
        <button data-align-mode="center-v" title="Meio">↕</button>
        <button data-align-mode="bottom" title="Base">⇣</button>
      </div>`;
  }

  private filterSlider(
    key: "brightness" | "contrast" | "saturation" | "grayscale" | "blur",
    label: string,
    unit: string,
    min: number,
    max: number,
  ): string {
    const current = store.selected[0]?.filters?.[key] ?? (key === "blur" || key === "grayscale" ? 0 : 100);
    return `
      <div class="field">
        <label>${label} <span class="tiny muted" data-filter-value="${key}">${current}${unit}</span></label>
        <input class="range" type="range" min="${min}" max="${max}" value="${current}" data-filter="${key}" />
      </div>`;
  }

  private colorRow(name: string, value: string): string {
    return `
      <div class="color-input">
        <label class="color-swatch"><span style="background:${esc(value)}"></span>
          <input type="color" data-color="${name}" value="${esc(this.toHex(value))}" style="opacity:0;position:absolute;width:0;height:0" />
        </label>
        <input class="input" data-color-hex="${name}" value="${esc(value)}" />
      </div>`;
  }

  private toHex(value: string): string {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    return "#6c5ce7";
  }

  private pageInspector(page: Page): string {
    return `
      <div class="group-title" style="margin-top:0">Página</div>
      <div class="field"><label>Nome</label><input class="input" data-page-field="name" value="${esc(page.name)}" /></div>
      <div class="field-row">
        <div class="field"><label>Largura</label><input class="input" type="number" data-page-field="width" value="${page.width}" /></div>
        <div class="field"><label>Altura</label><input class="input" type="number" data-page-field="height" value="${page.height}" /></div>
      </div>
      <div class="field"><label>Fundo</label>${this.colorRow("pageBg", typeof page.background === "string" ? page.background : "#0B1020")}</div>
      <div class="field"><label>Gradientes</label>
        <div class="row wrap" style="gap:6px">
          ${GRADIENTS.slice(0, 6)
            .map(
              (g) =>
                `<button class="color-swatch" data-gradient="${g.id}" title="${esc(g.name)}" style="width:26px;height:26px"><span style="background:linear-gradient(${g.value.angle}deg, ${g.value.stops.map((s) => s.color).join(",")})"></span></button>`,
            )
            .join("")}
        </div>
      </div>
      <div class="field"><label>Redimensionar (mantém proporção)</label>
        <div class="chips" style="margin-top:2px">
          ${RESIZE_PRESETS.map(
            (preset) =>
              `<button class="chip ${page.width === preset.w && page.height === preset.h ? "active" : ""}" data-resize="${preset.id}" title="${preset.w}×${preset.h}">${preset.name}</button>`,
          ).join("")}
        </div>
      </div>
      <div class="field"><label>Fundo rápido</label>
        <div class="row wrap" style="gap:6px">
          ${["#FFFFFF", "#0B1020", "#F7F7FB", "#111214", "#FAF7F2", "#06231F"]
            .map((c) => `<button class="color-swatch" data-bg="${c}" style="width:26px;height:26px"><span style="background:${c}"></span></button>`)
            .join("")}
        </div>
      </div>
      <div class="divider"></div>
      <div class="group-title">Adicionar</div>
      <div class="row wrap">
        <button class="btn small" data-inspector="add-text">${icons.text} Texto</button>
        <button class="btn small" data-inspector="add-rect">${icons.square} Forma</button>
        <button class="btn small" data-inspector="add-image">${icons.image} Imagem</button>
        <button class="btn small" data-inspector="add-video">${icons.video} Vídeo</button>
        <button class="btn small" data-inspector="record-screen">${icons.record} Gravar tela</button>
      </div>
      <div class="divider"></div>
      <div class="empty-note">
        Dica: <span class="kbd">⌘Z</span> desfaz, <span class="kbd">⌘D</span> duplica, <span class="kbd">⌘S</span> salva.
        Arraste arquivos para o canvas para importar imagens, vídeos e PDFs.
      </div>`;
  }

  private onInspectorClick(event: Event): void {
    const target = event.target as HTMLElement;

    const filterPreset = target.closest<HTMLElement>("[data-filter-preset]")?.dataset.filterPreset;
    if (filterPreset) {
      const preset = FILTER_PRESETS.find((item) => item.id === filterPreset);
      const el = store.selected[0];
      if (preset && el) {
        store.updateElement(el.id, { filters: { ...preset.filters } });
        this.inspectorKey = "";
        this.paintInspector();
      }
      return;
    }

    const radiusPreset = target.closest<HTMLElement>("[data-radius]")?.dataset.radius;
    if (radiusPreset !== undefined) {
      const el = store.selected[0];
      if (el) store.updateElement(el.id, { radius: Number(radiusPreset) });
      return;
    }

    const shadowPreset = target.closest<HTMLElement>("[data-shadow]")?.dataset.shadow;
    if (shadowPreset) {
      const preset = SHADOW_PRESETS.find((item) => item.id === shadowPreset);
      const el = store.selected[0];
      if (el) {
        store.updateElement(el.id, { shadow: preset?.shadow ? { ...preset.shadow } : null });
        this.inspectorKey = "";
        this.paintInspector();
      }
      return;
    }

    const resize = target.closest<HTMLElement>("[data-resize]")?.dataset.resize;
    if (resize) {
      const preset = RESIZE_PRESETS.find((item) => item.id === resize);
      if (preset) this.resizePage(preset.w, preset.h);
      return;
    }

    const action = target.closest<HTMLElement>("[data-inspector]")?.dataset.inspector;
    const alignMode = target.closest<HTMLElement>("[data-align-mode]")?.dataset.alignMode;
    const textStyle = target.closest<HTMLElement>("[data-text-style]")?.dataset.textStyle;
    if (textStyle) {
      const el = store.selected[0];
      if (el?.text) {
        const key = textStyle as "italic" | "underline" | "uppercase";
        store.updateElement(el.id, { text: { ...el.text, [key]: !el.text[key] } });
        this.inspectorKey = "";
        this.paintInspector();
      }
      return;
    }
    const alignText = target.closest<HTMLElement>("[data-align]")?.dataset.align;
    const fit = target.closest<HTMLElement>("[data-fit]")?.dataset.fit;
    const colorBtn = target.closest<HTMLElement>("[data-color]");
    const gradientBtn = target.closest<HTMLElement>("[data-gradient]")?.dataset.gradient;
    const bgBtn = target.closest<HTMLElement>("[data-bg]")?.dataset.bg;

    if (alignMode) {
      store.alignSelection(alignMode as never);
      return;
    }
    if (alignText) {
      const el = store.selected[0];
      if (el?.text) store.updateElement(el.id, { text: { ...el.text, align: alignText as TextAlign } });
      return;
    }
    if (fit) {
      const el = store.selected[0];
      if (el) store.updateElement(el.id, { fit: fit as never });
      return;
    }
    if (gradientBtn) {
      const preset = GRADIENTS.find((g) => g.id === gradientBtn);
      if (preset) store.setPageBackground(preset.value);
      return;
    }
    if (bgBtn) {
      store.setPageBackground(bgBtn);
      return;
    }
    if (colorBtn) {
      const input = colorBtn.querySelector("input[type=color]") as HTMLInputElement | null;
      input?.click();
      return;
    }
    if (!action) return;

    const el = store.selected[0];
    switch (action) {
      case "duplicate":
        store.duplicateSelected();
        break;
      case "delete":
        store.deleteSelected();
        break;
      case "lock":
        if (el) store.updateElement(el.id, { locked: !el.locked });
        break;
      case "order-front":
        if (el) store.reorder(el.id, "front");
        break;
      case "order-back":
        if (el) store.reorder(el.id, "back");
        break;
      case "add-text":
        this.addQuick("text");
        break;
      case "add-rect":
        this.addQuick("rect");
        break;
      case "add-image":
        this.pickFile("image/*");
        break;
      case "add-video":
        this.pickFile("video/*");
        break;
      case "record-screen":
        this.recordScreen();
        break;
      case "flip-h":
        if (el) store.updateElement(el.id, { flipH: !el.flipH });
        break;
      case "flip-v":
        if (el) store.updateElement(el.id, { flipV: !el.flipV });
        break;
      case "replace-media":
        this.pickFile(el?.kind === "video" ? "video/*" : "image/*", el?.id);
        break;
      case "clear-media":
        if (el) store.updateElement(el.id, { src: null });
        break;
      default:
        break;
    }
  }

  /** Abre o estúdio de gravação (tela, janela, aba ou câmera). */
  private recordScreen(): void {
    if (!displayCaptureSupported() && !recorderSupported()) {
      store.toast("Este ambiente não permite gravar. Use o aplicativo instalado.", "error");
      return;
    }
    openRecorder((video) => {
      void this.insertRecording(video);
    });
  }

  /** Coloca a gravação no centro da página, já no tamanho da mídia. */
  private async insertRecording(video: RecordedVideo): Promise<void> {
    const page = store.page;
    const src = await mediaSource(video.file);
    const ratio = video.width && video.height ? video.height / video.width : 9 / 16;
    const maxW = page.width * 0.64;
    const w = Math.min(video.width || maxW, maxW);
    const h = w * ratio;
    const el = baseElement("video", (page.width - w) / 2, Math.max(16, (page.height - h) / 2), w, h);
    el.src = src;
    el.fit = "cover";
    el.name = video.file.name;
    store.addElement(el);
    store.toast("Gravação inserida no design.", "success");
  }

  private pickFile(accept: string, replaceId?: string): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      await this.importMedia(file, replaceId);
    });
    input.click();
  }

  /**
   * Importa imagem ou vídeo sem travar a interface.
   *
   * A mídia entra como `blob:` (nunca base64 no estado), a decodificação
   * acontece depois do próximo frame e o elemento só é criado no fim — assim
   * arquivos grandes não bloqueiam o arraste nem o histórico.
   */
  private async importMedia(file: File, replaceId?: string, point?: { x: number; y: number }): Promise<void> {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      store.toast("Formato não suportado aqui. Use imagem ou vídeo.", "error");
      return;
    }
    const mb = file.size / 1048576;
    store.toast(isVideo ? `Preparando vídeo (${mb.toFixed(1)} MB)…` : `Importando ${file.name}…`, "info");
    // Deixa o toast pintar antes de qualquer trabalho pesado.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const src = await mediaSource(file);

    const page = store.page;
    let width = 0;
    let height = 0;
    if (isVideo) {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.src = src;
      width = await new Promise<number>((resolve) => {
        const done = (): void => resolve(probe.videoWidth);
        probe.addEventListener("loadedmetadata", done, { once: true });
        probe.addEventListener("error", () => resolve(0), { once: true });
        window.setTimeout(() => resolve(probe.videoWidth), 2500);
      });
      height = probe.videoHeight;
    } else {
      const img = new Image();
      img.src = src;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      width = img.naturalWidth;
      height = img.naturalHeight;
      if (!width || !height) {
        store.toast("Não consegui ler essa imagem. Tente outro arquivo.", "error");
        return;
      }
    }

    if (replaceId) {
      store.updateElement(replaceId, { src, name: file.name });
      store.toast("Mídia trocada.", "success");
      return;
    }

    const ratio = width && height ? height / width : isVideo ? 9 / 16 : 0.66;
    const maxW = page.width * (isVideo ? 0.64 : 0.5);
    const w = Math.min(width || maxW, maxW);
    const h = Math.max(24, w * ratio);
    const origin = point ?? { x: (page.width - w) / 2, y: (page.height - h) / 2 };
    const x = clamp(origin.x, 0, Math.max(0, page.width - w));
    const y = clamp(origin.y, 0, Math.max(0, page.height - h));

    const node = baseElement(isVideo ? "video" : "image", x, y, w, h);
    node.src = src;
    node.fit = "cover";
    node.name = file.name;
    store.addElement(node);
    store.toast(isVideo ? "Vídeo inserido." : "Imagem inserida.", "success");
  }

  private onInspectorChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const el = store.selected[0];

    if (target.dataset.prop) {
      const prop = target.dataset.prop;
      const value = Number(target.value);
      if (!Number.isFinite(value)) return;
      if (!el) return;
      const patch: Partial<Element> = {};
      if (prop === "opacity") patch.opacity = clamp(value / 100, 0, 1);
      else if (prop === "strokeWidth") patch.stroke = { color: el.stroke?.color ?? "#000000", width: value };
      else (patch as Record<string, number>)[prop] = value;
      store.updateElement(el.id, patch);
      return;
    }

    if (target.dataset.text && el?.text) {
      const key = target.dataset.text as keyof typeof el.text;
      const raw = target.value;
      const patch: Record<string, unknown> = { ...el.text };
      if (["fontSize", "fontWeight", "lineHeight", "letterSpacing"].includes(key)) {
        patch[key] = Number(raw);
      } else {
        patch[key] = raw;
      }
      store.updateElement(el.id, { text: patch as never });
      return;
    }

    if (target.dataset.colorHex) {
      this.applyColor(target.dataset.colorHex, target.value);
      return;
    }

    if (target.dataset.color) {
      this.applyColor(target.dataset.color, target.value);
      return;
    }

    if (target.dataset.pageField) {
      const field = target.dataset.pageField;
      const page = store.page;
      if (field === "name") store.renamePage(store.state.pageIndex, target.value);
      if (field === "width" || field === "height") {
        const value = Number(target.value);
        if (Number.isFinite(value) && value > 32) {
          store.pushHistory();
          page[field] = value;
          store.patch({ zoom: 0 }, true);
        }
      }
    }
  }

  private onInspectorInput(event: Event): void {
    const target = event.target as HTMLInputElement;

    if (target.dataset.filter) {
      const el = store.selected[0];
      if (!el) return;
      const key = target.dataset.filter as keyof NonNullable<Element["filters"]>;
      const current = el.filters ?? { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0 };
      store.updateElement(el.id, { filters: { ...current, [key]: Number(target.value) } }, false);
      const label = this.root.querySelector(`[data-filter-value="${key}"]`);
      if (label) label.textContent = `${target.value}${key === "blur" ? "px" : "%"}`;
      return;
    }

    // O conteúdo do texto atualiza ao vivo no canvas enquanto se digita.
    if (target.dataset.text === "content") {
      const el = store.selected[0];
      if (el?.text) store.updateElement(el.id, { text: { ...el.text, content: target.value } }, false);
      return;
    }
    if (target.type !== "color") return;
    if (target.dataset.color) this.applyColor(target.dataset.color, target.value, false);
  }

  private applyColor(kind: string, value: string, history = true): void {
    const el = store.selected[0];
    switch (kind) {
      case "pageBg":
        store.setPageBackground(value);
        break;
      case "textColor":
        if (el?.text) store.updateElement(el.id, { text: { ...el.text, color: value } }, history);
        break;
      case "fill":
        if (el) store.updateElement(el.id, { fill: value }, history);
        break;
      case "strokeColor":
        if (el) store.updateElement(el.id, { stroke: { color: value, width: el.stroke?.width ?? 2 } }, history);
        break;
      default:
        break;
    }
  }

  /* ---------------- utilidades públicas ---------------- */

  addImageFromData(src: string, name = "Imagem"): void {
    const page = store.page;
    const el = baseElement("image", page.width * 0.2, page.height * 0.2, page.width * 0.45, page.width * 0.3);
    el.src = src;
    el.fit = "cover";
    el.name = name;
    store.addElement(el);
  }

  addIcon(name: string): void {
    const page = store.page;
    const el = baseElement("icon", page.width / 2 - 80, page.height / 2 - 80, 160, 160);
    el.src = iconDataUri(name, "#6C5CE7");
    el.name = name;
    store.addElement(el);
  }

  addGradientBackground(id: string): void {
    const preset = GRADIENTS.find((g) => g.id === id);
    if (preset) store.setPageBackground(preset.value);
  }

  addText(content = "Novo texto"): void {
    const page = store.page;
    store.addElement(
      textEl(page.width * 0.1, page.height * 0.4, page.width * 0.8, 120, content, {
        size: Math.round(page.height * 0.08),
        weight: 700,
        color: "#0B1020",
      }),
    );
  }

  addShape(kind: "rect" | "ellipse"): void {
    const page = store.page;
    store.addElement(
      shapeEl(kind, page.width / 2 - 150, page.height / 2 - 150, 300, 300, "#6C5CE7", {
        radius: kind === "rect" ? 24 : 0,
      }),
    );
  }

  applyThemeGradient(): void {
    store.setPageBackground(gradient(135, "#0B1020", "#241B4D"));
  }
}

interface PdfPage {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: unknown) => { promise: Promise<void> };
}
interface PdfDocument {
  numPages: number;
  getPage: (index: number) => Promise<PdfPage>;
}

export { isDesktop };
