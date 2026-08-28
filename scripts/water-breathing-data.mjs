export const WATER_BREATH_TEMPLATE_ID = 'NABreathTpl00001';

/** Tipos de dano padrão das Formas de Respiração da Água (chaves de TIPOS_DANO). */
export const WATER_DEFAULT_DAMAGE_TYPES = Object.freeze(['cortante']);

/**
 * Resolve os tipos de dano efetivos de um nível.
 * Precedência: types do nível → types da forma → padrão da Respiração.
 * @param {object} form Forma do catálogo (possui `types` opcional).
 * @param {object} [selected] Nível do catálogo (possui `types` opcional).
 * @returns {string[]}
 */
export function resolveWaterDamageTypes(form = {}, selected = {}) {
    const candidates = [selected.types, form.types, WATER_DEFAULT_DAMAGE_TYPES];
    for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length > 0) return candidate;
    }
    return WATER_DEFAULT_DAMAGE_TYPES;
}

export const WATER_BREATHING_FORMS = Object.freeze([
    {
        id: 'agua_01',
        documentId: 'NAWaterFrm000001',
        order: 1,
        name: 'Ichi no Kata Minamo Giri',
        ptName: 'Barra de Superfície da Água',
        action: 'unica',
        minLevel: 1,
        description:
            'Concentra um corte de água sem contato e fortalece o próximo ataque bem-sucedido.',
        requirement: 'O bônus é consumido somente ao rolar o dano do próximo ataque bem-sucedido.',
        levels: [
            { cost: 1, damage: '1d6', effect: '+1d6 no próximo ataque' },
            { cost: 2, damage: '2d6', effect: '+2d6 no próximo ataque' },
            { cost: 3, damage: '3d6', effect: '+3d6 no próximo ataque' },
            { cost: 3, damage: '4d6', effect: '+4d6 no próximo ataque' },
        ],
    },
    {
        id: 'agua_02',
        documentId: 'NAWaterFrm000002',
        order: 2,
        name: 'Ni no Kata Mizu Guruma',
        ptName: "Roda D'Água",
        action: 'ataque_especial',
        minLevel: 1,
        description: 'Salta e gira em um ataque circular. Exige DEX 12; a falha não gasta PDR.',
        requirement: 'Teste de DEX CD 12. Pode ser Especial após a 1ª Forma ou pagando +1 PDR.',
        levels: [
            { cost: 2, damage: '2d6 + @int', effect: 'Vantagem; defesa bem-sucedida sofre metade' },
            { cost: 3, damage: '3d6 + @int', effect: 'Vantagem; defesa bem-sucedida sofre metade' },
            { cost: 3, damage: '4d6 + @int', effect: 'Vantagem; defesa bem-sucedida sofre metade' },
            {
                cost: 4,
                damage: '4d6 + 2 * @int',
                effect: 'Vantagem; INT dobrada; defesa sofre metade',
            },
        ],
    },
    {
        id: 'agua_03',
        documentId: 'NAWaterFrm000003',
        order: 3,
        name: 'San no Kata Ryuryu Mai',
        ptName: 'Dança da Corrente Rápida',
        action: 'completa',
        minLevel: 1,
        description: 'Executa até três ataques contra alvos diferentes em local aberto.',
        requirement:
            'Local aberto; máximo de três alvos distintos. Em combo com a 9ª Forma usa Ação de Ataque.',
        levels: [
            { cost: 2, damage: '@int', effect: 'INT no dano de cada alvo' },
            { cost: 2, damage: '@int', effect: 'INT no dano e no Acerto' },
            { cost: 3, damage: '@int', effect: 'INT+1 no dano e no Acerto' },
            { cost: 3, damage: '@int', effect: 'INT+2 no dano e no Acerto' },
        ],
    },
    {
        id: 'agua_04',
        documentId: 'NAWaterFrm000004',
        order: 4,
        name: 'Shi no Kata Uchisio',
        ptName: 'Maré Impressionante',
        action: 'especial',
        minLevel: 1,
        description:
            'Após finalizar um inimigo ou obter crítico, realiza outro ataque padrão contra inimigo próximo.',
        requirement:
            'Confirmar finalização ou crítico; alvo dentro do deslocamento. Pode repetir pagando o custo.',
        levels: Array.from({ length: 4 }, () => ({
            cost: 1,
            damage: '',
            effect: 'Ataque padrão imediato em outro inimigo',
        })),
    },
    {
        id: 'agua_05',
        documentId: 'NAWaterFrm000005',
        order: 5,
        name: 'Go no Kata Kanten no Jiu',
        ptName: 'Chuva Misericordiosa de um Dia Seco',
        action: 'especial',
        minLevel: 2,
        description: 'Ataque automaticamente crítico contra alvo rendido ou atordoado.',
        requirement:
            'Alvo rendido ou atordoado. Se finalizar, recupera PDR igual ao Nível de Respiração.',
        levels: [
            null,
            { cost: 0, damage: '', effect: 'Crítico automático; recuperação ao finalizar' },
            { cost: 0, damage: '', effect: 'Crítico automático; recuperação ao finalizar' },
            { cost: 0, damage: '', effect: 'Crítico automático; recuperação ao finalizar' },
        ],
    },
    {
        id: 'agua_06',
        documentId: 'NAWaterFrm000006',
        order: 6,
        name: 'Roku no Kata Nejire Uzu',
        ptName: 'Torção de Hidromassagem',
        action: 'ataque',
        minLevel: 1,
        description: 'Redemoinho em área que pode atingir inimigos e aliados próximos.',
        requirement:
            'Um Acerto para todos os alvos; submerso concede +3. Aliados ganham DEX do usuário na Defesa.',
        levels: [
            { cost: 4, damage: '8d6 + @dex', effect: 'Ataque em área' },
            { cost: 4, damage: '10d6 + @dex', effect: 'Ataque em área' },
            { cost: 5, damage: '12d6 + @dex', effect: 'Ataque em área' },
            { cost: 6, damage: '14d6 + @dex', effect: 'Ataque em área' },
        ],
    },
    {
        id: 'agua_07',
        documentId: 'NAWaterFrm000007',
        order: 7,
        name: 'Shichi no Kata Shizuku wa Mondzuki',
        ptName: 'Gota de Chuva Penetrante',
        action: 'reacao',
        minLevel: 1,
        description:
            'Bloqueio de reação com bônus de INT contra todos os ataques da ação declarada.',
        requirement:
            'Declarar antes do Acerto inimigo. Nos níveis 3–4 habilita a 6ª Forma por metade do PDR após Bloqueio.',
        levels: [
            { cost: 2, damage: '', effect: '+INT no Bloqueio da ação' },
            { cost: 2, damage: '', effect: '+INT no Bloqueio da ação' },
            { cost: 2, damage: '', effect: '+INT no Bloqueio e combo com a 6ª Forma' },
            { cost: 2, damage: '', effect: '+INT no Bloqueio e combo com a 6ª Forma' },
        ],
    },
    {
        id: 'agua_08',
        documentId: 'NAWaterFrm000008',
        order: 8,
        name: 'Hachi no Kata Takitsubo',
        ptName: 'Força da Cascata',
        action: 'completa',
        minLevel: 1,
        description:
            'Golpe vertical que suprime resistências por dois turnos e entra em recarga por três turnos.',
        requirement:
            'Não pode ser usada durante a recarga. Níveis 2–4 exigem teste de VIT do alvo contra o Acerto.',
        levels: [
            { cost: 5, damage: '4d6 + 2 * @int', effect: 'Suprime resistências por 2 turnos' },
            { cost: 5, damage: '4d6 + 2 * @int', effect: 'Supressão; VIT ou Atordoado 1 turno' },
            { cost: 6, damage: '4d6 + 2 * @int', effect: 'Supressão; VIT; INT por d6 crítico' },
            {
                cost: 6,
                damage: '4d6 + 2 * @int',
                effect: 'Supressão; VIT; INT por d6 crítico; Vantagem',
            },
        ],
    },
    {
        id: 'agua_09',
        documentId: 'NAWaterFrm000009',
        order: 9,
        name: 'Ku no Kata Suiryu Shibuki',
        ptName: 'Respingos de Água',
        action: 'unica',
        minLevel: 1,
        description: 'Movimentação fluida por dois turnos, com Esquiva e deslocamento adicionais.',
        requirement:
            'Enquanto ativo, garante o pulo da 2ª Forma e pode habilitar técnica Especial de aliado por 1 PDR.',
        levels: [
            { cost: 2, damage: '', effect: '+1 Esquiva e +1m por 2 turnos' },
            { cost: 2, damage: '', effect: '+1 Esquiva e +2m por 2 turnos' },
            { cost: 4, damage: '', effect: '+3 Esquiva e +3m por 2 turnos' },
            { cost: 4, damage: '', effect: '+3 Esquiva e +4m por 2 turnos' },
        ],
    },
    {
        id: 'agua_10',
        documentId: 'NAWaterFrm000010',
        order: 10,
        name: 'Ju no Kata Seisei Ruten',
        ptName: 'O Dragão da Mudança',
        action: 'completa',
        minLevel: 2,
        description: 'Carrega poder por turnos antes de liberar um ataque crescente.',
        requirement:
            'Mínimo de um turno carregado. Mais de um turno concede 2 Exaustão ao liberar.',
        levels: [
            null,
            { cost: 3, damage: '1d8 + @int', effect: 'Por turno carregado' },
            { cost: 4, damage: '2d6 + @int', effect: 'Por turno carregado' },
            { cost: 5, damage: '3d6 + @int', effect: 'Por turno carregado' },
        ],
    },
    {
        id: 'agua_11',
        documentId: 'NAWaterFrm000011',
        order: 11,
        name: 'Ju Ichi no Kata Nagi',
        ptName: 'Calmaria',
        action: 'reacao',
        minLevel: 2,
        description: 'Anula completamente um ataque recebido, com usos diários limitados.',
        requirement: 'Nível 2: 1/dia; Nível 3: 2/dia; Nível 4: 3/dia.',
        levels: [
            null,
            { cost: 4, damage: '', effect: 'Anula um ataque; 1 uso/dia' },
            { cost: 4, damage: '', effect: 'Anula um ataque; 2 usos/dia' },
            { cost: 4, damage: '', effect: 'Anula um ataque; 3 usos/dia' },
        ],
    },
]);

export function waterFormById(id) {
    return WATER_BREATHING_FORMS.find((form) => form.id === id) ?? null;
}
