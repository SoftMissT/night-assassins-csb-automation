import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "macros");
const outputDirectory = path.join(root, "build", "compendium", "macros");

const ICONS = "modules/night-assassins-csb-automation/assets/icons/macros";
const macros = [
  { id: "NARollMode000001", file: "na-roll-mode.js", name: "Night Assassins — Teste de Atributo", icon: `${ICONS}/na-roll-mode_icon.webp` },
  { id: "NAHitRoll0000001", file: "na-acerto-roll.js", name: "Night Assassins — Rolagem de Acerto", icon: `${ICONS}/na-acerto-roll_icon.webp` },
  { id: "NADamageRoll0001", file: "na_roll_damage.js", name: "Night Assassins — Rolagem de Dano", icon: `${ICONS}/na_roll_damage_icon.webp` },
  { id: "NAAttrLevel00001", file: "na-attribute-level-snapshot.js", name: "Night Assassins — Atributos por Nível", icon: `${ICONS}/na-attribute-level-snapshot_icon.webp` },
  { id: "NAHunterMark0001", file: "na-marca-cacador.js", name: "Night Assassins — Marca do Caçador", icon: `${ICONS}/na-marca-cacador_icon.webp` },
  { id: "NAGMControl00001", file: "na-gm-control.js", name: "Night Assassins — Controle GM", icon: `${ICONS}/na-gm-control_icon.webp` },
  { id: "NAResistance0001", file: "na-gerenciar-resistencias.js", name: "Night Assassins — Gerenciar Resistências", icon: `${ICONS}/na-gerenciar-resistencias_icon.webp` },
  { id: "NAStatusManage01", file: "na-gerenciar-status.js", name: "Night Assassins — Gerenciar Status", icon: `${ICONS}/na-gerenciar-status_icon.webp` },
  { id: "NAActionManage01", file: "na-gerenciar-acoes.js", name: "Night Assassins — Gerenciar Ações", icon: `${ICONS}/na-gerenciar-acoes_icon.webp` },
  { id: "NARestManage0001", file: "na-gerenciar-descanso.js", name: "Night Assassins — Gerenciar Descanso", icon: `${ICONS}/na-gerenciar-descanso_icon.webp` },
  { id: "NARespFormUse001", file: "na-resp-usar-forma.js", name: "Night Assassins — Usar Forma de Respiração", icon: `${ICONS}/na-resp-usar-forma_icon.webp` },
  { id: "NALifeDeath00001", file: "na-gerenciar-vida-morte.js", name: "Night Assassins — Vida e Morte", icon: `${ICONS}/na-gerenciar-vida-morte_icon.webp` },
  { id: "NAAdvStates00001", file: "na-gerenciar-estados-avancados.js", name: "Night Assassins — Estados Avançados", icon: `${ICONS}/na-gerenciar-estados-avancados_icon.webp` },
  { id: "NAInterlude00001", file: "na-gerenciar-interludio.js", name: "Night Assassins — Gerenciar Interludio", icon: `${ICONS}/na-gerenciar-interludio_icon.webp` },
  { id: "NAWeaponRepair01", file: "na-corrigir-armas.js", name: "Night Assassins — Corrigir Armas dos Caçadores", icon: `${ICONS}/na-corrigir-armas_icon.webp` },
  { id: "NABreathRepair01", file: "na-corrigir-respiracoes.js", name: "Night Assassins — Corrigir Respirações dos Caçadores", icon: `${ICONS}/na-corrigir-respiracoes_icon.webp` },
  { id: "NAPhoneChat00001", file: "na-telefone.js", name: "Night Assassins — Telefone", icon: `${ICONS}/na-telefone_icon.webp` },
  { id: "NAKekkUse0000001", file: "na-usar-kekki.js", name: "Night Assassins — Usar Kekkijutsu", icon: `${ICONS}/na-usar-kekki_icon.webp` },
  { id: "NABloodGift00001", file: "na-oni-blood-gift.js", name: "Night Assassins — Dom do Sangue", icon: `${ICONS}/na-oni-blood-gift_icon.webp` },
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
    img: macro.icon ?? "icons/svg/dice-target.svg",
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


