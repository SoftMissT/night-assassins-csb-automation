import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(root, "src", "templates", "actors", "oni-template.json");

const REMOVED_KEYS = new Set([
  "oni_secao_biografia",
  "perfil_oni_bio",
  "oni_secao_inventario",
  "inventario_oni_titulo",
  "inventario_oni_moedas_panel",
  "inventario_oni_armas",
  "inventario_oni_equipamentos",
  "inventario_oni_itens",
]);

/** @returns {Promise<void>} */
export async function pruneOniTemplate() {
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const tabbedPanel = template.system.body.contents.find(
    /** @param {{type?: string}} node */
    (node) => node.type === "tabbedPanel",
  );
  if (!tabbedPanel) throw new Error("tabbedPanel do Oni não encontrado.");

  const tabs = tabbedPanel.contents;
  const combatTab = tabs[0];
  const before = JSON.stringify(tabs).length;

  combatTab.contents = combatTab.contents.filter((node) => !REMOVED_KEYS.has(node.key));

  const skillsIndex = tabs.findIndex((tab) => tab.key === "skills_oni_tab");
  if (skillsIndex !== -1) {
    const skillsTab = tabs[skillsIndex];
    const kekkijutsuContainer = skillsTab.contents.find((node) => node.key === "inventario_oni_kekkijutsus");
    if (kekkijutsuContainer) {
      const alreadyMoved = combatTab.contents.some((node) => node.key === "inventario_oni_kekkijutsus");
      if (!alreadyMoved) {
        kekkijutsuContainer.label = { ...kekkijutsuContainer.label };
        combatTab.contents.push(kekkijutsuContainer);
      }
    }
    tabs.splice(skillsIndex, 1);
  }

  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`);
  return `Oni podado: ${tabs.length} abas, ${before - JSON.stringify(tabs).length} bytes removidos`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await pruneOniTemplate());
}
