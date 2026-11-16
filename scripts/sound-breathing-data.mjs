const LEVEL = (custo, options = {}) => Object.freeze({ custo, ...options });

const MANUAL = 'verificação manual';

/**
 * Formas da Respiração do Som no shape canônico do contrato. Fonte: PDF oficial V25.1, p.46.
 * Dano composto por tipo (ex.: Concussivo + Trovejante) é rolado numa fórmula só; a separação
 * por tipo fica no texto. Salvaguardas de alvo e efeitos de área ficam em texto (mesa resolve).
 */
export const SOUND_FORMS = Object.freeze([
    {
        id: 'som_01',
        respiracao: 'Som',
        estilo: 1,
        nome: 'Ichi no Kata Todoroki',
        ptName: 'Rugido',
        acao: 'unica',
        semAcerto: true,
        niveis: [
            LEVEL(1, {
                dano: '1d4 + 4',
                tiposDano: ['concussao', 'trovejante'],
                texto: 'Bônus no próximo Ataque Padrão (que ainda exige Acerto): 1d4 Concussivo + 4 Trovejante. Trovejante não pode ser reduzido.',
            }),
            LEVEL(2, {
                dano: '1d4 + 4',
                tiposDano: ['concussao', 'trovejante'],
                texto: `Igual ao nível 1. Alvo testa VIT, CD 10 + DEX ou FOR do usuário; falha: atordoado por 1 turno (${MANUAL}).`,
            }),
            LEVEL(3, {
                dano: '2d4 + 6',
                tiposDano: ['concussao', 'trovejante'],
                texto: `Bônus: 2d4 Concussivo + 6 Trovejante. CD do teste de VIT +1 (11 + DEX ou FOR) (${MANUAL}).`,
            }),
            LEVEL(3, {
                dano: '2d4 + 1d4 + 6',
                tiposDano: ['concussao', 'cortante', 'trovejante'],
                texto: `Bônus: 2d4 Concussivo + 1d4 Cortante + 6 Trovejante. CD total 12 + DEX ou FOR (${MANUAL}).`,
            }),
        ],
    },
    {
        id: 'som_02',
        respiracao: 'Som',
        estilo: 2,
        nome: 'Ni no Kata Chinmoku',
        ptName: 'Silêncio',
        acao: 'especial',
        niveis: [1, 2, 3, 4].map((bonus, index) =>
            LEVEL([2, 2, 3, 3][index], {
                texto: `Bloqueia todo som em até 9m, centrado em você, por 3 turnos: +${bonus} em Acerto, Esquiva e Bloqueio. Não pode ser reativada enquanto durar.`,
                primitivas: [
                    {
                        tipo: 'buff',
                        id: 'som_silencio',
                        label: 'Silêncio',
                        mods: { acerto: bonus, esquiva: bonus, bloqueio: bonus },
                        turnos: 3,
                    },
                ],
            })
        ),
    },
    {
        id: 'som_03',
        respiracao: 'Som',
        estilo: 3,
        nome: 'San no Kata Saundoremunanto',
        ptName: 'Resquício Sonoro',
        acao: 'unica',
        niveis: [
            [2, '1d6', 3, 4],
            [3, '1d8', 3, 4],
            [4, '1d10', 4, 2],
            [5, '1d12', 4, 2],
        ].map(([clones, dado, custo, penalidade], index) =>
            LEVEL(custo, {
                texto: `Conjura ${clones} clones indistinguíveis (não acumulam; só novos após todos se esvaírem). Ao ser atacado, role ${dado}: 1 ou o máximo = você é atacado; outro resultado = um clone é atacado e some, e o dado cai 2 faces. Defesa dos clones: a sua −${penalidade}. Ao ser desfeito, o atacante testa VIT CD 12 ou toma ${index === 3 ? '2d4' : '1d4'} Sonoro e −3 em SAB de audição até o fim do combate (${MANUAL}).`,
            })
        ),
    },
    {
        id: 'som_04',
        respiracao: 'Som',
        estilo: 4,
        nome: 'Shi no Kata Kyōzan Muken',
        ptName: 'Sinos da Morte de Avīci',
        acao: 'ataque',
        semAcerto: true,
        niveis: [
            ['3d6', 3, 'CD 10 + DEX + FDV'],
            ['4d6', 4, 'CD 10 + DEX + FDV'],
            ['5d6', 4, 'CD 10 + DEX + FDV'],
            ['5d6', 5, 'CD 12 + DEX + FDV'],
        ].map(([dano, custo, cd]) =>
            LEVEL(custo, {
                dano,
                tiposDano: ['sonoro'],
                texto: `Área de 8m (menos você): desvantagem em ataques até o início do seu próximo turno. Dano Sonoro: não pode ser esquivado nem bloqueado; defensor testa VIT, ${cd} do usuário, e toma metade se passar (${MANUAL}). Sinergia (Trovão, Pedra, Luz): VIT CD 15 − DEX para remover 1 Exaustão, Enraizamento/Restrição ou Atordoamento.`,
            })
        ),
    },
    {
        id: 'som_05',
        respiracao: 'Som',
        estilo: 5,
        nome: 'Go no Kata Meigen Sōsō',
        ptName: 'Sinfonia das Cordas Estridentes',
        acao: 'especial',
        semAcerto: true,
        niveis: [
            ['2d6', '1d8', 3],
            ['3d6', '2d8', 3],
            ['4d6', '3d8', 4],
            ['4d6 + @dex', '3d8 + DEX', 5],
        ].map(([dano, padrao, custo]) =>
            LEVEL(custo, {
                dano,
                tiposDano: ['sonoro'],
                texto: `Escolha 3 alvos a até 9m: VIT, CD 10 + DEX do usuário; falha = ${dano.replace('@dex', 'DEX')} Sonoro. Um dos 3 toma também ${padrao} de Dano Padrão (da arma) (${MANUAL}). Pode ser usada até 3×/turno (Ataque, Especial e Movimento), pagando o PDR de cada uso.`,
            })
        ),
    },
    {
        id: 'som_06',
        respiracao: 'Som',
        estilo: 6,
        nome: 'Roku no Kata Dedari Symphony',
        ptName: 'Sinfonia Imortal',
        acao: 'completa',
        semAcerto: true,
        niveis: [
            ['6d8', '2d8', 4],
            ['8d8', '4d8', 4],
            ['10d8', '6d8', 5],
            ['22d8', '8d8', 5],
        ].map(([sonoro, cortante, custo]) =>
            LEVEL(custo, {
                dano: sonoro,
                tiposDano: ['sonoro'],
                texto: `Dano Sonoro ${sonoro} (sem Acerto; o defensor testa CD fixa) + ${cortante} Cortante com Acerto em vantagem contra alvo único: role o Acerto e some o Cortante só se acertar. Você e o alvo ficam surdos; humano, para sempre; Oni, desvantagem permanente em percepção auditiva. Passiva O Canto dos Pássaros: pode conjurar como Reação para anular técnica/Kekkijutsu que o tenha como alvo (sem vantagem no acerto nem desvantagem na sua defesa) pagando +2 PDR.`,
            })
        ),
    },
]);
