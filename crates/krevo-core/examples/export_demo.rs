//! Gera um PDF vetorial de demonstração usando só o núcleo do Krevo.
//!
//! ```bash
//! cargo run -p krevo-core --example export_demo -- docs/krevo-demo.pdf
//! ```

use krevo_core::agent;
use krevo_core::model::{brand_with, Element, ElementKind, Fill, LinearGradient, GradientStop, Page, Project, TextProps};
use krevo_core::pdf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out = std::env::args().nth(1).unwrap_or_else(|| "krevo-demo.pdf".into());

    // Página 1: capa gerada pelo agente local (modo demo).
    let plan = agent::demo_plan("Krevo — estúdio de design com IA", 1920.0, 1080.0);
    let mut cover = Page::new("Capa", 1920.0, 1080.0);
    cover.background = plan.background.clone();
    for node in &plan.elements {
        let mut el = Element {
            id: krevo_core::model::new_id(),
            kind: match node.kind.as_str() {
                "text" => ElementKind::Text,
                "ellipse" => ElementKind::Ellipse,
                "image" => ElementKind::Image,
                _ => ElementKind::Rect,
            },
            name: node.name.clone().unwrap_or_default(),
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h,
            rotation: 0.0,
            opacity: node.opacity.unwrap_or(1.0),
            locked: false,
            hidden: false,
            fill: node
                .fill
                .as_ref()
                .map(|f| Fill::Color(f.clone())),
            stroke: None,
            radius: node.radius.unwrap_or(0.0),
            shadow: None,
            text: None,
            src: None,
            fit: None,
        };
        if el.kind == ElementKind::Text {
            el.text = Some(TextProps {
                content: node.content.clone(),
                font_family: "Inter".into(),
                font_size: node.font_size.unwrap_or(48.0),
                font_weight: node.font_weight.unwrap_or(600),
                line_height: node.line_height.unwrap_or(1.15),
                letter_spacing: 0.0,
                align: agent::align_from(node.align.as_ref()),
                color: node.color.clone().unwrap_or_else(|| "#FFFFFF".into()),
                italic: false,
                underline: false,
                uppercase: false,
            });
        }
        cover.elements.push(el);
    }

    let mut project = Project::blank("Krevo — demonstração", 1920.0, 1080.0);
    project.pages = vec![cover];

    // Página 2: página de texto, provando quebra de linha e tipografia.
    let mut page2 = Page::new("Texto", 1240.0, 1754.0);
    page2.background = Some(Fill::Linear(LinearGradient {
        angle: 135.0,
        stops: vec![
            GradientStop { offset: 0.0, color: "#FAF7F2".into() },
            GradientStop { offset: 1.0, color: "#EFE7DC".into() },
        ],
    }));
    page2.elements.push(Element {
        id: krevo_core::model::new_id(),
        kind: ElementKind::Text,
        name: "Título".into(),
        x: 120.0,
        y: 140.0,
        w: 1000.0,
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
            content: "PDF vetorial, sem Chromium.".into(),
            font_family: "Inter".into(),
            font_size: 72.0,
            font_weight: 700,
            line_height: 1.1,
            letter_spacing: 0.0,
            align: krevo_core::model::TextAlign::Left,
            color: "#1A1714".into(),
            italic: false,
            underline: false,
                uppercase: false,
            }),
        src: None,
        fit: None,
    });
    page2.elements.push(Element {
        id: krevo_core::model::new_id(),
        kind: ElementKind::Text,
        name: "Corpo".into(),
        x: 120.0,
        y: 340.0,
        w: 1000.0,
        h: 600.0,
        rotation: 0.0,
        opacity: 1.0,
        locked: false,
        hidden: false,
        fill: None,
        stroke: None,
        radius: 0.0,
        shadow: None,
        text: Some(TextProps {
            content: "Este PDF foi gerado pelo motor escrito em Rust do Krevo. O texto é selecionável, as formas são curvas reais e nenhum navegador foi iniciado para produzir este arquivo. O mesmo motor exporta apresentações, relatórios, currículos e cartões em milissegundos, direto do app desktop.".into(),
            font_family: "Inter".into(),
            font_size: 28.0,
            font_weight: 400,
            line_height: 1.6,
            letter_spacing: 0.0,
            align: krevo_core::model::TextAlign::Left,
            color: "#3A342C".into(),
            italic: false,
            underline: false,
                uppercase: false,
            }),
        src: None,
        fit: None,
    });
    project.pages.push(page2);

    let bytes = pdf::render_pdf(&project)?;
    if let Some(parent) = std::path::Path::new(&out).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&out, &bytes)?;
    println!("PDF gerado: {out} ({} KB)", bytes.len() / 1024);
    let _ = brand_with;
    Ok(())
}
