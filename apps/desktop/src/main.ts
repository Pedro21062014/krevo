/**
 * Ponto de entrada do Krevo (interface).
 *
 * A tela é decidida por `store.state.screen`; o editor mantém a própria
 * assinatura de estado (repinta sem recriar o DOM do canvas).
 */

import "./styles.css";
import { store } from "./store";
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
