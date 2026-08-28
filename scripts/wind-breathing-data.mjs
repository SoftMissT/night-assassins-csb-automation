const LEVEL = (cost, options = {}) => Object.freeze({ cost, ...options });

/**
 * Respiração do Vento 9 Estilos (1º Estilo com 2 variações independentes:
 * Redemoinho Escalável e Ciclone Penetrante, ambas sob o mesmo Item do
 * catálogo `vento_02`).
 */
export const WIND_FORMS = Object.freeze([
    {
        id: 'vento_01',
        style: 'passiva',
        name: 'Tokubetsuna Chi',
        ptName: 'Sangue Especial',
        action: 'passiva',
        passive: true,
        levels: [LEVEL(0, {}), LEVEL(0, {}), LEVEL(0, {}), LEVEL(0, {})],
    },
    {
        id: 'vento_02',
        style: 1,
        name: 'Ichi no Kata Jin Senpū Sogi',
        ptName: 'Redemoinho de Poeira (Redemoinho Escalável)',
        action: 'ataque',
        variant: 'scalable', // Redemoinho Escalável dano por PDR investido
        levels: [
            LEVEL(0, { damagePerPdr: '1d6', maxPdr: '2*@dex' }),
            LEVEL(0, { damagePerPdr: '1d6', maxPdr: '2*@dex' }),
            LEVEL(0, { damagePerPdr: '1d6', maxPdr: '2*@dex' }),
            LEVEL(0, { damagePerPdr: '2d6', maxPdr: '2*@dex' }),
        ],
    },
    {
        id: 'vento_02_ciclone',
        style: 1,
        name: 'Ichi no Kata Jin Senpū Sogi',
        ptName: 'Redemoinho de Poeira (Ciclone Penetrante)',
        action: 'ataque',
        variant: 'cyclone', // fixo, alternativa ao Redemoinho Escalável mesmo Item vento_02
        levels: [
            LEVEL(3, {
                damage: '5d6',
                damageTypes: ['cortante'],
                areaDiameter: 2,
                maxTargets: 3,
                halfOnEvasion: true,
            }),
            LEVEL(3, {
                damage: '5d6',
                damageTypes: ['cortante'],
                areaDiameter: 2,
                maxTargets: 3,
                halfOnEvasion: true,
            }),
            LEVEL(3, {
                damage: '5d6',
                damageTypes: ['cortante'],
                areaDiameter: 2,
                maxTargets: 3,
                halfOnEvasion: true,
            }),
            LEVEL(3, {
                damage: '5d6',
                damageTypes: ['cortante'],
                areaDiameter: 2,
                maxTargets: 3,
                halfOnEvasion: true,
            }),
        ],
    },
    {
        id: 'vento_03',
        style: 2,
        name: 'Ni no Kata Sōsō Shinato Kaze',
        ptName: 'Garras do Vento Puro',
        action: 'unica',
        levels: [
            null,
            LEVEL(4, { multiplier: 3 }),
            LEVEL(4, { multiplier: 4 }),
            LEVEL(5, { multiplier: 4, addDex: true }),
        ],
    },
    {
        id: 'vento_04',
        style: 3,
        name: 'San no Kata Kokufū Enran',
        ptName: 'Árvore Balançando ao Vapor da Montanha',
        actions: ['ataque', 'reacao'],
        levels: [
            LEVEL(3, { damage: '3d10', counterDamage: '2d8' }),
            LEVEL(3, { damage: '3d10', counterDamage: '2d8' }),
            LEVEL(3, { damage: '3d10', counterDamage: '2d12' }),
            LEVEL(3, { damage: '3d10', counterDamage: '2d12' }),
        ],
        reactionCost: 2,
    },
    {
        id: 'vento_05',
        style: 4,
        name: 'Shi no Kata Shōjō Sajinran',
        ptName: 'Tempestade Crescente de Poeira',
        action: 'unica',
        levels: [
            LEVEL(4, { extraAttack: 1, disablesHealing: true, extraPdrCost: 0 }),
            LEVEL(4, { extraAttack: 1, disablesHealing: true, extraPdrCost: 0 }),
            LEVEL(5, { extraAttack: 1, disablesHealing: true, extraPdrCost: 2 }),
            LEVEL(5, { extraAttack: 1, disablesHealing: true, extraPdrCost: 2 }),
        ],
    },
    {
        id: 'vento_06',
        style: 5,
        name: 'Go no Kata Kogarashi Oroshi',
        ptName: 'Vendaval de Inverno',
        actions: ['unica', 'ataque'],
        levels: [
            LEVEL(3, { attacks: 3, damage: '2d4 + @fdv', hitBonus: 0 }),
            LEVEL(3, { attacks: 3, damage: '2d6 + @fdv', hitBonus: 0 }),
            LEVEL(4, {
                attacks: 3,
                damage: '2d8 + @fdv',
                hitBonus: 1,
                exhaustionAtLevel3Plus: true,
            }),
            LEVEL(4, {
                attacks: 3,
                damage: '2d8 + @fdv + @dex',
                hitBonus: 2,
                exhaustionAtLevel3Plus: true,
            }),
        ],
        ignoresResistance: true,
    },
    {
        id: 'vento_07',
        style: 6,
        name: 'Roku no Kata Seiran Fuju',
        ptName: 'Tempestade da Fumaça Escurecedora',
        action: 'ataque',
        levels: [
            null,
            LEVEL(5, { damage: '8d6', damageTypes: ['cortante'] }),
            LEVEL(5, { damage: '8d6 + 2d6', damageTypes: ['cortante', 'perfurante'] }),
            LEVEL(5, { damage: '8d6 + 4d6', damageTypes: ['cortante', 'perfurante'] }),
        ],
        blockPenalty: -2,
    },
    {
        id: 'vento_08',
        style: 7,
        name: 'Shichi no Kata Keifū · Tengu Kaze',
        ptName: 'Ventania Rajadas Repentinas',
        action: 'especial',
        levels: [
            LEVEL(4, { saveDc: '9+@dex', fallDamage: '2d6' }),
            LEVEL(4, { saveDc: '10+@dex', fallDamage: '2d6' }),
            LEVEL(5, { saveDc: '10+@dex', fallDamage: '3d6' }),
            LEVEL(5, { saveDc: '12+@dex', fallDamage: '3d6' }),
        ],
    },
    {
        id: 'vento_09',
        style: 8,
        name: 'Hachi no Kata Sho Rekkaza Kiri',
        ptName: 'Corte da Primeira Ventania',
        action: 'completa',
        levels: [
            null,
            null,
            LEVEL(6, { damagePerScar: '4d12', range: 18 }),
            LEVEL(6, { damagePerScar: '6d12', range: 18 }),
        ],
    },
    {
        id: 'vento_10',
        style: 9,
        name: 'Ku no Kata Idaten Taifu',
        ptName: 'Tufão Idaten',
        action: 'completa',
        minDex: 4,
        levels: [
            null,
            null,
            null,
            LEVEL(8, {
                testDc: 17,
                damageBase: '10d10',
                damagePerScar: '2d10',
                damagePerDex: '2d10',
                bleedSaveDc: '12+@for',
                exhaustionOnUse: 1,
                healOnBigHit: 5,
                healThresholdPercent: 10,
            }),
        ],
    },
]);

export function windFormById(id) {
    return WIND_FORMS.find((form) => form.id === String(id ?? '')) ?? null;
}

/** Respirações que ativam a sinergia de crítico do 3º Estilo (Árvore Balançando). */
export const WIND_SYNERGY_BREATHINGS = Object.freeze(['Insetos', 'Névoa', 'Grama', 'Areia']);
