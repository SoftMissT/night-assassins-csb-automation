import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { registerSettings, SETTINGS } from "../scripts/settings.mjs";

describe("module distribution", () => {
  it("declara o Compendium de macros no manifesto", async () => {
    const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
    assert.equal(manifest.version, "0.3.1");
    assert.equal(manifest.socket, true);
    assert.deepEqual(manifest.packs.map(({ name, label, type }) => ({ name, label, type })), [
      { name: "night-assassins-macros", label: "Macros Night Assassins", type: "Macro" },
      { name: "night-assassins-slayer", label: "Night Assassin's Slayer", type: "Actor" },
      { name: "night-assassins-onis", label: "Night Assassin's Onis", type: "Actor" },
    ]);
  });

  it("prepara um template válido para cada Compêndio de Actor", async () => {
    const files = [
      ["../fvtt-Actor-slayer_template_atual-xif9qdBXTkeL1BXW.json", "_template"],
      ["../fvtt-Actor-oni_template-PQR15WSdSqBcN15w.json", "_template"],
    ];
    for (const [file, type] of files) {
      const actor = JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
      assert.equal(actor.type, type);
      assert.ok(actor.name);
      assert.ok(actor.prototypeToken);
      assert.ok(actor.system?.body);
    }
  });

  it("inclui as oito macros canônicas", async () => {
    const files = [
      "na-roll-mode.js",
      "na-acerto-roll.js",
      "na_roll_damage.js",
      "na-attribute-level-snapshot.js",
      "na-marca-cacador.js",
      "na-gm-control.js",
      "na-gerenciar-resistencias.js",
      "na-gerenciar-status.js",
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
