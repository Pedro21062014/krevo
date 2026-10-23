//! Camada de IA multi-provedor ("traga a sua chave").
//!
//! O app nunca guarda a chave: ela fica no cofre local do usuário e é enviada
//! apenas nesta camada, direto do processo Rust para o provedor escolhido.
//!
//! Aqui montamos a requisição HTTP (URL, headers, corpo) e lemos a resposta de
//! cada "dialeto": OpenAI-compatível, Anthropic e Gemini.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{Error, Result};

/// Provedores suportados de fábrica.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[serde(rename = "openai")]
    OpenAi,
    Anthropic,
    Gemini,
    OpenRouter,
    Groq,
    Deepseek,
    Mistral,
    Ollama,
    /// Endpoint público gratuito (Pollinations), compatível com OpenAI.
    /// Serve para o agente funcionar "de verdade" sem chave nenhuma.
    Pollinations,
    Custom,
}

impl Provider {
    pub fn from_id(id: &str) -> Result<Self> {
        match id.to_ascii_lowercase().as_str() {
            "openai" => Ok(Self::OpenAi),
            "anthropic" | "claude" => Ok(Self::Anthropic),
            "gemini" | "google" => Ok(Self::Gemini),
            "openrouter" => Ok(Self::OpenRouter),
            "groq" => Ok(Self::Groq),
            "deepseek" => Ok(Self::Deepseek),
            "mistral" => Ok(Self::Mistral),
            "ollama" | "local" => Ok(Self::Ollama),
            "pollinations" | "free" | "gratis" | "grátis" => Ok(Self::Pollinations),
            "custom" => Ok(Self::Custom),
            other => Err(Error::UnknownProvider(other.into())),
        }
    }

    pub fn id(&self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::OpenRouter => "openrouter",
            Self::Groq => "groq",
            Self::Deepseek => "deepseek",
            Self::Mistral => "mistral",
            Self::Ollama => "ollama",
            Self::Pollinations => "pollinations",
            Self::Custom => "custom",
        }
    }

    /// Endpoint padrão (ou base para o dialeto OpenAI).
    pub fn default_endpoint(&self) -> &'static str {
        match self {
            Self::OpenAi => "https://api.openai.com/v1/chat/completions",
            Self::Anthropic => "https://api.anthropic.com/v1/messages",
            Self::Gemini => "https://generativelanguage.googleapis.com/v1beta/models",
            Self::OpenRouter => "https://openrouter.ai/api/v1/chat/completions",
            Self::Groq => "https://api.groq.com/openai/v1/chat/completions",
            Self::Deepseek => "https://api.deepseek.com/chat/completions",
            Self::Mistral => "https://api.mistral.ai/v1/chat/completions",
            Self::Ollama => "http://localhost:11434/v1/chat/completions",
            Self::Pollinations => "https://text.pollinations.ai/openai",
            Self::Custom => "",
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            Self::OpenAi => "gpt-4o-mini",
            Self::Anthropic => "claude-sonnet-4-20250514",
            Self::Gemini => "gemini-2.0-flash",
            Self::OpenRouter => "openai/gpt-4o-mini",
            Self::Groq => "llama-3.3-70b-versatile",
            Self::Deepseek => "deepseek-chat",
            Self::Mistral => "mistral-large-latest",
            Self::Ollama => "llama3.1",
            Self::Pollinations => "openai",
            Self::Custom => "",
        }
    }

    pub fn needs_key(&self) -> bool {
        !matches!(self, Self::Ollama | Self::Pollinations)
    }

    /// Rótulo curto para a interface.
    pub fn label(&self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::Anthropic => "Anthropic (Claude)",
            Self::Gemini => "Google Gemini",
            Self::OpenRouter => "OpenRouter",
            Self::Groq => "Groq",
            Self::Deepseek => "DeepSeek",
            Self::Mistral => "Mistral",
            Self::Ollama => "Ollama (local)",
            Self::Pollinations => "Grátis, sem chave (Pollinations)",
            Self::Custom => "Endpoint compatível (custom)",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    /// `system`, `user` ou `assistant`.
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn system(text: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: text.into(),
        }
    }
    pub fn user(text: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: text.into(),
        }
    }
}

/// Requisição pronta para ser disparada pelo `reqwest` (app) ou por um teste.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Value,
}

#[derive(Debug, Clone)]
pub struct ChatOptions {
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub json_mode: bool,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
}

impl Default for ChatOptions {
    fn default() -> Self {
        Self {
            model: String::new(),
            temperature: 0.7,
            max_tokens: 4096,
            json_mode: false,
            base_url: None,
            api_key: None,
        }
    }
}

/// Monta a requisição HTTP para o provedor escolhido.
pub fn build_chat_request(
    provider: Provider,
    messages: &[ChatMessage],
    opts: &ChatOptions,
) -> Result<HttpRequest> {
    let key = opts.api_key.clone().unwrap_or_default();
    if provider.needs_key() && key.trim().is_empty() {
        return Err(Error::Other(format!(
            "Informe sua chave de API do provedor '{}'.",
            provider.id()
        )));
    }
    let model = if opts.model.trim().is_empty() {
        provider.default_model().to_string()
    } else {
        opts.model.clone()
    };
    let base = opts
        .base_url
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| provider.default_endpoint().to_string());

    match provider {
        Provider::Anthropic => {
            let system = messages
                .iter()
                .filter(|m| m.role == "system")
                .map(|m| m.content.clone())
                .collect::<Vec<_>>()
                .join("\n\n");
            let chat: Vec<Value> = messages
                .iter()
                .filter(|m| m.role != "system")
                .map(|m| json!({ "role": m.role, "content": m.content }))
                .collect();
            let mut body = json!({
                "model": model,
                "max_tokens": opts.max_tokens,
                "temperature": opts.temperature,
                "messages": chat,
            });
            if !system.is_empty() {
                body["system"] = json!(system);
            }
            Ok(HttpRequest {
                url: base,
                method: "POST".into(),
                headers: vec![
                    ("content-type".into(), "application/json".into()),
                    ("x-api-key".into(), key),
                    ("anthropic-version".into(), "2023-06-01".into()),
                ],
                body,
            })
        }
        Provider::Gemini => {
            let system = messages
                .iter()
                .filter(|m| m.role == "system")
                .map(|m| m.content.clone())
                .collect::<Vec<_>>()
                .join("\n\n");
            let contents: Vec<Value> = messages
                .iter()
                .filter(|m| m.role != "system")
                .map(|m| {
                    json!({
                        "role": if m.role == "assistant" { "model" } else { "user" },
                        "parts": [{ "text": m.content }]
                    })
                })
                .collect();
            let mut body = json!({
                "contents": contents,
                "generationConfig": {
                    "temperature": opts.temperature,
                    "maxOutputTokens": opts.max_tokens,
                    "responseMimeType": if opts.json_mode { "application/json" } else { "text/plain" },
                }
            });
            if !system.is_empty() {
                body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
            }
            let url = format!("{}/{}:generateContent?key={}", base, model, key);
            Ok(HttpRequest {
                url,
                method: "POST".into(),
                headers: vec![("content-type".into(), "application/json".into())],
                body,
            })
        }
        _ => {
            // Dialeto OpenAI-compatível (OpenAI, OpenRouter, Groq, DeepSeek,
            // Mistral, Ollama, endpoints customizados compatíveis).
            let mut body = json!({
                "model": model,
                "temperature": opts.temperature,
                "max_tokens": opts.max_tokens,
                "messages": messages,
            });
            if opts.json_mode {
                body["response_format"] = json!({ "type": "json_object" });
            }
            let mut headers = vec![("content-type".to_string(), "application/json".to_string())];
            if !key.trim().is_empty() {
                headers.push(("authorization".into(), format!("Bearer {key}")));
            }
            if provider == Provider::OpenRouter {
                headers.push(("x-title".into(), "Krevo Studio".into()));
            }
            if provider == Provider::Pollinations {
                // o serviço público pede um referrer identificando o app
                headers.push(("referer".into(), "https://github.com/Pedro21062014/krevo".into()));
            }
            Ok(HttpRequest {
                url: base,
                method: "POST".into(),
                headers,
                body,
            })
        }
    }
}

/// Extrai o texto da resposta de qualquer um dos dialetos.
pub fn parse_chat_response(provider: Provider, value: &Value) -> Result<String> {
    let text = match provider {
        Provider::Anthropic => value
            .get("content")
            .and_then(|c| c.as_array())
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            }),
        Provider::Gemini => value
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|c| c.first())
            .and_then(|c| c.get("content"))
            .and_then(|c| c.get("parts"))
            .and_then(|p| p.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            }),
        _ => value
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|c| c.first())
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string()),
    };

    match text {
        Some(t) if !t.trim().is_empty() => Ok(t),
        _ => {
            // repassa mensagens de erro amigáveis do provedor
            if let Some(msg) = value
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
            {
                return Err(Error::Other(msg.to_string()));
            }
            if let Some(msg) = value.get("error").and_then(|e| e.as_str()) {
                return Err(Error::Other(msg.to_string()));
            }
            Err(Error::EmptyCompletion)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openai_request_shape() {
        let opts = ChatOptions {
            api_key: Some("sk-teste".into()),
            ..Default::default()
        };
        let req = build_chat_request(
            Provider::OpenAi,
            &[ChatMessage::system("voce é um designer"), ChatMessage::user("crie um post")],
            &opts,
        )
        .unwrap();
        assert_eq!(req.url, "https://api.openai.com/v1/chat/completions");
        assert!(req
            .headers
            .iter()
            .any(|(k, v)| k == "authorization" && v == "Bearer sk-teste"));
        assert_eq!(req.body["model"], "gpt-4o-mini");
        assert_eq!(req.body["messages"][1]["content"], "crie um post");
    }

    #[test]
    fn anthropic_moves_system_out() {
        let opts = ChatOptions {
            api_key: Some("k".into()),
            ..Default::default()
        };
        let req = build_chat_request(
            Provider::Anthropic,
            &[ChatMessage::system("sys"), ChatMessage::user("oi")],
            &opts,
        )
        .unwrap();
        assert_eq!(req.body["system"], "sys");
        assert_eq!(req.body["messages"].as_array().unwrap().len(), 1);
        assert!(req.headers.iter().any(|(k, _)| k == "x-api-key"));
    }

    #[test]
    fn gemini_embeds_key_in_url() {
        let opts = ChatOptions {
            api_key: Some("gkey".into()),
            ..Default::default()
        };
        let req = build_chat_request(Provider::Gemini, &[ChatMessage::user("oi")], &opts).unwrap();
        assert!(req.url.contains("gemini-2.0-flash:generateContent?key=gkey"));
        assert_eq!(req.body["contents"][0]["parts"][0]["text"], "oi");
    }

    #[test]
    fn ollama_does_not_need_key() {
        let req =
            build_chat_request(Provider::Ollama, &[ChatMessage::user("oi")], &ChatOptions::default())
                .unwrap();
        assert_eq!(req.url, "http://localhost:11434/v1/chat/completions");
        assert!(!req.headers.iter().any(|(k, _)| k == "authorization"));
    }

    #[test]
    fn pollinations_is_free_and_openai_shaped() {
        assert!(!Provider::Pollinations.needs_key());
        let req = build_chat_request(
            Provider::Pollinations,
            &[ChatMessage::user("oi")],
            &ChatOptions::default(),
        )
        .unwrap();
        assert_eq!(req.url, "https://text.pollinations.ai/openai");
        assert_eq!(req.body["model"], "openai");
        assert!(req.headers.iter().any(|(k, _)| k == "referer"));
        assert!(!req.headers.iter().any(|(k, _)| k == "authorization"));
    }

    #[test]
    fn provider_ids_roundtrip() {
        for p in [
            Provider::OpenAi,
            Provider::Anthropic,
            Provider::Gemini,
            Provider::OpenRouter,
            Provider::Groq,
            Provider::Deepseek,
            Provider::Mistral,
            Provider::Ollama,
            Provider::Pollinations,
            Provider::Custom,
        ] {
            assert_eq!(Provider::from_id(p.id()).unwrap(), p);
        }
        assert!(Provider::from_id("free").is_ok());
    }

    #[test]
    fn parses_all_dialects() {
        let oa = json!({"choices":[{"message":{"content":"a"}}]});
        assert_eq!(parse_chat_response(Provider::OpenAi, &oa).unwrap(), "a");
        let an = json!({"content":[{"text":"b"},{"text":"c"}]});
        assert_eq!(parse_chat_response(Provider::Anthropic, &an).unwrap(), "bc");
        let gm = json!({"candidates":[{"content":{"parts":[{"text":"d"}]}}]});
        assert_eq!(parse_chat_response(Provider::Gemini, &gm).unwrap(), "d");
    }

    #[test]
    fn missing_key_is_an_error() {
        let err = build_chat_request(Provider::OpenAi, &[], &ChatOptions::default()).unwrap_err();
        assert!(err.to_string().contains("chave de API"));
    }
}
