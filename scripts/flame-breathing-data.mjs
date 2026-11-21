const LEVEL = (cost, options = {}) => ({ cost, ...options });

export const FLAME_FORMS = Object.freeze([
    {
        id: 'chamas_01',
        style: 3,
        name: 'San no Kata Hitoappu',
        ptName: 'Esquentar',
        passive: true,
        action: null,
        weaponHeat: 0,
        enemyHeat: 0,
        levels: [LEVEL(0), LEVEL(0), LEVEL(0), LEVEL(0)],
    },
    {
        id: 'chamas_02',
        style: 1,
        name: 'Ichi no Kata Shiranui',
        ptName: 'Fogo Desconhecido / Tempestade Ígnea',
        action: 'especial',
        weaponHeat: 7,
        enemyHeat: 0,
        damageTypes: ['fogo'],
        levels: [
            LEVEL(2, { damage: '2d4', extraAttacks: 0 }),
            LEVEL(3, { damage: '2d4', extraAttacks: 1 }),
            LEVEL(3, { damage: '2d4', extraAttacks: 1, extraAttackDamage: '1d4' }),
            LEVEL(4, { damage: '2d4', extraAttacks: 1, extraAttackDamage: '2d4' }),
        ],
    },
    {
        id: 'chamas_03',
        style: 2,
        name: 'Ni no Kata Nobori en Ten',
        ptName: 'Céu em Chamas Ascendentes',
        action: 'ataque',
        weaponHeat: 9,
        enemyHeat: 6,
        levels: [
            LEVEL(3, { criticalOnHit: true }),
            LEVEL(3, { criticalOnHit: true, blockPenalty: -2, blockPenaltyTurns: 2 }),
            LEVEL(3, { criticalOnHit: true, blockPenalty: -2, blockPenaltyTurns: 2, hitBonus: 1 }),
            LEVEL(3, { criticalOnHit: true, blockPenalty: -2, blockPenaltyTurns: 2, hitBonus: 2 }),
        ],
    },
    {
        id: 'chamas_04',
        style: 4,
        name: 'Shi no Kata Sei en no Uneri',
        ptName: 'Ondulação da Chama Fluorescente',
        action: 'reacao',
        weaponHeat: 7,
        enemyHeat: 0,
        levels: [
            LEVEL(1, { blockBonus: 1 }),
            LEVEL(1, { blockBonus: 2 }),
            LEVEL(2, { blockBonus: 3 }),
            LEVEL(3, { blockBonus: 4 }),
        ],
    },
    {
        id: 'chamas_05',
        style: 5,
        name: 'Go no Kata Enko',
        ptName: 'Tigre Ardente',
        action: 'ataque',
        weaponHeat: 11,
        enemyHeat: 8,
        damageTypes: ['fogo'],
        levels: [
            LEVEL(3, { damage: '4d10', hitCount: 1 }),
            LEVEL(3, { damage: '5d10', hitCount: 1 }),
            LEVEL(4, { damage: '6d10', hitCount: 1 }),
            LEVEL(5, { damage: '6d10', hitCount: 1, exhaustionOverDamage: 30 }),
        ],
    },
    {
        id: 'chamas_06',
        style: 6,
        name: 'Roku no Kata Hono Arashi',
        ptName: 'Tormenta de Chamas',
        action: 'ataque',
        weaponHeat: 13,
        enemyHeat: 10,
        damageTypes: ['fogo'],
        levels: [
            null,
            null,
            LEVEL(6, { damage: '8d8', areaMeters: 10, evasionDc: 16, halfOnSave: true }),
            LEVEL(8, {
                damage: '8d8',
                damagePerEnemyHeat: '1d8',
                areaMeters: 10,
                evasionDc: 16,
                halfOnSave: true,
            }),
        ],
    },
    {
        id: 'chamas_07',
        style: 7,
        name: 'Shichi no Kata Kien Banshō',
        ptName: 'Universo Flamejante',
        action: 'unica',
        weaponHeat: 3,
        enemyHeat: 2,
        damageTypes: ['cortante'],
        levels: [
            LEVEL(3, { damage: '2d10', advance: 3 }),
            LEVEL(4, { damage: '3d10', advance: 4.5 }),
            LEVEL(6, { damage: '4d10', advance: 6 }),
            LEVEL(7, { damage: '5d10', advance: 7.5 }),
        ],
    },
    {
        id: 'chamas_08',
        style: 8,
        name: 'Hachi no Kata Tenka',
        ptName: 'Ignição',
        action: 'especial',
        weaponHeat: 8,
        enemyHeat: 0,
        levels: [
            null,
            null,
            LEVEL(5, { selfDamage: 5, damageBonus: 5, turns: 3 }),
            LEVEL(5, { selfDamage: 5, damageBonus: 8, turns: 3 }),
        ],
    },
    {
        id: 'chamas_09',
        style: 9,
        name: 'Ku no Kata Rengoku',
        ptName: 'Rengoku',
        action: 'ataque',
        weaponHeat: 15,
        enemyHeat: 12,
        damageTypes: ['fogo'],
        levels: [
            null,
            LEVEL(4, { hitBonus: 4, saveBaseDc: 10, vulnerableOnFail: true }),
            LEVEL(4, { hitBonus: 4, saveBaseDc: 12, vulnerableOnFail: true }),
            LEVEL(5, { hitBonus: 4, saveBaseDc: 12, vulnerableOnFail: true, exhaustionOnHit: 1 }),
        ],
    },
]);

export function flameFormById(id, variant = 'homebrew') {
    const form = FLAME_FORMS.find((entry) => entry.id === String(id ?? '')) ?? null;
    if (form?.id === 'chamas_03') {
        if (variant === 'vanilla') return { ...form, weaponHeat: 3, enemyHeat: 2 };
        const formulas = ['2d10', '4d10', '6d10 + @for', '8d10 + @for + @fdv'];
        return { ...form, levels: form.levels.map((level, index) => ({ ...level, damage: formulas[index] })) };
    }
    if (form?.id === 'chamas_08' && variant === 'homebrew') {
        return { ...form, levels: form.levels.map((level, index) => level && ({
            ...level, damageBonus: index === 2 ? '2d8' : '4d8', damageType: 'concussao',
        })) };
    }
    return form;
}

export function flameWeaponTier(rawHeat) {
    const heat = Math.max(0, Math.min(60, Math.trunc(Number(rawHeat) || 0)));
    if (heat >= 60)
        return {
            heat,
            hit: 7,
            weaponDamage: 8,
            techniqueDie: '',
            multiplier: 2,
            selfDamage: 2,
        };
    if (heat >= 50)
        return { heat, hit: 6, weaponDamage: 7, techniqueDie: '3d10', multiplier: 1, selfDamage: 0 };
    if (heat >= 40)
        return { heat, hit: 5, weaponDamage: 6, techniqueDie: '2d10', multiplier: 1, selfDamage: 0 };
    if (heat >= 30)
        return { heat, hit: 4, weaponDamage: 5, techniqueDie: '1d10', multiplier: 1, selfDamage: 0 };
    if (heat >= 20)
        return { heat, hit: 3, weaponDamage: 4, techniqueDie: '', multiplier: 1, selfDamage: 0 };
    if (heat >= 10)
        return { heat, hit: 2, weaponDamage: 3, techniqueDie: '', multiplier: 1, selfDamage: 0 };
    if (heat >= 5)
        return { heat, hit: 1, weaponDamage: 2, techniqueDie: '', multiplier: 1, selfDamage: 0 };
    return { heat, hit: 0, weaponDamage: 0, techniqueDie: '', multiplier: 1, selfDamage: 0 };
}

export function flameEmberFormula(rawHeat) {
    const heat = Math.max(0, Number(rawHeat) || 0);
    for (const [threshold, dice] of [[60, 30], [50, 24], [40, 18], [30, 14], [20, 10], [10, 6], [5, 4]])
        if (heat >= threshold) return `${dice}d10`;
    return '';
}
