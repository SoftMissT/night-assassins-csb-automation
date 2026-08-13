import { createHash } from "node:crypto";

export function stableId(namespace, value) {
  return createHash("sha1").update(`${namespace}:${value}`).digest("hex").slice(0, 16);
}

export function stripMarkdown(value = "") {
  return String(value)
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/>\s*\[![^\]]+\]\s*/gu, "")
    .replace(/[`*_]/gu, "")
    .trim();
}

export function splitLevelTwoSections(markdown = "") {
  const matches = [...String(markdown).matchAll(/^##\s+(.+)$/gmu)];
  return matches.map((match, index) => ({
    heading: match[1].trim(),
    body: String(markdown).slice(match.index + match[0].length, matches[index + 1]?.index ?? String(markdown).length).trim(),
  }));
}

export function firstDiceFormula(text = "") {
  const match = String(text).match(/\b\d+d\d+(?:\s*[+-]\s*(?:\d+|(?:DEX|FOR|VIT|CAR|FDV|INT|SAB)))?/iu);
  return match?.[0]?.replace(/\b(DEX|FOR|VIT|CAR|FDV|INT|SAB)\b/giu, (value) => `@${value.toLowerCase()}`) ?? "";
}

export function firstFixedDamage(text = "") {
  const match = String(text).match(/(?:^|\n)[^\n]*\bDano(?:\s+[^:]+)?:\s*(\d+)/iu);
  return Number(match?.[1] ?? 0);
}

export function attributesIn(text = "") {
  return [...new Set((String(text).match(/\b(?:DEX|FOR|VIT|CAR|FDV|INT|SAB)\b/giu) ?? []).map((value) => value.toUpperCase()))];
}

export function damageTypesIn(text = "") {
  const types = ["cortante", "perfurante", "concussivo", "trovejante", "sonoro", "ferida", "sangramento", "envenenamento", "necrótico"];
  const normalized = String(text).toLocaleLowerCase("pt-BR");
  return types.filter((type) => normalized.includes(type));
}

export function actionIn(text = "") {
  const match = String(text).match(/Ação\s+(Livre|Única|Especial|de Ataque|Completa|de Movimento)|Reação/iu);
  return match?.[0] ?? "Não informada";
}

export function costIn(text = "") {
  const values = [...String(text).matchAll(/(\d+)\s*PDR\b/giu)].map((match) => Number(match[1]));
  return values.length ? values[0] : 0;
}

export function minimumBreathingLevel(text = "") {
  const match = String(text).match(/(?:a partir do|requer(?:imento)?[^\n]*?)\s*N[ií]vel\s+(\d)\s+de Respira/iu);
  return Math.min(4, Math.max(1, Number(match?.[1] ?? 1)));
}

export function folderDocument(id, name, sort = 0) {
  return {
    _id: id,
    _key: `!folders!${id}`,
    name,
    type: "Item",
    folder: null,
    sorting: "a",
    sort,
    color: null,
    flags: {},
  };
}

