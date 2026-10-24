# Changelog

Todas as mudanças importantes do Krevo ficam neste arquivo.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
versionamento semântico.

## [0.5.0] — 2026-10-24

### Corrigido (vídeo de vez ao salvar, abrir e arrastar)

- **Salvar/exportar com vídeo não trava mais**: o `.krevo` nunca mais converte o
  arquivo de vídeo em base64 — um vídeo de 200 MB virava ~270 MB de texto em
  JSON (três cópias em memória) e congelava o app ao salvar ou exportar PDF.
  Agora o projeto guarda o **cartão do vídeo** (poster + nome + geometria) e a
  interface oferece **“Reconectar arquivo”** ao reabrir, com um clique.
- **Abrir projetos antigos com mídia embutida**: `data:` gigantes são convertidos
  para `blob:` logo ao abrir — editar depois disso não serializa megabytes a
  cada passo do histórico.
- **Arrastar arquivo para a janela no app desktop funciona**: com
  `dragDropEnabled` o Tauri intercepta o drop antes do webview; agora o evento
  nativo é escutado e os arquivos entram pelo mesmo pipeline seguro (via asset
  protocol, em streaming — sem IPC gigante). `.krevo`, imagens e vídeos.
- **Reprodução com guarda anti-travamento**: se o vídeo não começar em 8 s
  (codec ausente no sistema), o app avisa com orientação em vez de parecer
  congelado.
- **Poster do vídeo capturado durante a reprodução** (nunca na importação) —
  miniaturas, PDF e cartões reabertos mostram o quadro real, de graça.
- Arquivos soltos sem MIME (comum no Linux) são detectados pela extensão; excluir
  mídia agora libera a memória do object URL correspondente.

### Adicionado (templates de apresentação)

- **Decks com vários slides**: templates agora podem nascer com páginas —
  **Deck · Pitch Aurora** (capa, problema, solução, tração, roadmap e contato,
  6 slides) e **Deck · Claro minimal** (proposta comercial em 5 slides).
- **4 slides avulsos novos**: Citação, Métricas, Comparativo (antes/depois) e
  Cronograma — todos em 1920×1080.
- **Currículo minimal refeito**: o template estava com conteúdo de e-book
  (erro de copy-paste); agora é um currículo A4 de verdade, com experiência,
  formação, competências e idiomas.

## [0.4.0] — 2026-10-23

### Adicionado

- **Gravação de tela e câmera** (`⌘⇧R`, botão na barra lateral, menu de contexto do
  canvas e inspetor): escolha entre tela inteira, janela, aba do navegador ou
  webcam; qualidade (720p 24 fps → 1080p 60 fps → resolução original, até 4K);
  microfone com narração, áudio do sistema e **câmera em bolha** sobre a captura
  (composição em canvas). Tem contagem regressiva opcional, cronômetro, pausar e
  retomar, prévia com duração/resolução/tamanho e duas saídas: baixar o arquivo
  ou **inserir no design**. Se você encerrar o compartilhamento pelo navegador, a
  gravação é finalizada — nada é enviado para servidor.
- **Criar design em duas etapas**: primeiro o **tipo de mídia** (imagem/social,
  vídeo, apresentação, documento, impressão ou tamanho próprio), depois o
  **formato** exato (1:1, 4:5, 9:16, 16:9, A4, 4K, cartão…). O diálogo lembra a
  última escolha, sugere o nome do projeto e cria a página já com a mídia padrão
  na medida certa. `⌘N` e o botão “Novo” abrem esse fluxo.
- **Miniaturas reais dos projetos recentes**: o editor renderiza a página em
  canvas e guarda um JPEG pequeno (fora dos projetos), então a tela inicial abre
  leve, mesmo com designs que têm fotos grandes.

### Corrigido

- **Travamento ao importar mídia**: imagens e vídeos agora entram sempre como
  `blob:` (object URL) — antes fotos pequenas viravam base64 dentro do estado e
  eram copiadas a cada passo do histórico e a cada gravação no `localStorage`,
  o que congelava a interface com arquivos de alguns MB.
- Fotos gigantes (ex.: 4000×3000 de celular) são reduzidas automaticamente para
  até 3600 px no lado maior, preservando PNG/transparência — importação medida em
  ~40 ms e o arraste segue respondendo.
- Importação por arrastar/soltar usa o mesmo caminho otimizado, com leitura de
  metadados do vídeo (proporção correta já na inserção).
- Importação de mídia agora informa progresso e nunca deixa o toast “congelado”
  na tela.

## [0.3.0] — 2026-10-23

### Adicionado

- **Kit de edição estilo Canva**: 12 formas vetoriais extras (triângulo, estrela,
  seta, balão, hexágono, losango, cruz, anel, cápsula, arco, explosão), 8 estilos
  de texto prontos, escolha de família tipográfica, itálico, sublinhado e caixa alta.
- **Ajustes de imagem** no inspetor: brilho, contraste, saturação, preto e branco e
  desfoque com sliders ao vivo, 8 filtros prontos, espelhar na horizontal/vertical.
- **Sombras e cantos** em um clique (6 sombras, 7 raios de canto).
- **Redimensionamento de página** com proporção (16:9, 4:3, A4 retrato/paisagem,
  1:1, 9:16, 4:5, banner, capa) — o chamado *magic resize*.
- **Exportar PNG** em 2× direto do canvas 2D (sem html2canvas), além do PDF vetorial.
- **Mídia definida ao criar**: todo projeto novo já vem com fundo em arte suave e
  paleta sóbria aplicada.
- Subir/descer camadas direto na lista de camadas.

### Corrigido

- **Travamento no upload de vídeo**: o arquivo era convertido em base64 (2,7 MB
  viravam ~3,6 MB de string) e o projeto inteiro ia para o `localStorage` a cada
  alteração, estourando a cota e congelando a interface. Agora vídeos e arquivos
  grandes entram como `blob:` local, a lista de recentes guarda uma versão sem
  mídia pesada e o salvamento materializa a mídia apenas quando você pede.
- Vídeo sem codec suportado mostra um cartão com o nome do arquivo em vez de
  ficar decodificando em segundo plano.
- Upload de vídeo/imagem não bloqueia mais a interface (medição: 150 ms para um
  MP4 de 2 MB).

## [0.2.1] — 2026-10-23

### Corrigido

- **Edição de texto** agora confirma ao clicar fora, com `Enter` ou `⌘↵` — antes o
  texto digitado voltava ao sair do modo de edição (`⇧Esc` descarta de propósito).
- **Arraste travado**: o canvas passou a reaproveitar os nós dos elementos em vez
  de recriá-los a cada movimento. As imagens não recarregam mais (era isso que
  fazia os elementos "sumirem" por um instante) e os painéis de páginas, camadas e
  propriedades só repintam ao soltar o mouse. Movimentos agrupados em um quadro.
- Fotografias eram aplicadas em um projeto novo; agora entram no design aberto.

### Adicionado

- **Menu de contexto** com o botão direito: editar texto, duplicar, copiar/colar,
  trazer para frente / avançar / recuar / enviar para trás, bloquear, ocultar e
  excluir. No vazio do canvas: inserir elementos, colar, grade, ajustar à tela.
- **Painel de atalhos** (`?`) com todas as combinações, e novos atalhos:
  `⌘C/⌘V`, `⌘[`/`⌘]`, `⌘⇧[`/`⌘⇧]`, `⌘⇧L`, `⌘⇧H`, `⌘⇧G`, `⌘0`, `⌘+`/`⌘−`.
- Área de transferência interna com cópia deslocada ao colar.

### Mudado

- A aba **Fotos** foi incorporada em **Elementos**: formas, gradientes, ícones,
  fotos e paletas no mesmo lugar, como no Canva. Menos navegação, mais canvas.

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
