/** Menu de contexto (botão direito) e painel de atalhos do Krevo. */

export interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Traço separador. */
  separator?: boolean;
  /** Linha de título não clicável. */
  header?: string;
}

let openMenu: HTMLElement | null = null;

function closeMenu(): void {
  openMenu?.remove();
  openMenu = null;
  document.removeEventListener("pointerdown", onOutside, true);
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("blur", closeMenu);
}

function onOutside(event: PointerEvent): void {
  if (openMenu && !openMenu.contains(event.target as Node)) closeMenu();
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeMenu();
  }
}

export function closeContextMenu(): void {
  closeMenu();
}

/** Abre um menu no ponto (x, y) da tela. */
export function openMenuAt(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (item.separator) {
      const line = document.createElement("div");
      line.className = "ctx-sep";
      menu.appendChild(line);
      continue;
    }
    if (item.header) {
      const head = document.createElement("div");
      head.className = "ctx-head";
      head.textContent = item.header;
      menu.appendChild(head);
      continue;
    }
    const button = document.createElement("button");
    button.className = `ctx-item ${item.danger ? "danger" : ""}`;
    button.disabled = Boolean(item.disabled);
    button.setAttribute("role", "menuitem");
    const label = document.createElement("span");
    label.textContent = item.label ?? "";
    button.appendChild(label);
    if (item.shortcut) {
      const key = document.createElement("kbd");
      key.textContent = item.shortcut;
      button.appendChild(key);
    }
    button.addEventListener("click", () => {
      closeMenu();
      item.action?.();
    });
    menu.appendChild(button);
  }

  document.body.appendChild(menu);

  // mantém o menu dentro da janela
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  openMenu = menu;
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", closeMenu);
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Atalhos                                                             */
/* ------------------------------------------------------------------ */

export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: "Ferramentas",
    items: [
      ["V", "Selecionar"],
      ["H / Segurar espaço", "Mover a tela"],
      ["T", "Texto"],
      ["R", "Retângulo"],
      ["O", "Elipse"],
      ["L", "Linha"],
    ],
  },
  {
    group: "Editar",
    items: [
      ["Duplo clique no texto", "Editar no lugar"],
      ["Enter (⌘↵)", "Confirmar texto"],
      ["Esc", "Confirmar / cancelar seleção"],
      ["⌘Z / ⇧⌘Z", "Desfazer / refazer"],
      ["⌘D", "Duplicar"],
      ["⌘C / ⌘V", "Copiar / colar"],
      ["Delete", "Excluir seleção"],
      ["Setas / ⇧setas", "Mover 1 px / 10 px"],
      ["⌘A", "Selecionar tudo"],
    ],
  },
  {
    group: "Camadas e ordem",
    items: [
      ["⇧clique", "Seleção múltipla"],
      ["⌘] / ⌘[", "Trazer para frente / enviar para trás"],
      ["⌘⇧L", "Bloquear / desbloquear"],
      ["⌘⇧H", "Mostrar / ocultar"],
    ],
  },
  {
    group: "Tela e arquivo",
    items: [
      ["⌘+ / ⌘−", "Zoom"],
      ["⌘0", "Ajustar à tela"],
      ["⌘⇧G", "Grade"],
      ["⌘S", "Salvar projeto"],
      ["⇧⌘E", "Exportar PDF"],
      ["Botão direito", "Menu de contexto"],
    ],
  },
];

export function openShortcuts(): void {
  document.querySelector(".modal-backdrop.krevo-shortcuts")?.remove();

  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop krevo-shortcuts";
  const groups = SHORTCUTS.map(
    (group) => `
      <div class="shortcut-group">
        <div class="group-title">${group.group}</div>
        ${group.items
          .map(
            ([key, label]) => `
          <div class="shortcut-row">
            <span>${label}</span>
            <kbd>${key}</kbd>
          </div>`,
          )
          .join("")}
      </div>`,
  ).join("");

  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-label="Atalhos do Krevo">
      <div class="modal-head">
        <b>Atalhos</b>
        <button class="btn small icon ghost" data-close aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body shortcuts">${groups}</div>
    </div>`;

  const close = (): void => wrap.remove();
  wrap.addEventListener("pointerdown", (event) => {
    if (event.target === wrap) close();
  });
  wrap.querySelector("[data-close]")?.addEventListener("click", close);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") close();
    },
    { once: true },
  );
  document.body.appendChild(wrap);
}
