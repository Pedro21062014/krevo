//! Paletas curadas usadas pelos templates e pelo agente.
//!
//! A ideia é simples: nenhuma sugestão de IA deve nascer feia. O agente escolhe
//! entre paletas que já passaram por revisão de contraste.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Theme {
    pub id: &'static str,
    pub name: &'static str,
    pub bg: String,
    pub bg_2: String,
    pub on_bg: String,
    pub muted: String,
    pub accent: String,
    pub accent_2: String,
    pub photo_query: &'static str,
}

macro_rules! theme {
    ($id:expr, $name:expr, $bg:expr, $bg2:expr, $fg:expr, $muted:expr, $a1:expr, $a2:expr, $photo:expr) => {
        Theme {
            id: $id,
            name: $name,
            bg: $bg.into(),
            bg_2: $bg2.into(),
            on_bg: $fg.into(),
            muted: $muted.into(),
            accent: $a1.into(),
            accent_2: $a2.into(),
            photo_query: $photo,
        }
    };
}

fn built() -> &'static [Theme] {
    use std::sync::OnceLock;
    static CELL: OnceLock<Vec<Theme>> = OnceLock::new();
    CELL.get_or_init(|| {
        vec![
            theme!(
                "meia-noite",
                "Meia-noite",
                "#0B1020",
                "#241B4D",
                "#F7F7FB",
                "#B9B7D6",
                "#6C5CE7",
                "#00D4B8",
                "abstract night gradient"
            ),
            theme!(
                "papel",
                "Papel",
                "#FAF7F2",
                "#EFE7DC",
                "#1A1714",
                "#6B6259",
                "#E4572E",
                "#2A9D8F",
                "paper texture still life"
            ),
            theme!(
                "menta",
                "Menta",
                "#06231F",
                "#0E3B33",
                "#ECFFF8",
                "#9FD8C8",
                "#3ED598",
                "#F2C14E",
                "green leaves minimal"
            ),
            theme!(
                "vulcao",
                "Vulcão",
                "#160B0B",
                "#3A1414",
                "#FFF3EC",
                "#D8B4A6",
                "#FF6B35",
                "#FFC857",
                "lava texture dark"
            ),
            theme!(
                "algodao",
                "Algodão",
                "#F4F6FF",
                "#E4E9FF",
                "#101433",
                "#5A5F86",
                "#4361EE",
                "#F72585",
                "soft pastel studio"
            ),
            theme!(
                "grafite",
                "Grafite",
                "#111214",
                "#22252B",
                "#F2F3F5",
                "#9AA0A6",
                "#F5A524",
                "#38BDF8",
                "concrete architecture minimal"
            ),
            theme!(
                "coral",
                "Coral",
                "#1B0F1A",
                "#4A1B33",
                "#FFF1F4",
                "#E7B6C6",
                "#FF5D8F",
                "#FFD166",
                "coral reef abstract"
            ),
            theme!(
                "oceano",
                "Oceano",
                "#04121F",
                "#0B2C46",
                "#EAF6FF",
                "#9EC5DE",
                "#22A7F0",
                "#7BD389",
                "ocean waves aerial"
            ),
        ]
    })
}

/// Todas as paletas curadas.
pub fn themes() -> &'static [Theme] {
    built()
}

fn hash(s: &str) -> u64 {
    let mut h: u64 = 1469598103934665603;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    h
}

/// Escolhe uma paleta determinística a partir do briefing.
pub fn pick_for(brief: &str, width: f32, height: f32) -> Theme {
    let lower = brief.to_lowercase();
    let keyword = |keys: &[&str]| keys.iter().any(|k| lower.contains(k));

    let forced = if keyword(&["finan", "banco", "invest", "cripto", "startup", "tech", "saas", "ia"]) {
        Some("meia-noite")
    } else if keyword(&["comida", "restaurante", "café", "cafe", "padaria", "receita"]) {
        Some("papel")
    } else if keyword(&["saúde", "saude", "bem-estar", "yoga", "natural", "eco"]) {
        Some("menta")
    } else if keyword(&["festa", "show", "música", "musica", "evento", "esporte", "energia"]) {
        Some("vulcao")
    } else if keyword(&["educação", "educacao", "curso", "aula", "escola", "infantil"]) {
        Some("algodao")
    } else if keyword(&["moda", "beleza", "cosmético", "cosmetico", "luxo"]) {
        Some("coral")
    } else if keyword(&["viagem", "praia", "mar", "hotel", "turismo"]) {
        Some("oceano")
    } else {
        None
    };

    if let Some(id) = forced {
        if let Some(t) = themes().iter().find(|t| t.id == id) {
            return t.clone();
        }
    }
    let list = themes();
    let idx = (hash(brief) as usize + if height > width { 3 } else { 0 }) % list.len();
    list[idx].clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keywords_route_to_palettes() {
        assert_eq!(pick_for("app de finanças pessoais", 1080.0, 1080.0).id, "meia-noite");
        assert_eq!(pick_for("menu de restaurante", 1080.0, 1350.0).id, "papel");
        assert_eq!(pick_for("aula de yoga", 1080.0, 1080.0).id, "menta");
    }

    #[test]
    fn is_deterministic() {
        let a = pick_for("qualquer coisa", 800.0, 600.0);
        let b = pick_for("qualquer coisa", 800.0, 600.0);
        assert_eq!(a, b);
    }

    #[test]
    fn all_themes_have_hex_colors() {
        for t in themes() {
            for c in [&t.bg, &t.bg_2, &t.on_bg, &t.accent, &t.accent_2, &t.muted] {
                assert!(c.starts_with('#') && c.len() == 7, "cor inválida: {c}");
            }
        }
    }
}
