//! # krevo-core
//!
//! O núcleo do **Krevo** — o estúdio de design que edita PDF, apresentações,
//! imagens, vídeo e muito mais, com um agente de IA ao lado.
//!
//! Este crate é 100% independente de interface: ele é usado tanto pelo app
//! desktop (Tauri) quanto pelos testes. Ele cuida de:
//!
//! * [`model`] — o modelo de documento (páginas, elementos, estilos);
//! * [`ai`] — construção de requisições e leitura de respostas de 9 provedores
//!   de IA (OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral,
//!   Ollama e endpoint compatível customizado);
//! * [`agent`] — interpretação das "operações de design" devolvidas pela IA;
//! * [`pdf`] — gerador de PDF **vetorial** escrito em Rust (sem Chromium);
//! * [`unsplash`] — cliente de busca de fotos;
//! * [`theme`] — paletas e tipografias curadas usadas por templates e IA.
//!
//! ```no_run
//! use krevo_core::{model::Project, pdf};
//! let project = Project::demo();
//! let bytes = pdf::render_pdf(&project).unwrap();
//! std::fs::write("deck.pdf", bytes).unwrap();
//! ```

pub mod agent;
pub mod ai;
pub mod error;
pub mod model;
pub mod pdf;
pub mod theme;
pub mod unsplash;

pub use error::{Error, Result};
pub use model::{Element, ElementKind, Page, Project};

/// Versão do formato de arquivo `.krevo` (JSON).
pub const FORMAT_VERSION: u32 = 1;
