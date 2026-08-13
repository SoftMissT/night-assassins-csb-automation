import { parseAttributeValue, parseNumber } from "./parsing.mjs";

export const WEAPON_RANK_LEVELS = Object.freeze({ D: 2, C: 4, B: 6, A: 8, S: 11, SS: 12 });

export function slayerWeaponRank(actorProps = {}) {
  const text = String(actorProps.rank_atual ?? actorProps.rank_slayer_atual ?? "").toUpperCase();
  for (const rank of ["SS", "S", "A", "B", "C", "D"]) {
    if (new RegExp(`(?:RANK\\s*)?${rank}(?:\\b|$)`).test(text)) return rank;
  }
  const level = Math.max(0, Math.trunc(parseNumber(actorProps.nvl_num ?? actorProps.nivel_slayer_num ?? actorProps.nivel)));
  if (level >= 12) return "SS";
  if (level >= 11) return "S";
  if (level >= 8) return "A";
  if (level >= 6) return "B";
  if (level >= 4) return "C";
  if (level >= 2) return "D";
  return "";
}

export function extractWeaponRankFormulas(markdown = "") {
  const section = String(markdown).match(/# DANO POR RANK([\s\S]*?)(?=\n# [^#]|$)/i)?.[1] ?? "";
  const formulas = {};
  for (const match of section.matchAll(/## Rank (SS|S|A|B|C|D)[^\n]*\n+([\s\S]*?)(?=\n## Rank |$)/gi)) {
    const values = [...match[2].matchAll(/`([^`]+)`/g)].map((entry) => entry[1].trim()).filter(Boolean);
    if (values.length > 0) formulas[match[1].toUpperCase()] = values;
  }
  return formulas;
}

function diceFromFormula(formula = "") {
  return [...String(formula).matchAll(/\b\d+d\d+\b/gi)].map((match) => match[0]).join(" + ");
}

function attributeChoiceKeys(formula = "") {
  const keys = new Set();
  for (const match of String(formula).toUpperCase().matchAll(/\b(VIT|DEX|FOR|CAR|FDV|INT|SAB)\b\s+OU\s+\b(VIT|DEX|FOR|CAR|FDV|INT|SAB)\b/g)) {
    keys.add(match[1]);
    keys.add(match[2]);
  }
  return keys;
}

export function weaponProfilesForActor(itemProps = {}, actorProps = {}) {
  const profiles = Array.isArray(itemProps.arma_perfis_ataque) ? itemProps.arma_perfis_ataque : [];
  const rank = slayerWeaponRank(actorProps);
  const rankFormulas = itemProps.arma_formulas_por_rank && typeof itemProps.arma_formulas_por_rank === "object"
    ? itemProps.arma_formulas_por_rank
    : extractWeaponRankFormulas(itemProps.arma_regra_completa);
  const ranked = Array.isArray(rankFormulas[rank]) ? rankFormulas[rank] : [];

  return profiles.map((profile, index) => {
    const rankFormula = ranked[index] ?? ranked[0] ?? "";
    const rankDice = diceFromFormula(rankFormula);
    const baseDice = String(profile.dano_dados ?? "").trim();
    const choiceKeys = attributeChoiceKeys(profile.formula_texto || rankFormula);
    return {
      ...profile,
      atributos: (Array.isArray(profile.atributos) ? profile.atributos : []).map((rule) => ({
        ...rule,
        escolha: rule.escolha === true || choiceKeys.has(String(rule.key ?? "").toUpperCase()),
      })),
      dano_dados: [baseDice, rankDice].filter(Boolean).join(" + "),
      rank,
      rank_formula: rankFormula,
    };
  });
}

export function weaponActorSummary(actorProps = {}) {
  return {
    rank: slayerWeaponRank(actorProps),
    for: parseAttributeValue(actorProps.for_display),
    dex: parseAttributeValue(actorProps.dex_display),
    fdv: parseAttributeValue(actorProps.fdv_display),
  };
}
