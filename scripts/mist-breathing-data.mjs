/** Dados mecânicos curados da Respiração da Névoa. */

export const MIST_FORMS = Object.freeze([
    {
        id: 'nevoa_01',
        order: 1,
        name: 'Ichi no Kata Suiten Togasumi',
        ptName: 'Céu Suspenso',
        action: 'especial',
        levels: [
            { cost: 1, bonus: '@sab' },
            { cost: 1, bonus: '@sab + 1' },
            { cost: 2, bonus: '@sab + 2' },
            { cost: 2, bonus: '@sab + 3' },
        ],
    },
    {
        id: 'nevoa_02',
        order: 2,
        name: 'Ni no Kata Yaekasumi',
        ptName: 'Névoa de Oito Camadas',
        action: 'ataque',
        levels: [
            { cost: 3, damage: '5d6' },
            { cost: 3, damage: '6d6' },
            { cost: 3, damage: '8d6' },
            { cost: 3, damage: '10d6' },
        ],
    },
    {
        id: 'nevoa_03',
        order: 3,
        name: 'San no Kata Kasan no Shibuki',
        ptName: 'Expansão de Névoa',
        action: 'reacao',
        levels: [
            { cost: 3, reduction: '1d6 + @level' },
            { cost: 3, reduction: '1d6 + @level' },
            { cost: 3, reduction: '1d6 + @level + @sab' },
            { cost: 3, reduction: '1d6 + @level + @sab' },
        ],
    },
    {
        id: 'nevoa_04',
        order: 4,
        name: 'Shi no Kata Iryukir',
        ptName: 'Corte de Advecção / Fecha Neblinada',
        action: 'especial',
        levels: [
            { cost: 2, damage: '3d6' },
            { cost: 2, damage: '4d6' },
            { cost: 3, damage: '5d6' },
            { cost: 3, damage: '6d6' },
        ],
    },
    {
        id: 'nevoa_05',
        order: 5,
        name: 'Go no Kata Kaun no Umi',
        ptName: 'Mar de Nuvens Neblinadas',
        action: 'reacao',
        levels: [
            null,
            { cost: 2, saveDc: '9 + @sab' },
            { cost: 2, saveDc: '10 + @sab' },
            { cost: 3, saveDc: '12 + @sab' },
        ],
    },
    {
        id: 'nevoa_06',
        order: 6,
        name: 'Roku no Kata Tsuki no Kashō',
        ptName: 'Névoa sob o Luar',
        action: 'completa',
        levels: [{ cost: 2 }, { cost: 2 }, { cost: 2 }, { cost: 2 }],
    },
    {
        id: 'nevoa_07',
        order: 7,
        name: 'Shichi no Kata Oboro',
        ptName: 'Neblina',
        action: 'especial',
        levels: [null, { cost: 4, bonus: 2 }, { cost: 5, bonus: 3 }, { cost: 6, bonus: 4 }],
    },
    {
        id: 'nevoa_08',
        order: 8,
        name: 'Hachi no Kata Nandoku-ka',
        ptName: 'Ofuscamento',
        action: 'unica',
        levels: [
            null,
            { cost: 7, hitPenalty: -2 },
            { cost: 7, hitPenalty: -2, hitBonus: 2 },
            { cost: 7, hitPenalty: -2, hitBonus: 2, criticalImmunity: true },
        ],
    },
]);

export function mistFormById(id) {
    return MIST_FORMS.find((form) => form.id === id) ?? null;
}
