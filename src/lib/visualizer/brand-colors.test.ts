import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SPECTRAL_FRAGMENT_SHADER } from "./shaders";
import {
  OPTICAL_SYSTEMS,
  REFERENCE_GEOMETRY_INTENSITY,
} from "./types";

const SOURCE_EXTENSIONS = new Set([".css", ".svg", ".ts", ".tsx"]);
const ALLOWED_HEX = new Set(["#000", "#000000", "#fff", "#ffffff", "#008cff"]);
const ALLOWED_RGB = new Set(["0,0,0", "255,255,255", "0,140,255"]);
const FORBIDDEN_COLOR_FUNCTION = /\b(?:hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/gi;
const NAMED_PIGMENT = /(?::\s*|=\s*["'])(?:red|blue|green|orange|yellow|purple|pink|gray|grey|silver|navy|teal|aqua|maroon|lime|olive|fuchsia)\b/gi;

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

function composite(
  foreground: readonly [number, number, number],
  alpha: number,
  background: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
  ];
}

function pigmentViolations(source: string): string[] {
  const violations: string[] = [];
  for (const match of source.matchAll(/#[\da-f]{3,8}\b/gi)) {
    if (!ALLOWED_HEX.has(match[0].toLowerCase())) violations.push(match[0]);
  }
  for (const match of source.matchAll(/rgba?\(\s*(\d+)\s*(?:,\s*|\s+)(\d+)\s*(?:,\s*|\s+)(\d+)/gi)) {
    const base = `${match[1]},${match[2]},${match[3]}`;
    if (!ALLOWED_RGB.has(base)) violations.push(`rgb(${base})`);
  }
  for (const match of source.matchAll(FORBIDDEN_COLOR_FUNCTION)) {
    violations.push(match[0]);
  }
  for (const match of source.matchAll(NAMED_PIGMENT)) {
    violations.push(match[0]);
  }
  return violations;
}

describe("AV/01 optical system", () => {
  it("has exactly one black, electric-blue, and white renderer optical system", () => {
    expect(OPTICAL_SYSTEMS).toHaveLength(1);
    expect(OPTICAL_SYSTEMS[0]).toEqual({
      id: "electric",
      background: [0, 0, 0],
      signal: [0, 140 / 255, 1],
      reference: [1, 1, 1],
    });
  });

  it("contains no unapproved literal pigment in first-party source", () => {
    const roots = ["src", "public"]
      .map((directory) => path.join(process.cwd(), directory))
      .filter(existsSync);
    const files = [
      ...roots.flatMap(sourceFiles),
      path.join(process.cwd(), "tailwind.config.ts"),
      path.join(process.cwd(), "next.config.ts"),
    ].filter(existsSync);

    expect(pigmentViolations("color: rgb(255 0 0); background: hsl(0 100% 50%);")).toEqual([
      "rgb(255,0,0)",
      "hsl(",
    ]);

    for (const file of files) {
      if (path.basename(file) === "brand-colors.test.ts") continue;
      const source = readFileSync(file, "utf8");
      expect(
        pigmentViolations(source),
        `${path.relative(process.cwd(), file)} contains undeclared pigments`,
      ).toEqual([]);
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
    expect(SPECTRAL_FRAGMENT_SHADER).not.toMatch(/u(?:Primary|Secondary|Accent)/);
    const compressionIndex = SPECTRAL_FRAGMENT_SHADER.indexOf(
      "color *= compressedIntensity / pigmentIntensity;",
    );
    const referenceIndex = SPECTRAL_FRAGMENT_SHADER.indexOf("color = mix(");
    expect(referenceIndex).toBeGreaterThan(compressionIndex);
    expect(SPECTRAL_FRAGMENT_SHADER).toContain(
      `saturate(fixedReference * ${REFERENCE_GEOMETRY_INTENSITY.toFixed(2)})`,
    );
  });

  it("keeps text and fixed reference geometry inside their declared contrast roles", () => {
    const black = [0, 0, 0] as const;
    const electricBlue = [0, 140, 255] as const;
    const white = [255, 255, 255] as const;
    const mutedInk = composite(black, 0.58, white);
    const fixedReference = composite(white, REFERENCE_GEOMETRY_INTENSITY, black);
    expect(contrast(electricBlue, black)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(black, electricBlue)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, black)).toBeGreaterThanOrEqual(7);
    expect(contrast(mutedInk, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fixedReference, black)).toBeGreaterThanOrEqual(3);
    expect(contrast(electricBlue, white)).toBeGreaterThanOrEqual(3);
    expect(contrast(electricBlue, white)).toBeLessThan(4.5);
  });
});
