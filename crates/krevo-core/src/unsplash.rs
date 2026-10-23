//! Banco de imagens do editor.
//!
//! Suporta o Unsplash (chave do próprio usuário, plano gratuito) e um catálogo
//! local determinístico para o app funcionar 100% offline.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{Error, Result};

/// Foto normalizada — o front-end não precisa saber de qual fonte veio.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: String,
    pub description: String,
    pub thumb: String,
    pub regular: String,
    pub full: String,
    pub author: String,
    pub author_url: String,
    pub link: String,
    pub color: String,
    pub width: u32,
    pub height: u32,
    pub provider: String,
}

/// Monta a URL de busca do Unsplash.
pub fn search_url(query: &str, page: u32, per_page: u32, orientation: Option<&str>) -> String {
    let q = urlencode(query.trim());
    let mut url = format!(
        "https://api.unsplash.com/search/photos?query={}&page={}&per_page={}&content_filter=high",
        q,
        page.max(1),
        per_page.clamp(1, 30)
    );
    if let Some(o) = orientation {
        if !o.is_empty() && o != "all" {
            url.push_str(&format!("&orientation={}", urlencode(o)));
        }
    }
    url
}

/// Converte o JSON do Unsplash no nosso formato.
pub fn parse_search_response(value: &Value) -> Result<Vec<Photo>> {
    if let Some(errors) = value.get("errors").and_then(|e| e.as_array()) {
        if let Some(first) = errors.first().and_then(|e| e.as_str()) {
            return Err(Error::Other(format!("Unsplash: {first}")));
        }
    }
    let results = value
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or_else(|| Error::Other("Resposta inesperada do Unsplash.".into()))?;

    Ok(results.iter().filter_map(parse_photo).collect())
}

fn parse_photo(v: &Value) -> Option<Photo> {
    let urls = v.get("urls")?;
    let user = v.get("user");
    Some(Photo {
        id: v.get("id").and_then(|s| s.as_str()).unwrap_or_default().to_string(),
        description: v
            .get("alt_description")
            .or_else(|| v.get("description"))
            .and_then(|s| s.as_str())
            .unwrap_or("Imagem do Unsplash")
            .to_string(),
        thumb: urls.get("small").and_then(|s| s.as_str()).unwrap_or_default().to_string(),
        regular: urls.get("regular").and_then(|s| s.as_str()).unwrap_or_default().to_string(),
        full: urls.get("full").and_then(|s| s.as_str()).unwrap_or_default().to_string(),
        author: user
            .and_then(|u| u.get("name"))
            .and_then(|s| s.as_str())
            .unwrap_or("Unsplash")
            .to_string(),
        author_url: user
            .and_then(|u| u.get("links"))
            .and_then(|l| l.get("html"))
            .and_then(|s| s.as_str())
            .unwrap_or("https://unsplash.com")
            .to_string(),
        link: v
            .get("links")
            .and_then(|l| l.get("html"))
            .and_then(|s| s.as_str())
            .unwrap_or("https://unsplash.com")
            .to_string(),
        color: v.get("color").and_then(|s| s.as_str()).unwrap_or("#141414").to_string(),
        width: v.get("width").and_then(|n| n.as_u64()).unwrap_or(0) as u32,
        height: v.get("height").and_then(|n| n.as_u64()).unwrap_or(0) as u32,
        provider: "unsplash".into(),
    })
}

/// Catálogo local: sempre disponível, sem chave e sem rede.
pub fn local_catalog(query: &str) -> Vec<Photo> {
    let terms: Vec<&str> = [
        "abstract", "gradient", "texture", "office", "nature", "city", "people", "product",
        "technology", "architecture", "food", "travel", "gradient mesh", "3d shapes",
    ]
    .to_vec();

    let q = query.trim().to_lowercase();
    let filtered: Vec<&str> = if q.is_empty() {
        terms.clone()
    } else {
        let hits: Vec<&str> = terms.iter().copied().filter(|t| t.contains(&q) || q.contains(t)).collect();
        if hits.is_empty() {
            terms.clone()
        } else {
            hits
        }
    };

    filtered
        .iter()
        .enumerate()
        .map(|(i, term)| {
            let (c1, c2) = palette_for(term, i);
            Photo {
                id: format!("local-{}-{}", slug(term), i),
                description: format!("{term} (gerado localmente)"),
                // SVG inline como "imagem": funciona offline e imprime nítido.
                thumb: svg_placeholder(term, &c1, &c2, 480, 320),
                regular: svg_placeholder(term, &c1, &c2, 1280, 853),
                full: svg_placeholder(term, &c1, &c2, 1920, 1280),
                author: "Krevo".into(),
                author_url: "https://github.com/Pedro21062014/krevo".into(),
                link: String::new(),
                color: c1,
                width: 1920,
                height: 1280,
                provider: "local".into(),
            }
        })
        .collect()
}

fn slug(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect()
}

fn palette_for(term: &str, i: usize) -> (String, String) {
    let palettes = [
        ("#6C5CE7", "#00D4B8"),
        ("#FF6B35", "#FFC857"),
        ("#0B2C46", "#22A7F0"),
        ("#2A9D8F", "#E9C46A"),
        ("#F72585", "#4361EE"),
        ("#111214", "#F5A524"),
    ];
    let (a, b) = palettes[(i + term.len()) % palettes.len()];
    (a.to_string(), b.to_string())
}

/// SVG em data-URI (não depende de rede nem de binário no repositório).
pub fn svg_placeholder(label: &str, c1: &str, c2: &str, w: u32, h: u32) -> String {
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.14"/></feComponentTransfer></filter></defs><rect width="{w}" height="{h}" fill="url(#g)"/><rect width="{w}" height="{h}" filter="url(#n)" opacity="0.5"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff" opacity="0.16"/><text x="{tx}" y="{ty}" font-family="Inter,Segoe UI,sans-serif" font-size="{fs}" fill="#fff" opacity="0.85" text-anchor="middle">{label}</text></svg>"##,
        w = w,
        h = h,
        c1 = c1,
        c2 = c2,
        cx = (w as f32 * 0.78) as u32,
        cy = (h as f32 * 0.22) as u32,
        r = (w.min(h) as f32 * 0.22) as u32,
        tx = w / 2,
        ty = h / 2,
        fs = (w.min(h) as f32 * 0.075).max(14.0) as u32,
        label = label
    );
    let encoded = percent_encode(&svg);
    format!("data:image/svg+xml;charset=utf-8,{}", encoded)
}

fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'!' | b'*'
            | b'\'' | b'(' | b')' => out.push(*b as char),
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_has_query_and_paging() {
        let u = search_url("noite estrelada", 2, 24, Some("landscape"));
        assert!(u.contains("query=noite%20estrelada"));
        assert!(u.contains("page=2"));
        assert!(u.contains("per_page=24"));
        assert!(u.contains("orientation=landscape"));
    }

    #[test]
    fn parses_unsplash_payload() {
        let v: Value = serde_json::from_str(
            r##"{"results":[{"id":"abc","alt_description":"uma ponte","urls":{"small":"s","regular":"r","full":"f"},"user":{"name":"Ana","links":{"html":"https://u/ana"}},"links":{"html":"https://u/p"},"color":"#123456","width":4000,"height":3000}]}"##,
        )
        .unwrap();
        let photos = parse_search_response(&v).unwrap();
        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].author, "Ana");
        assert_eq!(photos[0].provider, "unsplash");
    }

    #[test]
    fn surfaces_api_errors() {
        let v: Value = serde_json::from_str(r#"{"errors":["OAuth error: invalid token"]}"#).unwrap();
        assert!(parse_search_response(&v).unwrap_err().to_string().contains("OAuth"));
    }

    #[test]
    fn local_catalog_works_offline() {
        let photos = local_catalog("natureza");
        assert!(!photos.is_empty());
        assert!(photos[0].thumb.starts_with("data:image/svg+xml"));
    }
}
