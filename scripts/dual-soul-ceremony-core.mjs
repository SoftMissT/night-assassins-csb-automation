/**
 * Regras puras da Cerimônia de Vínculo das Armas de Dupla Alma.
 *
 * Este arquivo NÃO conhece armas, Entidades ou Demônios nominais.
 * O domínio entra exclusivamente através dos dados do Item.
 */

export const DUAL_SOUL_INTENSITIES = Object.freeze([
    Object.freeze({
        id: 'fragil',
        name: 'Vínculo Frágil',
        min: 3,
        max: 14,
        value: 1,
    }),
    Object.freeze({
        id: 'fraco',
        name: 'Vínculo Fraco',
        min: 15,
        max: 24,
        value: 2,
    }),
    Object.freeze({
        id: 'comum',
        name: 'Vínculo Comum',
        min: 25,
        max: 38,
        value: 3,
    }),
    Object.freeze({
        id: 'forte',
        name: 'Vínculo Forte',
        min: 39,
        max: 48,
        value: 4,
    }),
    Object.freeze({
        id: 'profundo',
        name: 'Vínculo Profundo',
        min: 49,
        max: 57,
        value: 5,
    }),
    Object.freeze({
        id: 'absoluto',
        name: 'Vínculo Absoluto',
        min: 58,
        max: 60,
        value: 6,
    }),
]);

export const DUAL_SOUL_TRIGGER_BANDS = Object.freeze([
    Object.freeze({
        id: 'comum',
        label: 'Gatilho comum',
        min: 3,
        max: 14,
    }),
    Object.freeze({
        id: 'tensao',
        label: 'Gatilho de tensão',
        min: 15,
        max: 38,
    }),
    Object.freeze({
        id: 'raro',
        label: 'Gatilho raro',
        min: 39,
        max: 57,
    }),
    Object.freeze({
        id: 'oculto',
        label: 'Gatilho oculto do Mestre',
        min: 58,
        max: 60,
    }),
]);

function integer(value, fallback = 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed)
        ? Math.trunc(parsed)
        : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.min(
        maximum,
        Math.max(
            minimum,
            integer(value, minimum)
        )
    );
}

export function parseDualSoulJson(
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
        const parsed = JSON.parse(value);

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

/**
 * O framework permite 1d20 ou 1d100 para o Teste 1.
 *
 * A tabela canônica possui vinte posições.
 * O modo d100 usa cinco resultados percentuais para cada posição,
 * preservando exatamente a proporção das faixas:
 *
 * 01-05 -> 1
 * 06-10 -> 2
 * ...
 * 96-100 -> 20
 */
export function dominanceD20Equivalent(
    total,
    formula = '1d20'
) {
    const normalized =
        String(formula ?? '')
            .toLowerCase();

    if (normalized.includes('d100')) {
        return Math.ceil(
            clamp(total, 1, 100) / 5
        );
    }

    return clamp(total, 1, 20);
}

export function dualSoulDominance(
    total,
    {
        formula = '1d20',
        entityName = 'Entidade',
        demonName = 'Demônio',
    } = {}
) {
    const result =
        dominanceD20Equivalent(
            total,
            formula
        );

    if (result <= 3) {
        return {
            kind: 'demonio',
            relation: 'domina',

            dominantKind: 'demonio',
            dominantName: demonName,

            sleepingKind: 'entidade',
            sleepingName: entityName,

            deepSleep: true,
            d20Equivalent: result,

            display:
                `${demonName} — Demônio domina`,
        };
    }

    if (result <= 8) {
        return {
            kind: 'demonio',
            relation: 'favorecido',

            dominantKind: 'demonio',
            dominantName: demonName,

            sleepingKind: 'entidade',
            sleepingName: entityName,

            deepSleep: false,
            d20Equivalent: result,

            display:
                `${demonName} — Demônio favorecido`,
        };
    }

    if (result <= 12) {
        return {
            kind: 'equilibrio',
            relation: 'instavel',

            dominantKind: 'equilibrio',
            dominantName: 'Equilíbrio instável',

            sleepingKind: null,
            sleepingName: null,

            deepSleep: false,
            d20Equivalent: result,

            display: 'Equilíbrio instável',
        };
    }

    if (result <= 17) {
        return {
            kind: 'entidade',
            relation: 'favorecido',

            dominantKind: 'entidade',
            dominantName: entityName,

            sleepingKind: 'demonio',
            sleepingName: demonName,

            deepSleep: false,
            d20Equivalent: result,

            display:
                `${entityName} — Entidade favorecida`,
        };
    }

    return {
        kind: 'entidade',
        relation: 'domina',

        dominantKind: 'entidade',
        dominantName: entityName,

        sleepingKind: 'demonio',
        sleepingName: demonName,

        deepSleep: true,
        d20Equivalent: result,

        display:
            `${entityName} — Entidade domina`,
    };
}

export function dualSoulIntensity(total) {
    const value =
        clamp(total, 3, 60);

    return (
        DUAL_SOUL_INTENSITIES.find(
            (band) =>
                value >= band.min &&
                value <= band.max
        ) ??
        DUAL_SOUL_INTENSITIES[2]
    );
}

export function dualSoulTrigger(total) {
    const value =
        clamp(total, 3, 60);

    return (
        DUAL_SOUL_TRIGGER_BANDS.find(
            (band) =>
                value >= band.min &&
                value <= band.max
        ) ??
        DUAL_SOUL_TRIGGER_BANDS[1]
    );
}

export function lookupDualSoulRange(
    table = {},
    total
) {
    if (
        !table ||
        typeof table !== 'object' ||
        Array.isArray(table)
    ) {
        return undefined;
    }

    const value = integer(total);

    for (
        const [rawRange, result]
        of Object.entries(table)
    ) {
        const range =
            String(rawRange)
                .replace(/[–—]/gu, '-');

        const plus =
            range.match(
                /^\s*(\d+)\s*\+\s*$/u
            );

        if (plus) {
            if (
                value >= Number(plus[1])
            ) {
                return result;
            }

            continue;
        }

        const between =
            range.match(
                /^\s*(\d+)\s*-\s*(\d+)\s*$/u
            );

        if (!between) {
            continue;
        }

        const minimum =
            Number(between[1]);

        const maximum =
            Number(between[2]);

        if (
            value >= minimum &&
            value <= maximum
        ) {
            return result;
        }
    }

    return undefined;
}

export function buildDualSoulCeremonyResult({
    test1Total,
    test1Formula = '1d20',

    test2Total,
    test3Total,

    entityName = 'Entidade',
    demonName = 'Demônio',

    tests = {},
} = {}) {
    const dominance =
        dualSoulDominance(
            test1Total,
            {
                formula: test1Formula,
                entityName,
                demonName,
            }
        );

    const intensity =
        dualSoulIntensity(test2Total);

    const trigger =
        dualSoulTrigger(test3Total);

    const dominanceText =
        lookupDualSoulRange(
            tests
                ?.teste_1_lado_dominante,
            dominance.d20Equivalent
        );

    const triggerText =
        lookupDualSoulRange(
            tests
                ?.teste_3_gatilho_lado_adormecido,
            test3Total
        );

    const publicTrigger =
        trigger.id === 'oculto'
            ? 'Gatilho oculto do Mestre.'
            : (
                triggerText ??
                trigger.label
            );

    const rawCd =
        tests
            ?.teste_de_despertar
            ?.[intensity.name];

    const awakeningCd =
        Number.isFinite(Number(rawCd))
            ? Number(rawCd)
            : null;

    return {
        version: 1,

        dominance: {
            ...dominance,

            roll: {
                formula: test1Formula,
                total: integer(test1Total),
                d20Equivalent:
                    dominance.d20Equivalent,
            },

            sourceText:
                dominanceText ?? '',
        },

        intensity: {
            id: intensity.id,
            name: intensity.name,
            value: intensity.value,

            roll: {
                formula: '3d20',
                total: integer(test2Total),
            },

            awakeningCd,
        },

        trigger: {
            id: trigger.id,
            label: trigger.label,

            roll: {
                formula: '3d20',
                total: integer(test3Total),
            },

            publicText:
                publicTrigger,

            sourceText:
                trigger.id === 'oculto'
                    ? ''
                    : (
                        triggerText ??
                        ''
                    ),
        },
    };
}

export function dualSoulCeremonyCompleted(
    value
) {
    const parsed =
        parseDualSoulJson(
            value,
            {}
        );

    return (
        parsed
            ?.runtime
            ?.completed === true
    );
}

export function dualSoulCeremonyRuntime(
    value
) {
    const parsed =
        parseDualSoulJson(
            value,
            {}
        );

    return (
        parsed?.runtime &&
        typeof parsed.runtime === 'object'
    )
        ? parsed.runtime
        : null;
}
