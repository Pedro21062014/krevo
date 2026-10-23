//! Modelo de documento do Krevo.
//!
//! O arquivo `.krevo` é um JSON versionado. Tudo aqui usa `camelCase` para
//! conversar com o front-end TypeScript sem tradução.

use serde::{Deserialize, Serialize};

use crate::FORMAT_VERSION;

/// Um projeto completo (documento, deck, post, vídeo…).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    #[serde(default = "new_id")]
    pub id: String,
    #[serde(default = "default_name")]
    pub name: String,
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub brand: Brand,
    #[serde(default)]
    pub pages: Vec<Page>,
}

fn default_version() -> u32 {
    FORMAT_VERSION
}
fn default_name() -> String {
    "Sem título".into()
}

/// Identidade visual reaproveitada pela IA e pelos templates.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Brand {
    pub palette: Vec<String>,
    pub font_heading: String,
    pub font_body: String,
}

impl Default for Brand {
    fn default() -> Self {
        Self {
            palette: vec![
                "#0B1020".into(),
                "#6C5CE7".into(),
                "#00D4B8".into(),
                "#F6C177".into(),
                "#F7F7FB".into(),
            ],
            font_heading: "Inter".into(),
            font_body: "Inter".into(),
        }
    }
}

/// Uma página / slide / frame de vídeo.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    #[serde(default = "new_id")]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub background: Option<Fill>,
    #[serde(default)]
    pub elements: Vec<Element>,
}

/// Tipos de elemento suportados pelo editor.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ElementKind {
    Text,
    Rect,
    Ellipse,
    Line,
    Image,
    Video,
    Icon,
    Frame,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Element {
    #[serde(default = "new_id")]
    pub id: String,
    pub kind: ElementKind,
    #[serde(default)]
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "one")]
    pub opacity: f32,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub fill: Option<Fill>,
    #[serde(default)]
    pub stroke: Option<Stroke>,
    #[serde(default)]
    pub radius: f32,
    #[serde(default)]
    pub shadow: Option<Shadow>,
    #[serde(default)]
    pub text: Option<TextProps>,
    /// Data-URL (`data:image/png;base64,…`) ou caminho absoluto da mídia.
    #[serde(default)]
    pub src: Option<String>,
    #[serde(default)]
    pub fit: Option<ImageFit>,
}

fn one() -> f32 {
    1.0
}

/// Preenchimento: cor sólida (`"#RRGGBB"`) ou gradiente linear.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Fill {
    Color(String),
    Linear(LinearGradient),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LinearGradient {
    /// 0 = esquerda→direita, 90 = topo→base.
    pub angle: f32,
    pub stops: Vec<GradientStop>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GradientStop {
    pub offset: f32,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stroke {
    pub color: String,
    #[serde(default = "default_stroke_width")]
    pub width: f32,
}

fn default_stroke_width() -> f32 {
    2.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Shadow {
    pub color: String,
    #[serde(default = "default_blur")]
    pub blur: f32,
    #[serde(default)]
    pub x: f32,
    #[serde(default = "default_shadow_y")]
    pub y: f32,
}

fn default_blur() -> f32 {
    24.0
}
fn default_shadow_y() -> f32 {
    8.0
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ImageFit {
    #[default]
    Cover,
    Contain,
    Fill,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    #[default]
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextProps {
    pub content: String,
    #[serde(default = "default_font")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    #[serde(default = "default_weight")]
    pub font_weight: u32,
    #[serde(default = "default_line_height")]
    pub line_height: f32,
    #[serde(default)]
    pub letter_spacing: f32,
    #[serde(default)]
    pub align: TextAlign,
    #[serde(default = "default_text_color")]
    pub color: String,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
}

fn default_font() -> String {
    "Inter".into()
}
fn default_font_size() -> f32 {
    48.0
}
fn default_weight() -> u32 {
    600
}
fn default_line_height() -> f32 {
    1.2
}
fn default_text_color() -> String {
    "#0B1020".into()
}

/// Marca padrão do Krevo (atalho para `Brand::default()`).
pub fn brand_with(palette: Vec<String>) -> Brand {
    Brand {
        palette,
        ..Brand::default()
    }
}

pub fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    // sufixo pseudo-aleatorio simples (xorshift) para evitar colisões
    let mut x = (nanos as u64) ^ 0x9E37_79B9_7F4A_7C15;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    format!("el_{:x}{:x}", nanos, x & 0xffff_ffff)
}

impl Project {
    /// Cria um projeto vazio com uma página no formato pedido (em px @96dpi).
    pub fn blank(name: &str, width: f32, height: f32) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: new_id(),
            name: name.into(),
            version: FORMAT_VERSION,
            created_at: now.clone(),
            updated_at: now,
            brand: Brand::default(),
            pages: vec![Page {
                id: new_id(),
                name: "Página 1".into(),
                width,
                height,
                background: Some(Fill::Color("#0B1020".into())),
                elements: vec![],
            }],
        }
    }

    /// Projeto de demonstração usado em testes e no `cargo run --example`.
    pub fn demo() -> Self {
        let mut p = Self::blank("Krevo Demo", 1280.0, 720.0);
        let page = &mut p.pages[0];
        page.background = Some(Fill::Linear(LinearGradient {
            angle: 135.0,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: "#0B1020".into(),
                },
                GradientStop {
                    offset: 1.0,
                    color: "#241B4D".into(),
                },
            ],
        }));
        page.elements.push(Element {
            id: new_id(),
            kind: ElementKind::Text,
            name: "Título".into(),
            x: 96.0,
            y: 180.0,
            w: 720.0,
            h: 160.0,
            rotation: 0.0,
            opacity: 1.0,
            locked: false,
            hidden: false,
            fill: None,
            stroke: None,
            radius: 0.0,
            shadow: None,
            text: Some(TextProps {
                content: "Crie tudo.\nEm um só lugar.".into(),
                font_family: "Inter".into(),
                font_size: 76.0,
                font_weight: 700,
                line_height: 1.05,
                letter_spacing: -1.0,
                align: TextAlign::Left,
                color: "#F7F7FB".into(),
                italic: false,
                underline: false,
            }),
            src: None,
            fit: None,
        });
        page.elements.push(Element {
            id: new_id(),
            kind: ElementKind::Rect,
            name: "Botão".into(),
            x: 96.0,
            y: 430.0,
            w: 260.0,
            h: 64.0,
            rotation: 0.0,
            opacity: 1.0,
            locked: false,
            hidden: false,
            fill: Some(Fill::Color("#6C5CE7".into())),
            stroke: None,
            radius: 32.0,
            shadow: Some(Shadow {
                color: "rgba(0,0,0,0.35)".into(),
                blur: 30.0,
                x: 0.0,
                y: 12.0,
            }),
            text: None,
            src: None,
            fit: None,
        });
        p
    }

    /// Serializa respeitando o wrapper `{ version, project }`.
    pub fn to_json(&self) -> crate::Result<String> {
        Ok(serde_json::to_string_pretty(&serde_json::json!({
            "format": "krevo",
            "version": FORMAT_VERSION,
            "project": self,
        }))?)
    }

    /// Lê um arquivo `.krevo` (aceita também o projeto "cru", sem wrapper).
    pub fn from_json(raw: &str) -> crate::Result<Self> {
        let value: serde_json::Value = serde_json::from_str(raw)?;
        let project = value.get("project").cloned().unwrap_or(value);
        Ok(serde_json::from_value(project)?)
    }

    /// Todos os elementos de todas as páginas (útil para contagens/estatísticas).
    pub fn element_count(&self) -> usize {
        self.pages.iter().map(|p| p.elements.len()).sum()
    }
}

impl Page {
    pub fn new(name: &str, width: f32, height: f32) -> Self {
        Self {
            id: new_id(),
            name: name.into(),
            width,
            height,
            background: Some(Fill::Color("#FFFFFF".into())),
            elements: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_json() {
        let p = Project::demo();
        let json = p.to_json().unwrap();
        assert!(json.contains("\"format\": \"krevo\""));
        let back = Project::from_json(&json).unwrap();
        assert_eq!(back.pages.len(), 1);
        assert_eq!(back.element_count(), 2);
        assert_eq!(back.pages[0].elements[0].kind, ElementKind::Text);
    }

    #[test]
    fn reads_bare_project() {
        let raw = r#"{"name":"x","pages":[{"width":100,"height":100,"elements":[]}]}"#;
        let p = Project::from_json(raw).unwrap();
        assert_eq!(p.name, "x");
        assert_eq!(p.pages[0].width, 100.0);
    }

    #[test]
    fn fill_is_untagged() {
        let solid: Fill = serde_json::from_str("\"#ff0000\"").unwrap();
        assert!(matches!(solid, Fill::Color(_)));
        let grad: Fill =
            serde_json::from_str(r##"{"angle":45,"stops":[{"offset":0,"color":"#fff"}]}"##).unwrap();
        assert!(matches!(grad, Fill::Linear(_)));
    }
}
