/**
 * @fileoverview
 * Regras puras do Teste de Resistência ao Despertar.
 *
 * Nenhuma arma, Entidade ou Demônio nominal é conhecido aqui.
 *
 * Cerimônia:
 *   permanente / read-only.
 *
 * Resistência:
 *   gera um evento transitório persistido separadamente.
 *
 * Consequência:
 *   será consumida por outro slice.
 */

export const DUAL_SOUL_RESISTANCE_VERSION = 1;

export const DUAL_SOUL_KINDS = Object.freeze([
    'entidade',
    'demonio',
]);

export const DUAL_SOUL_RESISTANCE_ATTRIBUTES =
    Object.freeze([
        'FOR',
        'VIT',
    ]);

function finiteNumber(
    value,
    label
) {
    const parsed =
        Number(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(
            `${label} precisa ser numérico.`
        );
    }

    return parsed;
}

export function normalizeDualSoulKind(
    value
) {
    const normalized =
        String(value ?? '')
            .trim()
            .toLocaleLowerCase('pt-BR')
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/gu,
                ''
            );

    if (normalized === 'entidade') {
        return 'entidade';
    }

    if (
        normalized === 'demonio'
    ) {
        return 'demonio';
    }

    return null;
}

export function normalizeResistanceAttribute(
    value
) {
    const attribute =
        String(value ?? '')
            .trim()
            .toUpperCase();

    if (
        !DUAL_SOUL_RESISTANCE_ATTRIBUTES
            .includes(attribute)
    ) {
        throw new Error(
            'Resistência ao Despertar aceita somente FOR ou VIT.'
        );
    }

    return attribute;
}

export function isUnstableDualSoulCeremony(
    ceremony = {}
) {
    const kind =
        String(
            ceremony
                ?.dominance
                ?.kind ??
            ceremony
                ?.dominance
                ?.dominantKind ??
            ''
        )
            .trim()
            .toLocaleLowerCase('pt-BR');

    return (
        kind === 'equilibrio' ||
        kind === 'equilíbrio'
    );
}
export function challengerKindFromD2(
    total
) {
    const value =
        Math.trunc(
            finiteNumber(
                total,
                'Resultado do 1d2'
            )
        );

    if (value === 1) {
        return 'entidade';
    }

    if (value === 2) {
        return 'demonio';
    }

    throw new Error(
        `Resultado inválido de 1d2: ${value}.`
    );
}

/**
 * Resolve quem está desafiando neste evento.
 *
 * Estável:
 *   challenger = lado adormecido persistido pela Cerimônia.
 *
 * Equilíbrio:
 *   ninguém é dominante/adormecido.
 *   challenger é sorteado neste evento por 1d2.
 */
export function resolveDualSoulChallenge({
    ceremony,
    challengerRollTotal = null,
} = {}) {
    if (
        !ceremony ||
        typeof ceremony !== 'object'
    ) {
        throw new Error(
            'Cerimônia inválida.'
        );
    }

    if (
        isUnstableDualSoulCeremony(
            ceremony
        )
    ) {
        const challengerKind =
            challengerKindFromD2(
                challengerRollTotal
            );

        return {
            balance: 'unstable',

            dominantKind: null,
            sleepingKind: null,

            challengerKind,

            challengerRoll: {
                formula: '1d2',
                total:
                    Math.trunc(
                        Number(
                            challengerRollTotal
                        )
                    ),
            },
        };
    }

    const dominantKind =
        normalizeDualSoulKind(
            ceremony
                ?.dominance
                ?.dominantKind
        );

    const sleepingKind =
        normalizeDualSoulKind(
            ceremony
                ?.dominance
                ?.sleepingKind
        );

    if (
        !dominantKind ||
        !sleepingKind
    ) {
        throw new Error(
            'Cerimônia estável sem lados dominante/adormecido válidos.'
        );
    }

    if (
        dominantKind ===
        sleepingKind
    ) {
        throw new Error(
            'Lado dominante e adormecido não podem ser iguais.'
        );
    }

    return {
        balance: 'stable',

        dominantKind,
        sleepingKind,

        challengerKind:
            sleepingKind,

        challengerRoll: null,
    };
}

/**
 * Constrói o evento persistido.
 *
 * pending só é true em falha.
 */
export function buildDualSoulResistanceEvent({
    ceremony,

    challengerRollTotal = null,

    attribute,
    attributeValue,

    rollTotal,
    dc,

    actorUuid = null,
    itemUuid = null,

    combatId = null,
    round = null,
    turn = null,

    eventId = null,
    createdAt = null,

    trigger = '',
} = {}) {
    const normalizedAttribute =
        normalizeResistanceAttribute(
            attribute
        );

    const resolvedAttributeValue =
        finiteNumber(
            attributeValue,
            'Valor do atributo'
        );

    const resolvedRollTotal =
        finiteNumber(
            rollTotal,
            'Resultado da Resistência'
        );

    const resolvedDc =
        finiteNumber(
            dc,
            'CD de Despertar'
        );

    if (resolvedDc <= 0) {
        throw new Error(
            `CD de Despertar inválida: ${resolvedDc}.`
        );
    }

    const challenge =
        resolveDualSoulChallenge({
            ceremony,
            challengerRollTotal,
        });

    const success =
        resolvedRollTotal >=
        resolvedDc;

    return {
        version:
            DUAL_SOUL_RESISTANCE_VERSION,

        eventId:
            eventId ?? null,

        createdAt:
            createdAt ?? null,

        pending:
            !success,

        result:
            success
                ? 'success'
                : 'failure',

        balance:
            challenge.balance,

        dominantKind:
            challenge.dominantKind,

        sleepingKind:
            challenge.sleepingKind,

        challengerKind:
            challenge.challengerKind,

        challengerRoll:
            challenge.challengerRoll,

        attribute:
            normalizedAttribute,

        attributeValue:
            resolvedAttributeValue,

        rollTotal:
            resolvedRollTotal,

        dc:
            resolvedDc,

        resistanceRoll: {
            formula:
                `1d20 + ${normalizedAttribute}`,

            resolvedFormula:
                `1d20 + ${resolvedAttributeValue}`,

            total:
                resolvedRollTotal,
        },

        trigger:
            String(trigger ?? ''),

        actorUuid,
        itemUuid,

        combatId,
        round,
        turn,
    };
}

export function parseDualSoulResistanceRuntime(
    value,
    fallback = {}
) {
    if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
    ) {
        return value;
    }

    if (
        typeof value !== 'string' ||
        !value.trim()
    ) {
        return fallback;
    }

    try {
        const parsed =
            JSON.parse(value);

        return (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
        )
            ? parsed
            : fallback;
    } catch {
        return fallback;
    }
}

export function hasPendingDualSoulResistance(
    value
) {
    const runtime =
        parseDualSoulResistanceRuntime(
            value,
            {}
        );

    return (
        runtime.pending === true &&
        runtime.result === 'failure' &&
        DUAL_SOUL_KINDS.includes(
            runtime.challengerKind
        )
    );
}
