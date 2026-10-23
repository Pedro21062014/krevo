# Changelog

Todas as mudanças importantes do Krevo ficam neste arquivo.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
versionamento semântico.

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
