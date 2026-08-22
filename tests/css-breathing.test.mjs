import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, "..", "styles", "na-csb-automation.css");
const css = await readFile(cssPath, "utf-8");

describe("na-csb-automation.css — Breathing Distinction Visual", () => {
  it("contém .na-breathing-summary", () => {
    assert.ok(css.includes(".na-breathing-summary"));
  });

  it("contém .na-breathing--ativa (glow ciano)", () => {
    assert.ok(css.includes(".na-breathing--ativa"));
    assert.ok(css.includes("--na-gm-cyan"));
  });

  it("contém .na-breathing--constante (glow roxo)", () => {
    assert.ok(css.includes(".na-breathing--constante"));
    assert.ok(css.includes("#c49bff"));
  });

  it("contém .na-breathing--ofegante (alerta vermelho)", () => {
    assert.ok(css.includes(".na-breathing--ofegante"));
    assert.ok(css.includes("--na-gm-red"));
  });

  it("contém .na-breathing-form--ativa e --passiva", () => {
    assert.ok(css.includes(".na-breathing-form--ativa"));
    assert.ok(css.includes(".na-breathing-form--passiva"));
  });

  it("contém .na-breathing-ofegante-badge", () => {
    assert.ok(css.includes(".na-breathing-ofegante-badge"));
  });

  it("contém .na-breathing-rounds-left", () => {
    assert.ok(css.includes(".na-breathing-rounds-left"));
  });
});
