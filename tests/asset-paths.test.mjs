/**
 * @fileoverview Anti-regressão de caminhos de imagem (Assets).
 *
 * Bugs reais reportados pelo operador, repetidamente, ao longo de várias
 * versões: "NA Respiração - Forma ainda sem imagem", "npc_template ainda sem
 * imagem", "oni_template ainda sem imagem", "ainda tem armas sem imagens",
 * `GET /icons/svg/wind.svg 404`.
 *
 * Causa raiz comum: templates e catálogos referenciando caminhos que NÃO
 * existem dentro do módulo — seja um arquivo do core do Foundry que não existe
 * (`icons/svg/wind.svg`), seja um caminho relativo que parece do módulo mas
 * resolve para a raiz do Foundry (`icons/items/...` em vez de
 * `modules/night-assassins-csb-automation/assets/icons/items/...`).
 *
 * Estes testes falham se qualquer imagem referenciada não existir de fato no
 * repositório, e se qualquer template/catálogo voltar a usar arte genérica do
 * core em vez da arte própria do módulo.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_PREFIX = "modules/night-assassins-csb-automation/";

const IMAGE_KEYS = new Set(["img", "image", "src"]);

function listJsonFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsonFiles(full));
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

/**
 * Coleta todo valor de imagem de uma árvore JSON.
 *
 * `flags` é ignorado de propósito: ali ficam configurações persistidas de
 * outros módulos do Foundry (ex.: `tokenizer-2`), que são dados de terceiros
 * e não fazem parte da arte que este módulo entrega.
 */
function collectImages(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectImages(item, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === "flags") continue;
    if (IMAGE_KEYS.has(key) && typeof value === "string" && value.trim()) {
      out.push(value.trim());
    }
    collectImages(value, out);
  }
  return out;
}

const TARGET_FILES = [
  ...listJsonFiles(path.join(repoRoot, "src", "templates")),
  ...listJsonFiles(path.join(repoRoot, "catalogs")),
];

describe("Caminhos de assets — imagens existem e são do módulo", () => {
  for (const file of TARGET_FILES) {
    const relative = path.relative(repoRoot, file);

    it(`${relative}: toda imagem do módulo existe no disco`, () => {
      const content = JSON.parse(fs.readFileSync(file, "utf8"));
      const broken = collectImages(content)
        .filter((img) => img.startsWith(MODULE_PREFIX))
        .filter((img) => !fs.existsSync(path.join(repoRoot, img.slice(MODULE_PREFIX.length))))
        .filter((img, index, all) => all.indexOf(img) === index);

      assert.deepEqual(
        broken,
        [],
        `Imagens referenciadas que não existem no repositório:\n${broken.join("\n")}`,
      );
    });

    it(`${relative}: não usa arte genérica do core do Foundry`, () => {
      const content = JSON.parse(fs.readFileSync(file, "utf8"));
      // `systems/...` é legítimo (arte do próprio Custom System Builder) e
      // `http(s)` é externo — o que não pode é apontar para a raiz do Foundry
      // (ex.: `icons/svg/sword.svg`, `icons/items/...`), porque isso ou dá 404
      // ou entrega arte genérica no lugar da arte do módulo.
      const coreArt = collectImages(content)
        .filter((img) => !img.startsWith(MODULE_PREFIX))
        .filter((img) => !img.startsWith("systems/"))
        .filter((img) => !/^https?:\/\//.test(img))
        .filter((img, index, all) => all.indexOf(img) === index);

      assert.deepEqual(
        coreArt,
        [],
        `Caminhos que não são do módulo (usar assets/ do próprio módulo):\n${coreArt.join("\n")}`,
      );
    });
  }
});

describe("Templates de Actor — identidade visual própria", () => {
  const templates = [
    ["slayer-template.json", "slayer_template"],
    ["oni-template.json", "oni_template"],
    ["oni-minion-template.json", "oni_minion_template"],
    ["npc-template.json", "npc_template"],
  ];

  for (const [file, expectedName] of templates) {
    it(`${file}: nome canônico e ícone próprio do módulo`, () => {
      const full = path.join(repoRoot, "src", "templates", "actors", file);
      const doc = JSON.parse(fs.readFileSync(full, "utf8"));

      assert.equal(doc.name, expectedName, `O template deve se chamar "${expectedName}".`);
      assert.ok(
        String(doc.img ?? "").startsWith(MODULE_PREFIX),
        `${file} deve usar um ícone do próprio módulo, não o logo genérico do CSB. Atual: ${doc.img}`,
      );
      assert.equal(
        doc.prototypeToken?.name,
        expectedName,
        `prototypeToken.name deve acompanhar o nome do template (${expectedName}).`,
      );
    });
  }
});
