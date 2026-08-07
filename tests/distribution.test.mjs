import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { registerSettings, SETTINGS } from "../scripts/settings.mjs";

describe("module distribution", () => {
  it("declara o Compendium de macros no manifesto", async () => {
    const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
    assert.equal(manifest.version, "0.1.1");
    assert.deepEqual(manifest.packs, [{
      name: "night-assassins-macros",
      label: "Macros Night Assassins",
      path: "packs/night-assassins-macros",
      type: "Macro",
      system: "custom-system-builder",
    }]);
  });

  it("inclui as cinco macros canônicas", async () => {
    const files = [
      "na-roll-mode.js",
      "na-acerto-roll.js",
      "na_roll_damage.js",
      "na-attribute-level-snapshot.js",
      "na-marca-cacador.js",
    ];

    for (const file of files) {
      const command = await readFile(new URL(`../macros/${file}`, import.meta.url), "utf8");
      assert.ok(command.length > 100, `${file} deve conter o código da macro`);
    }
  });
});

describe("module settings", () => {
  it("registra automação da ficha e relay de dano", () => {
    const registrations = [];
    globalThis.game = {
      settings: {
        register: (moduleId, key, config) => registrations.push({ moduleId, key, config }),
      },
    };

    registerSettings();

    assert.deepEqual(registrations.map(({ key }) => key), [
      SETTINGS.enableSheetAutomation,
      SETTINGS.enableDamageRelay,
    ]);
    assert.ok(registrations.every(({ config }) => config.config && config.scope === "world"));
  });
});
