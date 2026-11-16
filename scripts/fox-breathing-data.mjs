const LEVEL = (custo, options = {}) => Object.freeze({ custo, ...options });

const MANUAL = 'verificação manual';

/**
 * Formas da Respiração da Raposa no shape canônico do contrato. Fonte: PDF oficial V25.1, p.65.
 * A passiva Olhos Escarlate (`raposa_01`) não é Forma de uso. Vínculos com aliado, escudos e a
 * 9ª Forma (sacrifício) são resolvidos pela mesa: o módulo cobra ação e PDR e mostra a regra.
 */
export const FOX_FORMS = Object.freeze([
    {
        id: 'raposa_01',
        respiracao: 'Raposa',
        nome: 'Hiiro no Me',
        ptName: 'Olhos Escarlate',
        passive: true,
        niveis: [1, 2, 3, 4].map(() =>
            LEVEL(0, {
                texto: 'Passiva: sem ação nem PDR. +2 em testes de SAB e INT de percepção com os olhos; +1 PDR máximo no Nível 1; imune a ataques surpresa físicos. Contraponto: −1 em rolagens de acerto (sensibilidade à luz).',
            })
        ),
    },
    {
        id: 'raposa_02',
        respiracao: 'Raposa',
        estilo: 1,
        nome: 'Ichi no Kata Tobimushi',
        ptName: 'Cauda da Primavera',
        acao: 'ataque',
        semAcerto: true,
        niveis: [
            [1, 2, 2, 'remove 1 Exaustão dos aliados afetados', 1],
            [2, 2, 2, 'remove 1 Exaustão dos aliados afetados', 2],
            [3, 2, 2, 'remove 1 Exaustão e cura sangramento e envenenamento dos aliados afetados', 3],
            [4, 3, 2, 'remove 2 Exaustão e cura sangramento e envenenamento dos aliados afetados', 4],
        ].map(([nivel, alvos, pontos, aliados, custo]) => {
            const exaustao = nivel >= 3 ? 2 : 1;
            return LEVEL(custo, {
                texto: `Cone à frente, até 3 alvos: ${exaustao} ponto(s) de Exaustão em até ${nivel === 4 ? 3 : 2} inimigos por 3 turnos. Aliados afetados: ${nivel === 1 ? 'nenhum efeito' : aliados} (${MANUAL}).`,
            });
        }),
    },
    {
        id: 'raposa_03',
        respiracao: 'Raposa',
        estilo: 2,
        nome: 'Ni no Kata Sōrātēru',
        ptName: 'Cauda Solar',
        acao: 'especial',
        niveis: [
            ['1d4', 2, 'si + 1 aliado'],
            ['1d4 + 2', 2, 'si + 1 aliado'],
            ['1d4 + @fdv + 2', 3, 'si + 1 aliado'],
            ['1d4 + @fdv + 2', 3, 'si + até 2 aliados'],
        ].map(([formula, custo, alvos]) =>
            LEVEL(custo, {
                texto: `Cura PDV (${formula.replace('@fdv', 'FDV')}) em ${alvos}. O módulo cura você; cure o(s) aliado(s) com o mesmo valor. Usável dentro e fora de batalha.`,
                primitivas: [{ tipo: 'cura', formula, label: 'Cauda Solar' }],
            })
        ),
    },
    {
        id: 'raposa_04',
        respiracao: 'Raposa',
        estilo: 3,
        nome: 'San no Kata Aki no Shippo',
        ptName: 'Cauda do Outono',
        acao: 'reacao',
        niveis: [
            null,
            ...[2, 3, 4].map(() =>
                LEVEL(3, {
                    texto: 'Nega o efeito de um Kekkijutsu de alvo único lançado contra um aliado. Em si mesmo: +1 PDR além do custo.',
                })
            ),
        ],
    },
    {
        id: 'raposa_05',
        respiracao: 'Raposa',
        estilo: 4,
        nome: 'Shi no Kata Tsuki no O',
        ptName: 'Cauda Lunar',
        acao: 'unica',
        niveis: [
            [2, 2, ''],
            [3, 3, ''],
            [5, 4, ''],
            [6, 5, ' O indivíduo pode ser alvo da 9ª Forma.'],
        ].map(([bonus, custo, extra]) =>
            LEVEL(custo, {
                texto: `Um aliado coberto pelo manto recebe +${bonus} de PDV e PDR máximos. Como Ação Única, troque o manto de indivíduo.${extra}`,
            })
        ),
    },
    {
        id: 'raposa_06',
        respiracao: 'Raposa',
        estilo: 5,
        nome: 'Go no Kata Fuyu no Shippo',
        ptName: 'Cauda do Inverno',
        acao: 'completa',
        niveis: [
            [3, 'nega o próximo dano que receberiam'],
            [3, 'nega o próximo dano; um dos dois ganha +2 no acerto do próximo ataque ou técnica'],
            [4, 'nega o próximo dano; um dos dois ganha vantagem no acerto do próximo ataque ou técnica'],
            [4, 'nega o próximo dano; um dos dois ganha vantagem no acerto do próximo ataque ou técnica; o indivíduo pode ser alvo da 9ª Forma'],
        ].map(([custo, efeito]) =>
            LEVEL(custo, {
                texto: `Dash até um aliado (costas com costas) e escudo de aura até o início do seu próximo turno: ${efeito}. Só anula ataques físicos ou à distância, não Kekkijutsus; um ataque bem-sucedido anula o escudo dos dois.`,
            })
        ),
    },
    {
        id: 'raposa_07',
        respiracao: 'Raposa',
        estilo: 6,
        nome: 'Roku no Kata Miko no Shippo',
        ptName: 'Cauda da Sacerdotisa',
        acao: 'movimento',
        niveis: [
            null,
            ...[2, 3, 4].map(() =>
                LEVEL(1, {
                    texto: 'Requer já ter usado a Respiração da Recuperação neste combate. Abdica da Ação de Movimento e ganha um uso extra da Recuperação (o módulo ainda não libera esse uso: peça ao Mestre para reiniciar o estado da Recuperação neste combate). Limite por combate: FDV ÷ 2, arredondado para cima.',
                })
            ),
        ],
    },
    {
        id: 'raposa_08',
        respiracao: 'Raposa',
        estilo: 7,
        nome: 'Shichi no Kata Yogen-sha no Shippo',
        ptName: 'Cauda do Profeta',
        acao: 'ataque',
        niveis: [
            null,
            ...['6d10', '9d10', '12d10'].map((dano) =>
                LEVEL(6, {
                    dano,
                    tiposDano: [],
                    texto: `7 caudas atacam um inimigo por 3 turnos fixos, consumindo as Ações de Ataque desses turnos (um Acerto por turno, soma FDV, vantagem contra Bloqueio). Dano por turno: ${dano}. Cada acerto: Restrição de Movimentos por 1 turno. Ao fim, 1 Exaustão em você. O módulo rola o 1º turno; repita nos seguintes sem novo custo.`,
                    primitivas: [
                        {
                            tipo: 'aplicaStatus',
                            status: 'restricao_movimentos',
                            turnos: 1,
                            sourceName: 'Cauda do Profeta',
                        },
                    ],
                })
            ),
        ],
    },
    {
        id: 'raposa_09',
        respiracao: 'Raposa',
        estilo: 8,
        nome: 'Hachi no Kata Seirei no Shippo',
        ptName: 'Cauda dos Espíritos',
        acao: 'ataque',
        semAcerto: true,
        niveis: [
            [1, 1, 1, ''],
            [2, 1, 1, ''],
            [2, 2, 2, ''],
            [2, 2, 2, ' Você e o aliado ganham +1 em testes de CD para resistir ou se defender de técnicas sem esquiva ou bloqueio.'],
        ].map(([acerto, dano, custo, extra]) =>
            LEVEL(custo, {
                texto: `Liga você a um aliado por uma cauda espiritual: ambos ganham +${acerto} no acerto e +${dano} de dano por acerto (não acumulativo). Refazer a técnica remove ou transfere a cauda.${extra}`,
            })
        ),
    },
    {
        id: 'raposa_10',
        respiracao: 'Raposa',
        estilo: 9,
        nome: 'Ku no Kata Kitsune no Saigo no Uta',
        ptName: 'O Canto Final da Raposa',
        acao: 'completa',
        niveis: [
            null,
            null,
            null,
            LEVEL(5, {
                texto: 'Só no Nível 4 e após usar a 4ª ou a 5ª Forma neste combate em um aliado caído (0 PDV ou menos). Você se ajoelha e doa a alma à Kyuubi: você morre sem teste de morte; o aliado volta com PDV e PDR cheios e +3 em todas as rolagens até o fim do combate (resolva pela mesa).',
            }),
        ],
    },
]);
