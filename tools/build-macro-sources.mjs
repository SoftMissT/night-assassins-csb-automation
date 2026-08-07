import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "macros");
const outputDirectory = path.join(root, "build", "compendium", "macros");

const macros = [
  { id: "NARollMode000001", file: "na-roll-mode.js", name: "Night Assassins — Teste de Atributo" },
  { id: "NAHitRoll0000001", file: "na-acerto-roll.js", name: "Night Assassins — Rolagem de Acerto" },
  { id: "NADamageRoll0001", file: "na_roll_damage.js", name: "Night Assassins — Rolagem de Dano" },
  { id: "NAAttrLevel00001", file: "na-attribute-level-snapshot.js", name: "Night Assassins — Atributos por Nível" },
  { id: "NAHunterMark0001", file: "na-marca-cacador.js", name: "Night Assassins — Marca do Caçador" },
  { id: "NAGMControl00001", file: "na-gm-control.js", name: "Night Assassins — Controle GM" },
  { id: "NAResistance0001", file: "na-gerenciar-resistencias.js", name: "Night Assassins — Gerenciar Resistências" },
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const [index, macro] of macros.entries()) {
  if (macro.id.length !== 16) throw new Error(`ID inválido para ${macro.file}: ${macro.id}`);

  const command = await readFile(path.join(sourceDirectory, macro.file), "utf8");
  const document = {
    _key: `!macros!${macro.id}`,
    _id: macro.id,
    name: macro.name,
    type: "script",
    author: null,
    img: "icons/svg/dice-target.svg",
    scope: "global",
    command,
    folder: null,
    sort: (index + 1) * 100000,
    ownership: { default: macro.name === "Night Assassins — Controle GM" ? 0 : 2 },
    flags: {},
    _stats: {
      systemId: "custom-system-builder",
      systemVersion: "6.0.2",
      coreVersion: "14",
      createdTime: 0,
      modifiedTime: 0,
      lastModifiedBy: null
    }
  };

  const outputName = `${String(index + 1).padStart(2, "0")}-${path.basename(macro.file, ".js")}.json`;
  await writeFile(path.join(outputDirectory, outputName), `${JSON.stringify(document, null, 2)}\n`);
}

console.log(`Preparadas ${macros.length} macros para o Compendium.`);
