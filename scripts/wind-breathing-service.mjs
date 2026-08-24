import { parseNumber } from "./parsing.mjs";
import { windFormById } from "./wind-breathing-data.mjs";

export const WIND_STATE_KEY = "resp_vento_estado";

export function parseWindBreathingState(raw) {
  if (raw && typeof raw === "object") return { version: 1, scars: 0, battleDamage: { blunt: 0 }, ...raw };
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object"
      ? { version: 1, scars: 0, battleDamage: { blunt: 0 }, ...parsed }
      : { version: 1, scars: 0, battleDamage: { blunt: 0 } };
  } catch (_) {
    return { version: 1, scars: 0, battleDamage: { blunt: 0 } };
  }
}

export function windStatePatch(state, overrides = {}) {
  return {
    [`system.props.${WIND_STATE_KEY}`]: JSON.stringify({ version: 1, ...state }),
    "system.props.resp_vento_cicatrizes": Math.max(0, Math.trunc(parseNumber(state.scars))),
    ...overrides,
  };
}

/**
 * Registra dano recebido (Cortante/Perfurante) e Sangramento/Infecção para a
 * passiva Sangue Especial. Chamado a cada dano recebido por um Slayer usuário
 * da Respiração do Vento (ver `status-engine.mjs` -> `applySlayerDamage`).
 * Cicatrizes só se consolidam no Descanso Longo (ver `consolidateWindScars`).
 */
export function registerWindBattleDamage(state, { cutPierce = 0, bleedInfection = 0 } = {}) {
  const battleDamage = state.battleDamage ?? { cutPierce: 0, bleedInfection: 0 };
  return {
    ...state,
    battleDamage: {
      cutPierce: Math.max(0, Math.trunc(parseNumber(battleDamage.cutPierce)) + Math.max(0, Math.trunc(Number(cutPierce) || 0))),
      bleedInfection: Math.max(0, Math.trunc(parseNumber(battleDamage.bleedInfection)) + Math.max(0, Math.trunc(Number(bleedInfection) || 0))),
    },
  };
}

/**
 * Consolida o dano acumulado da última batalha em cicatrizes permanentes,
 * aplicado no Descanso Longo. Regra: a cada 30 de dano Cortante/Perfurante
 * = +1 cicatriz (máx. +4 dessa fonte); a cada 25 de Sangramento/Infecção =
 * +1 em testes de VIT (máx. +4). Ambos os acúmulos são independentes e o
 * contador de dano da batalha zera após a consolidação.
 */
export function consolidateWindScars(state) {
  const battleDamage = state.battleDamage ?? { cutPierce: 0, bleedInfection: 0 };
  const newScarsFromCuts = Math.min(4, Math.floor(parseNumber(battleDamage.cutPierce) / 30));
  const newVitBonusFromBleed = Math.min(4, Math.floor(parseNumber(battleDamage.bleedInfection) / 25));
  return {
    ...state,
    scars: Math.min(4, Math.trunc(parseNumber(state.scars)) + newScarsFromCuts),
    vitBonus: Math.min(4, Math.trunc(parseNumber(state.vitBonus)) + newVitBonusFromBleed),
    battleDamage: { cutPierce: 0, bleedInfection: 0 },
  };
}

function resolveFormula(formula, props = {}) {
  return String(formula ?? "")
    .replace(/@(vit|dex|for|car|fdv|int|sab)\b/giu, (_match, key) => String(parseNumber(props[`${String(key).toLowerCase()}_display`])));
}

export function buildWindBreathingPlan(formId, level, props = {}, choices = {}) {
  const form = windFormById(formId);
  if (!form) return { ok: false, noCost: true, reason: "Forma do Vento desconhecida." };
  if (form.passive) return { ok: false, noCost: true, reason: "Sangue Especial é uma passiva automática e não gasta ação ou PDR." };
  const selected = form.levels?.[level - 1] ?? null;
  if (!selected) return { ok: false, noCost: true, reason: `Esta forma não pode ser usada no Nível de Respiração ${level}.` };
  if (form.minDex && parseNumber(props.dex_display) < form.minDex) {
    return { ok: false, noCost: true, reason: `Requer DEX ${form.minDex} ou mais.` };
  }
  const state = parseWindBreathingState(props[WIND_STATE_KEY]);
  const dex = parseNumber(props.dex_display);
  const fdv = parseNumber(props.fdv_display);
  const scars = Math.min(4, Math.trunc(parseNumber(state.scars)));
  const next = { ...state };

  /**
   * CONTRATO OBRIGATÓRIO (P0 — dano fantasma): todo dano ofensivo do Vento
   * grava state.pendingDamage/nextHit no mesmo shape consumido pelo
   * damage-service/hit-service (padrão Chamas/Água/Pedra/Névoa/Neve/Metal).
   */
  const emit = ({ action, cost, pendingDamage = null, pendingHit = null, extraPatch = {}, extra = {} }) => {
    if (pendingDamage) next.pendingDamage = { source: formId, technique: true, ...pendingDamage };
    else delete next.pendingDamage;
    if (pendingHit) next.nextHit = { source: formId, ...pendingHit };
    else delete next.nextHit;
    return {
      ok: true, form, selected, action, cost,
      state: next, patch: windStatePatch(next, extraPatch),
      ...extra,
    };
  };

  if (form.id === "vento_02") {
    // Redemoinho Escalável: custo variável (PDR investido = dano); coletado
    // via choices.pdrInvested. Requer estar a >= 5m do alvo (checagem manual).
    const maxPdr = Math.trunc(2 * dex);
    const requested = Math.trunc(parseNumber(choices.pdrInvested));
    if (requested <= 0) return { ok: false, noCost: true, reason: "Investimento de PDR deve ser maior que zero." };
    if (requested > maxPdr) return { ok: false, noCost: true, reason: `Investimento máximo de PDR neste nível: ${maxPdr} (2×DEX).` };
    const invested = requested;
    const dice = level >= 4 ? "2d6" : "1d6";
    const formula = Array.from({ length: invested }, () => dice).join(" + ");
    return emit({
      action: "ataque", cost: invested,
      pendingDamage: { formula, types: ["cortante"], uses: 1 },
    });
  }
  if (form.id === "vento_02_ciclone") {
    // DECISÃO PENDENTE (documentada): rolagem ofensiva única compartilhada
    // comparada à Esquiva de cada alvo (implementação atual).
    return emit({
      action: "ataque", cost: selected.cost,
      pendingDamage: {
        formula: selected.damage, types: selected.damageTypes, uses: 1,
        cycloneOpposed: true, maxTargets: selected.maxTargets ?? 3,
      },
    });
  }
  if (form.id === "vento_03") {
    // Garras do Vento Puro: prepara o PRÓXIMO ataque válido — o dano da arma
    // é transformado no damage-service ((arma [+ DEX]) × multiplicador).
    return emit({
      action: "unica", cost: selected.cost,
      pendingDamage: { formula: "", uses: 1, garras: { multiplier: selected.multiplier, addDex: selected.addDex === true } },
      extraPatch: { "system.props.resp_efeito_flag": `Vento 2: dano da arma ×${selected.multiplier}${selected.addDex ? " (+DEX antes)" : ""}` },
    });
  }
  if (form.id === "vento_04") {
    const use = choices.secondUse ? "reacao" : "ataque";
    const damage = use === "reacao" ? selected.counterDamage : selected.damage;
    const cost = use === "reacao" ? (form.reactionCost ?? selected.cost) : selected.cost;
    return emit({
      action: use, cost,
      pendingDamage: { formula: damage, types: ["cortante"], uses: 1, criticalSynergy: use === "reacao" },
    });
  }
  if (form.id === "vento_05") {
    // +1 ataque adicional no turno + trava de cura no alvo atingido (N3+: +2 PDR em Kekkijutsu)
    return emit({
      action: "unica", cost: selected.cost,
      pendingDamage: { formula: "", uses: 1, disablesHealing: true, kekkijutsuSurcharge: level >= 3 ? 2 : 0 },
      pendingHit: { count: 1 + (selected.extraAttack ?? 1) },
      extraPatch: { "system.props.resp_efeito_flag": "Vento 4: +1 ataque; alvos atingidos sem cura de PDV" },
    });
  }
  if (form.id === "vento_06") {
    const exhaustion = level >= 3 ? 1 : 0;
    return emit({
      action: "unica", cost: selected.cost,
      pendingDamage: { formula: selected.damage, types: [], uses: selected.attacks, ignoreResistance: true },
      pendingHit: { count: selected.attacks, bonus: selected.hitBonus ?? 0 },
      extraPatch: exhaustion > 0 ? { "system.props.status_slayer_exaustao": Math.min(8, parseNumber(props.status_slayer_exaustao) + exhaustion) } : {},
      ignoresResistance: true,
    });
  }
  if (form.id === "vento_07") {
    return emit({
      action: "ataque", cost: selected.cost,
      pendingDamage: {
        formula: selected.damage, types: selected.damageTypes, uses: 1,
        blockPenaltyVsBlock: form.blockPenalty ?? -2,
        critBlocksRegenerationTurns: 1,
      },
    });
  }
  if (form.id === "vento_08") {
    return emit({
      action: "especial", cost: selected.cost,
      pendingDamage: { formula: "", uses: 1, ventania: { dcFormula: resolveFormula(selected.saveDc, props), fallDamage: selected.fallDamage } },
    });
  }
  if (form.id === "vento_09") {
    const guaranteedScars = Math.max(1, scars);
    const formula = Array.from({ length: guaranteedScars }, () => selected.damagePerScar).join(" + ");
    return emit({
      action: "completa", cost: selected.cost,
      pendingDamage: { formula, types: ["cortante"], uses: 1, scarCount: guaranteedScars },
    });
  }
  if (form.id === "vento_10") {
    const formula = `${selected.damageBase} + ${scars} * (${selected.damagePerScar}) + ${dex} * (${selected.damagePerDex})`;
    return emit({
      action: "completa", cost: selected.cost,
      pendingDamage: { formula, types: ["cortante"], uses: 1, tufao: { bleedSaveDc: resolveFormula(selected.bleedSaveDc, props), bleedTurns: 3, healOnBigHit: selected.healOnBigHit ?? 0, healThresholdPercent: selected.healThresholdPercent ?? 10 } },
      extraPatch: { "system.props.status_slayer_exaustao": Math.min(8, parseNumber(props.status_slayer_exaustao) + selected.exhaustionOnUse) },
      testDc: selected.testDc,
      bleedSaveDc: resolveFormula(selected.bleedSaveDc, props),
      healOnBigHit: selected.healOnBigHit, healThresholdPercent: selected.healThresholdPercent,
    });
  }
  return { ok: false, reason: "Forma do Vento sem implementação." };
}

/** Consome os pendentes do Vento espelhando o contrato das demais Respirações. */
export function consumeWindPending(state, { hit = false, damage = false } = {}) {
  const next = { ...state };
  if (hit) delete next.nextHit;
  if (damage && next.pendingDamage) {
    const uses = Math.max(0, Math.trunc(Number(next.pendingDamage.uses) || 1) - 1);
    if (uses > 0) next.pendingDamage = { ...next.pendingDamage, uses };
    else delete next.pendingDamage;
  }
  return next;
}

export function tickWindBreathing(raw) {
  const state = parseWindBreathingState(raw);
  return { state, patch: windStatePatch(state) };
}

export function clearWindBreathingState(raw) {
  const state = parseWindBreathingState(raw);
  // Cicatrizes e bônus de VIT são passivas permanentes (persistem entre
  // combates); apenas o contador de dano da batalha atual é limpo.
  return windStatePatch({ ...state, battleDamage: { cutPierce: 0, bleedInfection: 0 } });
}
