import path from "node:path";

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

test("landing experience is hydrated, explicit, and responsive", async ({ page }) => {
  const failures = captureRuntimeFailures(page);
  await page.goto("/");

  await expect(page).toHaveTitle("AV/01 — Audio Visualizer");
  await expect(page.getByRole("heading", { name: "Sound, seen." })).toBeVisible();
  await expect(page.getByText("ILLUSTRATIVE · NOT MEASURED")).toBeVisible();

  const stage = page.locator("canvas.stage-canvas");
  await expect(stage).toHaveAttribute("data-analysis-source", "synthetic-preview");
  await expect(stage).toHaveAttribute("data-renderer", /^(webgl2|canvas2d)$/);

  await page.getByRole("button", { name: "Pause demo visualization" }).click();
  await expect(page.getByRole("button", { name: "Play demo visualization" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
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
    await expect(page.getByRole("region", { name: new RegExp(claimId) })).toBeVisible();
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
  console.log("RHYTHM_E2E", {
    periodicBpm,
    periodicEvidence,
    periodicCandidates,
    aperiodicEvidence,
  });
  expect(failures).toEqual([]);
});
