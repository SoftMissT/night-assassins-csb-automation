import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPath = path.join(root, "src", "templates", "actors", "oni-template.json");

const REMOVED_TABS = new Set(["skills_oni_tab", "interludios_oni_tab", "dados_tab"]);
const REMOVED_KEYS = new Set([
  "skills_oni_respiracoes", "resp_oni_panel", "resp_oni_display", "resp_oni_storage_panel",
  "skills_marca_oni_panel", "marca_slayer_gerenciar", "marca_oni_gerenciar", "metal_escolhido",
]);
const REMOVED_HIDDEN = /^(?:hab_|marca_|metal_|resp_|nvl_respiracao_num$|(?:vit|dex|for|car|fdv|int|sab)_(?:marca|resp)_)/;

function prune(value) {
  if (Array.isArray(value)) return value.map(prune).filter((entry) => entry !== null);
  if (!value || typeof value !== "object") return value;
  if (REMOVED_TABS.has(value.key) || REMOVED_KEYS.has(value.key)) return null;
  if (/Marca do Caçador/i.test(String(value.title ?? ""))) return null;
  if (/Bônus Temporários de Marca/i.test(String(value.title ?? ""))) value.title = "Bônus Temporários Oni";
  for (const [key, child] of Object.entries(value)) value[key] = prune(child);
  return value;
}

function cleanHeader(template) {
  const table = template.system?.header?.contents?.find((entry) => entry?.key === "perfil");
  if (!table?.contents) return;
  table.contents = table.contents
    .map((row) => row.map((component) => component && REMOVED_KEYS.has(component.key) ? null : component))
    .filter((row) => row.some(Boolean));
  table.rows = table.contents.length;
  template.system.header.contents = [table];
}

function orderTabs(template) {
  const tabbed = template.system?.body?.contents?.find((entry) => entry?.type === "tabbedPanel");
  if (!tabbed?.contents) return;
  const order = ["perfil_oni_tab", "pericias_tab", "combat_oni_tab", "inventario_oni_tab", "notas_oni_tab", "configs_tab"];
  tabbed.contents.sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key));
}

export function cleanOniTemplate(source) {
  const cleaned = prune(structuredClone(source));
  cleanHeader(cleaned);
  orderTabs(cleaned);
  cleaned.system.hidden = (cleaned.system.hidden ?? []).filter(({ name }) => !REMOVED_HIDDEN.test(String(name ?? "")));
  cleaned.system.templateSystemUniqueVersion = Math.max(1, Number(cleaned.system.templateSystemUniqueVersion) || 0) + 1;
  return cleaned;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourcePath = path.resolve(process.argv[2] ?? defaultPath);
  const targetPath = path.resolve(process.argv[3] ?? sourcePath);
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  await writeFile(targetPath, `${JSON.stringify(cleanOniTemplate(source), null, 2)}\n`);
  console.log(`Template Oni limpo em ${targetPath}`);
}
