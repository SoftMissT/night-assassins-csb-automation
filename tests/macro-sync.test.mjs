import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_MACRO_PACK_ID, syncCanonicalMacros } from "../scripts/macro-sync.mjs";

describe("macro-sync", () => {
  it("cria ausentes e atualiza macros gerenciadas dentro da pasta Night Assassins", async () => {
    const created = [];
    const updated = [];
    const docs = [
      { name: "Night Assassins — Rolagem de Dano", uuid: "Compendium.na.damage", toObject: () => ({ name: "Night Assassins — Rolagem de Dano", command: "damage" }) },
      { name: "Night Assassins — Controle GM", uuid: "Compendium.na.gm", toObject: () => ({ name: "Night Assassins — Controle GM", command: "gm" }) },
    ];

    globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
    globalThis.Folder = { create: async (data) => ({ ...data, id: "folder-na" }) };
    globalThis.Macro = {
      createDocuments: async (data) => created.push(...data),
      updateDocuments: async (data) => updated.push(...data),
    };
    game.user.isGM = true;
    game.folders = { find: () => null };
    game.macros = { contents: [{ id: "world-damage", name: "Night Assassins — Rolagem de Dano", folder: "folder-old", flags: { "night-assassins-csb-automation": { sourceId: "Compendium.na.damage" } } }] };
    game.packs = new Map([[CANONICAL_MACRO_PACK_ID, { getDocuments: async () => docs }]]);

    const result = await syncCanonicalMacros();

    assert.deepEqual(result, { created: 1, updated: 1, skipped: 0, folderId: "folder-na" });
    assert.equal(created.length, 1);
    assert.equal(created[0].name, "Night Assassins — Controle GM");
    assert.equal(created[0].folder, "folder-na");
    assert.deepEqual(created[0].ownership, { default: 0 });
    assert.equal(updated.length, 1);
    assert.equal(updated[0]._id, "world-damage");
    assert.equal(updated[0].command, "damage");
  });

  it("não cria macros quando o usuário não é GM", async () => {
    game.user.isGM = false;
    assert.deepEqual(await syncCanonicalMacros(), { created: 0, updated: 0, skipped: 0 });
  });
});
