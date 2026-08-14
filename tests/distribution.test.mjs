import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { registerSettings, SETTINGS } from "../scripts/settings.mjs";

describe("module distribution", () => {
  it("declara o Compendium de macros no manifesto", async () => {
    const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(
      manifest.download,
      `https://github.com/SoftMissT/night-assassins-csb-automation/releases/download/v${manifest.version}/module.zip`,
    );
    assert.equal(manifest.socket, true);
    assert.deepEqual(manifest.packs.map(({ name, label, type }) => ({ name, label, type })), [
      { name: "night-assassins-macros", label: "Macros Night Assassins", type: "Macro" },
      { name: "night-assassins-slayer", label: "Night Assassin's Slayer", type: "Actor" },
      { name: "night-assassins-onis", label: "Night Assassin's Onis", type: "Actor" },
      { name: "night-assassins-respiracoes", label: "Night Assassin's Respirações", type: "Item" },
      { name: "night-assassins-armas-slayer", label: "Night Assassin's Armas dos Caçadores", type: "Item" },
      { name: "night-assassins-arte", label: "Night Assassin's Arte", type: "Item" },
    ]);
  });

  it("cataloga todo asset de icons/ no Compêndio de Arte", async () => {
    const { readdir } = await import("node:fs/promises");
    const icons = (await readdir(new URL("../assets/icons", import.meta.url))).filter((file) => /\.(webp|png|jpg|jpeg|svg)$/i.test(file));
    assert.ok(icons.length > 0, "assets/icons deve conter ao menos um ícone");

    for (const file of icons) {
      const asset = await readFile(new URL(`../assets/icons/${file}`, import.meta.url));
      assert.ok(asset.length > 0, `${file} deve existir em assets/icons`);
    }

    const source = await readFile(new URL("../tools/build-asset-sources.mjs", import.meta.url), "utf8");
    assert.match(source, /modules\/\$\{MODULE_ID\}\/assets\/icons/i);
  });

  it("prepara um template válido para cada Compêndio de Actor", async () => {
    const files = [
      ["../src/templates/actors/slayer-template.json", "_template"],
      ["../src/templates/actors/oni-template.json", "_template"],
    ];
    for (const [file, type] of files) {
      const actor = JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
      assert.equal(actor.type, type);
      assert.ok(actor.name);
      assert.ok(actor.prototypeToken);
      assert.ok(actor.system?.body);
    }
  });

  it("inclui as doze macros canônicas", async () => {
    const files = [
      "na-roll-mode.js",
      "na-acerto-roll.js",
      "na_roll_damage.js",
      "na-attribute-level-snapshot.js",
      "na-marca-cacador.js",
      "na-gm-control.js",
      "na-gerenciar-resistencias.js",
      "na-gerenciar-status.js",
      "na-gerenciar-acoes.js",
      "na-gerenciar-descanso.js",
      "na-resp-usar-forma.js",
      "na-gerenciar-vida-morte.js",
    ];

    for (const file of files) {
      const command = await readFile(new URL(`../macros/${file}`, import.meta.url), "utf8");
      assert.ok(command.length > 100, `${file} deve conter o código da macro`);
    }
    const hitMacro = await readFile(new URL("../macros/na-acerto-roll.js", import.meta.url), "utf8");
    assert.match(hitMacro, /moduleApi\.rollHit/);
    assert.doesNotMatch(hitMacro, /new Dialog\(|ApplicationV1/);
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
