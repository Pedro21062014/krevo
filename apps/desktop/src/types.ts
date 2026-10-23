/**
 * Modelo de documento do Krevo — espelha `crates/krevo-core/src/model.rs`.
 * Qualquer mudança aqui precisa acontecer lá também (e vice-versa).
 */

export type ElementKind =
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "image"
  | "video"
  | "icon"
  | "frame";

export interface GradientStop {
  offset: number;
  color: string;
}

export interface LinearGradient {
  angle: number;
  stops: GradientStop[];
}

/** Cor sólida (`"#RRGGBB"`) ou gradiente linear. */
export type Fill = string | LinearGradient;

export interface Stroke {
  color: string;
  width: number;
}

export interface Shadow {
  color: string;
  blur: number;
  x: number;
  y: number;
}

export type TextAlign = "left" | "center" | "right";
export type ImageFit = "cover" | "contain" | "fill";

export interface TextProps {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  align: TextAlign;
  color: string;
  italic: boolean;
  underline: boolean;
}

export interface Element {
  id: string;
  kind: ElementKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  fill?: Fill | null;
  stroke?: Stroke | null;
  radius: number;
  shadow?: Shadow | null;
  text?: TextProps | null;
  src?: string | null;
  fit?: ImageFit | null;
}

export interface Page {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: Fill | null;
  elements: Element[];
}

export interface Brand {
  palette: string[];
  fontHeading: string;
  fontBody: string;
}

export interface Project {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  brand: Brand;
  pages: Page[];
}

export type Screen = "home" | "editor";
export type HomeTab = "inicio" | "templates" | "elementos" | "fotos" | "ia" | "ajustes";
export type Tool = "select" | "hand" | "text" | "rect" | "ellipse" | "line" | "image";

export interface Settings {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  unsplashKey: string;
  theme: "dark" | "light";
  autoDemo: boolean;
  brand: Brand;
}

export interface Photo {
  id: string;
  description: string;
  thumb: string;
  regular: string;
  full: string;
  author: string;
  authorUrl: string;
  link: string;
  color: string;
  width: number;
  height: number;
  provider: string;
}

export interface ChatTurn {
  role: "user" | "assistant" | "system";
  content: string;
  meta?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  pages: number;
  page: Page;
}
