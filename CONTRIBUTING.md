# Contribuindo com o Krevo

Obrigado pelo interesse! Este documento tem o essencial para você mandar bem na
primeira contribuição.

## Antes de abrir uma issue

1. Procure em [issues abertas](https://github.com/Pedro21062014/krevo/issues) —
   talvez alguém já tenha relatado.
2. Se for bug, diga: sistema, versão do Krevo, o que você fez, o que esperava e
   o que aconteceu. Print ajuda muito.
3. Se for ideia, conte **o problema** antes da solução ("perco tempo alinhando
   botões" > "adicione um botão X").

## Ambiente

```bash
git clone https://github.com/Pedro21062014/krevo.git
cd krevo/apps/desktop && npm install
npm run tauri:dev          # app desktop com hot reload
```

Requisitos: Rust estável 1.77+, Node 20+ e as libs de sistema listadas no README.

## Onde mexer

| Você quer… | Vá para |
|---|---|
| mudar o comportamento do agente de IA | `crates/krevo-core/src/agent.rs` |
| suportar outro provedor de IA | `crates/krevo-core/src/ai.rs` |
| melhorar o PDF exportado | `crates/krevo-core/src/pdf.rs` |
| adicionar template / ícone / paleta | `apps/desktop/src/assets.ts` |
| mudar o editor (canvas, inspetor) | `apps/desktop/src/ui/editor.ts` |
| mudar a tela inicial | `apps/desktop/src/ui/home.ts` |
| adicionar comando Rust → interface | `apps/desktop/src-tauri/src/lib.rs` + `src/bridge.ts` |
| ajustar o visual | `apps/desktop/src/styles.css` |
| mexer no site | `site/index.template.html` + `python3 site/build.py` |

## Regras do projeto

- **Nada de lógica de negócio no front.** Rede, disco, imagem e PDF vivem em Rust.
- O modelo de documento é espelho: mudou em `crates/krevo-core/src/model.rs`,
  mude em `apps/desktop/src/types.ts`.
- Textos de interface em **português**, nomes de código em **inglês**.
- Sem novas dependências pesadas sem justificar na PR.
- Formatação: `cargo fmt` e `npm run build` (que roda `tsc --noEmit`).

## Antes de abrir a PR

```bash
cargo fmt --all
cargo test --workspace
cd apps/desktop && npm run build
```

Descreva na PR **o que** mudou e **por quê**, com um print ou GIF quando for
visual. PRs pequenas e focadas entram mais rápido.

## Commits

Use mensagens no imperativo e em português ou inglês, curtas:

```
editor: snap magnético também nas bordas da página
pdf: quebra de linha respeita kerning negativo
ia: adiciona suporte ao endpoint custom
```

## Código de conduta

Seja gentil, técnico e direto. Discorde de ideias, não de pessoas.
