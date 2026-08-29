import { classRankAtLevel, masterBattleLevelElevenPlan } from './class-contracts.mjs';

const RANK_ORDER = ['C', 'B', 'A', 'S', 'SS'];
const RANK_LEVELS = Object.freeze({ C: 4, B: 6, A: 8, S: 11, SS: 12 });

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function resolveClassRank(classKey, level) {
    if (!classKey) return null;
    return classRankAtLevel(level);
}

export function classStateKey(classKey, suffix) {
    const short = String(classKey ?? '').replace(/^classe_/, '');
    return suffix ? `slayer_class_${short}_${suffix}` : `slayer_class_${short}`;
}

export function mbDamageBonus(rank) {
    if (rank === 'B') return 4;
    if (rank === 'C') return 2;
    return 0;
}

export function mbShouldApplyPermanentPdv(props = {}) {
    const plan = masterBattleLevelElevenPlan(props);
    return plan.eligible && plan.permanentPdv !== null;
}

export function mbPermanentPdvPatch(rolledTotal, alreadyApplied = 0) {
    const gain = Math.max(0, integer(rolledTotal));
    const applied = Math.max(0, integer(alreadyApplied));
    return Object.freeze({
        'system.props.pdv_slayer_extra': integer(applied + gain),
        [`system.props.${classStateKey('classe_mb', 'corpo_guerra_applied')}`]: integer(
            applied + gain
        ),
    });
}

export function mbParryAvailable(props = {}) {
    const used = props[classStateKey('classe_mb', 'parry_used_round')];
    return integer(used) === 0;
}

export function mbParryConsume() {
    return Object.freeze({ [`system.props.${classStateKey('classe_mb', 'parry_used_round')}`]: 1 });
}

export function mbParryReduction(rank, defenseAttribute) {
    if (rank !== 'S' && rank !== 'SS') return 0;
    return Math.max(0, integer(defenseAttribute));
}

export function mbParryApply(rank, incomingDamage, defenseAttribute) {
    if (rank !== 'S' && rank !== 'SS') return { reduced: 0, zeroed: false };
    const reduction = Math.max(0, integer(defenseAttribute));
    const reduced = Math.min(integer(incomingDamage), reduction);
    return Object.freeze({
        reduced,
        zeroed: integer(incomingDamage) - reduced === 0 && integer(incomingDamage) > 0,
    });
}

export function mbCriticoBrutalBleeding(forValue, dexValue, attrChoice = 'for') {
    const base = attrChoice === 'dex' ? integer(dexValue) : integer(forValue);
    return Math.ceil(base / 2);
}

export function mbCriticoBrutalFerimento(ferimentoKey) {
    const valid = ['tendao_rompido', 'guarda_aberta', 'impacto_profundo'];
    if (!valid.includes(ferimentoKey)) return null;
    return Object.freeze({
        key: ferimentoKey,
        label:
            ferimentoKey === 'tendao_rompido'
                ? 'Tendão Rompido'
                : ferimentoKey === 'guarda_aberta'
                  ? 'Guarda Aberta'
                  : 'Impacto Profundo',
    });
}

export function mbContraataqueEligible(props = {}) {
    const used = props[classStateKey('classe_mb', 'contraataque_used_round')];
    return integer(used) === 0;
}

export function mbContraataqueConsume() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_mb', 'contraataque_used_round')}`]: 1,
    });
}

export function mbPressaoCombate(props = {}, targetId = '') {
    const currentTarget = props[classStateKey('classe_mb', 'pressao_alvo')] ?? '';
    const usedThisTurn = integer(props[classStateKey('classe_mb', 'pressao_used_turn')]);
    if (usedThisTurn) return { apply: false, patch: {} };
    if (!targetId || currentTarget === targetId) return { apply: false, patch: {} };
    return {
        apply: true,
        patch: Object.freeze({
            [`system.props.${classStateKey('classe_mb', 'pressao_alvo')}`]: targetId,
            [`system.props.${classStateKey('classe_mb', 'pressao_used_turn')}`]: 1,
        }),
    };
}

export function poisonApply(targetProps = {}, attackerCarisma = 0, rank = 'C') {
    const car = Math.max(0, integer(attackerCarisma));
    const damage = rank === 'B' || rank === 'A' ? car + 2 : car;
    const rounds = rank === 'B' || rank === 'A' || rank === 'S' || rank === 'SS' ? 3 : 2;
    const maxInstances = rank === 'S' || rank === 'SS' ? 3 : 1;

    const instances = [];
    for (let i = 1; i <= 3; i++) {
        const instDamage = integer(targetProps[`slayer_veneno_${i}_dano`]);
        const instRounds = integer(targetProps[`slayer_veneno_${i}_rodadas`]);
        if (instRounds > 0) instances.push({ idx: i, damage: instDamage, rounds: instRounds });
    }

    const patch = {};
    if (instances.length < maxInstances) {
        const nextIdx = instances.length + 1;
        patch[`system.props.slayer_veneno_${nextIdx}_dano`] = damage;
        patch[`system.props.slayer_veneno_${nextIdx}_rodadas`] = rounds;
    } else if (instances.length > 0) {
        const shortest = instances.reduce((min, cur) => (cur.rounds < min.rounds ? cur : min));
        patch[`system.props.slayer_veneno_${shortest.idx}_dano`] = damage;
        patch[`system.props.slayer_veneno_${shortest.idx}_rodadas`] = rounds;
    }

    patch['system.props.slayer_veneno_ativas'] = Math.min(
        maxInstances,
        instances.length + (instances.length < maxInstances ? 1 : 0)
    );
    patch['system.props.slayer_veneno_fonte'] = 'classe_usuario_de_veneno';
    return Object.freeze(patch);
}

export function poisonTick(props = {}) {
    const activeCount = integer(props.slayer_veneno_ativas);
    if (activeCount === 0) {
        const stacks = integer(props.slayer_veneno_stacks);
        if (stacks === 0) return { damage: 0, patch: {} };
        const perStack = Math.max(0, integer(props.slayer_veneno_dano));
        const totalDamage = perStack * stacks;
        const remaining = Math.max(0, integer(props.slayer_veneno_rodadas) - 1);
        if (remaining <= 0) {
            return {
                damage: totalDamage,
                patch: Object.freeze({
                    'system.props.slayer_veneno_rodadas': 0,
                    'system.props.slayer_veneno_stacks': 0,
                    'system.props.slayer_veneno_dano': 0,
                }),
            };
        }
        return {
            damage: totalDamage,
            patch: Object.freeze({ 'system.props.slayer_veneno_rodadas': remaining }),
        };
    }

    let totalDamage = 0;
    const patch = {};
    let remaining = 0;

    for (let i = 1; i <= 3; i++) {
        const instDamage = integer(props[`slayer_veneno_${i}_dano`]);
        const instRounds = integer(props[`slayer_veneno_${i}_rodadas`]);
        if (instRounds > 0) {
            totalDamage += instDamage;
            const newRounds = instRounds - 1;
            patch[`system.props.slayer_veneno_${i}_rodadas`] = newRounds;
            if (newRounds <= 0) {
                patch[`system.props.slayer_veneno_${i}_dano`] = 0;
            } else {
                remaining++;
            }
        }
    }

    patch['system.props.slayer_veneno_ativas'] = remaining;
    return Object.freeze({ damage: totalDamage, patch });
}

export function mbVenenoPenalidadeDefesa(props = {}) {
    const activeCount = integer(props.slayer_veneno_ativas);
    return activeCount >= 3 ? -1 : 0;
}

export function cortaCuraMultiplier(props = {}) {
    const active = Math.max(0, integer(props.slayer_veneno_ativas));
    if (active === 0) return 1;
    return 0.5;
}

// ---- Usuário de Veneno - Ataque Adicional (Rank A) ----
export function uvAtaqueAdicionalAvailable(props = {}) {
    const used = integer(props[classStateKey('classe_usuario_de_veneno', 'ataque_adicional_used_turn')]);
    return used === 0;
}

export function uvAtaqueAdicionalConsume() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_usuario_de_veneno', 'ataque_adicional_used_turn')}`]: 1,
    });
}

export function kakushiAmpararHeal(rank, intOrSab = 0) {
    const attr = Math.max(0, integer(intOrSab));
    if (rank === 'C') return attr;
    if (rank === 'B' || rank === 'A' || rank === 'S' || rank === 'SS') return 3 + attr;
    return 0;
}

export function kakushiAmpararAvailable(props = {}) {
    const used = props[classStateKey('classe_kakushi', 'amparar_used_round')];
    return integer(used) === 0;
}

export function kakushiAmpararConsume() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'amparar_used_round')}`]: 1,
    });
}

export function kakushiTatakaaeeeRoll(carisma = 0) {
    const car = Math.max(0, integer(carisma));
    const threshold = 15;
    const bonus = car * 2;
    return Object.freeze({ threshold, bonus, car });
}

// ---- Kakushi Rank B: Amparar Aprimorado — buff defesa ----
export function kakushiAmpararBuffChoice(choice = '') {
    const normalized = String(choice).toLowerCase();
    const valid = normalized === 'esquiva' || normalized === 'bloqueio';
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'amparar_buff_choice')}`]: valid ? normalized : '',
    });
}

export function kakushiIdentifyStatuses(targetProps = {}) {
    const raw = String(targetProps.status_slayer_dados ?? '');
    if (!raw) return [];
    const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
    const known = [
        'corrupcao', 'regeneracao_suprimida', 'colapso', 'exaustao',
        'paralisado', 'atordoado', 'cego', 'surdo', 'envenenado',
    ];
    return tokens.filter((t) => known.some((k) => t.includes(k)));
}

// ---- Kakushi Rank A: Retirada Estratégica ----
export function kakushiRetiradaDisponivel(props = {}) {
    const used = integer(props[classStateKey('classe_kakushi', 'retirada_used_turn')]);
    return used === 0;
}

export function kakushiRetiradaConsume() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'retirada_used_turn')}`]: 1,
    });
}

export function kakushiPrioridadeMedica(props = {}) {
    return integer(props[classStateKey('classe_kakushi', 'amparar_prioridade_medica')]) === 1;
}

export function kakushiPrioridadeMedicaConsume() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'amparar_prioridade_medica')}`]: 1,
    });
}

export function kakushiPrioridadeMedicaReset() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'amparar_prioridade_medica')}`]: 0,
    });
}

// ---- Kakushi Rank S: Injeção de Adrenalina ----
export function kakushiAdrenalinaAvailable(props = {}) {
    const used = integer(props[classStateKey('classe_kakushi', 'adrenalina_used_combat')]);
    return used === 0;
}

export function kakushiAdrenalinaConsume() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'adrenalina_used_combat')}`]: 1,
    });
}

export function kakushiAdrenalinaPdrPatch(targetVit = 0, intOrSab = 0) {
    const pdr = Math.max(0, integer(targetVit)) + Math.max(0, integer(intOrSab));
    return Object.freeze({ 'system.props.pdr_slayer_curado': pdr });
}

export function kakushiAdrenalinaPulso(choice = '') {
    const normalized = String(choice).toLowerCase();
    const valid = ['firmar_corpo', 'clarearemente', 'levantar_agora'];
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'pulso_escolhido')}`]: valid.includes(normalized) ? normalized : '',
    });
}

// ---- Kakushi Rank SS: Tatakaaaaeee! ----
export function kakushiTatakaaeeeApply(carisma = 0) {
    const car = Math.max(0, integer(carisma));
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'tatakaaeee_used_round')}`]: 1,
        car,
    });
}

export function kakushiTatakaaeeeAvailable(props = {}) {
    const used = integer(props[classStateKey('classe_kakushi', 'tatakaaeee_used_round')]);
    return used === 0;
}

// ---- Companheiro de Oni ----
const oniState = (suffix) => classStateKey('classe_companheiro_oni', suffix);

export function oniCercarProtegerAvailable(props = {}) {
    const used = integer(props[oniState('cercar_used_round')]);
    const pdk = integer(props.oni_minion_pdk_atual);
    return used === 0 && pdk >= 2;
}

export function oniCercarProtegerConsume() {
    return Object.freeze({
        [`system.props.${oniState('cercar_used_round')}`]: 1,
        'system.props.oni_minion_pdk_gasto': 2,
    });
}

export function oniCercarProtegerDefesaPenalty(rank) {
    if (rank === 'B' || rank === 'A' || rank === 'S' || rank === 'SS') return 0;
    return -2;
}

export function oniGuardaVinculadaPresenca(enemyId = '') {
    return Object.freeze({
        [`system.props.${oniState('guarda_presenca_inimigo')}`]: String(enemyId),
        [`system.props.${oniState('guarda_presenca_aplicado')}`]: 1,
    });
}

export function oniGuardaVinculadaPresencaCheck(props = {}, enemyId = '') {
    const stored = String(props[oniState('guarda_presenca_inimigo')] ?? '');
    const active = integer(props[oniState('guarda_presenca_aplicado')]);
    return active === 1 && stored === String(enemyId);
}

export function oniResistenciaElementalSet(type = '') {
    const valid = ['cortante', 'perfurante', 'concussao', 'fogo', 'congelante', 'eletrico', 'necrotico', 'venenoso'];
    const normalized = String(type).toLowerCase();
    return Object.freeze({
        [`system.props.${oniState('resistencia_tipo')}`]: valid.includes(normalized) ? normalized : '',
    });
}

export function oniResistenciaElementalCheck(props = {}, damageType = '') {
    const stored = String(props[oniState('resistencia_tipo')] ?? '').toLowerCase();
    return stored !== '' && stored === String(damageType).toLowerCase();
}

export function oniEscudoInstintivoAvailable(props = {}) {
    const used = integer(props[oniState('escudo_used_round')]);
    return used === 0;
}

export function oniEscudoInstintivoConsume() {
    return Object.freeze({
        [`system.props.${oniState('escudo_used_round')}`]: 1,
    });
}

export function oniPresencaIntimidadoraBonus() {
    return 2;
}

export function oniSinergiaAvailable(props = {}) {
    const used = integer(props[oniState('sinergia_used_round')]);
    return used === 0;
}

export function oniSinergiaConsume(choice = '') {
    const valid = ['pressao_conjunta', 'rastro_sangue', 'abertura_demoniaca'];
    const normalized = String(choice).toLowerCase();
    return Object.freeze({
        [`system.props.${oniState('sinergia_used_round')}`]: 1,
        [`system.props.${oniState('sinergia_alvo')}`]: valid.includes(normalized) ? normalized : '',
    });
}

export function resetClassTurnState(classKey, props = {}) {
    const patches = {};
    const base = classStateKey(classKey, '');
    for (const key of Object.keys(props)) {
        if (key.startsWith(base) && key.endsWith('_turn')) {
            patches[`system.props.${key}`] = 0;
        }
    }
    return Object.freeze(patches);
}

export function resetClassRoundState(classKey, props = {}) {
    const patches = {};
    const base = classStateKey(classKey, '');
    for (const key of Object.keys(props)) {
        if (key.startsWith(base) && key.endsWith('_round')) {
            patches[`system.props.${key}`] = 0;
        }
    }
    return Object.freeze(patches);
}

export function classEventContext({ classKey, level, event, props = {} }) {
    const rank = resolveClassRank(classKey, level);
    if (!rank) return { rank: null, applicable: false };
    const events = {
        'basic-hit': ['C', 'B'],
        'basic-critical': ['A'],
        'physical-melee-damage': ['A', 'S'],
        'enemy-misses-melee': ['B', 'S', 'SS'],
        'turn-start': ['C', 'B', 'A', 'S', 'SS'],
        'round-start': ['C', 'B', 'A', 'S', 'SS'],
    };
    const applicableRanks = events[event] ?? [];
    return Object.freeze({
        rank,
        applicable: applicableRanks.includes(rank),
        event,
    });
}
