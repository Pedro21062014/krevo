# Changelog

Todas as mudanças importantes do Krevo ficam neste arquivo.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
versionamento semântico.

## [0.2.0] — 2026-10-23

### Adicionado

- **Logo novo**: o K avulso virou o símbolo do app e o wordmark fornecido é o
  logo completo. Todos os ícones (`.png`, `.ico`, `.icns`, `Square*Logo`,
  `StoreLogo`), o site e o README foram regerados a partir da arte original.
- **Agente de IA de verdade**: o provedor padrão agora é o **Pollinations**,
  gratuito e sem chave — abriu o app, escreveu o briefing, o design aparece no
  canvas. Continua com a opção de usar a sua API.
- **`ai_test`**: botão *Testar conexão* em Ajustes → Agente de IA, que valida
  provedor, chave e modelo com um pedido mínimo e mostra o tempo de resposta.
- **Edição de texto no lugar**: duplo clique em qualquer texto do canvas abre a
  edição direta (`Esc` cancela, `⌘↵` confirma); o painel de propriedades também
  atualiza o conteúdo ao vivo.
- **Hover de seleção**: o elemento sob o cursor ganha contorno antes do clique.
- **Grade opcional** no canvas e barra de ferramentas vertical.
- **Upload de imagem e vídeo** direto pela barra de ferramentas.
- Página **"Agente de IA"** na tela inicial: escolha do provedor, chave, modelo,
  URL base e teste de conexão em um só lugar.
- **Reparo de JSON**: se a resposta do modelo vier cortada, o Krevo reconstrói o
  plano e aproveita a melhor resposta em vez de falhar.

### Mudado

- **Interface redesenhada** do zero: tema escuro grafite, tipografia Inter,
  uma única cor de destaque (verde-menta `#34D39F`), cartões de 1 px, menos
  ruído visual e layout mais denso — na tela inicial e no editor.
- Mensagens de erro da IA agora são acionáveis ("aguarde ~30 s", "chave
  recusada", "modelo não encontrado") e o app espera o `Retry-After` do provedor.
- O agente insiste em composições completas (8+ elementos) e cai para o gerador
  local só quando o provedor falha de fato.

### Corrigido

- Texto editado não atualizava no canvas (o DOM era recriado durante a edição).
- Duplo clique em texto não abria a edição.
- A conversa do agente desaparecia durante a geração.
- Respostas vazias de modelos de raciocínio eram tratadas como erro definitivo.

## [0.1.1] — 2026-10-23

### Mudado

- macOS agora sai em **binário universal** (`Krevo_0.1.1_universal.dmg`), cobrindo
  Intel e Apple Silicon em um único instalador.
- CI: permissão `contents: write` para publicar o Release, testes do núcleo sem
  dependências gráficas e `apt` não interativo nos builders Linux.
- Ícones `.ico` (Windows) e `.icns` (macOS) adicionados ao bundle.

## [0.1.0] — 2026-10-23

### Adicionado

- **Editor multi-formato** com canvas de zoom/pan, seleção múltipla, arraste,
  redimensionamento com proporção, rotação, guias magnéticas e histórico de 80
  estados.
- **Tela inicial** com briefing, criação em branco por formato, skeleton loader,
  projetos recentes com miniatura real, biblioteca de templates, elementos,
  fotos, painel de IA e ajustes.
- **Agente de IA** ("traga a sua chave") para OpenAI, Anthropic, Gemini,
  OpenRouter, Groq, DeepSeek, Mistral, Ollama e endpoints compatíveis, com
  *system prompt* que ensina o grid, a margem segura e a paleta da marca.
- **Modo demo offline**: gerador local determinístico de layouts por palavra-chave.
- **Motor de PDF vetorial em Rust** (`krevo-core::pdf`): texto selecionável,
  formas arredondadas, elipses, sombras aproximadas, imagens embutidas com
  `cover`/`contain`/`fill` e gradientes por banda.
- **Importação de PDF** (até 30 páginas) para edição página a página no canvas.
- **Imagens**: busca no Unsplash com a chave do usuário + acervo local gerado
  proceduralmente (SVG) que funciona sem internet.
- **Arquivo `.krevo`** versionado em JSON, com salvar/abrir e miniaturas.
- **Site de divulgação** em `site/`, publicado no GitHub Pages.
- **CI/CD** com GitHub Actions gerando `.exe`, `.msi`, `.deb`, `.AppImage`,
  `.dmg` e artefatos de build para todas as plataformas.
- 31 testes de unidade no núcleo + testes de CI em TypeScript.

### Limitações conhecidas

- Fontes no PDF usam as quatro Helvetica base-14 (mapeadas por peso e itálico).
- Gradientes são aproximados por bandas de cor na exportação.
- Vídeos entram no PDF como o primeiro quadro estático.
- A edição de PDF importado é vetorial-sobre-imagem (cada página vira imagem
  editável, não reflow de texto).
