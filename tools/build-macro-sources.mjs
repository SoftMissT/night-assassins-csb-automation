import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "macros");
const outputDirectory = path.join(root, "build", "compendium", "macros");

const macros = [
  { id: "NARollMode000001", file: "na-roll-mode.js", name: "Night Assassins — Teste de Atributo", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Attributes_By_Level_icon.webp" },
  { id: "NAHitRoll0000001", file: "na-acerto-roll.js", name: "Night Assassins — Rolagem de Acerto", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Slayer_Weapon_icon.webp" },
  { id: "NADamageRoll0001", file: "na_roll_damage.js", name: "Night Assassins — Rolagem de Dano", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Slayer_Weapon_icon.webp" },
  { id: "NAAttrLevel00001", file: "na-attribute-level-snapshot.js", name: "Night Assassins — Atributos por Nível", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Attributes_By_Level_icon.webp" },
  { id: "NAHunterMark0001", file: "na-marca-cacador.js", name: "Night Assassins — Marca do Caçador", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_GM_Control_icon.webp" },
  { id: "NAGMControl00001", file: "na-gm-control.js", name: "Night Assassins — Controle GM", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_GM_Control_icon.webp" },
  { id: "NAResistance0001", file: "na-gerenciar-resistencias.js", name: "Night Assassins — Gerenciar Resistências", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Attributes_By_Level_icon.webp" },
  { id: "NAStatusManage01", file: "na-gerenciar-status.js", name: "Night Assassins — Gerenciar Status", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Gerenciar_Acoes_icon.webp" },
  { id: "NAActionManage01", file: "na-gerenciar-acoes.js", name: "Night Assassins — Gerenciar Ações", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Gerenciar_Acoes_icon.webp" },
  { id: "NARestManage0001", file: "na-gerenciar-descanso.js", name: "Night Assassins — Gerenciar Descanso", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Gerenciar_Acoes_icon.webp" },
  { id: "NARespFormUse001", file: "na-resp-usar-forma.js", name: "Night Assassins — Usar Forma de Respiração", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Breathing_Form_icon.webp" },
  { id: "NALifeDeath00001", file: "na-gerenciar-vida-morte.js", name: "Night Assassins — Vida e Morte", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Gerenciar_Acoes_icon.webp" },
  { id: "NAAdvStates00001", file: "na-gerenciar-estados-avancados.js", name: "Night Assassins — Estados Avançados", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Gerenciar_Acoes_icon.webp" },
  { id: "NAInterlude00001", file: "na-gerenciar-interludio.js", name: "Night Assassins — Gerenciar Interludio", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Gerenciar_Acoes_icon.webp" },
  { id: "NAWeaponRepair01", file: "na-corrigir-armas.js", name: "Night Assassins — Corrigir Armas dos Caçadores", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Slayer_Weapon_icon.webp" },
  { id: "NABreathRepair01", file: "na-corrigir-respiracoes.js", name: "Night Assassins — Corrigir Respirações dos Caçadores", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Breathing_Form_icon.webp" },
  { id: "NAPhoneChat00001", file: "na-telefone.js", name: "Night Assassins — Telefone", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_GM_Control_icon.webp" },
  { id: "NAKekkUse0000001", file: "na-usar-kekki.js", name: "Night Assassins — Usar Kekkijutsu", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_Breathing_Form_icon.webp" },
  { id: "NABloodGift00001", file: "na-oni-blood-gift.js", name: "Night Assassins — Dom do Sangue", icon: "modules/night-assassins-csb-automation/assets/icons/Night_Assassins_GM_Control_icon.webp" },
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


