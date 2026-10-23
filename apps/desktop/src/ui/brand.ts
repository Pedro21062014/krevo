/** Marca do Krevo — assets reais (K recortado + wordmark) por tema. */

import kDark from "../assets/brand/k-dark.png";
import kLight from "../assets/brand/k-light.png";
import wordmarkDark from "../assets/brand/wordmark-dark.png";
import wordmarkLight from "../assets/brand/wordmark-light.png";

export type ThemeName = "dark" | "light";

/** Proporção do wordmark (K + "krevo"): 1200×412. */
const WORD_RATIO = 1200 / 412;

export const brand = {
  k: (theme: ThemeName): string => (theme === "dark" ? kLight : kDark),
  wordmark: (theme: ThemeName): string => (theme === "dark" ? wordmarkLight : wordmarkDark),
};

/** Só o K, para avatares, estados vazios e marcas d'água. */
export function kMark(theme: ThemeName, size = 22, cls = ""): string {
  return `<img class="brand-k ${cls}" src="${brand.k(theme)}" width="${size}" height="${size}" alt="Krevo" draggable="false" />`;
}

/**
 * Lockup da marca: o wordmark do usuário já traz o K e o "krevo" juntos,
 * então ele é o logo completo. `size` é a altura em px.
 */
export function logoLockup(theme: ThemeName, size = 20, cls = ""): string {
  return `<img class="brand-word ${cls}" src="${brand.wordmark(theme)}" height="${size}" width="${Math.round(
    size * WORD_RATIO,
  )}" alt="Krevo" draggable="false" />`;
}
