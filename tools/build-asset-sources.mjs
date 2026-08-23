import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDirectory = path.join(root, "assets", "icons");
const outputDirectory = path.join(root, "build", "compendium", "artes");

const MODULE_ID = "night-assassins-csb-automation";

const labels = Object.freeze({
  na_Slayer_Weapon_icon: "Ícone — Arma do Slayer",
  "na-Breathing_Form_icon": "Ícone — Forma de Respiração",
  "na-gm-control_icon": "Ícone — Controle do GM",
  "na-roll-mode_icon": "Ícone — Teste de Atributo",
  "na-gerenciar-acoes_icon": "Ícone — Gerenciar Ações",
  "na-gerenciar-status_icon": "Ícone — Gerenciar Status",
  "na-gerenciar-descanso_icon": "Ícone — Gerenciar Descanso",
  "na-gerenciar-vida-morte_icon": "Ícone — Vida e Morte",
  "na-gerenciar-estados-avancados_icon": "Ícone — Estados Avançados",
  "na-gerenciar-interludio_icon": "Ícone — Interlúdio",
  "na-gerenciar-resistencias_icon": "Ícone — Gerenciar Resistências",
  "na-corrigir-armas_icon": "Ícone — Corrigir Armas",
  "na-corrigir-respiracoes_icon": "Ícone — Corrigir Respirações",
  "na-resp-usar-forma_icon": "Ícone — Usar Forma de Respiração",
  "na-usar-kekki_icon": "Ícone — Usar Kekkijutsu",
  "na-marca-cacador_icon": "Ícone — Marca do Caçador",
  "na-oni-blood-gift_icon": "Ícone — Dom do Sangue",
  "na-acerto-roll_icon": "Ícone — Rolagem de Acerto",
  "na-attribute-level-snapshot_icon": "Ícone — Atributos por Nível",
  "na-roll_damage_icon": "Ícone — Rolagem de Dano",
  "na-telefone_icon": "Ícone — Telefone",
  resp_agua: "Ícone — Respiração da Água",
  resp_amor: "Ícone — Respiração do Amor",
  resp_flor: "Ícone — Respiração da Flor",
  resp_raposa: "Ícone — Respiração da Raposa",
  resp_serpente: "Ícone — Respiração da Serpente",
  resp_metal: "Ícone — Respiração do Metal",
  resp_madeira: "Ícone — Respiração da Madeira",
  resp_chamas: "Ícone — Respiração das Chamas",
  resp_sombras: "Ícone — Respiração das Sombras",
});

function toArtId(file) {
  const base = path.parse(file).name;
  return createHash("sha1").update(`night-assassins-art:${base}`).digest("hex").slice(0, 16);
}

function artDocument(file, index) {
  const id = toArtId(file);
  if (id.length !== 16) throw new Error(`ID de arte inválido (${id.length}): ${id}`);
  const base = path.parse(file).name;
  const label = labels[base] || `Ícone — ${base}`;
  return {
    _id: id,
    _key: `!items!${id}`,
    name: label,
    type: "equippableItem",
    img: `modules/${MODULE_ID}/assets/icons/${file}`,
    system: {
      body: {
        contents: [],
        key: "custom_body",
        type: "panel",
      },
      templateSystemUniqueVersion: null,
      uniqueId: file,
      display: { width: 600, height: 600, fix_size: false, pp_width: 64, pp_height: 64 },
      header: { contents: [], key: "custom_header", type: "panel" },
      hidden: [],
      template: "",
      props: {},
      container: null,
      unique: null,
    },
    effects: [],
    folder: null,
    sort: index * 100000,
    ownership: { default: 0 },
    flags: {},
    _stats: {
      systemId: "custom-system-builder",
      systemVersion: "6.0.2",
      coreVersion: "14",
      createdTime: 0,
      modifiedTime: 0,
      lastModifiedBy: null,
    },
  };
}

async function walkAssets(dir, base = assetsDirectory) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkAssets(full, base));
    } else if (/\.(webp|png|jpg|jpeg|svg)$/i.test(entry.name)) {
      results.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }
  return results;
}

const files = (await walkAssets(assetsDirectory)).sort();

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(files.map((file, index) => writeFile(
  path.join(outputDirectory, `${String(index).padStart(2, "0")}-${path.parse(file).name}.json`),
  `${JSON.stringify(artDocument(file, index), null, 2)}\n`,
)));

console.log(`Preparados ${files.length} documentos de arte para o Compêndio de Arte.`);