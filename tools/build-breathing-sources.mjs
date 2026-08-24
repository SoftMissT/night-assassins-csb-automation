import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { breathingIconPath } from "../scripts/breathing-icons.mjs";
import { flameFormById } from "../scripts/flame-breathing-data.mjs";
import { stoneFormById } from "../scripts/stone-breathing-data.mjs";
import { mistFormById } from "../scripts/mist-breathing-data.mjs";
import { metalFormById } from "../scripts/metal-breathing-data.mjs";
import { snowFormById } from "../scripts/snow-breathing-data.mjs";
import { windFormById } from "../scripts/wind-breathing-data.mjs";
import { markdownToFoundryHtml } from "./compendium-catalog-utils.mjs";
import { useNativeCsbPresentation } from "./native-csb-style.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "catalogs", "breathing.json");
const outputDirectory = path.join(root, "build", "compendium", "respiracoes");
const templatePath = path.join(root, "src", "templates", "items", "breathing-form-template.json");

export const BREATHING_CATALOG = Object.freeze([
  "Água", "Ameixeira", "Amor", "Aranha", "Areia", "Besta", "Cerejeira", "Chamas", "Corvo", "Cristal", "Dragão",
  "Eclipse", "Estrelas", "Flores", "Grama", "Insetos", "Lobo", "Lua", "Luz", "Macaco", "Madeira", "Magma", "Metal",
  "Neve", "Nevasca", "Névoa", "Pedra", "Raposa", "Sangue", "Serpente", "Sol", "Som", "Sombras", "Sonhos", "Tartaruga",
  "Tempo", "Tigre", "Tinta", "Tormenta", "Trovão", "Tubarão", "Vagalume", "Veneno", "Vento",
]);

export const BREATHING_FOLDER_NAMES = Object.freeze([
  "Respiração da Água", "Respiração da Ameixeira", "Respiração do Amor", "Respiração da Aranha", "Respiração da Areia", "Respiração da Besta",
  "Respiração da Cerejeira", "Respiração das Chamas", "Respiração do Corvo", "Respiração do Cristal", "Respiração do Dragão", "Respiração do Eclipse",
  "Respiração das Estrelas", "Respiração das Flores", "Respiração da Grama", "Respiração dos Insetos", "Respiração do Lobo", "Respiração da Lua",
  "Respiração da Luz", "Respiração do Macaco", "Respiração da Madeira", "Respiração do Magma", "Respiração do Metal", "Respiração da Neve",
  "Respiração da Nevasca", "Respiração da Névoa", "Respiração da Pedra", "Respiração da Raposa", "Respiração do Sangue", "Respiração da Serpente",
  "Respiração do Sol", "Respiração do Som", "Respiração das Sombras", "Respiração dos Sonhos", "Respiração da Tartaruga", "Respiração do Tempo",
  "Respiração do Tigre", "Respiração da Tinta", "Respiração da Tormenta", "Respiração do Trovão", "Respiração do Tubarão", "Respiração do Vagalume",
  "Respiração do Veneno", "Respiração do Vento",
]);

/**
 * Respirações com motor de estado/combate real (service dedicado, testes,
 * auditoria forma-por-forma contra a fonte oficial). O catálogo mecânico
 * (`catalogs/breathing.json`) contém dados de todas as Respirações do jogo,
 * mas só estas são publicadas no pack Foundry distribuído — as demais não
 * têm mecânica implementada (não passam de descrição), então não vão para
 * o build até receberem o mesmo tratamento.
 */
export const PUBLISHED_BREATHINGS = Object.freeze(["Chamas", "Metal", "Neve", "Névoa", "Pedra", "Vento"]);

const BREATHING_ROMAJI = Object.freeze({
  Chamas: "Honoo no Kokyu",
  Pedra: "Iwa no Kokyu",
  Metal: "Kinzoku no Kokyu",
  Neve: "Yuki no Kokyu",
  "Névoa": "Kasumi no Kokyu",
  Vento: "Kaze no Kokyu",
});

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (catalog.format !== 1 || !Array.isArray(catalog.documents)) throw new Error("Catálogo mecânico de Respirações inválido.");
{
  const publishedItems = catalog.documents.filter((document) => document.type === "equippableItem"
    && PUBLISHED_BREATHINGS.includes(document.system?.props?.respiracao_nome ?? ""));
  const publishedFolderIds = new Set(publishedItems.map((item) => item.folder).filter(Boolean));
  catalog.documents = catalog.documents.filter((document) => {
    if (document.type === "equippableItem") return PUBLISHED_BREATHINGS.includes(document.system?.props?.respiracao_nome ?? "");
    if (document.type === "Item") return publishedFolderIds.has(document._id);
    return true;
  });
}
const templateExport = JSON.parse(await readFile(templatePath, "utf8"));
const breathingTemplate = templateExport.items?.find((item) => item.type === "_equippableItemTemplate" && item.id === "NABreathTpl00001");
if (!breathingTemplate) throw new Error("Template de Forma de Respiração inválido.");
const templateDocument = { _id: breathingTemplate.id, _key: `!items!${breathingTemplate.id}`, name: breathingTemplate.name, type: breathingTemplate.type, img: breathingTemplate.img, system: breathingTemplate.data };
useNativeCsbPresentation(templateDocument);
catalog.documents = catalog.documents.map((document) => document.type === "_equippableItemTemplate" && document._id === templateDocument._id ? templateDocument : document);

for (const document of catalog.documents) {
  if (document.type !== "equippableItem") continue;
  const icon = breathingIconPath(document.system?.props?.respiracao_nome);
  if (icon) document.img = icon;
  const flame = flameFormById(document.system?.props?.forma_id);
  const stone = stoneFormById(document.system?.props?.forma_id);
  const mist = mistFormById(document.system?.props?.forma_id);
  const metal = metalFormById(document.system?.props?.forma_id);
  const snow = snowFormById(document.system?.props?.forma_id);
  const wind = windFormById(document.system?.props?.forma_id);
  const props = document.system.props;
  props.forma_passiva = flame?.passive || ["metal_05", "neve_08"].includes(String(props.forma_id ?? ""))
    || /passiva/iu.test(String(props.tipo_manobra ?? "")) ? 1 : 0;
  if (flame) {
    document.name = `${BREATHING_ROMAJI.Chamas} — ${flame.name}`;
    document.system.props.nome_forma = flame.name;
    document.system.props.nome_jp = flame.ptName ?? "";
    document.system.props.tipo_manobra = flame.passive ? "Passiva" : ({ ataque: "Ação de Ataque", especial: "Ação Especial", reacao: "Reação" }[flame.action] ?? flame.action);
    for (let level = 1; level <= 4; level += 1) {
      const mechanics = flame.levels[level - 1];
      document.system.props[`tem_nvl${level}`] = mechanics ? 1 : 0;
      document.system.props[`nvl${level}_custo`] = mechanics?.cost ?? 0;
      document.system.props[`nvl${level}_dano`] = mechanics?.damage ?? "";
      document.system.props[`nvl${level}_tipos_dano`] = Array.isArray(flame.damageTypes) ? flame.damageTypes.join(",") : "";
      document.system.props[`nvl${level}_status`] = "";
      document.system.props[`nvl${level}_buff`] = "";
    }
  }
  const curated = stone ?? mist ?? metal ?? snow ?? wind;
  if (curated) {
    const breathingName = String(props.respiracao_nome ?? "");
    const romaji = BREATHING_ROMAJI[breathingName] ?? breathingName;
    document.name = `${romaji} — ${curated.name}`;
    document.system.props.nome_forma = curated.name;
    document.system.props.nome_jp = curated.ptName ?? "";
    const action = curated.action ?? curated.actions?.join(" + ") ?? "";
    document.system.props.tipo_manobra = ({ ataque: "Ação de Ataque", especial: "Ação Especial", reacao: "Reação", unica: "Ação Única", completa: "Ação Completa" }[action] ?? action);
    for (let level = 1; level <= 4; level += 1) {
      const mechanics = curated.levels[level - 1];
      document.system.props[`tem_nvl${level}`] = mechanics ? 1 : 0;
      document.system.props[`nvl${level}_custo`] = mechanics?.cost ?? 0;
      document.system.props[`nvl${level}_dano`] = mechanics?.damage ?? mechanics?.bonus ?? "";
      document.system.props[`nvl${level}_tipos_dano`] = Array.isArray(mechanics?.damageTypes) ? mechanics.damageTypes.join(",") : "";
    }
  }
  const canonicalPrefix = BREATHING_ROMAJI[String(props.respiracao_nome ?? "")];
  if (canonicalPrefix && !String(document.name).startsWith(`${canonicalPrefix} — `)) {
    const legacyName = String(document.name ?? "").split(" — ").slice(1).join(" — ")
      || String(props.nome_forma ?? props.nome_jp ?? "Forma");
    document.name = `${canonicalPrefix} — ${legacyName}`;
  }
  const richTextKeys = ["descricao", "requisito_texto", "gatilho_texto", "combo_texto", "notas_texto", "sinergias_texto", "nvl1_efeito", "nvl2_efeito", "nvl3_efeito", "nvl4_efeito"];
  for (const key of richTextKeys) {
    if (typeof props[key] === "string" && props[key].trim()) props[key] = markdownToFoundryHtml(props[key]);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(catalog.documents.map((document, index) => {
  const id = document._id ?? `document-${index}`;
  const kind = document.type === "Item" ? "folder" : "item";
  return writeFile(path.join(outputDirectory, `${String(index).padStart(4, "0")}-${kind}-${id}.json`), `${JSON.stringify(document, null, 2)}\n`);
}));

const folderCount = catalog.documents.filter((document) => document.type === "Item").length;
const itemCount = catalog.documents.filter((document) => document._key?.startsWith("!items!") && document.type !== "Item").length - 1;
console.info(`Preparados ${itemCount} Items em ${folderCount} pastas de Respiração.`);
