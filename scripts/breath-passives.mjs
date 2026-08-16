import { parseAttributeValue, parseNumber } from "./parsing.mjs";
import { isWeaponProficient, weaponAttackAttributes, weaponPropertyKeys, weaponProfilesForActor } from "./weapon-service.mjs";

export const PASSIVE_STATE_KEY = "resp_passivas_estado";

export function parseBreathPassiveState(raw) {
  if (raw && typeof raw === "object") return { version: 1, ...raw };
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? { version: 1, ...parsed } : { version: 1 };
  } catch (_) {
    return { version: 1 };
  }
}

export function passiveStatePatch(state) {
  return { [`system.props.${PASSIVE_STATE_KEY}`]: JSON.stringify({ version: 1, ...state }) };
}

export function actorWeapons(actor) {
  return [...(actor?.items ?? [])].filter((item) => {
    const props = item?.system?.props ?? {};
    return item?.system?.template === "NAWeaponTpl00001"
      || props.arma_critico !== undefined
      || Boolean(props.arma_nome && (props.arma_dano_fixo !== undefined || props.arma_dano_atributo !== undefined || props.arma_tipos_dano !== undefined));
  }).flatMap((item) => {
    const props = item.system?.props ?? {};
    const actorProps = actor?.system?.props ?? {};
    const profiles = weaponProfilesForActor(props, actorProps);
    return profiles.map((profile, profileIndex) => {
      const profileMode = weaponPropertyKeys(profile.nome).find((key) => ["nitoryu", "ryoto"].includes(key)) ?? "";
      const proficient = profile.proficiente !== false;
      return {
        id: item.id,
        uuid: item.uuid,
        profileIndex,
        profileName: profile.nome ?? "Ataque Base",
        name: String(props.arma_nome || item.name || "Arma"),
        proficient,
        attackAttributes: proficient ? weaponAttackAttributes(props, profile) : [],
        attacks: Math.max(1, Math.trunc(Number(profile.ataques) || 1)),
        secondaryPenalty: profileMode === "nitoryu" ? -2 : 0,
        secondaryNoAttribute: ["nitoryu", "ryoto"].includes(profileMode) || Number(profile.ataques) > 1,
        critical: Math.min(20, Math.max(1, Math.trunc(parseNumber(profile.critico ?? props.arma_critico) || 20))),
        criticalDisabled: profile.critico_desabilitado === true,
      };
    });
  });
}

export function stoneBreakStacks(state, weaponId) {
  return Math.max(0, Math.trunc(parseNumber(state?.stone?.breakByWeapon?.[weaponId])));
}

export function effectiveWeaponCritical({ base = 20, state = {}, weaponId = "", strength = 0 } = {}) {
  const maximum = Math.max(0, Math.trunc(parseAttributeValue(strength)));
  const stacks = Math.min(maximum, stoneBreakStacks(state, weaponId));
  return Math.max(1, Math.min(20, Math.trunc(parseNumber(base) || 20) - stacks));
}

export function addStoneBreak(state, weaponId, strength) {
  if (!weaponId) return state;
  const maximum = Math.max(0, Math.trunc(parseAttributeValue(strength)));
  const current = stoneBreakStacks(state, weaponId);
  return {
    ...state,
    stone: {
      ...(state.stone ?? {}),
      breakByWeapon: { ...(state.stone?.breakByWeapon ?? {}), [weaponId]: Math.min(maximum, current + 1) },
    },
  };
}

export function registerConfirmedCritical(state, { weaponId = "", weaponName = "", natural = 0, threshold = 20 } = {}) {
  return {
    ...state,
    lastCritical: { weaponId, weaponName, natural, threshold },
    metal: { ...(state.metal ?? {}), hammerPending: true },
  };
}

export function registerWeaponUse(state, weapon = null) {
  if (!weapon?.id) return state;
  return {
    ...state,
    lastWeapon: { id: weapon.id, uuid: weapon.uuid ?? "", name: weapon.name ?? "Arma", critical: weapon.effectiveCritical ?? weapon.critical ?? 20 },
  };
}

export function addSnowFreeze(state, targetUuid, amount = 1) {
  if (!targetUuid) return state;
  const current = Math.max(0, Math.trunc(parseNumber(state?.snow?.freezeByTarget?.[targetUuid])));
  return {
    ...state,
    snow: {
      ...(state.snow ?? {}),
      freezeByTarget: { ...(state.snow?.freezeByTarget ?? {}), [targetUuid]: Math.min(5, current + Math.max(0, Math.trunc(parseNumber(amount)))) },
    },
  };
}

export function isPassiveItem(formId) {
  return formId === "metal_05" || formId === "neve_08";
}
