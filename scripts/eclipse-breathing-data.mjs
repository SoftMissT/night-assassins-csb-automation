const LEVEL = (custo, options = {}) => Object.freeze({ custo, ...options });

/**
 * Formas da Respiração do Eclipse no shape canônico do contrato. Fonte: PDF oficial V25.1,
 * Beginning Hour pp. 23–26. As Formas 1, 3 e 5 dependem de aliado, reação contra ataque ou
 * efeito de campo de 3 rodadas: o módulo cobra ação e PDR e mostra a regra; a mesa resolve.
 */
export const ECLIPSE_FORMS = Object.freeze([
    {
        id: 'eclipse_01',
        respiracao: 'Eclipse',
        estilo: 1,
        nome: 'Ichi no Kata Jitsugetsu Ittai',
        ptName: 'União Solar-Lunar',
        acao: null,
        niveis: [
            'Dano: +2 dados do tipo padrão da técnica do aliado.',
            'Dano: +2 dados + FDV.',
            'Dano: +3 dados + 2× FDV.',
            'Dano: +5 dados + 2× FDV.',
        ].map((dano, index) =>
            LEVEL(1, {
                texto: `Durante o turno do aliado, amplifica a técnica dele; no seu próximo turno as ações gastas não estarão disponíveis. Custo total: PDR da técnica do aliado + 1 (o módulo cobra só o +1; pague o resto). ${dano} Buff: ${['+1', '+2', 'dobra o bônus + 1', 'dobra o bônus + metade da CAR'][index]}. Cura: ${['+1 dado', '+1 dado + metade da SAB (mín. 1)', '+2 dados + SAB', '+3 dados + SAB'][index]}. Debuff: ${['+1 turno', '+1 turno', '+2 turnos', '+1d4 + 1 turnos'][index]}. Valor fixo: bônus = Nível de Respiração. Não ajuda em pontos, marcas, acúmulos ou passivas.`,
            })
        ),
    },
    {
        id: 'eclipse_02',
        respiracao: 'Eclipse',
        estilo: 2,
        nome: 'Ni no Kata Meian',
        ptName: 'Luz e Sombra',
        acao: 'ataque',
        niveis: [
            ['4d6', 3],
            ['6d6', 4],
            ['6d6 + @fdv', 5],
            ['8d6 + @fdv', 6],
        ].map(([dano, custo]) =>
            LEVEL(custo, {
                dano,
                tiposDano: [],
                texto: 'Dois cortes lançados em qualquer direção (podem ser projéteis). Passiva Conceptáculo Penumbral: aliado de Água ganha deslocamento; Chamas, +5 Pontos de Esquentar temporários; Pedra, VIT ou metade da FDV no próximo acerto; Trovão, +2 PDR para 2d6 extra; Vento, sangramento bônus de 1d4 + Nível de Respiração (resolva pela mesa).',
            })
        ),
    },
    {
        id: 'eclipse_03',
        respiracao: 'Eclipse',
        estilo: 3,
        nome: 'San no Kata Nisegure',
        ptName: 'Pseudo-Anoitecer',
        acao: 'reacao',
        niveis: [1, 2, 3, 4].map(() =>
            LEVEL(4, {
                texto: 'Contra ataques a você ou a aliados no alcance da arma. Opção Acerto (4 PDR): testa acerto contra o do inimigo; sucesso anula o golpe e, se físico, devolve dano igual ao da arma dele (crítico: o dobro). Opção Esquiva (6 PDR, pague +2): anula o dano para você e, se for em área, para 1 aliado a até 2m (crítico: o aliado pode gastar 6 PDR para incluir mais um).',
            })
        ),
    },
    {
        id: 'eclipse_04',
        respiracao: 'Eclipse',
        estilo: 4,
        nome: 'Shi no Kata Shakunetsu no Nisshoku',
        ptName: 'Eclipse Escaldante',
        acao: 'unica',
        niveis: [
            [3, 'metade do dano padrão da arma por ataque', 'Supressão'],
            [3, 'dano padrão da arma por ataque', 'Supressão'],
            [4, 'dano padrão da arma + metade do Nível de Respiração', 'Supressão'],
            [4, 'dano padrão da arma por ataque', 'Supressão por 2 turnos'],
        ].map(([custo, ate2, tres]) =>
            LEVEL(custo, {
                texto: `4 ataques com 4 rolagens de acerto (cada crítico concede +1 ataque). Não causa dano diretamente. Até 2 acertos: ${ate2}. 3 ou mais acertos: status ${tres} (aplique em Gerenciar Status).`,
            })
        ),
    },
    {
        id: 'eclipse_05',
        respiracao: 'Eclipse',
        estilo: 5,
        nome: 'Go no Kata Shin no Nisshoku',
        ptName: 'Eclipse Verdadeiro',
        acao: 'completa',
        niveis: [1, 2, 3, 4].map(() =>
            LEVEL(1, {
                texto: 'Cria um efeito de campo por 3 rodadas (SAB ou VIT dos inimigos, ou perdem 2× Nível de Respiração em pontos de KKJ nas 2 primeiras). Escolha Eclipse Lunar (Anular → Parcial → Completa: redução de PDR, técnicas de aliados no seu turno, Ultra-Combo) ou Eclipse Solar (bônus de teste, margem de crítico −1, escolha do Conceptáculo Penumbral). O PDF não informa custo de PDR; o módulo cobra 1 PDR (valor já existente no catálogo). Resolva as fases pela mesa.',
            })
        ),
    },
]);
