import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { BREATHING_CATALOG, BREATHING_FOLDER_NAMES } from "../tools/build-breathing-sources.mjs";

async function sourceDocuments(directory) {
  const files = (await readdir(new URL(directory, import.meta.url))).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(new URL(`${directory}${file}`, import.meta.url), "utf8"))));
}

describe("catálogo de Respirações", () => {
  it("cria as 44 pastas solicitadas e cataloga todas as fontes existentes", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const folders = documents.filter((document) => String(document._key).startsWith("!folders!"));
    const items = documents.filter((document) => document.type === "equippableItem");
    assert.equal(BREATHING_CATALOG.length, 44);
    assert.equal(folders.length, 44);
    assert.equal(new Set(folders.map((folder) => folder.name)).size, 44);
    assert.deepEqual(folders.map((folder) => folder.name).sort(), [...BREATHING_FOLDER_NAMES].sort());
    assert.ok(items.length >= 300, "todas as técnicas oficiais disponíveis devem virar Items");
    assert.ok(items.every((item) => item.folder && item.system?.props?.inventario_categoria === "respiracao"));
  });

  it("preserva as onze Formas mecânicas de Água", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const water = documents.filter((document) => document.type === "equippableItem" && document.system?.props?.respiracao_nome === "Água");
    assert.equal(water.length, 11);
    assert.ok(water.every((item) => item.system.props.tipo_dano_base === "cortante"));
  });
});

describe("catálogo de armas Slayer", () => {
  it("cria uma pasta, um template e as 26 armas roláveis", async () => {
    const documents = await sourceDocuments("../build/compendium/armas-slayer/");
    assert.equal(documents.filter((document) => String(document._key).startsWith("!folders!")).length, 1);
    assert.equal(documents.filter((document) => document.type === "_equippableItemTemplate").length, 1);
    const weapons = documents.filter((document) => document.type === "equippableItem");
    assert.equal(weapons.length, 26);
    assert.ok(weapons.every((item) => item.system?.props?.inventario_categoria === "arma"));
    assert.ok(weapons.every((item) => Array.isArray(item.system.props.arma_tipos_dano)));
  });
});
