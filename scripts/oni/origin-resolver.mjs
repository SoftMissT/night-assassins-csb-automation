import originsCatalog from '../../catalogs/oni-origins.json' with { type: 'json' };

const ORIGINS_BY_ID = new Map(originsCatalog.origins.map((o) => [o.id, Object.freeze(o)]));

export const ONI_ORIGIN_IDS = Object.freeze([...ORIGINS_BY_ID.keys()]);

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function getOniOrigin(originId) {
    return (
        ORIGINS_BY_ID.get(
            String(originId ?? '')
                .trim()
                .toLocaleLowerCase('pt-BR')
        ) ?? null
    );
}

export function isFallenSlayerOrigin(originId) {
    const origin = getOniOrigin(originId);
    return origin?.special === 'fallen_slayer';
}

export function originAttributeBonus(originId) {
    const origin = getOniOrigin(originId);
    if (!origin) return Object.freeze({});
    return Object.freeze({ ...origin.attributeBonus });
}

export function originInitialPdv(originId, vitality = 0) {
    const origin = getOniOrigin(originId);
    if (!origin) return 0;
    const vit = Math.max(0, integer(vitality));
    if (origin.special === 'fallen_slayer') return null;
    return Math.max(0, integer(origin.pdvBase)) + vit;
}

export function originInitialPdk(originId, fdv = 0) {
    const origin = getOniOrigin(originId);
    if (!origin) return 0;
    const fdvValue = Math.max(0, integer(fdv));
    if (origin.special === 'fallen_slayer') return null;
    const fdvTriple = fdvValue * 3;
    if (origin.pdkUsesLegacyFdv) {
        return Math.max(0, integer(origin.pdkBase)) + fdvValue + fdvTriple;
    }
    return Math.max(0, integer(origin.pdkBase)) + fdvTriple;
}

export function fallenSlayerPdv(vitality = 0, fallenLevel = 1) {
    const vit = Math.max(0, integer(vitality));
    const level = Math.max(1, integer(fallenLevel, 1));
    return 30 + vit * 3 + 10 * level;
}

export function fallenSlayerPdk(previousPdrMax = 0, fallenLevel = 1, fdv = 0) {
    const pdr = Math.max(0, integer(previousPdrMax));
    const level = Math.max(1, integer(fallenLevel, 1));
    const fdvValue = Math.max(0, integer(fdv));
    return pdr + level * 2 + fdvValue * 3;
}

export function originSummary(originId) {
    const origin = getOniOrigin(originId);
    if (!origin) return null;
    return Object.freeze({
        id: origin.id,
        name: origin.name,
        attributeBonus: originAttributeBonus(originId),
        pdvFormula: origin.pdvFormula,
        pdkFormula: origin.pdkFormula,
        special: origin.special ?? null,
    });
}
