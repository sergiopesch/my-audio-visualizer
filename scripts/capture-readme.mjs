import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const appUrl = process.env.AV01_CAPTURE_URL ?? "http://127.0.0.1:3000";
const fixturePath = path.resolve("output/science-fixtures/motif-a-b-a-c.wav");
const outputPath = path.resolve("output/playwright/av01-studio-readme.png");

async function readPigmentStats(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector("canvas.stage-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        reject(new Error("Missing visualizer canvas."));
        return;
      }

      const renderer = canvas.dataset.renderer ?? "unknown";
      let pixels;
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

      const ratio = 140 / 255;
      const tolerance = 4;
      let coloredPixels = 0;
      let ratioViolations = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (Math.max(red, green, blue) <= tolerance) continue;
        coloredPixels += 1;
        const expectedGreen = red + (blue - red) * ratio;
        if (
          red > green + tolerance ||
          green > blue + tolerance ||
          Math.abs(green - expectedGreen) > tolerance
        ) {
          ratioViolations += 1;
        }
      }
      resolve({ renderer, coloredPixels, ratioViolations });
    });
  }));
}

await access(fixturePath).catch(() => {
  throw new Error(
    `Missing ${fixturePath}. Run "npm run science:fixtures" before capturing the README frame.`,
  );
});
await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const runtimeFailures = [];

  page.on("console", (message) => {
    if (message.type() === "error") runtimeFailures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeFailures.push(`page: ${error.message}`));

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByText("motif-a-b-a-c.wav", { exact: true }).first().waitFor();
  await page.getByRole("radio", { name: "Recurrence Atlas" }).click();
  await page.getByRole("button", { name: "Play audio" }).click();

  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas.stage-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    return (
      canvas.dataset.analysisSource === "measured" &&
      Number(canvas.dataset.similarityCount ?? 0) >= 43
    );
  });

  const pigmentStats = await readPigmentStats(page);
  if (pigmentStats.coloredPixels < 100 || pigmentStats.ratioViolations > 0) {
    throw new Error(`README canvas violated the optical contract: ${JSON.stringify(pigmentStats)}`);
  }

  await page.screenshot({
    path: outputPath,
    type: "png",
  });

  if (runtimeFailures.length > 0) {
    throw new Error(`README capture reported runtime failures:\n${runtimeFailures.join("\n")}`);
  }

  await context.close();
  console.log(`Captured measured README frame at ${outputPath}`);
} finally {
  await browser.close();
}
