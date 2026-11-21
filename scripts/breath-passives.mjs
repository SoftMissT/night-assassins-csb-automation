import { parseAttributeValue, parseNumber } from './parsing.mjs';
import {
    isWeaponProficient,
    weaponAttackAttributes,
    weaponPropertyKeys,
    weaponProfilesForActor,
} from './weapon-service.mjs';

export const PASSIVE_STATE_KEY = 'resp_passivas_estado';

export function parseBreathPassiveState(raw) {
    if (raw && typeof raw === 'object') return { version: 1, ...raw };
    try {
        const parsed = JSON.parse(String(raw || '{}'));
        return parsed && typeof parsed === 'object' ? { version: 1, ...parsed } : { version: 1 };
    } catch (_) {
        return { version: 1 };
    }
}

export function passiveStatePatch(state) {
    return { [`system.props.${PASSIVE_STATE_KEY}`]: JSON.stringify({ version: 1, ...state }) };
}

export function actorWeapons(actor) {
    return [...(actor?.items ?? [])]
        .filter((item) => {
            const props = item?.system?.props ?? {};
            return (
                ['NAWeaponTpl00001', 'NASpecialWeaponTpl00001'].includes(item?.system?.template) ||
                props.arma_critico !== undefined ||
                Boolean(
                    props.arma_nome &&
                    (props.arma_dano_fixo !== undefined ||
                        props.arma_dano_atributo !== undefined ||
                        props.arma_tipos_dano !== undefined)
                )
            );
        })
        .flatMap((item) => {
            const props = item.system?.props ?? {};
            const actorProps = actor?.system?.props ?? {};
            const profiles = weaponProfilesForActor(props, actorProps);
            return profiles.map((profile, profileIndex) => {
                const profileMode =
                    profile.modo_propriedade ||
                    weaponPropertyKeys(profile.nome).find((key) =>
                        ['nitoryu', 'ryoto', 'morote'].includes(key)
                    ) ||
                    '';
                const proficient = profile.proficiente !== false;
                return {
                    id: item.id,
                    uuid: item.uuid,
                    profileIndex,
                    profileName: profile.nome ?? 'Ataque Base',
                    name: String(props.arma_nome || item.name || 'Arma'),
                    proficient,
                    attackAttributes: proficient ? weaponAttackAttributes(props, profile) : [],
                    attacks: Math.max(1, Math.trunc(Number(profile.ataques) || 1)),
                    paidSecondaryAttack: profile.golpe_secundario_pago === true,
                    mode: profileMode,
                    secondaryPenalty: Number(profile.penalidade_segundo_acerto) || 0,
                    secondaryNoAttribute: profile.acerto_segundo_sem_atributo === true,
                    secondaryDamagePolicy: profile.dano_segundo_golpe ?? 'normal',
                    criticalChain: profile.cadeia_critica ?? null,
                    critical: Math.min(
                        20,
                        Math.max(
                            1,
                            Math.trunc(parseNumber(profile.critico ?? props.arma_critico) || 20)
                        )
                    ),
                    criticalDisabled: profile.critico_desabilitado === true,
                };
            });
        });
}

/**
 * Acúmulos de Quebra pertencem ao praticante, não à arma (regra: "o
 * benefício acompanha o praticante, mesmo que ele troque de arma").
 * `breakByWeapon` é lido apenas como estado legado.
 */
export function stoneBreakStacks(state) {
    const stored = state?.stone?.breakStacks;
    if (stored !== undefined) return Math.max(0, Math.trunc(parseNumber(stored)));
    return Object.values(state?.stone?.breakByWeapon ?? {}).reduce(
        (total, value) => total + Math.max(0, Math.trunc(parseNumber(value))),
        0
    );
}

export function effectiveWeaponCritical({ base = 20, state = {}, strength = 0, floor = 1 } = {}) {
    const baseCritical = Math.min(20, Math.max(1, Math.trunc(parseNumber(base) || 20)));
    const configuredFloor = Math.min(20, Math.max(1, Math.trunc(parseNumber(floor) || 1)));
    const minimum = Math.min(baseCritical, configuredFloor);
    const maximum = Math.max(0, Math.trunc(parseAttributeValue(strength)));
    const stacks = Math.min(maximum, stoneBreakStacks(state));
    return Math.max(minimum, baseCritical - stacks);
}

export function addStoneBreak(state, strength) {
    const maximum = Math.max(0, Math.trunc(parseAttributeValue(strength)));
    const current = stoneBreakStacks(state);
    return {
        ...state,
        stone: {
            ...(state.stone ?? {}),
            breakStacks: Math.min(maximum, current + 1),
        },
    };
}

export function addStoneBreakForAction(state, strength, actionId = '') {
    const normalizedActionId = String(actionId ?? '');
    if (normalizedActionId && state?.stone?.lastBreakActionId === normalizedActionId)
        return state;
    const next = addStoneBreak(state, strength);
    return {
        ...next,
        stone: {
            ...(next.stone ?? {}),
            ...(normalizedActionId ? { lastBreakActionId: normalizedActionId } : {}),
        },
    };
}

export function registerStoneConfirmedDamage(
    state,
    {
        targetUuid = '',
        damage = 0,
        actionId = '',
        combatId = '',
        round = 0,
        turn = 0,
        weaponId = '',
    } = {}
) {
    const target = String(targetUuid ?? '');
    const total = Math.max(0, Math.trunc(parseNumber(damage)));
    if (!target || total <= 0) return state;
    const record = {
        targetUuid: target,
        damage: total,
        actionId: String(actionId ?? ''),
        combatId: String(combatId ?? ''),
        round: Math.max(0, Math.trunc(parseNumber(round))),
        turn: Math.max(0, Math.trunc(parseNumber(turn))),
        weaponId: String(weaponId ?? ''),
    };
    return {
        ...state,
        stone: {
            ...(state.stone ?? {}),
            lastConfirmedDamageByTarget: {
                ...(state.stone?.lastConfirmedDamageByTarget ?? {}),
                [target]: record,
            },
        },
    };
}

export function stoneConfirmedDamageForTarget(
    state,
    targetUuid,
    { combatId = '', round = 0, turn = 0 } = {}
) {
    const record = state?.stone?.lastConfirmedDamageByTarget?.[String(targetUuid ?? '')];
    if (!record || !(parseNumber(record.damage) > 0)) return null;
    const activeCombatId = String(combatId ?? '');
    if (activeCombatId) {
        if (String(record.combatId ?? '') !== activeCombatId) return null;
        if (Math.trunc(parseNumber(record.round)) !== Math.trunc(parseNumber(round))) return null;
        if (Math.trunc(parseNumber(record.turn)) !== Math.trunc(parseNumber(turn))) return null;
    }
    return { ...record, damage: Math.max(0, Math.trunc(parseNumber(record.damage))) };
}

export function clearStonePassiveState(state) {
    const next = { ...parseBreathPassiveState(state) };
    delete next.stone;
    return next;
}

export function registerConfirmedCritical(
    state,
    { weaponId = '', weaponName = '', natural = 0, threshold = 20 } = {}
) {
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
        lastWeapon: {
            id: weapon.id,
            uuid: weapon.uuid ?? '',
            name: weapon.name ?? 'Arma',
            critical: weapon.effectiveCritical ?? weapon.critical ?? 20,
        },
    };
}

export function addSnowFreeze(state, targetUuid, amount = 1) {
    if (!targetUuid) return state;
    const current = Math.max(0, Math.trunc(parseNumber(state?.snow?.freezeByTarget?.[targetUuid])));
    return {
        ...state,
        snow: {
            ...(state.snow ?? {}),
            freezeByTarget: {
                ...(state.snow?.freezeByTarget ?? {}),
                [targetUuid]: Math.min(5, current + Math.max(0, Math.trunc(parseNumber(amount)))),
            },
        },
    };
}

export function isPassiveItem(formId) {
    return formId === 'metal_05' || formId === 'neve_08';
}
