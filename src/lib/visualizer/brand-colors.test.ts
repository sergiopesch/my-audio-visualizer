import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SPECTRAL_FRAGMENT_SHADER } from "./shaders";
import { OPTICAL_SYSTEMS } from "./types";

const SOURCE_EXTENSIONS = new Set([".css", ".svg", ".ts", ".tsx"]);
const ALLOWED_HEX = new Set(["#000", "#000000", "#fff", "#ffffff", "#008cff"]);
const ALLOWED_RGB = new Set(["0,0,0", "255,255,255", "0,140,255"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return SOURCE_EXTENSIONS.has(path.extname(entry)) ? [absolute] : [];
  });
}

function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: readonly number[]): number {
  return 0.2126 * linearChannel(red)
    + 0.7152 * linearChannel(green)
    + 0.0722 * linearChannel(blue);
}

function contrast(first: readonly number[], second: readonly number[]): number {
  const brightest = Math.max(luminance(first), luminance(second));
  const darkest = Math.min(luminance(first), luminance(second));
  return (brightest + 0.05) / (darkest + 0.05);
}

describe("AV/01 optical system", () => {
  it("has exactly one black, electric-blue, and white renderer optical system", () => {
    expect(OPTICAL_SYSTEMS).toHaveLength(1);
    expect(OPTICAL_SYSTEMS[0]).toMatchObject({
      id: "electric",
      background: [0, 0, 0],
      primary: [0, 140 / 255, 1],
      secondary: [1, 1, 1],
      accent: [1, 1, 1],
      css: ["#008CFF", "#FFFFFF", "#FFFFFF"],
    });
  });

  it("contains no unapproved literal pigment in first-party source", () => {
    for (const file of sourceFiles(path.join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/#[\da-f]{3,8}\b/gi)) {
        expect(
          ALLOWED_HEX.has(match[0].toLowerCase()),
          `${path.relative(process.cwd(), file)} contains ${match[0]}`,
        ).toBe(true);
      }
      for (const match of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
        const base = `${match[1]},${match[2]},${match[3]}`;
        expect(
          ALLOWED_RGB.has(base),
          `${path.relative(process.cwd(), file)} contains rgb(${base})`,
        ).toBe(true);
      }
      expect(
        source,
        `${path.relative(process.cwd(), file)} applies a hue-shifting brightness filter`,
      ).not.toMatch(/filter\s*:\s*brightness\s*\(/i);
    }
  });

  it("compresses renderer intensity as one scalar so the pigment ratio cannot drift", () => {
    expect(SPECTRAL_FRAGMENT_SHADER).toContain(
      "float pigmentIntensity = max(max(color.r, color.g), color.b);",
    );
    expect(SPECTRAL_FRAGMENT_SHADER).toContain(
      "color *= compressedIntensity / pigmentIntensity;",
    );
    expect(SPECTRAL_FRAGMENT_SHADER).toContain(
      "compressedIntensity = min(1.0, pow(max(compressedIntensity, 0.0), 0.92));",
    );
    expect(SPECTRAL_FRAGMENT_SHADER).not.toMatch(
      /color\s*=\s*color\s*\/\s*\(vec3\(1\.0\)\s*\+\s*color/,
    );
    expect(SPECTRAL_FRAGMENT_SHADER).not.toMatch(
      /pow\(max\(color,\s*vec3\(0\.0\)\)/,
    );
  });

  it("keeps normal-size electric-blue and black text above WCAG AA contrast", () => {
    const black = [0, 0, 0] as const;
    const electricBlue = [0, 140, 255] as const;
    const white = [255, 255, 255] as const;
    expect(contrast(electricBlue, black)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(black, electricBlue)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, black)).toBeGreaterThanOrEqual(7);
  });
});
