/**
 * Editor: canvas, seleção, arraste, redimensionamento, camadas, páginas,
 * inspetor de propriedades e painel do agente.
 */

import {
  GRADIENTS,
  baseElement,
  gradient,
  iconDataUri,
  shapeEl,
  textEl,
} from "../assets";
import { exportPdf, isDesktop, saveProjectFile } from "../bridge";
import { store } from "../store";
import type { Element, Page, TextAlign } from "../types";
import { clamp, esc, readFileAsDataUrl, toCss } from "../util";
import { agentPanelHtml, bindAgentPanel } from "./agent";
import { icons } from "./icons";
import { renderElement, renderThumb } from "./render";

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
        <aside class="panel left">
          <div class="panel-head"><span>${icons.layers} Páginas</span>
            <button class="btn small icon" data-edit="add-page" title="Nova página">${icons.plus}</button>
          </div>
          <div class="panel-body" id="pages-list" style="gap:8px"></div>
          <div class="panel-head" style="border-top:1px solid var(--line)"><span>${icons.elements} Camadas</span></div>
          <div class="panel-body" id="layers-list" style="flex:1"></div>
        </aside>

        <div style="display:flex;flex-direction:column;min-width:0;min-height:0">
          <div class="topbar">
            <button class="btn small ghost icon" data-edit="home" title="Voltar ao início (Esc)">${icons.back}</button>
            <input class="doc-name" id="doc-name" value="${esc(store.state.project.name)}" />
            <span class="pill" id="format-pill"></span>
            <div class="spacer"></div>
            <div class="row" style="gap:4px">
              <button class="btn small icon ghost" data-edit="undo" title="Desfazer (⌘Z)">${icons.undo}</button>
              <button class="btn small icon ghost" data-edit="redo" title="Refazer (⇧⌘Z)">${icons.redo}</button>
            </div>
            <div class="zoom-pill">
              <button data-edit="zoom-out" title="Menos zoom">${icons.zoomOut}</button>
              <span id="zoom-label">—</span>
              <button data-edit="zoom-in" title="Mais zoom">${icons.zoomIn}</button>
              <button data-edit="zoom-fit" title="Ajustar à tela">${icons.fit}</button>
            </div>
            <button class="btn small" data-edit="save" title="Salvar (⌘S)">${icons.download} Salvar</button>
            <button class="btn primary small" data-edit="export-pdf" title="Exportar PDF (⌘⇧E)">${icons.pdf} Exportar PDF</button>
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
            <button class="panel-tab active" data-tab-panel="inspector">Propriedades</button>
            <button class="panel-tab" data-tab-panel="agent">Agente</button>
          </div>
          <div class="panel-body" id="inspector-host" style="flex:1"></div>
          <div id="agent-host" class="hidden" style="flex:1;min-height:0"></div>
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

    this.unsubscribe = store.subscribe(() => this.paintAll());
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
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
    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      store.select(store.page.elements.map((el) => el.id));
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
      case "save":
        await this.save();
        break;
      case "export-pdf":
        await this.exportPdf();
        break;
      default:
        break;
    }
  }

  private async save(): Promise<void> {
    try {
      const result = await saveProjectFile(store.state.project);
      store.persistRecent();
      store.toast(result === "download" ? "Projeto baixado no navegador." : `Projeto salvo em ${result}`, "success");
    } catch (error) {
      const message = (error as Error).message;
      if (message !== "Salvamento cancelado.") store.toast(message, "error");
    }
  }

  private async exportPdf(): Promise<void> {
    try {
      const result = await exportPdf(store.state.project);
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
    if (this.drag?.mode === "pan") {
      this.drag = null;
      return;
    }
    this.drag = null;
    this.root.querySelectorAll(".guide").forEach((g) => g.remove());
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
    const point = this.canvasPoint(event as unknown as PointerEvent);
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
      if (file.type.startsWith("video/")) {
        const data = await readFileAsDataUrl(file);
        const el = baseElement("video", point.x, point.y, 480, 270);
        el.src = data;
        el.name = file.name;
        store.addElement(el);
        continue;
      }
      if (file.type.startsWith("image/")) {
        const data = await readFileAsDataUrl(file);
        const img = new Image();
        img.src = data;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        const maxW = store.page.width * 0.6;
        const ratio = img.width && img.height ? img.height / img.width : 0.66;
        const w = Math.min(img.width || maxW, maxW);
        const el = baseElement("image", point.x, point.y, w, w * ratio);
        el.src = data;
        el.fit = "cover";
        el.name = file.name;
        store.addElement(el);
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
    if (!state.zoom) {
      state.zoom = this.fitZoom();
    }
    const page = store.page;
    const zoom = state.zoom;

    const existing = this.stageInner.querySelector(".kf-page");
    const pageEl = existing instanceof HTMLElement ? existing : document.createElement("div");
    pageEl.className = "kf-page";
    pageEl.style.width = `${page.width}px`;
    pageEl.style.height = `${page.height}px`;
    pageEl.style.background = page.background ? toCss(page.background as never) : "#FFFFFF";

    // redesenha os elementos
    pageEl.innerHTML = "";
    for (const el of page.elements) {
      const node = renderElement(el, true);
      node.addEventListener("dblclick", (event) => {
        if (el.kind !== "text") return;
        event.stopPropagation();
        this.startTextEdit(node, el);
      });
      pageEl.appendChild(node);
    }

    // overlay de seleção
    const bounds = this.selectionBounds();
    if (state.selection.length) {
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

    if (!existing) this.stageInner.appendChild(pageEl);
    this.pageEl = pageEl;
    this.stageInner.style.transform = `translate(calc(-50% + ${state.pan.x}px), calc(-50% + ${state.pan.y}px)) scale(${zoom})`;
    const label = this.root.querySelector("#zoom-label");
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
  }

  private startTextEdit(node: HTMLElement, el: Element): void {
    if (!el.text) return;
    store.patch({ editingId: el.id }, false);
    node.setAttribute("contenteditable", "true");
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const finish = (): void => {
      node.removeAttribute("contenteditable");
      const text = node.innerText.replace(/\u00a0/g, " ");
      if (el.text && text !== el.text.content) {
        store.updateElement(el.id, { text: { ...el.text, content: text } });
      }
      node.removeEventListener("blur", finish);
    };
    node.addEventListener("blur", finish);
  }

  private paintPages(): void {
    const host = this.root.querySelector("#pages-list");
    if (!host) return;
    host.innerHTML = store.state.project.pages
      .map((page, index) => {
        const thumb = renderThumb(page, 92);
        const holder = document.createElement("div");
        holder.appendChild(thumb);
        return `
        <div class="page-chip ${index === store.state.pageIndex ? "active" : ""}" data-page-index="${index}" style="width:100%">
          ${holder.innerHTML}
          <span class="num">${index + 1}</span>
          <div class="row" style="position:absolute;right:2px;top:2px;gap:0">
            <button class="mini" data-page-action="duplicate" data-page-index="${index}" title="Duplicar" style="width:17px;height:17px;border-radius:4px;background:rgba(0,0,0,.5);color:#fff;font-size:9px">⧉</button>
            <button class="mini" data-page-action="delete" data-page-index="${index}" title="Excluir" style="width:17px;height:17px;border-radius:4px;background:rgba(0,0,0,.5);color:#fff;font-size:9px">✕</button>
          </div>
        </div>`;
      })
      .join("");
    const strip = this.root.querySelector("#page-strip");
    if (strip) {
      strip.innerHTML = "";
      store.state.project.pages.forEach((page, index) => {
        const chip = document.createElement("button");
        chip.className = `page-chip ${index === store.state.pageIndex ? "active" : ""}`;
        const thumb = renderThumb(page, 110);
        chip.appendChild(thumb);
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
  }

  private paintLayers(): void {
    const host = this.root.querySelector("#layers-list");
    if (!host) return;
    const page = store.page;
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
          <span class="mini" data-layer-action="hide" title="${el.hidden ? "Mostrar" : "Ocultar"}">${el.hidden ? icons.eyeOff : icons.eye}</span>
        </div>`;
      })
      .join("");
  }

  private paintAgentIfIdle(): void {
    const host = this.root.querySelector<HTMLElement>("#agent-host");
    if (!host) return;
    const active = document.activeElement;
    const typingInAgent = active && host.contains(active);
    if (typingInAgent && !store.state.agentBusy) return;
    host.innerHTML = agentPanelHtml();
    bindAgentPanel(this.root);
  }

  /* ---------------- inspetor ---------------- */

  private paintInspector(): void {
    const host = this.root.querySelector("#inspector-host");
    if (!host) return;
    const active = document.activeElement;
    if (active && host.contains(active)) return;

    const selected = store.selected;
    const page = store.page;

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
          ${el.src ? `<button class="btn small ghost" data-inspector="clear-media">Remover</button>` : ""}
        </div>
      `
          : ""
      }

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
      </div>
      <div class="divider"></div>
      <div class="empty-note">
        Dica: <span class="kbd">⌘Z</span> desfaz, <span class="kbd">⌘D</span> duplica, <span class="kbd">⌘S</span> salva.
        Arraste arquivos para o canvas para importar imagens, vídeos e PDFs.
      </div>`;
  }

  private onInspectorClick(event: Event): void {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>("[data-inspector]")?.dataset.inspector;
    const alignMode = target.closest<HTMLElement>("[data-align-mode]")?.dataset.alignMode;
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

  private pickFile(accept: string, replaceId?: string): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const data = await readFileAsDataUrl(file);
      if (replaceId) {
        const el = store.page.elements.find((e) => e.id === replaceId);
        if (el) store.updateElement(replaceId, { src: data, name: file.name });
        return;
      }
      const page = store.page;
      if (file.type.startsWith("video/")) {
        const node = baseElement("video", page.width * 0.1, page.height * 0.1, page.width * 0.4, page.width * 0.22);
        node.src = data;
        node.name = file.name;
        store.addElement(node);
        return;
      }
      const img = new Image();
      img.src = data;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      const ratio = img.width && img.height ? img.height / img.width : 0.66;
      const w = Math.min(img.width || page.width * 0.5, page.width * 0.5);
      const node = baseElement("image", page.width * 0.25, page.height * 0.25, w, w * ratio);
      node.src = data;
      node.fit = "cover";
      node.name = file.name;
      store.addElement(node);
    });
    input.click();
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
