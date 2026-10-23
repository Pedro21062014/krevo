//! O agente de design do Krevo.
//!
//! A IA responde com um **plano de design** em JSON (não com código): uma lista
//! de elementos posicionados na página. Este módulo:
//!
//! 1. monta o *system prompt* com as regras do editor e o grid da página;
//! 2. lê a resposta (JSON puro, cercado por ```, ou embutido em texto);
//! 3. gera planos locais de demonstração quando o usuário ainda não conectou
//!    a chave de API (modo offline).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{Error, Result};
use crate::model::{Brand, Fill, LinearGradient, GradientStop, TextAlign};
use crate::theme;

/// Um elemento pedido pela IA.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesignNode {
    /// `text` | `rect` | `ellipse` | `line` | `image` | `icon`
    #[serde(rename = "type")]
    pub kind: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub font_size: Option<f32>,
    #[serde(default)]
    pub font_weight: Option<u32>,
    #[serde(default)]
    pub line_height: Option<f32>,
    #[serde(default)]
    pub align: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub radius: Option<f32>,
    #[serde(default)]
    pub opacity: Option<f32>,
    #[serde(default)]
    pub rotation: Option<f32>,
    #[serde(default)]
    pub stroke: Option<String>,
    #[serde(default)]
    pub src: Option<String>,
    #[serde(default)]
    pub fit: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

/// Resposta completa do agente para uma página.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesignPlan {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub rationale: String,
    #[serde(default)]
    pub background: Option<Fill>,
    #[serde(default)]
    pub palette: Vec<String>,
    #[serde(default)]
    pub elements: Vec<DesignNode>,
}

/// Extrai o objeto JSON de uma resposta que pode vir com cercas de código
/// ou com texto explicativo em volta.
pub fn extract_json(text: &str) -> Result<Value> {
    let trimmed = text.trim();
    let candidates = [
        trimmed.to_string(),
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .to_string(),
        match (trimmed.find('{'), trimmed.rfind('}')) {
            (Some(a), Some(b)) if b > a => trimmed[a..=b].to_string(),
            _ => String::new(),
        },
    ];
    for candidate in candidates {
        if candidate.trim().is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(candidate.trim()) {
            return Ok(v);
        }
    }
    Err(Error::Other(
        "A IA não devolveu um JSON de design válido. Tente reformular o pedido.".into(),
    ))
}

/// Lê a resposta do modelo como um [`DesignPlan`].
pub fn parse_plan(text: &str) -> Result<DesignPlan> {
    let value = extract_json(text)?;
    let node = value.get("design").cloned().unwrap_or(value);
    let mut plan: DesignPlan = serde_json::from_value(node)?;
    if plan.elements.is_empty() {
        return Err(Error::Other("O plano veio sem elementos.".into()));
    }
    for el in &mut plan.elements {
        let k = el.kind.to_ascii_lowercase();
        el.kind = match k.as_str() {
            "text" | "texto" => "text",
            "rect" | "rectangle" | "retangulo" | "shape" | "forma" => "rect",
            "ellipse" | "circle" | "circulo" => "ellipse",
            "line" | "linha" => "line",
            "image" | "imagem" | "photo" | "foto" => "image",
            "icon" | "icone" => "icon",
            _ => "rect",
        }
        .to_string();
    }
    Ok(plan)
}

/// System prompt com o contrato do editor. É aqui que o agente aprende a
/// "pensar como designer" dentro das nossas coordenadas.
pub fn system_prompt(width: f32, height: f32, brand: &Brand, brief: &str) -> String {
    let palette = brand.palette.join(", ");
    let margin = (width.min(height) * 0.07).round();
    let title_size = (height * 0.085).round().clamp(36.0, 120.0);
    format!(
        r##"Você é o Agente Krevo: diretor de arte sênior que desenha dentro de um editor de
design vetorial. Você NÃO escreve código nem CSS — você posiciona elementos.

SAÍDA: um único objeto JSON válido. Sem markdown, sem comentários, sem texto fora do JSON.

A página tem {w} x {h} px (origem no canto superior esquerdo, y cresce para baixo).
Margem segura: {m}px em todos os lados. Nada pode cruzar essa margem.

Formato exato:
{{
  "title": "nome curto do design",
  "rationale": "1 frase explicando a decisão de design",
  "background": "#RRGGBB" ou {{"angle":135,"stops":[{{"offset":0,"color":"#111111"}},{{"offset":1,"color":"#1E2A44"}}]}},
  "palette": ["#hex", "#hex", "#hex"],
  "elements": [
    {{"type":"text","x":{m},"y":260,"w":900,"h":200,"content":"Título","fontSize":{ts},"fontWeight":700,"lineHeight":1.05,"color":"#F5F5F3","align":"left"}},
    {{"type":"rect","x":{m},"y":200,"w":72,"h":6,"fill":"#34D39F","radius":3}},
    {{"type":"image","x":960,"y":0,"w":320,"h":{h},"src":"unsplash:abstract","fit":"cover"}}
  ]
}}

Chaves permitidas em cada elemento: type, x, y, w, h, content, fontSize, fontWeight,
lineHeight, align, color, fill, radius, opacity, rotation, stroke, src, fit.
type aceita: text | rect | ellipse | line | image | icon.

REGRA DE OURO — entregue um design COMPLETO, nunca um rascunho:
- Mínimo 8 e máximo 14 elementos. Um único texto é considerado resposta inválida.
- Sempre inclua, no mínimo: (1) fundo definido em "background", (2) título grande
  ({ts}px ou mais), (3) subtítulo de 20-30px, (4) uma linha de apoio ou dado,
  (5) um detalhe gráfico da marca (barra, filete ou selo) e (6) uma imagem ou
  forma geométrica que dê profundidade à composição.
- Hierarquia: título {ts}px · subtítulo 24-30px · corpo 16-18px · rodapé 12-14px.
- Contraste AA obrigatório: texto claro sobre fundo escuro ou vice-versa.
- Se usar imagem, aplique scrim (retângulo semi-transparente, opacity 0.25-0.6)
  entre a foto e o texto para manter a leitura.
- Alinhe à esquerda por padrão; centro só em capas simétricas.
- Coordenadas inteiras, dentro de 0..{w} e 0..{h}. Não empilhe elementos por acidente.
- Máximo 3 famílias de cor + neutros. Paleta da marca: {palette}.
- Imagens: use src "unsplash:termo em inglês" (ex.: "unsplash:minimal architecture").
- Escreva o conteúdo no idioma do briefing (português, se for português).
- Nada de Lorem ipsum, nada de "seu texto aqui": escreva copy real e específica.
- Responda o JSON em uma única linha, compacto (sem indentação), para caber inteiro.
- Entregue a peça final. Não faça perguntas, não peça confirmação.

Checklist antes de responder: o JSON é válido? tem 8+ elementos? o título está
grande? o fundo está definido? nada saiu da margem? o texto tem contraste?

Briefing do usuário: {brief}"##,
        w = width.round() as i64,
        h = height.round() as i64,
        m = margin as i64,
        ts = title_size as i64,
        palette = palette,
        brief = if brief.trim().is_empty() { "(livre — proponha algo sofisticado)" } else { brief }
    )
}

/// Converte o plano em chamadas de ferramenta legíveis para o histórico do chat.
pub fn plan_summary(plan: &DesignPlan) -> String {
    let mut counts = std::collections::BTreeMap::new();
    for el in &plan.elements {
        *counts.entry(el.kind.clone()).or_insert(0) += 1;
    }
    let parts: Vec<String> = counts
        .iter()
        .map(|(k, v)| format!("{v}× {k}"))
        .collect();
    let title = if plan.title.is_empty() {
        "Design gerado".to_string()
    } else {
        plan.title.clone()
    };
    format!("{} — {}", title, parts.join(", "))
}

/// Gerador local (modo demo / offline). Produz um layout decente a partir do
/// briefing sem chamar nenhum provedor.
pub fn demo_plan(brief: &str, width: f32, height: f32) -> DesignPlan {
    let theme = theme::pick_for(brief, width, height);
    let m = (width.min(height) * 0.08).round();
    let is_portrait = height > width;
    let title_size = if is_portrait { width * 0.105 } else { height * 0.115 };
    let title = headline_from(brief);
    let subtitle = if brief.trim().is_empty() {
        "Um design gerado pelo agente do Krevo".to_string()
    } else {
        format!("Gerado a partir de: {}", brief.trim())
    };

    let mut elements = vec![
        DesignNode {
            kind: "rect".into(),
            x: m,
            y: m,
            w: title_size * 0.6,
            h: 6.0,
            content: String::new(),
            font_size: None,
            font_weight: None,
            line_height: None,
            align: None,
            color: None,
            fill: Some(theme.accent.clone()),
            radius: Some(3.0),
            opacity: None,
            rotation: None,
            stroke: None,
            src: None,
            fit: None,
            name: Some("Detalhe de marca".into()),
        },
        DesignNode {
            kind: "text".into(),
            x: m,
            y: height * 0.3,
            w: width - m * 2.0,
            h: title_size * 2.6,
            content: title.clone(),
            font_size: Some(title_size),
            font_weight: Some(700),
            line_height: Some(1.02),
            align: Some("left".into()),
            color: Some(theme.on_bg.clone()),
            fill: None,
            radius: None,
            opacity: None,
            rotation: None,
            stroke: None,
            src: None,
            fit: None,
            name: Some("Título".into()),
        },
        DesignNode {
            kind: "text".into(),
            x: m,
            y: height * 0.3 + title_size * 2.9,
            w: width * 0.52,
            h: title_size * 1.2,
            content: subtitle,
            font_size: Some(title_size * 0.3),
            font_weight: Some(400),
            line_height: Some(1.35),
            align: Some("left".into()),
            color: Some(theme.muted.clone()),
            fill: None,
            radius: None,
            opacity: None,
            rotation: None,
            stroke: None,
            src: None,
            fit: None,
            name: Some("Apoio".into()),
        },
        DesignNode {
            kind: "rect".into(),
            x: m,
            y: height * 0.3 + title_size * 4.4,
            w: width * 0.26,
            h: title_size * 0.9,
            content: String::new(),
            font_size: None,
            font_weight: None,
            line_height: None,
            align: None,
            color: None,
            fill: Some(theme.accent.clone()),
            radius: Some(title_size * 0.45),
            opacity: None,
            rotation: None,
            stroke: None,
            src: None,
            fit: None,
            name: Some("Botão".into()),
        },
        DesignNode {
            kind: "ellipse".into(),
            x: width - m - title_size * 2.0,
            y: height * 0.5,
            w: title_size * 2.4,
            h: title_size * 2.4,
            content: String::new(),
            font_size: None,
            font_weight: None,
            line_height: None,
            align: None,
            color: None,
            fill: Some(theme.accent_2.clone()),
            radius: None,
            opacity: Some(0.55),
            rotation: None,
            stroke: None,
            src: None,
            fit: None,
            name: Some("Ornamento".into()),
        },
    ];

    if !is_portrait {
        elements.push(DesignNode {
            kind: "image".into(),
            x: width * 0.62,
            y: 0.0,
            w: width * 0.38,
            h: height,
            content: String::new(),
            font_size: None,
            font_weight: None,
            line_height: None,
            align: None,
            color: None,
            fill: None,
            radius: None,
            opacity: Some(0.9),
            rotation: None,
            stroke: None,
            src: Some(format!("unsplash:{}", theme.photo_query)),
            fit: Some("cover".into()),
            name: Some("Imagem".into()),
        });
    }

    DesignPlan {
        title: title.replace('\n', " "),
        rationale: "Composição em dois pesos: título dominante, apoio curto e um gesto de cor da marca."
            .into(),
        background: Some(Fill::Linear(LinearGradient {
            angle: 135.0,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: theme.bg.clone(),
                },
                GradientStop {
                    offset: 1.0,
                    color: theme.bg_2.clone(),
                },
            ],
        })),
        palette: vec![theme.bg, theme.accent, theme.accent_2, theme.on_bg],
        elements,
    }
}

/// Transforma o briefing em um título curto e vendável.
fn headline_from(brief: &str) -> String {
    let clean = brief.trim().trim_matches(|c: char| !c.is_alphanumeric() && c != ' ');
    if clean.is_empty() {
        return "Ideias que\nviram forma.".into();
    }
    let words: Vec<&str> = clean.split_whitespace().collect();
    let take = words.len().min(6);
    let head = words[..take].join(" ");
    if take < words.len() {
        format!("{}.", capitalize(&head))
    } else {
        capitalize(&head)
    }
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// Ajuda a IA a respeitar alinhamento textual.
pub fn align_from(value: Option<&String>) -> TextAlign {
    match value.map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("center") | Some("centro") => TextAlign::Center,
        Some("right") | Some("direita") => TextAlign::Right,
        _ => TextAlign::Left,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_json() {
        let v = extract_json(r#"{"a":1}"#).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn extracts_fenced_json() {
        let raw = "Claro! Aqui está:\n```json\n{\"elements\":[{\"type\":\"text\",\"x\":0,\"y\":0,\"w\":10,\"h\":10}]}\n```\nBons estudos!";
        let plan = parse_plan(raw).unwrap();
        assert_eq!(plan.elements.len(), 1);
        assert_eq!(plan.elements[0].kind, "text");
    }

    #[test]
    fn normalizes_portuguese_kinds() {
        let raw = r#"{"elements":[{"type":"Texto","x":0,"y":0,"w":10,"h":10},{"type":"Imagem","x":0,"y":0,"w":1,"h":1}]}"#;
        let plan = parse_plan(raw).unwrap();
        assert_eq!(plan.elements[0].kind, "text");
        assert_eq!(plan.elements[1].kind, "image");
    }

    #[test]
    fn empty_plan_is_rejected() {
        assert!(parse_plan(r#"{"elements":[]}"#).is_err());
    }

    #[test]
    fn demo_plan_stays_inside_the_page() {
        let plan = demo_plan("lançamento do app de finanças", 1080.0, 1080.0);
        assert!(plan.elements.len() >= 4);
        for el in &plan.elements {
            assert!(el.x >= 0.0 && el.x + el.w <= 1080.0 + 1.0, "x fora: {el:?}");
            assert!(el.y >= 0.0 && el.y + el.h <= 1080.0 + 1.0, "y fora: {el:?}");
        }
    }

    #[test]
    fn system_prompt_mentions_page_size() {
        let p = system_prompt(1280.0, 720.0, &Brand::default(), "crie um deck");
        assert!(p.contains("1280 x 720"));
        assert!(p.contains("crie um deck"));
        assert!(p.contains("JSON"));
    }

    #[test]
    fn summary_counts_kinds() {
        let plan = demo_plan("x", 800.0, 600.0);
        let s = plan_summary(&plan);
        assert!(s.contains("text"));
    }
}
