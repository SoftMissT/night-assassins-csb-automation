/** Planos e estado persistente da Respiração da Neve. */
import { parseNumber } from "./parsing.mjs";
import { SNOW_SYNERGIES, snowFormById } from "./snow-breathing-data.mjs";

const EMPTY_STATE = () => ({ version: 1, freezeByTarget: {}, cooldowns: {} });

export function parseSnowBreathingState(raw) {
  if (raw && typeof raw === "object") return { ...EMPTY_STATE(), ...structuredClone(raw) };
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? { ...EMPTY_STATE(), ...parsed } : EMPTY_STATE();
  } catch (_) {
    return EMPTY_STATE();
  }
}

export function snowStatePatch(state, overrides = {}) {
  return { "system.props.resp_neve_estado": JSON.stringify({ ...EMPTY_STATE(), ...state }), ...overrides };
}

export function snowFreezeCount(state, targetUuid) {
  return Math.max(0, Math.min(5, Math.trunc(parseNumber(state?.freezeByTarget?.[targetUuid]))));
}

export function addSnowFreeze(rawState, targetUuid, amount = 1) {
  const state = parseSnowBreathingState(rawState);
  const uuid = String(targetUuid ?? "").trim();
  if (!uuid) return { state, count: 0, reachedFive: false, burstFormula: null };
  const before = snowFreezeCount(state, uuid);
  const count = Math.min(5, before + Math.max(0, Math.trunc(parseNumber(amount))));
  state.freezeByTarget = { ...state.freezeByTarget, [uuid]: count };
  const reachedFive = before < 5 && count === 5;
  return { state, count, reachedFive, burstFormula: reachedFive && state.belowZero?.freezeBurst ? state.belowZero.freezeBurst : null };
}

/**
 * Resolve todos os efeitos que acontecem quando Congelar é aplicado.
 * O chamador executa a rolagem de burst e a recuperação descritas no retorno.
 */
export function resolveSnowFreezeGain(rawState, targetUuid, amount = 1, { recoveryChoice = "" } = {}) {
  const result = addSnowFreeze(rawState, targetUuid, amount);
  const canRecover = amount > 0 && result.state.belowZero?.freezeRecovery === true;
  const recovery = !canRecover ? null
    : recoveryChoice === "pdv" ? { resource: "pdv", amount: 2, pdv: 2 }
      : recoveryChoice === "pdr" ? { resource: "pdr", amount: 1, pdr: 1 }
        : { resource: "choice", options: [{ resource: "pdv", amount: 2 }, { resource: "pdr", amount: 1 }] };
  return { ...result, recovery };
}

export function snowEffectiveBreathLevel(baseLevel, rawState) {
  const state = parseSnowBreathingState(rawState);
  const base = Math.max(1, Math.min(4, Math.trunc(parseNumber(baseLevel))));
  return Math.min(4, base + Math.max(0, Math.trunc(parseNumber(state.iceHeart?.breathingLevelBonus))));
}

export function snowRestrictionFlag(restriction, sourceActorUuid) {
  if (!restriction?.uuid) return null;
  return {
    sourceActorUuid: String(sourceActorUuid ?? ""),
    targetUuid: String(restriction.uuid),
    escapeDc: Math.max(0, Math.trunc(parseNumber(restriction.escapeDc))),
    escapeAction: "ataque",
    escapeAttribute: "FOR",
    breakOnDamage: true,
  };
}

export function resolveSnowRestrictionEscape(flag, rollTotal) {
  if (!flag?.targetUuid) return { ok: false, escaped: false, reason: "Restrição de Congelar ausente." };
  const total = Math.trunc(parseNumber(rollTotal));
  const dc = Math.max(0, Math.trunc(parseNumber(flag.escapeDc)));
  return { ok: true, escaped: total >= dc, total, dc, consumesAction: "ataque" };
}

export function resolveSnowKekkijutsuGuard(rawState, { enemyUuid = "" } = {}) {
  const state = parseSnowBreathingState(rawState);
  const guard = state.kekkijutsuGuard;
  if (!guard) return { active: false, state, damageMultiplier: 1, negateEffects: false, freeze: 0, opportunityAttack: false };
  delete state.kekkijutsuGuard;
  return {
    active: true,
    state,
    protectedUuid: guard.protectedUuid,
    enemyUuid: String(enemyUuid),
    damageMultiplier: Number(guard.damageMultiplier) === 0.5 ? 0.5 : 1,
    negateEffects: guard.negateEffects === true,
    freeze: Math.max(0, Math.trunc(parseNumber(guard.freezeOnUse))),
    opportunityAttack: guard.opportunityAttack === true,
  };
}

export function resolveSnowAvalancheSynergy(rawState, { targetUuid = "", allyStealthed = false } = {}) {
  const state = parseSnowBreathingState(rawState);
  const avalanche = state.avalancheTarget;
  const applies = Boolean(allyStealthed && avalanche?.turns > 0 && avalanche.uuid && avalanche.uuid === targetUuid);
  return {
    applies,
    formula: applies ? String(avalanche.allyStealthBonusDamage || "1d4") : "",
    movementTurns: applies ? Math.max(0, Math.trunc(parseNumber(avalanche.turns))) : 0,
  };
}

export function snowTickPatchWithExhaustion(rawState, currentExhaustion = 0) {
  const tick = tickSnowBreathing(rawState);
  const gained = tick.events.reduce((total, event) => total + (event.type === "exhaustion" ? parseNumber(event.amount) : 0), 0);
  return {
    ...tick,
    patch: {
      ...tick.patch,
      ...(gained > 0 ? { "system.props.status_slayer_exaustao": Math.min(8, Math.max(0, Math.trunc(parseNumber(currentExhaustion))) + gained) } : {}),
    },
  };
}

export function consumeSnowPending(rawState, { hit = false, damage = false } = {}) {
  const state = parseSnowBreathingState(rawState);
  if (hit) delete state.nextHit;
  if (damage) delete state.pendingDamage;
  return state;
}

export function spendFreezeForRestriction(rawState, targetUuid, car) {
  const state = parseSnowBreathingState(rawState);
  const uuid = String(targetUuid ?? "").trim();
  if (!uuid || snowFreezeCount(state, uuid) < 5) return { ok: false, state, reason: "O alvo precisa ter 5 acúmulos de Congelar." };
  state.freezeByTarget = { ...state.freezeByTarget, [uuid]: 0 };
  state.restrictedTarget = { uuid, escapeDc: 8 + Math.trunc(parseNumber(car)), breakOnDamage: true, escapeAction: "ataque", escapeAttribute: "FOR" };
  return { ok: true, state, action: "unica", restriction: state.restrictedTarget };
}

export function breakSnowRestrictionOnDamage(rawState, targetUuid) {
  const state = parseSnowBreathingState(rawState);
  if (state.restrictedTarget?.uuid === targetUuid && state.restrictedTarget.breakOnDamage) delete state.restrictedTarget;
  return state;
}

export function grantBlizzardStealth(rawState, { allyUuid, allyBreathing = "", currentRound } = {}) {
  const state = parseSnowBreathingState(rawState);
  if (!state.blizzard?.turns) return { ok: false, state, reason: "Nevasca não está ativa." };
  if (!allyUuid || allyUuid === state.blizzard.ownerUuid) return { ok: false, state, reason: "Escolha outro aliado." };
  if (state.blizzard.lastGrantRound === currentRound) return { ok: false, state, reason: "A furtividade já foi concedida nesta rodada." };
  state.blizzard.lastGrantRound = currentRound;
  return { ok: true, state, allyUuid, stealth: true, pdrRecovery: SNOW_SYNERGIES.includes(allyBreathing) ? 2 : 0 };
}

export function buildSnowBreathingPlan(formId, level, props = {}, choices = {}) {
  const form = snowFormById(formId);
  const selected = form?.levels?.[level - 1];
  if (!form || !selected) return { ok: false, noCost: true, reason: "Forma indisponível neste Nível de Respiração." };
  const state = parseSnowBreathingState(props.resp_neve_estado);
  if (form.cooldown && parseNumber(state.cooldowns?.[formId]) > 0) {
    return { ok: false, noCost: true, reason: `Forma em recarga por ${state.cooldowns[formId]} turno(s).` };
  }
  const fdv = Math.trunc(parseNumber(props.fdv_display));
  const car = Math.trunc(parseNumber(props.car_display));
  const base = { ok: true, form, selected, action: form.action, cost: selected.cost, state, patch: {} };

  if (formId === "neve_01") {
    state.pendingDamage = { source: formId, formula: selected.damage, uses: 1, range: 5, freezeOnHit: 1 };
    state.nextHit = { source: formId };
  } else if (formId === "neve_02") {
    state.cooldowns[formId] = form.cooldown;
    state.nextHit = { source: formId, opposedBy: "esquiva", criticalFreeze: 1 };
    state.pendingTargetEffect = { source: formId, turns: 2, hitPenalty: selected.penalty, damagePenalty: selected.penalty,
      vulnerabilities: selected.vulnerabilities ?? [] };
  } else if (formId === "neve_03") {
    state.blizzard = { source: formId, turns: Math.max(0, car), ownerUuid: String(choices.ownerUuid ?? ""), lastGrantRound: null,
      grant: "furtividade", synergyBreathings: [...SNOW_SYNERGIES], synergyPdrRecovery: 2 };
  } else if (formId === "neve_04") {
    state.iceHeart = level < 4
      ? { source: formId, turns: 2, breathingLevelBonus: 1, exhaustionOnExpire: 1 }
      : { source: formId, turns: 2, testBonus: 2, hitBonus: 2, dodgeBonus: 2, blockBonus: 2, exhaustionOnExpire: 1 };
  } else if (formId === "neve_05") {
    state.nextHit = { source: formId, bonus: selected.hitBonus, criticalFreeze: 1 };
    state.pendingDamage = { source: formId, formula: selected.damage, uses: 1 };
    state.avalancheTarget = { uuid: String(choices.targetUuid ?? ""), turns: 2, allyStealthBonusDamage: "1d4", movementReductionFromRoll: true };
  } else if (formId === "neve_06") {
    const current = state.belowZero;
    const stacks = Math.max(0, Math.trunc(parseNumber(current?.stacks))) + 1;
    state.belowZero = { source: formId, turns: current?.turns > 0 ? current.turns : 3, stacks,
      fdvHitBonus: selected.fdvHit ? fdv * stacks : 0, fdvDamageBonus: selected.fdvDamage ? fdv * stacks : 0,
      freezeRecovery: Boolean(selected.freezeRecovery), freezeBurst: selected.freezeBurst ?? null };
  } else if (formId === "neve_07") {
    state.kekkijutsuGuard = { source: formId, negateEffects: selected.negateEffects, damageMultiplier: selected.damageMultiplier,
      protectedUuid: String(choices.protectedUuid ?? choices.ownerUuid ?? ""), canProtectAlly: Boolean(selected.protectAlly), freezeOnUse: selected.freeze ?? 0,
      opportunityAttack: Boolean(selected.protectAlly && SNOW_SYNERGIES.includes(choices.allyBreathing)) };
  }

  Object.assign(base.patch, snowStatePatch(state, {
    "system.props.resp_neve_resumo": `Congelar: ${Object.values(state.freezeByTarget).filter((value) => parseNumber(value) > 0).length} alvo(s)`,
    "system.props.resp_efeito_flag": `Neve: ${form.name}`,
    "system.props.resp_efeito_duracao": state.blizzard?.turns ?? state.iceHeart?.turns ?? state.belowZero?.turns ?? 0,
    "system.props.resp_bonus_acerto_temp": state.belowZero?.fdvHitBonus ?? state.iceHeart?.hitBonus ?? state.nextHit?.bonus ?? 0,
    "system.props.resp_bonus_esquiva_temp": state.iceHeart?.dodgeBonus ?? 0,
    "system.props.resp_bonus_bloqueio_temp": state.iceHeart?.blockBonus ?? 0,
    "system.props.resp_bonus_dano_fixo": state.belowZero?.fdvDamageBonus ?? 0,
  }));
  return base;
}

export function tickSnowBreathing(raw) {
  const state = parseSnowBreathingState(raw);
  const events = [];
  for (const key of Object.keys(state.cooldowns)) {
    state.cooldowns[key] = Math.max(0, Math.trunc(parseNumber(state.cooldowns[key])) - 1);
    if (!state.cooldowns[key]) delete state.cooldowns[key];
  }
  for (const key of ["blizzard", "iceHeart", "belowZero", "avalancheTarget", "pendingTargetEffect"]) {
    if (state[key]?.turns > 0) {
      state[key].turns -= 1;
      if (state[key].turns <= 0) {
        if (key === "iceHeart" && state[key].exhaustionOnExpire) events.push({ type: "exhaustion", amount: state[key].exhaustionOnExpire });
        delete state[key];
      }
    }
  }
  return { state, events, patch: snowStatePatch(state, {
    "system.props.resp_efeito_duracao": state.blizzard?.turns ?? state.iceHeart?.turns ?? state.belowZero?.turns ?? 0,
    "system.props.resp_bonus_acerto_temp": state.belowZero?.fdvHitBonus ?? state.iceHeart?.hitBonus ?? state.nextHit?.bonus ?? 0,
    "system.props.resp_bonus_esquiva_temp": state.iceHeart?.dodgeBonus ?? 0,
    "system.props.resp_bonus_bloqueio_temp": state.iceHeart?.blockBonus ?? 0,
    "system.props.resp_bonus_dano_fixo": state.belowZero?.fdvDamageBonus ?? 0,
  }) };
}

export function clearSnowBreathingState() {
  return snowStatePatch(EMPTY_STATE(), {
    "system.props.resp_neve_resumo": "Neve · sem efeito ativo",
    "system.props.resp_efeito_duracao": 0,
    "system.props.resp_bonus_acerto_temp": 0,
    "system.props.resp_bonus_esquiva_temp": 0,
    "system.props.resp_bonus_bloqueio_temp": 0,
    "system.props.resp_bonus_dano_fixo": 0,
  });
}
