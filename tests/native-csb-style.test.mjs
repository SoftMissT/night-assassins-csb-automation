import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actorTemplates = ["slayer-template.json", "oni-template.json", "oni-minion-template.json", "npc-template.json"];
const itemTemplates = ["slayer-weapon-template.json", "breathing-form-template.json", "kekkijutsu-item-template.json"];

test("módulo carrega somente o tema mínimo das fichas", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.styles, ["styles/na-sheet-theme.css"]);
  const css = await readFile(new URL("../styles/na-sheet-theme.css", import.meta.url), "utf8");
  assert.match(css, /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Orbitron/);
  assert.doesNotMatch(css, /@font-face|Orbitron-Variable\.woff2/);
  assert.match(css, /\.na-oni-sheet[\s\S]*\.na-oni-minion-sheet[\s\S]*#220b13/);
  assert.match(css, /\.na-slayer-sheet[\s\S]*\.na-npc-sheet[\s\S]*#071321/);
  assert.match(css, /na-resource-pdv[\s\S]*#ff3347/i);
  assert.match(css, /na-resource-pdr[\s\S]*#28d7ff/i);
  assert.match(css, /na-resource-pdk[\s\S]*#b868ff/i);
  assert.doesNotMatch(css, /gradient|box-shadow|animation|transition/i);
});

test("templates classificam PDV, PDR e PDK para o tema mínimo", async () => {
  const slayer = await readFile(new URL("../src/templates/actors/slayer-template.json", import.meta.url), "utf8");
  const npc = await readFile(new URL("../src/templates/actors/npc-template.json", import.meta.url), "utf8");
  const oni = await readFile(new URL("../src/templates/actors/oni-template.json", import.meta.url), "utf8");
  const minion = await readFile(new URL("../src/templates/actors/oni-minion-template.json", import.meta.url), "utf8");
  assert.match(slayer, /na-resource-pdv/);
  assert.match(slayer, /na-resource-pdr/);
  assert.match(npc, /na-resource-pdv/);
  assert.match(npc, /na-resource-pdr/);
  assert.match(oni, /na-resource-pdv/);
  assert.match(oni, /na-resource-pdk/);
  assert.match(minion, /na-resource-pdv/);
  assert.match(minion, /na-resource-pdk/);
});

test("Slayer e Oni usam os sete rótulos Orbitron oficiais nos botões de atributo", async () => {
  const colors = { VIT: "#36D67A", DEX: "#28D7FF", FOR: "#C1000C", CAR: "#FF9100", FDV: "#BB97F9", INT: "#F8EB4D", SAB: "#D45CA4" };
  for (const file of ["slayer-template.json", "oni-template.json"]) {
    const document = JSON.parse(await readFile(new URL(`../src/templates/actors/${file}`, import.meta.url), "utf8"));
    const buttons = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "label"
        && node.style === "button"
        && /custom-orbitron-wrapper/.test(node.value ?? "")
        && />(?:VIT|DEX|FOR|CAR|FDV|INT|SAB)<\/span>/i.test(node.value ?? "")
        && /attr\s*:\s*['"](?:VIT|DEX|FOR|CAR|FDV|INT|SAB)['"]/i.test(node.rollMessage ?? "")) buttons.push(node);
      Object.values(node).forEach(walk);
    };
    walk(document.system);
    assert.equal(buttons.length, 7, `${file} deve ter exatamente sete botões de atributo`);
    for (const [attribute, color] of Object.entries(colors)) {
      const button = buttons.find((entry) => entry.rollMessage.match(/attr\s*:\s*['"]([^'"]+)/i)?.[1]?.toUpperCase() === attribute);
      assert.ok(button, `${file}: botão ${attribute} ausente`);
      assert.match(button.value, /custom-orbitron-wrapper/);
      assert.match(button.value, /fonts\.googleapis\.com\/css2\?family=Orbitron:wght@700/);
      assert.match(button.value, new RegExp(`color:${color}`, "i"));
      assert.match(button.value, new RegExp(`>${attribute}<\\/span>`));
    }
  }
});

test("templates de Item não carregam CSS, fontes remotas ou wrappers decorativos", async () => {
  for (const file of itemTemplates) {
    const source = await readFile(new URL(`../src/templates/items/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /<style|style=|fonts\.googleapis\.com|custom-orbitron-wrapper|na-sheet-text/i, file);
  }
});
