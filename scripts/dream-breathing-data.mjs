const LEVEL = (custo, options = {}) => Object.freeze({ custo, ...options });

const MANUAL = 'verificação manual';

/**
 * Formas da Respiração dos Sonhos no shape canônico do contrato. Fonte: PDF oficial V25.1, p.58.
 * A passiva Troca Equivalente (`sonhos_01`) não é Forma de uso. Níveis bloqueados são `null`.
 */
export const DREAM_FORMS = Object.freeze([
    {
        id: 'sonhos_01',
        respiracao: 'Sonhos',
        nome: 'Tokubetsuna Passiva',
        ptName: 'Troca Equivalente',
        passive: true,
        niveis: [1, 2, 3, 4].map(() =>
            LEVEL(0, {
                texto: 'Passiva: sem ação nem PDR. Uma vez por dia, ao receber dano letal, oferta memórias ao Domínio dos Sonhos: perde 1 de SAB (depois 2, depois 3; não há quarta vez) e volta com 1 PDV. Não pode deixar a SAB negativa.',
            })
        ),
    },
    {
        id: 'sonhos_02',
        respiracao: 'Sonhos',
        estilo: 1,
        nome: 'Ichi no Kata Shushin Jikan',
        ptName: 'Hora de Dormir',
        acao: 'unica',
        niveis: [
            ['1d6 + 1', 1],
            ['1d6', 1],
            ['1d4 + 1', 2],
            ['1d4', 2],
        ].map(([reducao, custo]) =>
            LEVEL(custo, {
                texto: `Seus próximos ataques bem-sucedidos neste turno causam ${reducao} de dano a menos e aplicam 1 Exaustão no inimigo. É efeito de contato (1× por ação) (${MANUAL}).`,
            })
        ),
    },
    {
        id: 'sonhos_03',
        respiracao: 'Sonhos',
        estilo: 2,
        nome: 'Ni no Kata Sakushi',
        ptName: 'Ilusão de Ótica',
        acao: 'ataque',
        semAcerto: true,
        niveis: [1, 2, 3, 4].map(() =>
            LEVEL(2, {
                texto: 'Só a partir de furtividade. Os próximos 2 ataques do inimigo são rolados com debuff no acerto igual à SAB do usuário.',
            })
        ),
    },
    {
        id: 'sonhos_04',
        respiracao: 'Sonhos',
        estilo: 3,
        nome: 'San no Kata Shūtingusutā',
        ptName: 'Estrela Cadente',
        acao: 'unica',
        niveis: [
            ['2d6 + @dex', 2],
            ['4d6 + @dex', 2],
            ['5d6 + @dex', 3],
            ['6d6 + @dex', 3],
        ].map(([dano, custo]) =>
            LEVEL(custo, {
                dano,
                tiposDano: [],
                texto: 'Só no ar (Ação Especial: DEX CD 12 para pular). Sinergia (Sombras, Luz, Lua): em acerto, cada aliado com sinergia escolhe receber 1 Exaustão e recuperar PDR = CAR + SAB do usuário, até Nível de Respiração vezes por combate.',
            })
        ),
    },
    {
        id: 'sonhos_05',
        respiracao: 'Sonhos',
        estilo: 4,
        nome: 'Shi no Kata Omoide no Umi',
        ptName: 'Mar de Memórias',
        acao: 'especial',
        niveis: [
            ['+1', 1, 1],
            ['+2', 2, 2],
            ['sua SAB', 3, '@sab'],
            ['sua SAB + CAR', 4, '@sab + @car'],
        ].map(([rotulo, custo, bonus]) =>
            LEVEL(custo, {
                texto: `Por 2 turnos: ${rotulo} em Acerto e Esquiva, e mais velocidade de movimento. Não reativa enquanto o efeito anterior durar.`,
                primitivas: [
                    {
                        tipo: 'buff',
                        id: 'sonhos_mar_de_memorias',
                        label: 'Mar de Memórias',
                        mods: { acerto: bonus, esquiva: bonus },
                        turnos: 2,
                    },
                ],
            })
        ),
    },
    {
        id: 'sonhos_06',
        respiracao: 'Sonhos',
        estilo: 5,
        nome: 'Go no Kata Naitorēdā',
        ptName: 'Radar Noturno',
        acao: 'unica',
        niveis: [1, 2, 3, 4].map(() =>
            LEVEL(2, {
                texto: 'A Nichirin brilha na direção de Onis a até 500m: bônus em teste para encontrá-los igual ao seu Nível de Respiração + SAB.',
            })
        ),
    },
    {
        id: 'sonhos_07',
        respiracao: 'Sonhos',
        estilo: 6,
        nome: 'Roku no Kata Akumu no Ryōiki',
        ptName: 'Domínio dos Pesadelos',
        acao: 'ataque',
        semAcerto: true,
        niveis: [
            null,
            ['3d8', 5],
            ['4d8', 6],
            ['5d8', 6],
        ].map((entry) =>
            entry === null
                ? null
                : LEVEL(entry[1], {
                      texto: `Área circular de 10m sob o inimigo por 5 turnos. O inimigo só sai se passar em SAB, CD 9 + SAB + CAR do usuário. Dano concussivo contínuo no início do turno de quem estiver dentro: ${entry[0]} (${MANUAL}).`,
                  })
        ),
    },
    {
        id: 'sonhos_08',
        respiracao: 'Sonhos',
        estilo: 7,
        nome: 'Shichi no Kata Kaosu Riron',
        ptName: 'Teoria do Caos',
        acao: 'especial',
        niveis: [
            null,
            ...[2, 3, 4].map(() =>
                LEVEL(5, {
                    texto: 'Roubo de Vida na Nichirin por 2d4 turnos: converte 25% do dano causado em PDV por turno (arredonda para cima), recebidos no fim do seu turno. Não é efeito de contato.',
                })
            ),
        ],
    },
    {
        id: 'sonhos_09',
        respiracao: 'Sonhos',
        estilo: 8,
        nome: 'Hachi no Kata Kōsen no Shi',
        ptName: 'Raio de Luz da Morte',
        acao: 'ataque',
        niveis: [
            ['6d8 + @car + @sab', 7],
            ['10d8 + @car + @sab', 8],
            ['12d8 + @car + @sab', 10],
            ['12d10 + @car + @sab', 12],
        ].map(([dano, custo]) =>
            LEVEL(custo, {
                dano,
                tiposDano: [],
                texto: 'O Acerto soma CAR e SAB. Se o inimigo tiver 3 ou mais pontos de Exaustão ao ser acertado, também sofre Sangramento igual à DEX do usuário por 6 turnos.',
            })
        ),
    },
    {
        id: 'sonhos_10',
        respiracao: 'Sonhos',
        estilo: 9,
        nome: 'Ku no Kata Fainarufantají',
        ptName: 'Fantasia Final',
        acao: 'completa',
        niveis: [
            null,
            ['4d4', 7],
            ['6d4', 9],
            ['7d4', 10],
        ].map((entry) =>
            entry === null
                ? null
                : LEVEL(entry[1], {
                      dano: entry[0],
                      tiposDano: [],
                      texto: `Dash e golpes seguidos quantas vezes quiser, um Acerto por golpe; cada acerto causa ${entry[0]}. Interrompe ao errar 3 vezes. O módulo rola o primeiro golpe; repita o ataque para os seguintes.`,
                  })
        ),
    },
]);
