import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorldTemplatePatch,
  CANONICAL_TEMPLATE_NAMES,
  syncCanonicalActorTemplates,
  TEMPLATE_PACK_ID,
} from "../scripts/template-sync.mjs";

test("sincronização referencia o Compendium unificado e os quatro templates", () => {
  assert.equal(TEMPLATE_PACK_ID, "night-assassins-csb-automation.night-assassins-templates-de-ficha");
  assert.deepEqual(CANONICAL_TEMPLATE_NAMES, ["slayer_template", "oni_template", "oni_minion_template", "npc_template"]);
});

test("patch canônico substitui apenas contrato visual/mecânico do template", () => {
  const canonical = {
    toObject: () => ({
      _id: "CompendiumId",
      name: "oni_template",
      img: "icons/oni.webp",
      system: { body: { type: "panel" }, hidden: [] },
      prototypeToken: { name: "oni_template" },
      folder: "pack-folder",
    }),
  };
  const patch = buildWorldTemplatePatch(canonical, "0.11.10");
  assert.equal(patch.name, "oni_template");
  assert.deepEqual(patch.system, { body: { type: "panel" }, hidden: [] });
  assert.equal(patch["flags.night-assassins-csb-automation.templateSyncVersion"], "0.11.10");
  assert.equal(patch._id, undefined);
  assert.equal(patch.folder, undefined);
});

test("sincroniza templates existentes uma vez por versão e cria os ausentes", async () => {
  const names = [...CANONICAL_TEMPLATE_NAMES];
  const canonical = names.map((name) => ({
    name,
    toObject: () => ({
      _id: `pack-${name}`,
      _key: `Actor.pack-${name}`,
      name,
      type: "_template",
      img: `${name}.webp`,
      system: { body: { type: "panel", key: `${name}_body` } },
      prototypeToken: { name },
      flags: {},
    }),
  }));
  const updates = [];
  const creations = [];
  const worldActors = [
    {
      name: "slayer_template",
      type: "_template",
      flags: {},
      update: async (patch, options) => updates.push({ name: "slayer_template", patch, options }),
    },
    {
      name: "oni_template",
      type: "_template",
      flags: { "night-assassins-csb-automation": { templateSyncVersion: "0.11.10" } },
      update: async (patch, options) => updates.push({ name: "oni_template", patch, options }),
    },
    {
      name: "oni_minion_template",
      type: "_template",
      flags: {},
      update: async (patch, options) => updates.push({ name: "oni_minion_template", patch, options }),
    },
  ];
  const previousGame = globalThis.game;
  const previousActor = globalThis.Actor;
  globalThis.game = {
    user: { isGM: true },
    actors: { contents: worldActors },
    packs: new Map([[TEMPLATE_PACK_ID, { getDocuments: async () => canonical }]]),
    modules: new Map(),
  };
  globalThis.Actor = { create: async (source, options) => creations.push({ source, options }) };

  try {
    const result = await syncCanonicalActorTemplates({ version: "0.11.10" });
    assert.deepEqual(result, { created: 1, updated: 2, skipped: 1 });
    assert.deepEqual(updates.map(({ name }) => name), ["slayer_template", "oni_minion_template"]);
    assert.equal(updates[0].patch["flags.night-assassins-csb-automation.templateSyncVersion"], "0.11.10");
    assert.deepEqual(updates[0].options, {
      diff: false,
      recursive: false,
      render: false,
      naCsbAutomation: true,
    });
    assert.equal(creations[0].source.name, "npc_template");
    assert.equal(creations[0].source._id, undefined);
    assert.equal(creations[0].source.flags["night-assassins-csb-automation"].templateSyncVersion, "0.11.10");
  } finally {
    globalThis.game = previousGame;
    globalThis.Actor = previousActor;
  }
});
