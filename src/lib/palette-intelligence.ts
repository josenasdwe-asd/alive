import type { ColorGrade } from "./types";

/**
 * v3 INTELLIGENCE: Palette-driven color grading.
 *
 * Analyzes the VLM-extracted color palette and recommends the best color grade
 * based on warmth, saturation, and value distribution.
 */

interface RGB { r: number; g: number; b: number; }

function hexToRgb(hex: string): RGB | null {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Analyze a palette and recommend the best color grade.
 *
 * Decision logic:
 * - Very desaturated (avg S < 15%) → noir-film (enhance the monochrome feel)
 * - Warm-dominant (avg hue 0-60° or 330-360°) → teal-orange (complement warm skin tones)
 * - Cool-dominant (avg hue 180-270°) → blade-runner (enhance the cool cyber feel)
 * - High saturation + warm → portra (natural film look for vibrant warm scenes)
 * - Very dark (avg L < 25%) → noir-film
 * - Very bright (avg L > 75%) → bleach-bypass (high-key dramatic)
 * - Default → none
 */
export function recommendColorGrade(palette: string[]): ColorGrade {
  if (!palette || palette.length === 0) return "none";

  const rgbs = palette.map(hexToRgb).filter((x): x is RGB => x !== null);
  if (rgbs.length === 0) return "none";

  const hsls = rgbs.map(rgbToHsl);

  // Average saturation and lightness
  const avgS = hsls.reduce((sum, h) => sum + h.s, 0) / hsls.length;
  const avgL = hsls.reduce((sum, h) => sum + h.l, 0) / hsls.length;

  // Hue analysis: weight by saturation so muted colors don't skew
  let hueSum = 0, hueWeight = 0;
  hsls.forEach((h) => {
    if (h.s > 10) {
      hueSum += h.h * h.s;
      hueWeight += h.s;
    }
  });
  const avgHue = hueWeight > 0 ? hueSum / hueWeight : 180;

  // Very desaturated → noir
  if (avgS < 15) return "noir-film";

  // Very dark → noir
  if (avgL < 25) return "noir-film";

  // Very bright + moderate saturation → bleach-bypass
  if (avgL > 75 && avgS < 50) return "bleach-bypass";

  // Warm-dominant (reds, oranges, yellows)
  const isWarm = avgHue < 60 || avgHue > 330;
  if (isWarm) {
    // High saturation warm → portra (vibrant film)
    if (avgS > 50) return "portra";
    // Moderate warm → teal-orange (classic cinema)
    return "teal-orange";
  }

  // Cool-dominant (blues, cyans)
  const isCool = avgHue >= 180 && avgHue <= 270;
  if (isCool && avgL < 60) return "blade-runner";

  // Purple/magenta → blade-runner
  if (avgHue >= 270 && avgHue <= 330) return "blade-runner";

  // Default
  return "none";
}

/**
 * Get a human-readable description of why a color grade was recommended.
 */
export function explainColorGrade(grade: ColorGrade, palette: string[]): string {
  if (grade === "none" || palette.length === 0) return "Sin color grade";

  const rgbs = palette.map(hexToRgb).filter((x): x is RGB => x !== null);
  if (rgbs.length === 0) return "Sin color grade";

  const hsls = rgbs.map(rgbToHsl);
  const avgS = hsls.reduce((sum, h) => sum + h.s, 0) / hsls.length;
  const avgL = hsls.reduce((sum, h) => sum + h.l, 0) / hsls.length;

  switch (grade) {
    case "noir-film":
      return avgS < 15 ? "Paleta desaturada → noir realza el monocromo" : "Paleta oscura → noir añade contraste dramático";
    case "bleach-bypass":
      return "Paleta clara → bleach-bypass da alto contraste dramático";
    case "teal-orange":
      return "Paleta cálida → teal-orange complementa tonos de piel";
    case "portra":
      return "Paleta cálida vibrante → portra da look de película natural";
    case "blade-runner":
      return "Paleta fría → blade-runner realiza el cyber feel";
    default:
      return "Color grade automático";
  }
}
