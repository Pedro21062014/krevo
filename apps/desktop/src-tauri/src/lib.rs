//! Backend do app desktop Krevo (Tauri 2).
//!
//! Regra de ouro: **a interface é burra, o núcleo é Rust**. Tudo que toca rede,
//! disco, imagem ou PDF passa por aqui.
//!
//! Comandos expostos ao front-end:
//!
//! | comando | o que faz |
//! |---|---|
//! | `app_info` | versão, plataforma, recursos disponíveis |
//! | `ai_chat` | chama o provedor de IA escolhido (chave do usuário) |
//! | `design_system_prompt` | monta o prompt do agente para o tamanho da página |
//! | `design_demo_plan` | gera um layout local (offline, sem chave) |
//! | `design_parse_plan` | normaliza a resposta JSON do modelo |
//! | `unsplash_search` | busca fotos no Unsplash com a chave do usuário |
//! | `stock_local` | catálogo local de imagens (offline) |
//! | `export_pdf` | gera PDF vetorial com o motor em Rust |
//! | `save_project` / `load_project` | persiste o arquivo `.krevo` |
//! | `save_binary` | salva PNG/JPG/vídeo exportado pela interface |
//! | `read_media_base64` | embute mídia local no projeto |

use std::path::{Path, PathBuf};

use krevo_core::agent::{self, DesignPlan};
use krevo_core::ai::{self, ChatMessage, ChatOptions, Provider};
use krevo_core::model::{Brand, Project};
use krevo_core::unsplash::{self, Photo};
use serde::{Deserialize, Serialize};

const USER_AGENT: &str = concat!("Krevo/", env!("CARGO_PKG_VERSION"));

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: String,
    version: String,
    platform: String,
    arch: String,
    engine: String,
    pdf_engine: String,
    ai_providers: Vec<ProviderInfo>,
    offline: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderInfo {
    id: &'static str,
    model: &'static str,
    endpoint: &'static str,
    needs_key: bool,
    label: &'static str,
}

/// Lê o "Retry after Ns" que o Pollinations devolve no plano grátis.
fn free_limit_wait_ms(payload: &serde_json::Value) -> u64 {
    let message = payload
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .unwrap_or_default()
        .to_lowercase();
    let mut seconds: u64 = 10;
    if let Some(pos) = message.find("retry after") {
        let digits: String = message[pos + "retry after".len()..]
            .chars()
            .skip_while(|c| !c.is_ascii_digit())
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if let Ok(parsed) = digits.parse::<u64>() {
            seconds = parsed.clamp(1, 45);
        }
    }
    seconds * 1000 + 1200
}

#[tauri::command]
fn app_info() -> AppInfo {
    let providers = [
        Provider::Pollinations,
        Provider::OpenAi,
        Provider::Anthropic,
        Provider::Gemini,
        Provider::OpenRouter,
        Provider::Groq,
        Provider::Deepseek,
        Provider::Mistral,
        Provider::Ollama,
        Provider::Custom,
    ]
    .into_iter()
    .map(|p| ProviderInfo {
        id: p.id(),
        model: p.default_model(),
        endpoint: p.default_endpoint(),
        needs_key: p.needs_key(),
        label: p.label(),
    })
    .collect();

    AppInfo {
        name: "Krevo".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        platform: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        engine: format!("krevo-core {}", env!("CARGO_PKG_VERSION")),
        pdf_engine: "Rust nativo (printpdf) — vetorial, sem Chromium".into(),
        ai_providers: providers,
        offline: true,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiChatArgs {
    provider: String,
    api_key: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    messages: Vec<ChatMessage>,
    #[serde(default)]
    json_mode: bool,
    #[serde(default = "default_temp")]
    temperature: f32,
    #[serde(default = "default_tokens")]
    max_tokens: u32,
}

fn default_temp() -> f32 {
    0.7
}
fn default_tokens() -> u32 {
    4096
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChatResult {
    text: String,
    provider: String,
    model: String,
    ms: u128,
}

/// Chama qualquer provedor de IA com a chave do próprio usuário.
#[tauri::command]
async fn ai_chat(args: AiChatArgs) -> Result<AiChatResult, String> {
    let provider = Provider::from_id(&args.provider).map_err(|e| e.to_string())?;
    let opts = ChatOptions {
        model: args.model.clone().unwrap_or_default(),
        temperature: args.temperature,
        max_tokens: args.max_tokens,
        json_mode: args.json_mode,
        base_url: args.base_url.clone(),
        api_key: args.api_key.clone(),
    };
    let request = ai::build_chat_request(provider, &args.messages, &opts).map_err(|e| e.to_string())?;
    let model = request.body["model"].as_str().unwrap_or("").to_string();

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = client.post(&request.url);
    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }

    let started = std::time::Instant::now();

    // Alguns provedores gratuitos devolvem 429/5xx esporádicos e o Pollinations
    // retorna 402 enquanto o intervalo do plano grátis não passa: nos dois casos
    // esperamos e tentamos de novo antes de desistir.
    let mut attempt = 0;
    let (status, payload) = loop {
        attempt += 1;
        let response = match builder.try_clone().unwrap().json(&request.body).send().await {
            Ok(response) => response,
            Err(error) if attempt < 3 => {
                eprintln!("tentativa {attempt} falhou: {error}");
                tokio::time::sleep(std::time::Duration::from_millis(700 * attempt as u64)).await;
                continue;
            }
            Err(error) => {
                return Err(format!(
                    "Não consegui falar com o provedor ({error}). Verifique a conexão, a URL base ou se o Ollama está rodando."
                ))
            }
        };

        let status = response.status();
        let payload: serde_json::Value = response.json().await.unwrap_or(serde_json::Value::Null);
        let free_limit = status.as_u16() == 402;
        let transient = status.as_u16() == 429 || status.is_server_error();
        if (free_limit || transient) && attempt < 3 {
            let wait = if free_limit {
                free_limit_wait_ms(&payload)
            } else {
                900 * attempt as u64
            };
            tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
            continue;
        }
        break (status, payload);
    };

    if !status.is_success() {
        let message = payload
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .or_else(|| payload.get("error").and_then(|e| e.as_str()))
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("HTTP {status}"));
        let code = status.as_u16();
        let upper = message.to_uppercase();
        let friendly = if code == 402 || upper.contains("FREE LIMIT") || upper.contains("FREE_LIMIT") {
            "O plano grátis do Pollinations libera 1 resposta a cada 30 segundos. Aguarde um pouco e gere de novo — ou cole a sua chave em Ajustes → Agente de IA para uso sem limite.".to_string()
        } else if code == 429 {
            "O provedor está limitando as requisições. Espere alguns segundos, troque de provedor ou use a sua própria chave.".to_string()
        } else if code == 401 || code == 403 {
            "A chave foi recusada. Confira a chave, o modelo e a URL base em Ajustes → Agente de IA.".to_string()
        } else if code == 404 {
            "Modelo ou endpoint não encontrado. Confira o nome do modelo em Ajustes → Agente de IA.".to_string()
        } else if status.is_server_error() {
            format!("O provedor está instável (HTTP {code}). Tente de novo em instantes ou troque de provedor.")
        } else {
            format!("O provedor recusou o pedido: {message}")
        };
        return Err(friendly);
    }

    let text = ai::parse_chat_response(provider, &payload).map_err(|e| e.to_string())?;
    Ok(AiChatResult {
        text,
        provider: provider.id().into(),
        model,
        ms: started.elapsed().as_millis(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiTestResult {
    ok: bool,
    message: String,
    model: String,
    ms: u128,
}

/// Ping curto no provedor: valida chave, URL e modelo em ~1 segundo.
#[tauri::command]
async fn ai_test(args: AiChatArgs) -> AiTestResult {
    let started = std::time::Instant::now();
    let probe = AiChatArgs {
        messages: vec![ChatMessage::user(
            "Responda apenas com a palavra: ok",
        )],
        max_tokens: 12,
        temperature: 0.1,
        json_mode: false,
        ..args
    };
    match ai_chat(probe).await {
        Ok(result) => AiTestResult {
            ok: true,
            message: format!(
                "Conexão funcionando ({}) em {} ms.",
                if result.model.is_empty() { result.provider.clone() } else { result.model.clone() },
                result.ms
            ),
            model: result.model,
            ms: started.elapsed().as_millis(),
        },
        Err(message) => AiTestResult {
            ok: false,
            message,
            model: String::new(),
            ms: started.elapsed().as_millis(),
        },
    }
}

#[tauri::command]
fn design_system_prompt(width: f32, height: f32, brief: String, brand: Option<Brand>) -> String {
    agent::system_prompt(width, height, &brand.unwrap_or_default(), &brief)
}

#[tauri::command]
fn design_demo_plan(brief: String, width: f32, height: f32) -> DesignPlan {
    agent::demo_plan(&brief, width, height)
}

#[tauri::command]
fn design_parse_plan(raw: String) -> Result<DesignPlan, String> {
    agent::parse_plan(&raw).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PhotoSearch {
    photos: Vec<Photo>,
    provider: String,
    hint: String,
}

#[tauri::command]
async fn unsplash_search(
    query: String,
    page: Option<u32>,
    per_page: Option<u32>,
    orientation: Option<String>,
    access_key: Option<String>,
) -> Result<PhotoSearch, String> {
    let per_page = per_page.unwrap_or(24);
    let key = access_key.unwrap_or_default();
    if key.trim().is_empty() {
        // sem chave: entrega o catálogo local, sempre bonito e offline
        return Ok(PhotoSearch {
            photos: unsplash::local_catalog(&query),
            provider: "local".into(),
            hint: "Usando o acervo local do Krevo. Adicione sua chave do Unsplash em Ajustes → Imagens para buscar milhões de fotos.".into(),
        });
    }

    let url = unsplash::search_url(&query, page.unwrap_or(1), per_page, orientation.as_deref());
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .header("Authorization", format!("Client-ID {key}"))
        .header("Accept-Version", "v1")
        .send()
        .await
        .map_err(|e| format!("Falha ao consultar o Unsplash: {e}"))?;

    let status = response.status();
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Resposta inválida do Unsplash: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "Unsplash respondeu HTTP {status}. Confira se a chave é do tipo Access Key."
        ));
    }
    let photos = unsplash::parse_search_response(&value).map_err(|e| e.to_string())?;
    Ok(PhotoSearch {
        photos,
        provider: "unsplash".into(),
        hint: "Fotos do Unsplash — lembre-se de manter o crédito do autor.".into(),
    })
}

#[tauri::command]
fn stock_local(query: String) -> Vec<Photo> {
    unsplash::local_catalog(&query)
}

fn ensure_parent(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    Ok(p)
}

/// Exporta o projeto para PDF vetorial usando o motor em Rust.
#[tauri::command]
fn export_pdf(project: serde_json::Value, path: String) -> Result<String, String> {
    let project: Project =
        serde_json::from_value(project).map_err(|e| format!("Projeto inválido: {e}"))?;
    let bytes = krevo_core::pdf::render_pdf(&project).map_err(|e| e.to_string())?;
    let target = ensure_parent(&path)?;
    std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn save_project(project: serde_json::Value, path: String) -> Result<String, String> {
    let project: Project =
        serde_json::from_value(project).map_err(|e| format!("Projeto inválido: {e}"))?;
    let json = project.to_json().map_err(|e| e.to_string())?;
    let target = ensure_parent(&path)?;
    std::fs::write(&target, json).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn load_project(path: String) -> Result<serde_json::Value, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Não abriu {path}: {e}"))?;
    let project = Project::from_json(&raw).map_err(|e| e.to_string())?;
    serde_json::to_value(project).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BinaryPayload {
    path: String,
    /// base64 puro ou data-URL.
    data: String,
}

#[tauri::command]
fn save_binary(payload: BinaryPayload) -> Result<String, String> {
    use base64::Engine;
    let data = payload
        .data
        .split_once(',')
        .map(|(_, d)| d.to_string())
        .unwrap_or(payload.data);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| format!("base64 inválido: {e}"))?;
    let target = ensure_parent(&payload.path)?;
    std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

/// Lê um arquivo de mídia local e devolve um data-URL para embutir no projeto.
#[tauri::command]
fn read_media_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let p = Path::new(&path);
    let bytes = std::fs::read(p).map_err(|e| format!("Não abriu {path}: {e}"))?;
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        _ => "image/png",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn project_stats(project: serde_json::Value) -> Result<serde_json::Value, String> {
    let project: Project = serde_json::from_value(project).map_err(|e| e.to_string())?;
    let mut images = 0;
    let mut texts = 0;
    for page in &project.pages {
        for el in &page.elements {
            match el.kind {
                krevo_core::ElementKind::Image | krevo_core::ElementKind::Video => images += 1,
                krevo_core::ElementKind::Text => texts += 1,
                _ => {}
            }
        }
    }
    Ok(serde_json::json!({
        "pages": project.pages.len(),
        "elements": project.element_count(),
        "images": images,
        "texts": texts,
        "version": project.version,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            ai_chat,
            ai_test,
            design_system_prompt,
            design_demo_plan,
            design_parse_plan,
            unsplash_search,
            stock_local,
            export_pdf,
            save_project,
            load_project,
            save_binary,
            read_media_base64,
            project_stats,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Krevo");
}
