/**
 * Gravação de tela e de câmera.
 *
 * Usa `getDisplayMedia` / `getUserMedia` + `MediaRecorder`: tudo acontece
 * dentro do computador do usuário, nada é enviado para servidor.
 *
 * Fluxo: escolher a fonte → (contagem) → gravar → prévia → inserir no design
 * ou baixar o arquivo. A gravação entra no canvas pelo mesmo caminho de um
 * vídeo importado (`blob:` + `mediaSource`), então não trava a interface.
 */

import { store } from "../store";
import { esc } from "../util";
import { icons } from "./icons";

export type RecordSource = "screen" | "window" | "tab" | "camera";

export interface RecordedVideo {
  file: File;
  width: number;
  height: number;
  seconds: number;
  mime: string;
}

type Phase = "setup" | "countdown" | "recording" | "preview";

interface Quality {
  id: string;
  label: string;
  w: number;
  h: number;
  fps: number;
  bitrate: number;
}

const QUALITIES: Quality[] = [
  { id: "leve", label: "Leve · 720p 24 fps", w: 1280, h: 720, fps: 24, bitrate: 2_500_000 },
  { id: "padrao", label: "Padrão · 1080p 30 fps", w: 1920, h: 1080, fps: 30, bitrate: 6_000_000 },
  { id: "alta", label: "Alta · 1080p 60 fps", w: 1920, h: 1080, fps: 60, bitrate: 10_000_000 },
  { id: "original", label: "Original · resolução da tela", w: 0, h: 0, fps: 30, bitrate: 12_000_000 },
];

const SOURCES: { id: RecordSource; label: string; hint: string }[] = [
  { id: "screen", label: "Tela inteira", hint: "tudo o que aparece no monitor" },
  { id: "window", label: "Janela", hint: "escolha uma janela aberta" },
  { id: "tab", label: "Aba do navegador", hint: "somente a aba atual" },
  { id: "camera", label: "Câmera", hint: "webcam com áudio opcional" },
];

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/x-matroska;codecs=avc1",
];

export function recorderSupported(): boolean {
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return Boolean(md && typeof window.MediaRecorder === "function");
}

export function displayCaptureSupported(): boolean {
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return Boolean(md && typeof md.getDisplayMedia === "function");
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      /* ignora */
    }
  }
  return "";
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("matroska")) return "mkv";
  return "webm";
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* noop */
    }
  });
}

/** Junta microfone + áudio do sistema numa única faixa. */
function mixAudio(streams: MediaStream[], ctx: AudioContext): MediaStream | null {
  const withAudio = streams.filter((s) => s.getAudioTracks().length > 0);
  if (!withAudio.length) return null;
  const dest = ctx.createMediaStreamDestination();
  for (const stream of withAudio) {
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(dest);
  }
  return dest.stream;
}

interface ActiveRecording {
  recorder: MediaRecorder;
  chunks: Blob[];
  streams: MediaStream[];
  canvasFrame: number;
  timer: number;
  startedAt: number;
  pausedTotal: number;
  pausedAt: number;
  mime: string;
  width: number;
  height: number;
  blobUrl: string | null;
}

class RecorderOverlay {
  private root: HTMLDivElement | null = null;
  private phase: Phase = "setup";
  private source: RecordSource = "screen";
  private quality: Quality = QUALITIES[1];
  private mic = true;
  private systemAudio = true;
  private bubble = false;
  private countdownPref = 3;
  private active: ActiveRecording | null = null;
  private preview: RecordedVideo | null = null;
  private previewUrl: string | null = null;
  private onUse: ((video: RecordedVideo) => void) | null = null;
  private error = "";
  private size = 0;

  open(onUse: (video: RecordedVideo) => void): void {
    this.onUse = onUse;
    this.phase = "setup";
    this.error = "";
    this.preview = null;
    this.size = 0;
    if (displayCaptureSupported() === false) this.source = "camera";
    this.build();
  }

  private build(): void {
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    const root = document.createElement("div");
    root.className = "rec-overlay";
    root.innerHTML = `
      <div class="rec-dialog" role="dialog" aria-modal="true" aria-label="Gravar vídeo">
        ${this.header()}
        <div class="rec-body">${this.body()}</div>
        <div class="rec-foot">${this.foot()}</div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.bind();
    if (this.phase === "recording") this.startBars();
  }

  private header(): string {
    const title =
      this.phase === "preview" ? "Prévia da gravação" : this.phase === "recording" ? "Gravando…" : "Gravar vídeo";
    const sub =
      this.phase === "preview"
        ? "confira o resultado antes de colocar no design"
        : this.phase === "recording"
          ? "a gravação roda em segundo plano — você pode interagir com a tela"
          : "grave a tela, uma janela, uma aba ou a câmera — direto para o design";
    return `
      <div class="rec-head">
        <div>
          <h2>${icons.video} ${esc(title)}</h2>
          <p>${esc(sub)}</p>
        </div>
        <button class="btn small icon ghost" data-rec="close" title="Fechar">${icons.close}</button>
      </div>`;
  }

  private body(): string {
    if (this.phase === "preview") return this.previewBody();
    if (this.phase === "recording") return this.recordingBody();
    if (this.phase === "countdown") return `<div class="rec-count"><span>${this.countdownPref}</span></div>`;
    return this.setupBody();
  }

  private setupBody(): string {
    const noDisplay = !displayCaptureSupported();
    const note = this.error
      ? `<div class="rec-alert">${esc(this.error)}</div>`
      : noDisplay
        ? `<div class="rec-alert">Este ambiente não permite capturar a tela (o navegador de prévia bloqueia). A câmera funciona normalmente; no aplicativo instalado a captura de tela fica disponível.</div>`
        : "";
    return `
      ${note}
      <div class="rec-sources">
        ${SOURCES.map(
          (s) => `
          <button class="rec-source ${this.source === s.id ? "active" : ""}" data-rec-source="${s.id}" ${
            noDisplay && s.id !== "camera" ? "disabled" : ""
          }>
            <span class="rec-source-icon">${s.id === "camera" ? icons.photo : s.id === "tab" ? icons.template : icons.layers}</span>
            <span class="rec-source-text"><strong>${esc(s.label)}</strong><em>${esc(s.hint)}</em></span>
          </button>`,
        ).join("")}
      </div>

      <div class="rec-grid">
        <label class="rec-field">
          <span>Qualidade</span>
          <select data-rec-select="quality">
            ${QUALITIES.map(
              (q) => `<option value="${q.id}" ${q.id === this.quality.id ? "selected" : ""}>${esc(q.label)}</option>`,
            ).join("")}
          </select>
        </label>
        <label class="rec-field">
          <span>Contagem antes de gravar</span>
          <select data-rec-select="countdown">
            ${[0, 3, 5].map((v) => `<option value="${v}" ${v === this.countdownPref ? "selected" : ""}>${
              v === 0 ? "sem contagem" : `${v} segundos`
            }</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="rec-toggles">
        <label class="rec-check"><input type="checkbox" data-rec-check="mic" ${this.mic ? "checked" : ""} /><span>Microfone (narração)</span></label>
        <label class="rec-check ${
          this.source === "camera" ? "disabled" : ""
        }"><input type="checkbox" data-rec-check="systemAudio" ${this.systemAudio ? "checked" : ""} ${
          this.source === "camera" ? "disabled" : ""
        } /><span>Áudio do sistema</span></label>
        <label class="rec-check ${this.source === "camera" ? "disabled" : ""}"><input type="checkbox" data-rec-check="bubble" ${
          this.bubble ? "checked" : ""
        } ${this.source === "camera" ? "disabled" : ""} /><span>Minha câmera em bolha</span></label>
      </div>

      <p class="rec-hint">Ao iniciar, o sistema pede qual tela/janela compartilhar. Nada é enviado para servidores — o arquivo fica na sua máquina.</p>`;
  }

  private recordingBody(): string {
    return `
      <div class="rec-live">
        <span class="rec-dot"></span>
        <span class="rec-timer" data-rec-timer>00:00</span>
        <span class="rec-meta" data-rec-meta>${esc(this.sourceLabel())} · ${formatSize(this.size)}</span>
      </div>
      <div class="rec-bars" data-rec-bars>${"<i></i>".repeat(28)}</div>
      <p class="rec-hint">Pode minimizar esta janela e mostrar o que quiser: a captura continua até você parar.</p>`;
  }

  private previewBody(): string {
    const video = this.preview;
    const source = video ? "gravacao" : "—";
    return `
      <div class="rec-preview">
        ${this.previewUrl ? `<video src="${esc(this.previewUrl)}" controls playsinline></video>` : ""}
      </div>
      <div class="rec-info">
        <span><strong>${video ? formatClock(video.seconds) : "--:--"}</strong> duração</span>
        <span><strong>${video ? `${video.width}×${video.height}` : "—"}</strong> resolução</span>
        <span><strong>${video ? formatSize(video.file.size) : "—"}</strong> tamanho</span>
        <span><strong>${video ? extensionFor(video.mime).toUpperCase() : "—"}</strong> formato</span>
        <span class="muted">${esc(source)}</span>
      </div>`;
  }

  private foot(): string {
    if (this.phase === "preview") {
      return `
        <button class="btn ghost" data-rec="again">Gravar de novo</button>
        <button class="btn ghost" data-rec="download">${icons.download} Baixar</button>
        <span class="spacer"></span>
        <button class="btn ghost" data-rec="close">Fechar</button>
        <button class="btn primary" data-rec="use">${icons.check} Inserir no design</button>`;
    }
    if (this.phase === "recording") {
      return `
        <button class="btn ghost" data-rec="discard">Descartar</button>
        <span class="spacer"></span>
        <button class="btn" data-rec="pause">Pausar</button>
        <button class="btn primary" data-rec="stop">${icons.check} Parar e revisar</button>`;
    }
    if (this.phase === "countdown") {
      return `<span class="spacer"></span><button class="btn ghost" data-rec="close">Cancelar</button>`;
    }
    return `
      <span class="rec-note">${this.source === "camera" ? "gravação de câmera" : "gravação de tela"} · sem upload</span>
      <span class="spacer"></span>
      <button class="btn ghost" data-rec="close">Cancelar</button>
      <button class="btn primary" data-rec="start" ${recorderSupported() ? "" : "disabled"}>Gravar agora</button>`;
  }

  private sourceLabel(): string {
    return SOURCES.find((s) => s.id === this.source)?.label ?? "Tela";
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
      const sourceBtn = target.closest<HTMLElement>("[data-rec-source]");
      if (sourceBtn?.dataset.recSource) {
        this.source = sourceBtn.dataset.recSource as RecordSource;
        if (this.source === "camera") this.bubble = false;
        this.build();
        return;
      }
      const action = target.closest<HTMLElement>("[data-rec]")?.dataset.rec;
      if (!action) return;
      void this.action(action);
    });

    root.querySelectorAll<HTMLSelectElement>("[data-rec-select]").forEach((select) => {
      select.addEventListener("change", () => {
        if (select.dataset.recSelect === "quality") {
          this.quality = QUALITIES.find((q) => q.id === select.value) ?? QUALITIES[1];
        } else {
          this.countdownPref = Number(select.value) || 0;
        }
      });
    });

    root.querySelectorAll<HTMLInputElement>("[data-rec-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.recCheck;
        if (key === "mic") this.mic = input.checked;
        if (key === "systemAudio") this.systemAudio = input.checked;
        if (key === "bubble") this.bubble = input.checked;
      });
    });
  }

  private async action(action: string): Promise<void> {
    switch (action) {
      case "close":
        this.close();
        break;
      case "start":
        await this.start();
        break;
      case "pause":
        this.togglePause();
        break;
      case "stop":
        this.stop();
        break;
      case "discard":
        this.abort();
        break;
      case "again":
        this.reset();
        break;
      case "download":
        this.download();
        break;
      case "use":
        this.use();
        break;
      default:
        break;
    }
  }

  /* ---------------- gravação ---------------- */

  private async start(): Promise<void> {
    this.error = "";
    const md = navigator.mediaDevices as MediaDevices | undefined;
    if (!md || typeof MediaRecorder === "undefined") {
      this.error = "Este ambiente não suporta gravação (MediaRecorder indisponível).";
      this.build();
      return;
    }

    const streams: MediaStream[] = [];
    const audioCtxStreams: MediaStream[] = [];
    let audioCtx: AudioContext | null = null;

    try {
      let videoStream: MediaStream;
      if (this.source === "camera") {
        videoStream = await md.getUserMedia({
          video: { width: { ideal: this.quality.w || 1280 }, height: { ideal: this.quality.h || 720 }, frameRate: { ideal: this.quality.fps } },
          audio: this.mic,
        });
      } else if (typeof md.getDisplayMedia === "function") {
        videoStream = await md.getDisplayMedia({
          video: {
            frameRate: { ideal: this.quality.fps, max: Math.max(30, this.quality.fps) },
            width: this.quality.w ? { ideal: this.quality.w } : undefined,
            height: this.quality.h ? { ideal: this.quality.h } : undefined,
            // `displaySurface` é a preferência; o usuário sempre pode trocar.
            displaySurface: this.source === "screen" ? "monitor" : this.source,
          } as MediaTrackConstraints,
          audio: this.systemAudio,
        });
      } else {
        this.error = "Captura de tela indisponível aqui. Escolha “Câmera” ou use o aplicativo instalado.";
        this.build();
        return;
      }

      if (this.source !== "camera" && this.mic) {
        try {
          const micStream = await md.getUserMedia({ audio: true });
          audioCtxStreams.push(micStream);
        } catch {
          store.toast("Microfone não autorizado — gravando sem narração.", "info");
        }
      }

      streams.push(videoStream);
      streams.push(...audioCtxStreams);

      // Composição: bolha de câmera + tela num canvas.
      let outputVideo: MediaStream;
      let bubbleStream: MediaStream | null = null;
      if (this.source !== "camera" && this.bubble) {
        try {
          bubbleStream = await md.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 480 } }, audio: false });
        } catch {
          bubbleStream = null;
        }
      }

      const settings = videoStream.getVideoTracks()[0]?.getSettings() ?? {};
      const baseW = settings.width || this.quality.w || 1920;
      const baseH = settings.height || this.quality.h || 1080;
      const maxW = this.quality.w || baseW;
      const scale = Math.min(1, maxW / baseW);
      const width = Math.round((baseW * scale) / 2) * 2;
      const height = Math.round((baseH * scale) / 2) * 2;

      if (bubbleStream) {
        outputVideo = this.composeStream(videoStream, bubbleStream, width, height, this.quality.fps);
      } else {
        outputVideo = videoStream;
      }

      const tracks: MediaStreamTrack[] = [...outputVideo.getVideoTracks()];
      const audioSources = [...(this.systemAudio ? [videoStream] : []), ...audioCtxStreams];
      if (audioSources.some((s) => s.getAudioTracks().length)) {
        audioCtx = new AudioContext();
        const mixed = mixAudio(audioSources, audioCtx);
        mixed?.getAudioTracks().forEach((track) => tracks.push(track));
      }

      const combined = new MediaStream(tracks);
      const mime = pickMime();
      const recorder = new MediaRecorder(
        combined,
        mime
          ? { mimeType: mime, videoBitsPerSecond: this.quality.bitrate, audioBitsPerSecond: 128_000 }
          : { videoBitsPerSecond: this.quality.bitrate },
      );

      const active: ActiveRecording = {
        recorder,
        chunks: [],
        streams,
        canvasFrame: 0,
        timer: 0,
        startedAt: Date.now(),
        pausedTotal: 0,
        pausedAt: 0,
        mime: recorder.mimeType || mime || "video/webm",
        width,
        height,
        blobUrl: null,
      };
      this.active = active;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) {
          active.chunks.push(event.data);
          this.size += event.data.size;
        }
      });

      recorder.addEventListener("stop", () => this.finish());

      // Se o usuário encerrar o compartilhamento pelo navegador, finaliza bem.
      videoStream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (this.phase === "recording") this.stop();
        });
      });

      if (this.countdownPref > 0) {
        this.phase = "countdown";
        this.build();
        await this.runCountdown(this.countdownPref);
        if (!this.active) return;
      }

      recorder.start(1000);
      active.startedAt = Date.now();
      this.phase = "recording";
      this.size = 0;
      this.build();
      this.runTimer();
    } catch (error) {
      stopStream(videoStreamOf(streams));
      streams.forEach(stopStream);
      audioCtx?.close().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.error =
        message.includes("Permission") || message.includes("denied") || message.includes("NotAllowed")
          ? "Permissão negada. Autorize o compartilhamento de tela e o microfone nas configurações do sistema."
          : message.includes("NotFound")
            ? "Nenhuma fonte encontrada (tela ou câmera)."
            : `Não foi possível iniciar a gravação: ${message}`;
      this.active = null;
      this.phase = "setup";
      this.build();
    }
  }

  /** Desenha tela + bolha de câmera e devolve um stream de canvas. */
  private composeStream(
    display: MediaStream,
    bubble: MediaStream,
    width: number,
    height: number,
    fps: number,
  ): MediaStream {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const screenVideo = document.createElement("video");
    screenVideo.srcObject = display;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    void screenVideo.play().catch(() => undefined);
    const bubbleVideo = document.createElement("video");
    bubbleVideo.srcObject = bubble;
    bubbleVideo.muted = true;
    bubbleVideo.playsInline = true;
    void bubbleVideo.play().catch(() => undefined);

    let running = true;
    const draw = (): void => {
      if (!running) return;
      if (ctx) {
        ctx.fillStyle = "#0b0d10";
        ctx.fillRect(0, 0, width, height);
        if (screenVideo.videoWidth) ctx.drawImage(screenVideo, 0, 0, width, height);
        const d = Math.round(Math.min(width, height) * 0.22);
        const pad = Math.round(d * 0.16);
        const cx = width - pad - d / 2;
        const cy = height - pad - d / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, d / 2 + 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
        ctx.clip();
        if (bubbleVideo.videoWidth) {
          const side = Math.min(bubbleVideo.videoWidth, bubbleVideo.videoHeight);
          const sx = (bubbleVideo.videoWidth - side) / 2;
          const sy = (bubbleVideo.videoHeight - side) / 2;
          ctx.drawImage(bubbleVideo, sx, sy, side, side, cx - d / 2, cy - d / 2, d, d);
        } else {
          ctx.fillStyle = "#15181d";
          ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
        }
        ctx.restore();
      }
      requestAnimationFrame(draw);
    };
    draw();

    const stream = canvas.captureStream(fps);
    // Guarda parada limpa.
    const originalStop = stream.getVideoTracks()[0]?.stop.bind(stream.getVideoTracks()[0]);
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        running = false;
        stopStream(bubble);
        originalStop?.();
      });
    });
    return stream;
  }

  private runCountdown(from: number): Promise<void> {
    return new Promise((resolve) => {
      let left = from;
      const tick = (): void => {
        if (!this.active || left <= 0) {
          resolve();
          return;
        }
        const node = this.root?.querySelector<HTMLElement>(".rec-count span");
        if (node) node.textContent = String(left);
        left -= 1;
        window.setTimeout(tick, 700);
      };
      tick();
    });
  }

  private runTimer(): void {
    const active = this.active;
    if (!active) return;
    active.timer = window.setInterval(() => {
      const elapsed = (Date.now() - active.startedAt - active.pausedTotal) / 1000;
      const timerEl = this.root?.querySelector<HTMLElement>("[data-rec-timer]");
      if (timerEl) timerEl.textContent = formatClock(elapsed);
      const metaEl = this.root?.querySelector<HTMLElement>("[data-rec-meta]");
      if (metaEl) metaEl.textContent = `${this.sourceLabel()} · ${formatSize(this.size)}`;
    }, 250);
  }

  private startBars(): void {
    const bars = this.root?.querySelectorAll<HTMLElement>(".rec-bars i");
    if (!bars?.length) return;
    window.setInterval(() => {
      if (this.phase !== "recording") return;
      bars.forEach((bar) => {
        bar.style.height = `${8 + Math.random() * 26}px`;
      });
    }, 160);
  }

  private togglePause(): void {
    const active = this.active;
    if (!active) return;
    if (active.recorder.state === "recording") {
      active.recorder.pause();
      active.pausedAt = Date.now();
      const btn = this.root?.querySelector<HTMLElement>("[data-rec='pause']");
      if (btn) btn.textContent = "Retomar";
      this.root?.querySelector(".rec-live")?.classList.add("paused");
    } else if (active.recorder.state === "paused") {
      active.recorder.resume();
      if (active.pausedAt) active.pausedTotal += Date.now() - active.pausedAt;
      active.pausedAt = 0;
      const btn = this.root?.querySelector<HTMLElement>("[data-rec='pause']");
      if (btn) btn.textContent = "Pausar";
      this.root?.querySelector(".rec-live")?.classList.remove("paused");
    }
  }

  private stop(): void {
    const active = this.active;
    if (!active) return;
    window.clearInterval(active.timer);
    if (active.recorder.state !== "inactive") {
      try {
        active.recorder.stop();
      } catch {
        /* noop */
      }
    }
  }

  private finish(): void {
    const active = this.active;
    if (!active) return;
    window.clearInterval(active.timer);
    active.streams.forEach(stopStream);
    cancelAnimationFrame(active.canvasFrame);
    this.phase = "preview";
    const seconds = Math.max(0, (Date.now() - active.startedAt - active.pausedTotal) / 1000);
    const type = active.mime.split(";")[0] || "video/webm";
    const blob = new Blob(active.chunks, { type });
    if (!blob.size) {
      this.error = "A gravação saiu vazia. Tente novamente escolhendo outra fonte.";
      this.active = null;
      this.phase = "setup";
      this.build();
      return;
    }
    const stamp = new Date();
    const name = `gravacao-${stamp.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${extensionFor(active.mime)}`;
    const file = new File([blob], name, { type });
    this.preview = { file, width: active.width, height: active.height, seconds, mime: active.mime };
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(blob);
    active.blobUrl = this.previewUrl;
    this.active = null;
    this.build();
    store.toast("Gravação pronta. Revise e insira no design.", "success");
  }

  private abort(): void {
    const active = this.active;
    if (active) {
      window.clearInterval(active.timer);
      active.chunks = [];
      if (active.recorder.state !== "inactive") {
        try {
          active.recorder.stop();
        } catch {
          /* noop */
        }
      }
      active.streams.forEach(stopStream);
      this.active = null;
    }
    this.reset();
    store.toast("Gravação descartada.", "info");
  }

  private reset(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.preview = null;
    this.phase = "setup";
    this.size = 0;
    this.error = "";
    this.build();
  }

  private download(): void {
    const preview = this.preview;
    if (!preview || !this.previewUrl) return;
    const link = document.createElement("a");
    link.href = this.previewUrl;
    link.download = preview.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    store.toast("Download iniciado.", "success");
  }

  private use(): void {
    const preview = this.preview;
    if (!preview) return;
    this.onUse?.(preview);
    this.close();
  }

  close(): void {
    if (this.active) {
      this.abort();
      return;
    }
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.preview = null;
    this.active = null;
    this.root?.remove();
    this.root = null;
  }
}

function videoStreamOf(streams: MediaStream[]): MediaStream | null {
  return streams.find((s) => s.getVideoTracks().length > 0) ?? null;
}

let overlay: RecorderOverlay | null = null;

/** Abre a janela de gravação. `onUse` recebe o vídeo quando o usuário aprova. */
export function openRecorder(onUse: (video: RecordedVideo) => void): void {
  if (!overlay) overlay = new RecorderOverlay();
  overlay.open(onUse);
}
