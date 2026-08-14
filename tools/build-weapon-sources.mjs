import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractWeaponRankFormulas } from "../scripts/weapon-service.mjs";
import { markdownToFoundryHtml } from "./compendium-catalog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "catalogs", "slayer-weapons.json");
const outputDirectory = path.join(root, "build", "compendium", "armas-slayer");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (catalog.format !== 1 || !Array.isArray(catalog.documents)) throw new Error("Catálogo mecânico de armas Slayer inválido.");

const templatePath = path.join(root, "src", "templates", "items", "slayer-weapon-template.json");
const weaponTemplate = JSON.parse(await readFile(templatePath, "utf8"));
weaponTemplate._key = `!items!${weaponTemplate._id}`;

const documents = catalog.documents.map((document) => {
  if (document.type === "_equippableItemTemplate" && document._id === weaponTemplate._id) return weaponTemplate;
  if (document.type !== "equippableItem") return document;
  const props = document.system?.props ?? {};
  const profiles = Array.isArray(props.arma_perfis_ataque) ? props.arma_perfis_ataque : [];
  const formulas = extractWeaponRankFormulas(props.arma_regra_completa);
  return {
    ...document,
    system: {
      ...document.system,
      props: {
        ...props,
        descricao: markdownToFoundryHtml(props.descricao ?? ""),
        arma_regra_completa: markdownToFoundryHtml(props.arma_regra_completa ?? ""),
        arma_formulas_por_rank: formulas,
        arma_perfis_resumo: profiles.map((profile) => profile.formula_texto || profile.nome).filter(Boolean).join("\n"),
        arma_tipos_dano_resumo: (Array.isArray(props.arma_tipos_dano) ? props.arma_tipos_dano : []).join(", "),
        arma_atributos_resumo: (Array.isArray(props.arma_dano_atributo) ? props.arma_dano_atributo : []).join(" ou "),
        arma_rank_d_formula: formulas.D?.join(" | ") ?? "",
        arma_rank_c_formula: formulas.C?.join(" | ") ?? "",
        arma_rank_b_formula: formulas.B?.join(" | ") ?? "",
        arma_rank_a_formula: formulas.A?.join(" | ") ?? "",
        arma_rank_s_formula: formulas.S?.join(" | ") ?? "",
        arma_rank_ss_formula: formulas.SS?.join(" | ") ?? "",
      },
    },
  };
});

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(documents.map((document, index) => {
  const id = document._id ?? `document-${index}`;
  return writeFile(path.join(outputDirectory, `${String(index).padStart(3, "0")}-${id}.json`), `${JSON.stringify(document, null, 2)}\n`);
}));

const itemCount = documents.filter((document) => document._key?.startsWith("!items!") && !String(document.type).startsWith("_")).length;
console.info(`Preparados ${itemCount} Items de armas Slayer.`);
