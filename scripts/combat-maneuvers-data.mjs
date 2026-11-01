/** Catálogo canônico das Manobras de Combate. */
const maneuver = (id, label, cost, trigger, effect) =>
    Object.freeze({
        id,
        label,
        cost,
        trigger,
        effect,
    });
export const COMBAT_MANEUVERS = Object.freeze([
    maneuver(
        'ataque_imprudente',
        'Ataque Imprudente',
        3,
        'antes de ataque corpo a corpo',
        'Vantagem; +FOR no dano; Vulnerável até o próximo turno.'
    ),
    maneuver(
        'carregar_ataque',
        'Carregar Ataque',
        4,
        'no turno, antes de atacar',
        'Primeiro ataque do próximo turno causa dano máximo nos dados físicos.'
    ),
    maneuver(
        'contra_ataque_troca',
        'Contra-Ataque de Troca',
        2,
        'quando inimigo corpo a corpo acertar',
        'Recebe o dano e faz ataque imediato, se permanecer consciente.'
    ),
    maneuver(
        'derrubar',
        'Derrubar',
        2,
        'ao acertar ataque corpo a corpo',
        'FOR contra FOR/DEX; sucesso Derrubado; margem 5 causa Desequilibrado.'
    ),
    maneuver(
        'desarme',
        'Desarme',
        3,
        'ao acertar alvo armado',
        'Acerto contra Acerto; sucesso solta item; margem 5 causa Desequilibrado.'
    ),
    maneuver(
        'decepar_membro',
        'Decepar Membro',
        5,
        'antes de ataque Nichirin contra Oni',
        '-2 no acerto; supera Defesa por 4; dano atinge limiar do nível.'
    ),
    maneuver(
        'desengajar_tatico',
        'Desengajar Tático',
        2,
        'ao sair do alcance corpo a corpo',
        'Não provoca Ataque de Oportunidade; terreno difícil sem penalidade.'
    ),
    maneuver(
        'disparada',
        'Disparada',
        2,
        'ao se mover no turno',
        '+3m; ataque corpo a corpo em linha reta recebe +1 Acerto.'
    ),
    maneuver(
        'elo_salvacao',
        'Elo da Salvação',
        3,
        'aliado a até 3m é acertado',
        'DEX/FOR contra ataque; anula dano e move aliado 1,5m se passar.'
    ),
    maneuver(
        'empurrao_devastador',
        'Empurrão Devastador',
        2,
        'ao acertar ataque corpo a corpo',
        'FOR contra FOR; Empurrado 3m, ou 6m por margem 5.'
    ),
    maneuver(
        'explosao_kiai',
        'Explosão de Kiai',
        3,
        'no seu turno',
        'Inimigos a 3m resistem FDV contra CD 8 + FDV + metade do nível.'
    ),
    maneuver(
        'ficar_furtivo',
        'Ficar Furtivo',
        2,
        'com cobertura, sombra ou obstrução',
        'DEX contra SAB/INT; sucesso fica Inalvejável por ataques diretos.'
    ),
    maneuver(
        'finta',
        'Finta',
        2,
        'antes de atacar alvo que vê você',
        'INT/CAR contra SAB/INT; próximo ataque recebe Vantagem.'
    ),
    maneuver(
        'fio_abertura',
        'Fio da Abertura',
        3,
        'antes de atacar Oni observado',
        'Gasta 2–5 Marcadores de Leitura; bônus conforme a quantidade.'
    ),
    maneuver(
        'interceptar',
        'Interceptar',
        2,
        'aliado adjacente é alvo',
        'Ataque passa a atingir você; sem Defesa; dano pela metade.'
    ),
    maneuver(
        'investida_imparavel',
        'Investida Imparável',
        4,
        'antes de mover em linha reta',
        'Move o dobro, sem Ataques de Oportunidade, e ataca até 3 alvos.'
    ),
    maneuver(
        'redirecionamento',
        'Redirecionamento',
        3,
        'ao ser alvo de golpe físico',
        'INT/DEX contra ataque; erra você e pode atingir outro alvo.'
    ),
    maneuver(
        'varredura',
        'Varredura',
        3,
        'antes de ataque corpo a corpo em arco',
        'Até 3 alvos adjacentes; rolagem separada contra cada um.'
    ),
    maneuver(
        'rolamento_esquiva',
        'Rolamento de Esquiva',
        1,
        'ao escolher Esquiva',
        'Esquiva normal; sucesso move 1,5m; falha por 3 recebe metade do dano.'
    ),
    maneuver(
        'esquiva_rasante',
        'Esquiva Rasante',
        2,
        'ao falhar Defesa por 3 ou menos',
        'Metade do dano, move 3m sem oportunidade e recupera 1 Fôlego.'
    ),
    maneuver(
        'pivo_combate',
        'Pivô de Combate',
        1,
        'após acertar ou errar ataque corpo a corpo',
        'Move 1,5m; se acertou, até 3m sem oportunidade.'
    ),
    maneuver(
        'uso_cenario',
        'Uso do Cenário',
        2,
        'quando houver elemento útil no ambiente',
        'Escolhe Vantagem, +2 Defesa, dano 1d6+FOR ou distração aprovada.'
    ),
    maneuver(
        'chave_articulacao',
        'Chave de Articulação',
        3,
        'ao acertar desarmado ou agarrão',
        'FOR contra FOR/DEX; Restrição de Movimentos; margem 5 causa Fratura.'
    ),
    maneuver(
        'recuo_controlado',
        'Recuo Controlado',
        2,
        'ao receber dano corpo a corpo',
        'Reduz dano em VIT e pode recuar 3m sem oportunidade.'
    ),
    maneuver(
        'postura_contra_golpe',
        'Postura de Contra-Golpe',
        2,
        'no seu turno',
        'Até próximo turno, Bloqueio superior por 4 permite contra-golpe uma vez.'
    ),
    maneuver(
        'leitura_padrao',
        'Leitura de Padrão',
        1,
        'no turno, observando inimigo',
        '+2 Defesa contra esse inimigo e +2 Marcadores de Leitura; uma vez por alvo.'
    ),
]);
export const COMBAT_MANEUVER_IDS = Object.freeze(COMBAT_MANEUVERS.map(({ id }) => id));
