import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COLOR_TO_CLASS = Object.freeze({
  "#28d7ff": "na-sheet-role-dex",
  "#0ef5ff": "na-sheet-role-accent-cyan",
  "#15d7e6": "na-sheet-role-accent-cyan",
  "#36d67a": "na-sheet-role-vit",
  "#2eff7a": "na-sheet-role-accent-lime",
  "#c1000c": "na-sheet-role-for",
  "#ff9100": "na-sheet-role-car",
  "#bb97f9": "na-sheet-role-fdv",
  "#f8eb4d": "na-sheet-role-int",
  "#d45ca4": "na-sheet-role-sab",
  "#a855f7": "na-sheet-role-accent-purple",
  "#ff93ff": "na-sheet-role-accent-pink",
  "#ffd700": "na-sheet-role-accent-gold",
});

function sizeClass(px) {
  const n = parseFloat(px);
  if (Number.isNaN(n)) return "na-sheet-size-md";
  if (n >= 22) return "na-sheet-size-xl";
  if (n >= 18) return "na-sheet-size-lg";
  if (n <= 12) return "na-sheet-size-sm";
  return "na-sheet-size-md";
}

function roleClass(colorHex) {
  return COLOR_TO_CLASS[String(colorHex ?? "").toLowerCase()] ?? "";
}

/** Extrai o conteúdo interno do span do wrapper Orbitron. */
function extractInner(value) {
  const spanMatch = value.match(/<span[^>]*>([\s\S]*?)<\/span>/);
  return spanMatch ? spanMatch[1].trim() : value.replace(/<[^>]+>/g, "").trim();
}

function cleanValue(value, fallbackSizePx = 16) {
  const color = value.match(/color:\s*(#[0-9a-fA-F]{3,8})/)?.[1];
  const size = value.match(/font-size:\s*([\d.]+)px/)?.[1] ?? String(fallbackSizePx);
  const inner = extractInner(value);
  const classes = ["na-sheet-text", "na-sheet-label", sizeClass(size)];
  const role = roleClass(color);
  if (role) classes.push(role);
  return `<span class="${classes.join(" ")}">${inner}</span>`;
}

function walk(node, visitor, pathKey = "") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, visitor, `${pathKey}[${i}]`));
    return;
  }
  if (typeof node.value === "string" && node.value.includes("custom-orbitron-wrapper")) {
    visitor(node, pathKey);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== "parent") walk(child, visitor, `${pathKey}.${key}`);
  }
}

/**
 * Restaura as cores originais (pré-skin) e remove os wrappers Orbitron inline.
 * @param {string} templatePath Caminho do template atual.
 * @param {string|null} snapshotPath Caminho do snapshot pré-skin (opcional).
 * @returns {Promise<string>} Relatório.
 */
export async function restoreSkin(templatePath, snapshotPath = null) {
  const absolute = path.resolve(root, templatePath);
  const template = JSON.parse(await readFile(absolute, "utf8"));
  const snapshot = snapshotPath ? JSON.parse(await readFile(path.resolve(root, snapshotPath), "utf8")) : null;

  function buildSnapshotIndex() {
    const index = new Map();
    if (!snapshot) return index;
    walk(snapshot.system.body.contents, (cell) => {
      const color = cell.value.match(/color:\s*(#[0-9a-fA-F]{3,8})/)?.[1];
      const size = cell.value.match(/font-size:\s*([\d.]+)px/)?.[1];
      if (!color) return;
      const inner = extractInner(cell.value);
      if (inner && !index.has(inner)) index.set(inner, `${color}|${size ?? "16"}`);
    });
    return index;
  }

  const snapshotIndex = buildSnapshotIndex();

  let restoredFromSnapshot = 0;
  let cleanedOnly = 0;
  walk(template.system.body.contents, (cell) => {
    const inner = extractInner(cell.value);
    const remembered = snapshotIndex.get(inner);
    if (remembered) {
      const [color, size] = remembered.split("|");
      cell.value = cleanValue(
        `color:${color}; font-size:${size}px;` + `<!--inner:${inner}-->`,
        Number(size),
      );
      restoredFromSnapshot++;
    } else {
      cell.value = cleanValue(cell.value);
      cleanedOnly++;
    }
  });

  await writeFile(absolute, `${JSON.stringify(template, null, 2)}\n`);
  return `${path.basename(absolute)}: ${restoredFromSnapshot} células restauradas com cor original, ${cleanedOnly} apenas limpas`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , target, snapshot] = process.argv;
  console.log(await restoreSkin(target ?? "src/templates/actors/slayer-template.json", snapshot ?? null));
}
