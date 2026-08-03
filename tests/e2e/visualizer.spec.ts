import path from "node:path";
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const FIXTURE_DIRECTORY = path.resolve("output/science-fixtures");

function captureRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  return failures;
}

async function enableCanvas2dFallback(page: Page): Promise<void> {
  // Keep fixed-duration signal history independent of software-WebGL throughput in CI.
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      writable: true,
      value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
        if (contextId === "webgl2") return null;
        return Reflect.apply(originalGetContext, this, [contextId, ...args]);
      },
    });
  });
}

async function openFixture(page: Page, fileName: string): Promise<void> {
  await expect(page.locator("canvas.stage-canvas")).toHaveAttribute(
    "data-renderer",
    /^(webgl2|canvas2d)$/,
  );
  await page.locator('input[type="file"]').setInputFiles(
    path.join(FIXTURE_DIRECTORY, fileName),
  );
  await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible();
}

interface PigmentStats {
  renderer: string;
  coloredPixels: number;
  ratioViolations: number;
  maxGreenDeviation: number;
}

async function readCanvasPigmentStats(page: Page): Promise<PigmentStats> {
  return page.evaluate(() => new Promise<PigmentStats>((resolve, reject) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas.stage-canvas");
      if (!canvas) {
        reject(new Error("Missing visualizer canvas."));
        return;
      }

      const renderer = canvas.dataset.renderer ?? "unknown";
      let pixels: Uint8Array | Uint8ClampedArray;
      if (renderer === "webgl2") {
        const context = canvas.getContext("webgl2");
        if (!context) {
          reject(new Error("Missing active WebGL 2 context."));
          return;
        }
        pixels = new Uint8Array(canvas.width * canvas.height * 4);
        context.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixels,
        );
      } else {
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Missing active Canvas 2D context."));
          return;
        }
        pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      }

      const electricGreenRatio = 140 / 255;
      const tolerance = 4;
      let coloredPixels = 0;
      let ratioViolations = 0;
      let maxGreenDeviation = 0;

      for (let offset = 0; offset < pixels.length; offset += 4) {
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (Math.max(red, green, blue) <= tolerance) continue;

        coloredPixels += 1;
        const expectedGreen = red + (blue - red) * electricGreenRatio;
        const greenDeviation = Math.abs(green - expectedGreen);
        maxGreenDeviation = Math.max(maxGreenDeviation, greenDeviation);
        if (
          red > green + tolerance ||
          green > blue + tolerance ||
          greenDeviation > tolerance
        ) {
          ratioViolations += 1;
        }
      }

      resolve({ renderer, coloredPixels, ratioViolations, maxGreenDeviation });
    });
  }));
}

test("landing experience is hydrated, explicit, and responsive", async ({ page }) => {
  const failures = captureRuntimeFailures(page);
  await page.goto("/");

  await expect(page).toHaveTitle("AV/01 — Audio Visualizer");
  await expect(page.getByRole("heading", { name: "Five views. One signal." })).toBeVisible();
  await expect(page.getByText("NOT A MEASUREMENT")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with a known change." })).toBeVisible();
  await expect(page.locator('[data-brand-mark="av01-signal"]')).toHaveCount(1);

  const stage = page.locator("canvas.stage-canvas");
  await expect(stage).toHaveAttribute("data-analysis-source", "synthetic-preview");
  await expect(stage).toHaveAttribute("data-renderer", "webgl2");

  const webglPigments = await readCanvasPigmentStats(page);
  expect(webglPigments.renderer).toBe("webgl2");
  expect(webglPigments.coloredPixels).toBeGreaterThan(100);
  expect(webglPigments.ratioViolations).toBe(0);
  expect(webglPigments.maxGreenDeviation).toBeLessThanOrEqual(4);

  const opticalSystem = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const primaryAction = document.querySelector<HTMLElement>(".source-primary");
    const displayHeading = document.querySelector<HTMLElement>(".entry-copy h1");
    const eyebrow = document.querySelector<HTMLElement>(".entry-shell .eyebrow");
    const mutedCopy = document.querySelector<HTMLElement>(".privacy-note");
    const actionStyle = primaryAction ? getComputedStyle(primaryAction) : null;
    return {
      black: root.getPropertyValue("--ink").trim(),
      white: root.getPropertyValue("--paper").trim(),
      electricBlue: root.getPropertyValue("--electric-blue").trim(),
      actionBackground: actionStyle?.backgroundColor,
      actionText: actionStyle?.color,
      actionRadius: actionStyle?.borderRadius,
      bodyFont: getComputedStyle(document.body).fontFamily,
      displayFont: displayHeading ? getComputedStyle(displayHeading).fontFamily : "",
      eyebrowText: eyebrow ? getComputedStyle(eyebrow).color : "",
      mutedText: mutedCopy ? getComputedStyle(mutedCopy).color : "",
    };
  });
  expect(opticalSystem).toMatchObject({
    black: "#000000",
    white: "#ffffff",
    electricBlue: "#008cff",
    actionBackground: "rgb(0, 140, 255)",
    actionText: "rgb(0, 0, 0)",
    actionRadius: "0px",
    eyebrowText: "rgb(0, 0, 0)",
    mutedText: "rgba(0, 0, 0, 0.58)",
  });
  expect(opticalSystem.bodyFont).toContain("DM Mono");
  expect(opticalSystem.displayFont).toContain("Unbounded");

  await page.getByRole("button", { name: "Pause demo visualization" }).click();
  await expect(page.getByRole("button", { name: "Play demo visualization" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", {
    name: "Open A–B–A–C sequence in Recurrence Atlas",
  }).click();
  await expect(stage).toHaveAttribute("data-scene", "contour");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const activeScenePosition = await page.evaluate(() => {
    const rail = document.querySelector(".scene-list");
    const active = document.querySelector(".scene-button.is-active");
    if (!rail || !active) return null;
    const railRect = rail.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    return {
      railLeft: railRect.left,
      railRight: railRect.right,
      activeLeft: activeRect.left,
      activeRight: activeRect.right,
    };
  });
  expect(activeScenePosition).not.toBeNull();
  expect(activeScenePosition!.activeLeft).toBeGreaterThanOrEqual(activeScenePosition!.railLeft);
  expect(activeScenePosition!.activeRight).toBeLessThanOrEqual(activeScenePosition!.railRight);
  expect(failures).toEqual([]);
});

test("built-in references use the measured path with explicit provenance", async ({ page }) => {
  const failures = captureRuntimeFailures(page);
  await page.goto("/");

  await page.getByRole("button", {
    name: "Open Low / high tone in Auditory Field",
  }).click();

  const stage = page.locator("canvas.stage-canvas");
  await expect(stage).toHaveAttribute("data-scene", "field");
  await expect(stage).toHaveAttribute("data-analysis-source", "measured");
  await expect(stage).toHaveAttribute("data-source-provenance", "built-in-reference");
  await expect(page.getByText("BUILT-IN REFERENCE").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Low / high tone" })).toBeVisible();
  await expect(page.locator('[data-brand-mark="av01-signal"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#000000");

  await page.getByRole("button", { name: "Play audio" }).click();
  await expect.poll(
    async () => Number(await stage.getAttribute("data-analysis-sequence")),
  ).toBeGreaterThan(2);

  await page.getByRole("button", { name: "Change audio source" }).click();
  await expect(page.getByRole("heading", { name: "Five views. One signal." })).toBeVisible();

  // A user file that happens to share the generated filename must not inherit
  // built-in provenance from its name.
  await page.locator('input[type="file"]').setInputFiles({
    name: "reference-01-low-high-spectrum.wav",
    mimeType: "audio/wav",
    buffer: readFileSync(path.join(FIXTURE_DIRECTORY, "tone-375hz-rms025.wav")),
  });
  await expect(stage).toHaveAttribute("data-source-provenance", "user-source");
  await expect(page.getByText("BUILT-IN REFERENCE")).toHaveCount(0);
  expect(failures).toEqual([]);
});

test("measured frames remain complete and controls keep native keyboard behavior", async ({ page }) => {
  const failures = captureRuntimeFailures(page);
  await page.goto("/");
  await openFixture(page, "tone-375hz-rms025.wav");

  const stage = page.locator("canvas.stage-canvas");
  const orbit = page.getByRole("radio", { name: "Tonal Orbit" });
  await orbit.focus();
  await page.keyboard.press("Space");
  await expect(stage).toHaveAttribute("data-scene", "orbit");
  await expect(page.getByRole("button", { name: "Play audio" })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(stage).toHaveAttribute("data-scene", "trace");
  await expect(page.getByRole("radio", { name: "Temporal Scope" })).toBeFocused();

  await page.locator("summary").filter({ hasText: "Frame & comfort" }).click();
  const landscape = page.getByRole("radio", { name: "16:9" });
  await landscape.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "1:1" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "1:1" })).toBeFocused();
  await expect(page.getByRole("radio", { name: "1:1" })).toHaveCSS("border-top-width", "2px");

  await landscape.click();
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.stage-canvas");
    const studioStage = document.querySelector<HTMLElement>(".studio-stage");
    const transport = document.querySelector<HTMLElement>(".transport-bar");
    const inspector = document.querySelector<HTMLElement>(".inspector-panel");
    if (!canvas || !studioStage || !transport || !inspector) return null;
    const canvasBounds = canvas.getBoundingClientRect();
    return {
      objectFit: getComputedStyle(canvas).objectFit,
      displayedRatio: canvasBounds.width / canvasBounds.height,
      intrinsicRatio: canvas.width / canvas.height,
      transportTop: transport.getBoundingClientRect().top,
      inspectorTop: inspector.getBoundingClientRect().top,
    };
  });
  expect(layout).not.toBeNull();
  expect(layout?.objectFit).toBe("contain");
  expect(Math.abs((layout?.displayedRatio ?? 0) - 16 / 9)).toBeLessThan(0.02);
  expect(layout?.intrinsicRatio).toBeCloseTo(16 / 9, 2);
  expect(layout?.transportTop).toBeLessThan(layout?.inspectorTop ?? 0);
  expect(failures).toEqual([]);
});

test("sustained tone remains spectral evidence, never a periodicity claim", async ({ page }) => {
  const failures = captureRuntimeFailures(page);
  await enableCanvas2dFallback(page);
  await page.goto("/");
  await openFixture(page, "tone-6000hz-rms025.wav");

  const stage = page.locator("canvas.stage-canvas");
  await expect(stage).toHaveAttribute("data-renderer", "canvas2d");
  await page.getByRole("radio", { name: "Rhythm Lattice" }).click();
  await page.getByRole("button", { name: "Play audio" }).click();
  await expect.poll(
    async () => Number(await stage.getAttribute("data-analysis-sequence")),
    { timeout: 5_000 },
  ).toBeGreaterThan(125);

  const centroid = Number(await stage.getAttribute("data-centroid-hz"));
  const candidates = Number(await stage.getAttribute("data-transient-candidate-count"));
  expect(centroid).toBeGreaterThan(5_900);
  expect(centroid).toBeLessThan(6_100);
  expect(candidates).toBeLessThanOrEqual(1);
  await expect(stage).toHaveAttribute("data-periodicity-bpm", "0.00");
  await expect(stage).toHaveAttribute("data-periodicity-evidence", "0.0000");

  await page.getByRole("radio", { name: "Auditory Field" }).click();
  const canvasPigments = await readCanvasPigmentStats(page);
  expect(canvasPigments.renderer).toBe("canvas2d");
  expect(canvasPigments.coloredPixels).toBeGreaterThan(100);
  expect(canvasPigments.ratioViolations).toBe(0);
  expect(canvasPigments.maxGreenDeviation).toBeLessThanOrEqual(4);
  await page.getByRole("radio", { name: "Rhythm Lattice" }).click();

  const scenes = [
    ["Auditory Field", "field", "AV01-SCI-001"],
    ["Tonal Orbit", "orbit", "AV01-SCI-002"],
    ["Temporal Scope", "trace", "AV01-SCI-003"],
    ["Rhythm Lattice", "lattice", "AV01-SCI-004"],
    ["Recurrence Atlas", "contour", "AV01-SCI-005"],
  ] as const;
  for (const [label, scene, claimId] of scenes) {
    await page.getByRole("radio", { name: label }).click();
    await expect(stage).toHaveAttribute("data-scene", scene);
    await expect(page.getByText(claimId, { exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Stop audio" }).click();
  await expect(stage).toHaveAttribute("data-analysis-sequence", "0");
  await expect(stage).toHaveAttribute("data-transient-candidate-count", "0");
  expect(failures).toEqual([]);
});

test("periodic transients separate from the matched aperiodic control", async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await enableCanvas2dFallback(page);
  await page.goto("/");
  await openFixture(page, "pulses-120bpm-equivalent.wav");
  await page.getByRole("radio", { name: "Rhythm Lattice" }).click();
  await page.getByRole("button", { name: "Play audio" }).click();

  const stage = page.locator("canvas.stage-canvas");
  await expect(stage).toHaveAttribute("data-renderer", "canvas2d");
  await expect.poll(
    async () => Number(await stage.getAttribute("data-analysis-sequence")),
    { timeout: 8_000 },
  ).toBeGreaterThan(340);
  const periodicBpm = Number(await stage.getAttribute("data-periodicity-bpm"));
  const periodicEvidence = Number(await stage.getAttribute("data-periodicity-evidence"));
  const periodicCandidates = Number(
    await stage.getAttribute("data-transient-candidate-count"),
  );
  expect(periodicBpm).toBeGreaterThan(115);
  expect(periodicBpm).toBeLessThan(125);
  expect(periodicEvidence).toBeGreaterThan(0.65);
  expect(periodicCandidates).toBeGreaterThanOrEqual(12);

  await openFixture(page, "pulses-aperiodic-control.wav");
  await page.getByRole("button", { name: "Play audio" }).click();
  await expect.poll(
    async () => Number(await stage.getAttribute("data-analysis-sequence")),
    { timeout: 8_000 },
  ).toBeGreaterThan(340);
  const aperiodicEvidence = Number(await stage.getAttribute("data-periodicity-evidence"));
  expect(aperiodicEvidence).toBeLessThan(periodicEvidence * 0.75);
  await testInfo.attach("rhythm-readout.json", {
    body: JSON.stringify(
      { periodicBpm, periodicEvidence, periodicCandidates, aperiodicEvidence },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(failures).toEqual([]);
});
