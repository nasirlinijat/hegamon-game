// Small color helpers for the UI layer (no engine dependency).

interface Rgb { r: number; g: number; b: number }

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Linear blend from a→b. t=0 returns a, t=1 returns b. */
export function blend(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
}

/** Lighten toward white by t. */
export function lighten(hex: string, t: number): string {
  return blend(hex, '#ffffff', t);
}

/** Darken toward black by t. */
export function darken(hex: string, t: number): string {
  return blend(hex, '#000000', t);
}
