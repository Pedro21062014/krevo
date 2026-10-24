/**
 * Ponto de entrada do Krevo (interface).
 *
 * A tela é decidida por `store.state.screen`; o editor mantém a própria
 * assinatura de estado (repinta sem recriar o DOM do canvas).
 */

import "./styles.css";
import { isDesktop } from "./bridge";
import { store } from "./store";
import { hydrateProjectMedia } from "./util";
import { EditorView } from "./ui/editor";
import { mountHome } from "./ui/home";
import { openCreateDialog } from "./ui/create";

const app = document.getElementById("app");
if (!app) throw new Error("#app não encontrado");

let editor: EditorView | null = null;

function render(): void {
  const state = store.state;
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.dataset.screen = state.screen;

  if (state.screen === "editor") {
    if (!editor) {
      editor = new EditorView(app as HTMLElement);
      editor.mount();
    }
    document.title = `${state.project.name} · Krevo`;
    return;
  }

  if (editor) {
    editor.destroy();
    editor = null;
  }
  document.title = "Krevo — estúdio de design com IA";
  mountHome(app as HTMLElement);
}

store.subscribe(() => render());
render();

// Skeleton loader da tela inicial por um instante (dá sensação de app nativo).
window.setTimeout(() => {
  if (store.state.loadingHome) store.patch({ loadingHome: false });
}, 850);

// Atalhos globais
window.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === "n") {
    event.preventDefault();
    openCreateDialog();
  }
  if (key === "," && store.state.screen === "home") {
    event.preventDefault();
    store.patch({ homeTab: "ajustes" });
  }
});

// Evita perder o projeto ao fechar a janela
window.addEventListener("beforeunload", () => {
  try {
    store.persistRecent();
  } catch {
    /* noop */
  }
});

/* ------------------------------------------------------------------ */
/* Drop nativo no app desktop                                          */
/* ------------------------------------------------------------------ */

/**
 * No desktop, `dragDropEnabled: true` faz o Tauri interceptar os arquivos
 * arrastados ANTES do webview — os eventos HTML5 de drop nunca chegam com
 * `dataTransfer.files`. Escutamos o evento nativo e convertemos os caminhos
 * em arquivos (via asset protocol, que transfere em streaming, sem IPC
 * gigante) para entrar no mesmo pipeline seguro de importação.
 */
if (isDesktop()) {
  void (async () => {
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      type Payload = { type: string; paths?: string[] };
      await getCurrentWebview().onDragDropEvent(async (event: { payload: Payload }) => {
        const payload = event.payload;
        if (payload.type !== "drop" || !payload.paths?.length) return;

        const files: File[] = [];
        let krevoProject: unknown = null;
        for (const path of payload.paths) {
          const name = path.split(/[\\/]/).pop() ?? path;
          try {
            const url = convertFileSrc(path);
            if (name.toLowerCase().endsWith(".krevo")) {
              const text = await (await fetch(url)).text();
              try {
                const parsed = JSON.parse(text) as { project?: unknown };
                krevoProject = parsed.project ?? parsed;
              } catch {
                store.toast("Arquivo .krevo inválido.", "error");
              }
              continue;
            }
            const blob = await (await fetch(url)).blob();
            files.push(new File([blob], name, { type: blob.type }));
          } catch (error) {
            console.error("Falha ao ler arquivo solto", error);
            store.toast(`Não consegui ler ${name}.`, "error");
          }
        }

        if (krevoProject) {
          store.openProject(krevoProject as never);
          void hydrateProjectMedia(store.state.project);
        }
        if (!files.length) return;
        if (store.state.screen !== "editor") {
          store.toast("Abra ou crie um design antes de soltar mídias.", "info");
          return;
        }
        if (editor) await editor.importExternalFiles(files);
      });
    } catch (error) {
      console.warn("Drop nativo indisponível neste ambiente", error);
    }
  })();
}
