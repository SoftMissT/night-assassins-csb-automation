const LEVEL = (custo, options = {}) => Object.freeze({ custo, ...options });

/**
 * Formas da Respiração da Pedra no shape canônico do contrato
 * (`niveis[].custo/dano/tiposDano/texto/primitivas`). As Formas 3 e 5 foram
 * cortadas para texto; a 1 não rola acerto (`semAcerto`); a 2 carrega o
 * Sangramento como primitiva.
 */
export const STONE_FORMS = Object.freeze([
    {
        id: 'pedra_01',
        respiracao: 'Pedra',
        estilo: 1,
        nome: 'Jamongan Sōkyoku',
        ptName: 'Serpentino Duplo',
        acao: 'unica',
        semAcerto: true,
        niveis: [
            LEVEL(1, {
                dano: '1d4',
                tiposDano: ['ferida'],
                texto: 'Exige um acerto anterior no mesmo alvo e turno (verificação manual — deixou de ser automatizada).',
            }),
            LEVEL(2, {
                dano: '1d6',
                tiposDano: ['ferida'],
                texto: 'Exige um acerto anterior no mesmo alvo e turno (verificação manual — deixou de ser automatizada).',
            }),
            LEVEL(2, {
                dano: '2d4',
                tiposDano: ['ferida'],
                texto: 'Exige um acerto anterior no mesmo alvo e turno (verificação manual — deixou de ser automatizada).',
            }),
            LEVEL(3, {
                dano: '2d4 + @for',
                tiposDano: ['ferida', 'concussao'],
                texto: '2d4 de Ferida + FOR de Concussão. Exige um acerto anterior no mesmo alvo e turno (verificação manual).',
            }),
        ],
    },
    {
        id: 'pedra_02',
        respiracao: 'Pedra',
        estilo: 2,
        nome: 'Tenmen Kudaki / Hyōmen Kurasshu / Kyoseki',
        ptName: 'Quebra Superior / Esmagamento da Superfície / Pedregulho Gigante',
        acao: 'ataque',
        niveis: [
            LEVEL(3, {
                dano: '3d10',
                tiposDano: ['concussao'],
                texto: 'Causa Sangramento 4 por 2 turnos (acumula e renova a cada acerto).',
                primitivas: [
                    {
                        tipo: 'aplicaStatus',
                        status: 'sangramento',
                        formula: '4',
                        turnos: 2,
                        tick: 'start',
                        stack: true,
                        sourceName: 'Tenmen Kudaki',
                    },
                ],
            }),
            LEVEL(3, {
                dano: '3d10',
                tiposDano: ['concussao'],
                texto: 'Causa Sangramento 5 por 2 turnos (acumula e renova a cada acerto).',
                primitivas: [
                    {
                        tipo: 'aplicaStatus',
                        status: 'sangramento',
                        formula: '5',
                        turnos: 2,
                        tick: 'start',
                        stack: true,
                        sourceName: 'Tenmen Kudaki',
                    },
                ],
            }),
            LEVEL(4, {
                dano: '4d10',
                tiposDano: ['concussao'],
                texto: 'Causa Sangramento 6 por 2 turnos (acumula e renova a cada acerto).',
                primitivas: [
                    {
                        tipo: 'aplicaStatus',
                        status: 'sangramento',
                        formula: '6',
                        turnos: 2,
                        tick: 'start',
                        stack: true,
                        sourceName: 'Tenmen Kudaki',
                    },
                ],
            }),
            LEVEL(4, {
                dano: '5d10',
                tiposDano: ['concussao'],
                texto: 'Causa Sangramento 7 por 2 turnos (acumula e renova a cada acerto).',
                primitivas: [
                    {
                        tipo: 'aplicaStatus',
                        status: 'sangramento',
                        formula: '7',
                        turnos: 2,
                        tick: 'start',
                        stack: true,
                        sourceName: 'Tenmen Kudaki',
                    },
                ],
            }),
        ],
    },
    {
        id: 'pedra_03',
        respiracao: 'Pedra',
        estilo: 3,
        nome: "Ganku no Hadae / Sutōn'arō",
        ptName: 'Reflexão Ígnea / Flechas de Pedra',
        acao: 'reacao',
        niveis: [
            LEVEL(3, {
                texto: 'Bônus de Bloqueio e penalidade de Acerto eram automatizados e agora são resolvidos na mesa (texto).',
            }),
            LEVEL(3, {
                texto: 'Bônus de Bloqueio e penalidade de Acerto eram automatizados e agora são resolvidos na mesa (texto).',
            }),
            LEVEL(3, {
                texto: 'Bônus de Bloqueio (2 turnos) e penalidade de Acerto eram automatizados e agora são resolvidos na mesa (texto).',
            }),
            LEVEL(4, {
                texto: 'Contra-ataque e Bônus de Bloqueio (2 turnos) eram automatizados e agora são resolvidos na mesa (texto).',
            }),
        ],
    },
    {
        id: 'pedra_04',
        respiracao: 'Pedra',
        estilo: 4,
        nome: 'Ryūmongan, Sokusei / Keikoku',
        ptName: 'Riólito, Subjugação Rápida / Ravina',
        acao: 'ataque',
        acoes: ['ataque', 'especial'],
        niveis: [
            null,
            null,
            LEVEL(6, {
                dano: '6d6',
                tiposDano: ['concussao'],
                texto: 'Dois ataques (Ação de Ataque + Especial). Recuperação de 2 PDR no crítico era automatizada e agora é manual.',
                primitivas: [{ tipo: 'ataques', n: 2 }],
            }),
            LEVEL(6, {
                dano: '8d6',
                tiposDano: ['concussao'],
                texto: 'Dois ataques (Ação de Ataque + Especial). Recuperação de 2 PDR no crítico era automatizada e agora é manual.',
                primitivas: [{ tipo: 'ataques', n: 2 }],
            }),
        ],
    },
    {
        id: 'pedra_05',
        respiracao: 'Pedra',
        estilo: 5,
        nome: 'Kaifuku-ryoku',
        ptName: 'Resiliência',
        acao: 'especial',
        niveis: [
            LEVEL(5, {
                texto: 'Resistência a Concussão, Cortante e Perfurante por 3 turnos era automatizada e agora é resolvida na mesa (texto).',
            }),
            LEVEL(5, {
                texto: 'Resistência a Concussão, Cortante e Perfurante por 3 turnos era automatizada e agora é resolvida na mesa (texto).',
            }),
            LEVEL(5, {
                texto: 'Resistência a Concussão, Cortante e Perfurante por 3 turnos era automatizada e agora é resolvida na mesa (texto).',
            }),
            LEVEL(5, {
                texto: 'Resistência a Concussão, Cortante e Perfurante por 3 turnos era automatizada e agora é resolvida na mesa (texto).',
            }),
        ],
    },
]);

export function stoneFormById(id) {
    return STONE_FORMS.find((form) => form.id === String(id ?? '')) ?? null;
}
