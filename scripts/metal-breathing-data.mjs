const LEVEL = (cost, options = {}) => Object.freeze({ cost, ...options });

export const METAL_FORMS = Object.freeze([
    {
        id: 'metal_01',
        style: 1,
        name: 'Ichi no Kata Metaraizu',
        ptName: 'Metalizado',
        action: 'unica',
        levels: [
            LEVEL(2, { blockScale: 'half-vit-ceil', turns: 2 }),
            LEVEL(3, { blockScale: 'vit', turns: 2 }),
            LEVEL(3, { blockScale: 'vit', turns: 3 }),
            LEVEL(3, { blockScale: 'vit', turns: 4 }),
        ],
    },
    {
        id: 'metal_02',
        style: 2,
        name: 'Ni no Kata Yuruginai',
        ptName: 'Inabalável',
        action: 'especial',
        levels: [
            LEVEL(2, { turns: 2 }),
            LEVEL(2, { turns: 2 }),
            LEVEL(2, { turns: 2 }),
            LEVEL(2, { turns: 2 }),
        ],
    },
    {
        id: 'metal_03',
        style: 3,
        name: "San no Kata Rensa Han'nō",
        ptName: 'Reação em Cadeia',
        action: 'especial',
        levels: [
            LEVEL(2, { damageBonus: 2 }),
            LEVEL(3, { damageBonus: 4 }),
            LEVEL(3, { damageBonus: 6 }),
            LEVEL(4, { damageBonus: 8 }),
        ],
    },
    {
        id: 'metal_04',
        style: 4,
        name: 'Shi no Kata Hagane no Yō ni Katai',
        ptName: 'Duro como Aço',
        action: 'completa',
        levels: [
            null,
            LEVEL(2, { defenseAdvantage: true }),
            LEVEL(4, { negateAttack: true }),
            LEVEL(5, { negateAttack: true, counterAttack: true }),
        ],
    },
    {
        id: 'metal_06',
        style: 5,
        name: 'Go no Kata Tatakai de Kitaerareta',
        ptName: 'Forjado na Batalha',
        action: 'ataque',
        levels: [
            LEVEL(4, { turns: 8 }),
            LEVEL(4, { turns: 8 }),
            LEVEL(4, { turns: 8 }),
            LEVEL(4, { turns: 8 }),
        ],
    },
]);

export const METAL_STAGES = Object.freeze([
    null,
    Object.freeze({ hits: 1, name: 'Duro como Ferro', forBonus: 1, fdvBonus: 0 }),
    Object.freeze({ hits: 2, name: 'Versátil como Chumbo', forBonus: 1, fdvBonus: 1 }),
    Object.freeze({ hits: 3, name: 'Precioso como Titânio', forBonus: 2, fdvBonus: 1 }),
    Object.freeze({ hits: 4, name: 'Banhado a Ouro', forBonus: 2, fdvBonus: 2 }),
]);

export const METAL_HAMMER_PASSIVE = Object.freeze({
    id: 'metal_hammer_judgment',
    name: 'Martelo do Julgamento',
    minimumLevel: 1,
    trigger: 'standard-critical-after-damage',
    attackRoll: 'standard',
    damageMultiplier: 0.5,
    rounding: 'ceil',
    ignoresResistance: true,
    synergyBreathings: ['chamas', 'pedra', 'magma'],
    synergyPdrCost: 1,
    synergyDamageMultiplier: 1,
});

export function metalFormById(id) {
    return METAL_FORMS.find((form) => form.id === String(id ?? '')) ?? null;
}
