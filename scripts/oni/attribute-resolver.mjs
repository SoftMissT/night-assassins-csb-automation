import { originAttributeBonus } from "./origin-resolver.mjs";

const SEVEN = ["vit", "dex", "for", "car", "fdv", "int", "sab"];

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

const ATTRIBUTE_CHOICES = Object.freeze({
  3: 1, 4: 1, 6: 1, 8: 1, 11: 1, 12: 2,
});

const FIXED_ATTRIBUTES = Object.freeze({
  16: { fdv: 2 },
});

const DEMONIC_BODY_LEVEL = 13;

export const SEVEN_ATTRIBUTES = Object.freeze([...SEVEN]);

export function totalAttributeChoices(level) {
  const normalized = Math.max(1, Math.min(20, integer(level, 1)));
  let total = 0;
  for (const lvl of Object.keys(ATTRIBUTE_CHOICES)) {
    if (Number(lvl) <= normalized) total += ATTRIBUTE_CHOICES[lvl];
  }
  return total;
}

export function fixedAttributeBonus(level) {
  const normalized = Math.max(1, Math.min(20, integer(level, 1)));
  const bonus = {};
  for (const lvl of Object.keys(FIXED_ATTRIBUTES)) {
    if (Number(lvl) <= normalized) {
      const fixed = FIXED_ATTRIBUTES[lvl];
      for (const attr of Object.keys(fixed)) {
        bonus[attr] = (bonus[attr] ?? 0) + fixed[attr];
      }
    }
  }
  return Object.freeze(bonus);
}

export function demonicBodyAvailable(level) {
  return Math.max(1, Math.min(20, integer(level, 1))) >= DEMONIC_BODY_LEVEL;
}

function emptyAttrs() {
  const obj = {};
  for (const attr of SEVEN) obj[attr] = 0;
  return obj;
}

export function resolveOniAttributes({ baseAttributes = {}, originId = null, level = 1, persistedChoices = {}, demonicBodyChoice = null, temporaryBonuses = {} } = {}) {
  const attrs = emptyAttrs();
  for (const attr of SEVEN) {
    attrs[attr] = Math.max(0, integer(baseAttributes[attr]));
  }

  const originBonus = originAttributeBonus(originId);
  for (const attr of SEVEN) {
    if (originBonus[attr]) attrs[attr] += originBonus[attr];
  }

  const fixedBonus = fixedAttributeBonus(level);
  for (const attr of SEVEN) {
    if (fixedBonus[attr]) attrs[attr] += fixedBonus[attr];
  }

  if (demonicBodyAvailable(level) && demonicBodyChoice) {
    const choice = Array.isArray(demonicBodyChoice) ? demonicBodyChoice : [demonicBodyChoice];
    for (const entry of choice) {
      const attr = String(entry?.attr ?? entry ?? "").trim().toLocaleLowerCase("pt-BR");
      const amount = integer(entry?.amount ?? (typeof entry === "string" ? 2 : entry), 2);
      if (SEVEN.includes(attr) && (attr === "vit" || attr === "for" || attr === "dex")) {
        attrs[attr] += amount;
      }
    }
  }

  for (const attr of SEVEN) {
    if (temporaryBonuses[attr]) attrs[attr] += Math.max(0, integer(temporaryBonuses[attr]));
  }

  return Object.freeze({ ...attrs });
}

export function resolveOniDisplay({ baseAttributes = {}, originId = null, level = 1, persistedChoices = {}, demonicBodyChoice = null, temporaryBonuses = {} } = {}) {
  const resolved = resolveOniAttributes({ baseAttributes, originId, level, persistedChoices, demonicBodyChoice, temporaryBonuses });
  const display = {};
  for (const attr of SEVEN) {
    display[`${attr}_display`] = resolved[attr];
  }
  return Object.freeze(display);
}

export function parsePersistedChoices(props = {}) {
  const choices = {};
  for (const lvl of Object.keys(ATTRIBUTE_CHOICES)) {
    const key = `oni_atr_escolha_nvl${lvl}`;
    const raw = props[key];
    if (raw === undefined || raw === null) continue;
    const attrs = String(raw).split(/[+,]| e /).map((s) => s.trim().toLocaleLowerCase("pt-BR")).filter(Boolean);
    for (const attr of attrs) {
      if (SEVEN.includes(attr)) {
        choices[attr] = (choices[attr] ?? 0) + 1;
      }
    }
  }
  return Object.freeze(choices);
}
