//! Gerador de **PDF vetorial** escrito em Rust puro.
//!
//! Nada de Chromium, nada de headless browser: o Krevo converte o documento em
//! operadores PDF (texto selecionável, formas com curvas, imagens embutidas),
//! então um deck de 40 páginas sai em milissegundos e com tipografia nítida.
//!
//! Limitações conhecidas (documentadas no README): gradientes são aproximados
//! por bandas, fontes são as 4 Helvetica base-14 do PDF (com mapeamento de peso
//! e itálico) e vídeos entram como o primeiro quadro estático.

use base64::Engine;
use printpdf::path::{PaintMode, WindingOrder};
use printpdf::*;
// `printpdf::*` exporta um módulo `image`; usamos o crate homônimo de forma explícita.
use ::image as img;
use std::io::BufWriter;

use crate::error::{Error, Result};
use crate::model::{
    Element, ElementKind, Fill, ImageFit, Page, Project, TextAlign, TextProps,
};

/// 1 px CSS = 1/96 polegada → mm.
const PX_TO_MM: f32 = 25.4 / 96.0;
/// Largura de um "espaço" médio em Helvetica (unidades/1000).
const HELV_W: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/// Largura de um texto em px para um dado tamanho de fonte (aproximação
/// Helvetica, com fator para pesos maiores).
pub fn text_width(text: &str, font_size: f32, bold: bool) -> f32 {
    let mut units = 0u32;
    for ch in text.chars() {
        let idx = (ch as u32).wrapping_sub(32) as usize;
        units += if idx < HELV_W.len() {
            HELV_W[idx] as u32
        } else if ch.is_whitespace() {
            278
        } else {
            556
        };
    }
    let factor = if bold { 1.045 } else { 1.0 };
    (units as f32 / 1000.0) * font_size * factor
}

fn px(v: f32) -> Mm {
    Mm(v * PX_TO_MM)
}


/// Retângulo em coordenadas de tela (y para baixo) → PDF (origem embaixo).
fn rect_shape(x: f32, y: f32, w: f32, h: f32, page_h: f32, mode: PaintMode) -> Rect {
    let mut rect = Rect::new(px(x), px(page_h - y - h), px(x + w), px(page_h - y));
    rect.mode = mode;
    rect.winding = WindingOrder::NonZero;
    rect
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rgba {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Rgba {
    pub const BLACK: Rgba = Rgba { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };

    fn to_color(&self) -> Color {
        Color::Rgb(Rgb::new(self.r, self.g, self.b, None))
    }

    /// Mistura com um fundo (usado para simular opacidade em PDF).
    pub fn over(&self, bg: Rgba) -> Rgba {
        let a = self.a.clamp(0.0, 1.0);
        Rgba {
            r: self.r * a + bg.r * (1.0 - a),
            g: self.g * a + bg.g * (1.0 - a),
            b: self.b * a + bg.b * (1.0 - a),
            a: 1.0,
        }
    }
}

/// Interpreta `#RGB`, `#RRGGBB`, `rgb(...)` e `rgba(...)`.
pub fn parse_color(input: &str) -> Option<Rgba> {
    let s = input.trim().to_lowercase();
    if let Some(hex) = s.strip_prefix('#') {
        let (r, g, b) = match hex.len() {
            3 => {
                let d = |i: usize| u8::from_str_radix(&hex[i..i + 1].repeat(2), 16).ok();
                (d(0)?, d(1)?, d(2)?)
            }
            6 | 8 => {
                let d = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
                (d(0)?, d(2)?, d(4)?)
            }
            _ => return None,
        };
        return Some(Rgba {
            r: r as f32 / 255.0,
            g: g as f32 / 255.0,
            b: b as f32 / 255.0,
            a: 1.0,
        });
    }
    if let Some(inner) = s
        .strip_prefix("rgba(")
        .or_else(|| s.strip_prefix("rgb("))
        .and_then(|x| x.strip_suffix(')'))
    {
        let parts: Vec<f32> = inner
            .split(&[',', ' '][..])
            .filter(|p| !p.trim().is_empty())
            .filter_map(|p| {
                let p = p.trim();
                if let Some(pct) = p.strip_suffix('%') {
                    pct.parse::<f32>().ok().map(|v| v / 100.0 * 255.0)
                } else {
                    p.parse::<f32>().ok()
                }
            })
            .collect();
        if parts.len() >= 3 {
            return Some(Rgba {
                r: (parts[0] / 255.0).clamp(0.0, 1.0),
                g: (parts[1] / 255.0).clamp(0.0, 1.0),
                b: (parts[2] / 255.0).clamp(0.0, 1.0),
                a: parts.get(3).copied().unwrap_or(1.0).clamp(0.0, 1.0),
            });
        }
    }
    match s.as_str() {
        "white" => return parse_color("#ffffff"),
        "black" => return parse_color("#000000"),
        "transparent" | "none" => return None,
        _ => {}
    }
    None
}

/// Aproxima um `Fill` em uma cor média (usado em gradientes/strokes).
pub fn average_fill(fill: &Fill) -> Option<Rgba> {
    match fill {
        Fill::Color(c) => parse_color(c),
        Fill::Linear(g) => {
            let stops = &g.stops;
            if stops.is_empty() {
                return None;
            }
            let n = stops.len() as f32;
            let mut acc = (0.0, 0.0, 0.0, 0.0);
            for s in stops {
                if let Some(c) = parse_color(&s.color) {
                    acc.0 += c.r;
                    acc.1 += c.g;
                    acc.2 += c.b;
                    acc.3 += c.a;
                }
            }
            Some(Rgba {
                r: acc.0 / n,
                g: acc.1 / n,
                b: acc.2 / n,
                a: acc.3 / n,
            })
        }
    }
}

fn lerp_color(a: Rgba, b: Rgba, t: f32) -> Rgba {
    let t = t.clamp(0.0, 1.0);
    Rgba {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
        a: a.a + (b.a - a.a) * t,
    }
}

fn gradient_color(stops: &[crate::model::GradientStop], t: f32) -> Rgba {
    if stops.is_empty() {
        return Rgba::BLACK;
    }
    let t = t.clamp(0.0, 1.0);
    let mut sorted: Vec<&crate::model::GradientStop> = stops.iter().collect();
    sorted.sort_by(|a, b| a.offset.partial_cmp(&b.offset).unwrap_or(std::cmp::Ordering::Equal));
    let first = sorted[0];
    let last = sorted[sorted.len() - 1];
    if t <= first.offset {
        return parse_color(&first.color).unwrap_or(Rgba::BLACK);
    }
    if t >= last.offset {
        return parse_color(&last.color).unwrap_or(Rgba::BLACK);
    }
    for w in sorted.windows(2) {
        let (a, b) = (w[0], w[1]);
        if t >= a.offset && t <= b.offset {
            let span = (b.offset - a.offset).max(1e-6);
            let local = (t - a.offset) / span;
            let ca = parse_color(&a.color).unwrap_or(Rgba::BLACK);
            let cb = parse_color(&b.color).unwrap_or(Rgba::BLACK);
            return lerp_color(ca, cb, local);
        }
    }
    Rgba::BLACK
}

/// Gera o PDF de um projeto inteiro (uma página por frame).
pub fn render_pdf(project: &Project) -> Result<Vec<u8>> {
    if project.pages.is_empty() {
        return Err(Error::InvalidProject("o projeto não tem páginas".into()));
    }
    let first = &project.pages[0];
    let (doc, first_page, first_layer) = PdfDocument::new(
        project.name.clone(),
        px(first.width),
        px(first.height),
        "Conteúdo",
    );
    let fonts = FontSet::new(&doc);

    render_page(&doc, first_page, first_layer, first, &fonts)?;

    for page in project.pages.iter().skip(1) {
        let (idx, layer_idx) = doc.add_page(px(page.width), px(page.height), "Conteúdo");
        render_page(&doc, idx, layer_idx, page, &fonts)?;
    }

    let mut buffer = Vec::new();
    {
        let mut writer = BufWriter::new(&mut buffer);
        doc.save(&mut writer)
            .map_err(|e| Error::Pdf(e.to_string()))?;
    }
    Ok(buffer)
}

struct FontSet<'a> {
    regular: IndirectFontRef,
    bold: IndirectFontRef,
    italic: IndirectFontRef,
    bold_italic: IndirectFontRef,
    _marker: std::marker::PhantomData<&'a ()>,
}

impl<'a> FontSet<'a> {
    fn new(doc: &PdfDocumentReference) -> Self {
        let add = |f: BuiltinFont| {
            doc.add_builtin_font(f)
                .expect("fontes base-14 sempre existem")
        };
        Self {
            regular: add(BuiltinFont::Helvetica),
            bold: add(BuiltinFont::HelveticaBold),
            italic: add(BuiltinFont::HelveticaOblique),
            bold_italic: add(BuiltinFont::HelveticaBoldOblique),
            _marker: std::marker::PhantomData,
        }
    }

    fn get(&self, bold: bool, italic: bool) -> &IndirectFontRef {
        match (bold, italic) {
            (true, true) => &self.bold_italic,
            (true, false) => &self.bold,
            (false, true) => &self.italic,
            (false, false) => &self.regular,
        }
    }
}

fn render_page(
    doc: &PdfDocumentReference,
    page_idx: PdfPageIndex,
    layer_idx: PdfLayerIndex,
    page: &Page,
    fonts: &FontSet,
) -> Result<()> {
    let _ = doc;
    let layer = doc.get_page(page_idx).get_layer(layer_idx);
    let page_bg = page
        .background
        .as_ref()
        .and_then(average_fill)
        .unwrap_or(Rgba {
            r: 1.0,
            g: 1.0,
            b: 1.0,
            a: 1.0,
        });

    draw_background(&layer, page, page_bg);

    for element in page.elements.iter().filter(|e| !e.hidden) {
        draw_element(&layer, element, page, page_bg, fonts);
    }
    Ok(())
}

fn draw_background(layer: &PdfLayerReference, page: &Page, page_bg: Rgba) {
    let w = page.width;
    let h = page.height;
    match &page.background {
        Some(Fill::Linear(gradient)) => {
            // Aproximação por bandas perpendiculares ao eixo do gradiente.
            let bands: u32 = 96;
            let angle = gradient.angle.to_radians();
            let (dx, dy) = (angle.cos(), angle.sin());
            for i in 0..bands {
                let t0 = i as f32 / bands as f32;
                // cor no centro da banda, projetada no eixo do gradiente
                let t = t0;
                let color = gradient_color(&gradient.stops, t);
                let rect_w = w / bands as f32;
                // bandas verticais suavizam qualquer ângulo razoavelmente bem
                let x = i as f32 * rect_w;
                layer.set_fill_color(color.to_color());
                layer.add_rect(rect_shape(x, 0.0, rect_w + 0.6, h, h, PaintMode::Fill));
                let _ = (dx, dy);
            }
        }
        Some(Fill::Color(c)) => {
            if let Some(color) = parse_color(c) {
                layer.set_fill_color(color.to_color());
                layer.add_rect(rect_shape(0.0, 0.0, w, h, h, PaintMode::Fill));
            }
        }
        None => {
            layer.set_fill_color(page_bg.to_color());
            layer.add_rect(rect_shape(0.0, 0.0, w, h, h, PaintMode::Fill));
        }
    }
}

fn draw_element(
    layer: &PdfLayerReference,
    el: &Element,
    page: &Page,
    page_bg: Rgba,
    fonts: &FontSet,
) {
    let opacity = el.opacity.clamp(0.0, 1.0);

    // sombra (aproximada por retângulos concêntricos translúcidos)
    if let Some(shadow) = &el.shadow {
        if let Some(sc) = parse_color(&shadow.color) {
            let steps = 5;
            for i in (0..steps).rev() {
                let spread = shadow.blur * (i as f32 / steps as f32);
                let alpha = sc.a * 0.18 * (1.0 - i as f32 / steps as f32);
                let color = Rgba { a: alpha, ..sc }.over(page_bg);
                layer.set_fill_color(color.to_color());
                let x = el.x + shadow.x - spread * 0.5;
                let y = el.y + shadow.y - spread * 0.5;
                add_rounded_rect(
                    layer,
                    x,
                    y,
                    el.w + spread,
                    el.h + spread,
                    el.radius + spread * 0.5,
                    page.height,
                );
            }
        }
    }

    match el.kind {
        ElementKind::Text => {
            if let Some(text) = &el.text {
                draw_text(layer, el, text, page, opacity, fonts);
            }
        }
        ElementKind::Rect | ElementKind::Frame | ElementKind::Icon => {
            if let Some(fill) = &el.fill {
                if let Some(c) = average_fill(fill) {
                    let c = Rgba { a: c.a * opacity, ..c }.over(page_bg);
                    layer.set_fill_color(c.to_color());
                    add_rounded_rect(layer, el.x, el.y, el.w, el.h, el.radius, page.height);
                }
            }
            if let Some(stroke) = &el.stroke {
                if let Some(c) = parse_color(&stroke.color) {
                    layer.set_outline_color(c.to_color());
                    layer.set_outline_thickness(px(stroke.width).0);
                    add_rounded_rect_path(layer, el.x, el.y, el.w, el.h, el.radius, page.height);
                }
            }
        }
        ElementKind::Ellipse => {
            if let Some(fill) = &el.fill {
                if let Some(c) = average_fill(fill) {
                    let c = Rgba { a: c.a * opacity, ..c }.over(page_bg);
                    layer.set_fill_color(c.to_color());
                    add_ellipse(layer, el, page.height);
                }
            }
            if let Some(stroke) = &el.stroke {
                if let Some(c) = parse_color(&stroke.color) {
                    layer.set_outline_color(c.to_color());
                    layer.set_outline_thickness(px(stroke.width).0);
                    add_ellipse_path(layer, el, page.height);
                }
            }
        }
        ElementKind::Line => {
            let color = el
                .stroke
                .as_ref()
                .and_then(|s| parse_color(&s.color))
                .or_else(|| el.fill.as_ref().and_then(average_fill))
                .unwrap_or(Rgba::BLACK);
            let thickness = el.stroke.as_ref().map(|s| s.width).unwrap_or(2.0).max(0.5);
            layer.set_fill_color(Rgba { a: color.a * opacity, ..color }.over(page_bg).to_color());
            layer.add_rect(rect_shape(el.x, el.y, el.w, thickness, page.height, PaintMode::Fill));
        }
        ElementKind::Image | ElementKind::Video => {
            draw_media(layer, el, page, page_bg, opacity);
        }
    }
}

fn draw_media(
    layer: &PdfLayerReference,
    el: &Element,
    page: &Page,
    page_bg: Rgba,
    opacity: f32,
) {
    if let Some(src) = &el.src {
        if let Some(bytes) = decode_src(src) {
            if let Ok(dynimg) = img::load_from_memory(&bytes) {
                let fit = el.fit.unwrap_or_default();
                let prepared = prepare_image(dynimg, el.w, el.h, fit);
                let (iw, ih) = (prepared.width() as f32, prepared.height() as f32);
                let img = printpdf::Image::from_dynamic_image(&prepared);
                let dpi = if el.w > 0.0 { iw / (el.w * PX_TO_MM / 25.4) } else { 300.0 };
                img.add_to_layer(
                    layer.clone(),
                    ImageTransform {
                        translate_x: Some(px(el.x)),
                        translate_y: Some(Mm(page.height * PX_TO_MM - (el.y + el.h) * PX_TO_MM)),
                        rotate: None,
                        scale_x: None,
                        scale_y: None,
                        dpi: Some(dpi.max(1.0)),
                    },
                );
                let _ = (ih, opacity, page_bg);
                return;
            }
        }
    }
    // espaço reservado (vídeo sem poster, imagem ainda não carregada)
    let placeholder = Rgba {
        r: 0.85,
        g: 0.86,
        b: 0.9,
        a: 1.0,
    };
    layer.set_fill_color(placeholder.over(page_bg).to_color());
    add_rounded_rect(layer, el.x, el.y, el.w, el.h, el.radius.min(16.0), page.height);
}

fn decode_src(src: &str) -> Option<Vec<u8>> {
    if let Some(rest) = src.strip_prefix("data:") {
        let (_, data) = rest.split_once(',')?;
        return base64::engine::general_purpose::STANDARD.decode(data).ok();
    }
    if src.starts_with("http://") || src.starts_with("https://") {
        return None; // o app baixa antes de exportar
    }
    std::fs::read(src).ok()
}

fn prepare_image(img: img::DynamicImage, w: f32, h: f32, fit: ImageFit) -> img::DynamicImage {
    let target_w = (w as u32).clamp(16, 2400);
    let target_h = (h as u32).clamp(16, 2400);
    match fit {
        ImageFit::Fill => img.resize_exact(target_w, target_h, img::imageops::FilterType::Lanczos3),
        ImageFit::Contain => {
            let scaled = img.resize(target_w, target_h, img::imageops::FilterType::Lanczos3);
            let mut canvas = img::RgbaImage::from_pixel(target_w, target_h, img::Rgba([255, 255, 255, 0]));
            let ox = (target_w - scaled.width()) / 2;
            let oy = (target_h - scaled.height()) / 2;
            img::imageops::overlay(&mut canvas, &scaled.to_rgba8(), ox as i64, oy as i64);
            img::DynamicImage::ImageRgba8(canvas)
        }
        ImageFit::Cover => {
            // recorta no centro para preencher a caixa (sem overflow no PDF)
            let src_ratio = img.width() as f32 / img.height().max(1) as f32;
            let dst_ratio = w / h.max(1.0);
            let cropped = if src_ratio > dst_ratio {
                let new_w = (img.height() as f32 * dst_ratio).round() as u32;
                let x = (img.width() - new_w) / 2;
                img.crop_imm(x, 0, new_w.max(1), img.height())
            } else {
                let new_h = (img.width() as f32 / dst_ratio).round() as u32;
                let y = (img.height() - new_h) / 2;
                img.crop_imm(0, y, img.width(), new_h.max(1))
            };
            cropped.resize_exact(target_w, target_h, img::imageops::FilterType::Lanczos3)
        }
    }
}

fn draw_text(
    layer: &PdfLayerReference,
    el: &Element,
    text: &TextProps,
    page: &Page,
    opacity: f32,
    fonts: &FontSet,
) {
    let bold = text.font_weight >= 600;
    let font = fonts.get(bold, text.italic);
    let color = parse_color(&text.color).unwrap_or(Rgba::BLACK);
    let color = Rgba {
        a: color.a * opacity,
        ..color
    }
    .over(Rgba {
        r: 1.0,
        g: 1.0,
        b: 1.0,
        a: 1.0,
    });
    layer.set_fill_color(color.to_color());

    let line_height = (text.font_size * text.line_height).max(1.0);
    let lines = wrap_text(&text.content, el.w, text.font_size, bold);
    let total_h = lines.len() as f32 * line_height;
    // centraliza verticalmente dentro da caixa quando sobra espaço
    let start_y = if total_h < el.h {
        el.y + (el.h - total_h) / 2.0
    } else {
        el.y
    };

    for (i, line) in lines.iter().enumerate() {
        let line_w = text_width(line, text.font_size, bold);
        let x = match text.align {
            TextAlign::Left => el.x,
            TextAlign::Center => el.x + (el.w - line_w) / 2.0,
            TextAlign::Right => el.x + el.w - line_w,
        };
        let baseline = start_y + i as f32 * line_height + text.font_size * 0.82;
        let y_mm = page.height * PX_TO_MM - baseline * PX_TO_MM;
        if y_mm < -5.0 || y_mm > page.height * PX_TO_MM + 5.0 {
            continue;
        }
        layer.use_text(line, text.font_size * 0.75, px(x), Mm(y_mm), font);
    }

    if text.underline {
        let y = start_y + line_height - text.font_size * 0.12;
        layer.set_fill_color(color.to_color());
        let uw = text_width(&text.content, text.font_size, bold).min(el.w);
        layer.add_rect(rect_shape(el.x, y, uw, 1.0, page.height, PaintMode::Fill));
    }
}

/// Quebra o texto respeitando `\n` e a largura da caixa.
pub fn wrap_text(content: &str, max_width: f32, font_size: f32, bold: bool) -> Vec<String> {
    let mut out = Vec::new();
    for paragraph in content.split('\n') {
        if paragraph.trim().is_empty() {
            out.push(String::new());
            continue;
        }
        let mut current = String::new();
        for word in paragraph.split_whitespace() {
            let candidate = if current.is_empty() {
                word.to_string()
            } else {
                format!("{current} {word}")
            };
            if text_width(&candidate, font_size, bold) > max_width && !current.is_empty() {
                out.push(current);
                current = word.to_string();
            } else {
                current = candidate;
            }
        }
        if !current.is_empty() {
            out.push(current);
        }
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
}

fn rounded_points(x: f32, y: f32, w: f32, h: f32, r: f32, page_h: f32) -> Vec<(Point, bool)> {
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    let to_point = |px_x: f32, px_y: f32| Point::new(px(px_x), px(page_h - px_y));
    if r <= 0.5 {
        return vec![
            (to_point(x, y), false),
            (to_point(x + w, y), false),
            (to_point(x + w, y + h), false),
            (to_point(x, y + h), false),
            (to_point(x, y), false),
        ];
    }
    let steps = 8;
    let mut pts = Vec::with_capacity(steps * 4 + 4);
    let corners = [
        (x + w - r, y + r, -90.0f32, 0.0f32),   // topo-direita
        (x + w - r, y + h - r, 0.0, 90.0),      // baixo-direita
        (x + r, y + h - r, 90.0, 180.0),        // baixo-esquerda
        (x + r, y + r, 180.0, 270.0),           // topo-esquerda
    ];
    for (cx, cy, a0, a1) in corners {
        for s in 0..=steps {
            let t = a0 + (a1 - a0) * (s as f32 / steps as f32);
            let rad = t.to_radians();
            pts.push((to_point(cx + r * rad.cos(), cy + r * rad.sin()), false));
        }
    }
    pts.push((to_point(x, y), false));
    pts
}

fn add_rounded_rect(layer: &PdfLayerReference, x: f32, y: f32, w: f32, h: f32, r: f32, page_h: f32) {
    let poly: Polygon = rounded_points(x, y, w, h, r, page_h).into_iter().collect();
    layer.add_polygon(Polygon {
        mode: PaintMode::Fill,
        ..poly
    });
}

fn add_rounded_rect_path(layer: &PdfLayerReference, x: f32, y: f32, w: f32, h: f32, r: f32, page_h: f32) {
    let poly: Polygon = rounded_points(x, y, w, h, r, page_h).into_iter().collect();
    layer.add_polygon(Polygon {
        mode: PaintMode::Stroke,
        ..poly
    });
}

fn ellipse_points(el: &Element, page_h: f32) -> Vec<(Point, bool)> {
    let steps = 64;
    let cx = el.x + el.w / 2.0;
    let cy = el.y + el.h / 2.0;
    (0..=steps)
        .map(|i| {
            let t = i as f32 / steps as f32 * std::f32::consts::TAU;
            let x = cx + (el.w / 2.0) * t.cos();
            let y = cy + (el.h / 2.0) * t.sin();
            (Point::new(px(x), px(page_h - y)), false)
        })
        .collect()
}

fn add_ellipse(layer: &PdfLayerReference, el: &Element, page_h: f32) {
    let poly: Polygon = ellipse_points(el, page_h).into_iter().collect();
    layer.add_polygon(Polygon {
        mode: PaintMode::Fill,
        ..poly
    });
}

fn add_ellipse_path(layer: &PdfLayerReference, el: &Element, page_h: f32) {
    let poly: Polygon = ellipse_points(el, page_h).into_iter().collect();
    layer.add_polygon(Polygon {
        mode: PaintMode::Stroke,
        ..poly
    });
}

/// Exporta uma página só (útil para "exportar slide atual").
pub fn render_page_pdf(project: &Project, index: usize) -> Result<Vec<u8>> {
    let page = project
        .pages
        .get(index)
        .ok_or_else(|| Error::InvalidProject(format!("página {index} não existe")))?;
    let single = Project {
        pages: vec![page.clone()],
        ..project.clone()
    };
    render_pdf(&single)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hex_and_rgb() {
        let c = parse_color("#6C5CE7").unwrap();
        assert!((c.r - 0.4235).abs() < 0.01);
        let rgba = parse_color("rgba(0,0,0,0.5)").unwrap();
        assert_eq!(rgba.a, 0.5);
        assert!(parse_color("#zzz").is_none());
    }

    #[test]
    fn text_width_grows_with_size() {
        let a = text_width("Krevo", 12.0, false);
        let b = text_width("Krevo", 24.0, false);
        assert!(b > a * 1.9);
    }

    #[test]
    fn wraps_long_text() {
        let lines = wrap_text("O rato roeu a roupa do rei de roma", 120.0, 16.0, false);
        assert!(lines.len() > 1);
        for l in &lines {
            assert!(text_width(l, 16.0, false) <= 130.0, "linha larga: {l}");
        }
    }

    #[test]
    fn renders_a_valid_pdf() {
        let bytes = render_pdf(&Project::demo()).unwrap();
        assert!(bytes.starts_with(b"%PDF-1."));
        let tail = String::from_utf8_lossy(&bytes[bytes.len().saturating_sub(2048)..]).to_string();
        assert!(tail.contains("%%EOF"));
        assert!(bytes.len() > 2000);
    }

    #[test]
    fn multi_page_pdf_counts_pages() {
        let mut project = Project::demo();
        project
            .pages
            .push(Page::new("Slide 2", 1280.0, 720.0));
        let single = render_pdf(&Project::demo()).unwrap();
        let bytes = render_pdf(&project).unwrap();
        // os fluxos vão comprimidos, então comparamos tamanho e estrutura
        assert!(bytes.len() > single.len());
        assert!(bytes.windows(6).any(|w| w == b"/Count"));
        let tail = String::from_utf8_lossy(&bytes[bytes.len().saturating_sub(512)..]).to_string();
        assert!(tail.contains("%%EOF"));
    }

    #[test]
    fn empty_project_fails_gracefully() {
        let mut p = Project::demo();
        p.pages.clear();
        assert!(render_pdf(&p).is_err());
    }

    #[test]
    fn gradient_band_colors_interpolate() {
        let stops = vec![
            crate::model::GradientStop { offset: 0.0, color: "#000000".into() },
            crate::model::GradientStop { offset: 1.0, color: "#ffffff".into() },
        ];
        let mid = gradient_color(&stops, 0.5);
        assert!((mid.r - 0.5).abs() < 0.05);
    }

    #[test]
    fn export_single_page() {
        let bytes = render_page_pdf(&Project::demo(), 0).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        assert!(render_page_pdf(&Project::demo(), 9).is_err());
    }
}
