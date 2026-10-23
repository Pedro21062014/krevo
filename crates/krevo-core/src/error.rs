//! Erros unificados do núcleo.

/// Resultado padrão do `krevo-core`.
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("falha ao ler/escrever JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("arquivo de projeto inválido: {0}")]
    InvalidProject(String),

    #[error("provedor de IA desconhecido: {0}")]
    UnknownProvider(String),

    #[error("resposta da IA sem conteúdo utilizável")]
    EmptyCompletion,

    #[error("erro no gerador de PDF: {0}")]
    Pdf(String),

    #[error("imagem inválida: {0}")]
    Image(String),

    #[error("base64 inválido: {0}")]
    Base64(String),

    #[error("erro de rede: {0}")]
    Network(String),

    #[error("{0}")]
    Other(String),
}
