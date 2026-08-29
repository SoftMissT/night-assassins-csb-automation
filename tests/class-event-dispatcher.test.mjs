import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchClassEvent } from '../scripts/slayer/class-event-dispatcher.mjs';

function makeActor(overrides = {}) {
    return {
        system: {
            props: {
                classe_escolhida: 'classe_mb',
                nivel: 8,
                atr_for_valor_config: 5,
                atr_dex_valor_config: 4,
                atr_car_valor_config: 3,
                ...overrides,
            },
        },
    };
}

describe('class-event-dispatcher - routing', () => {
    it('retorna vazio quando nao tem classe', () => {
        const actor = { system: { props: {} } };
        const result = dispatchClassEvent(actor, 'basic-hit');
        assert.deepEqual(result.patches, {});
        assert.deepEqual(result.notifications, []);
    });

    it('retorna vazio quando evento nao e aplicavel', () => {
        const actor = makeActor({ nivel: 4 }); // rank C
        const result = dispatchClassEvent(actor, 'basic-critical'); // so rank A
        assert.deepEqual(result.patches, {});
    });

    it('despacha basic-hit para MB rank B', () => {
        const actor = makeActor({ nivel: 6 }); // rank B
        const result = dispatchClassEvent(actor, 'basic-hit', { targetId: 't1' });
        assert.ok(typeof result.patches === 'object');
    });

    it('despacha turn-start para qualquer rank', () => {
        const actor = makeActor({ nivel: 4 }); // rank C
        const result = dispatchClassEvent(actor, 'turn-start');
        assert.ok(typeof result.patches === 'object');
    });

    it('despacha round-start para qualquer rank', () => {
        const actor = makeActor({ nivel: 8 }); // rank A
        const result = dispatchClassEvent(actor, 'round-start');
        assert.ok(typeof result.patches === 'object');
    });
});

describe('class-event-dispatcher - MB Pressão de Combate', () => {
    it('aplica pressão quando rank B e target diferente', () => {
        const actor = makeActor({
            nivel: 6,
            slayer_class_mb_pressao_used_turn: 0,
            slayer_class_mb_pressao_alvo: '',
        });
        const result = dispatchClassEvent(actor, 'basic-hit', { targetId: 'enemy_1' });
        assert.ok(result.notifications.length > 0);
        assert.ok(result.notifications[0].includes('Pressão'));
    });

    it('nao aplica pressão quando mesmo alvo', () => {
        const actor = makeActor({
            nivel: 6,
            slayer_class_mb_pressao_used_turn: 0,
            slayer_class_mb_pressao_alvo: 'enemy_1',
        });
        const result = dispatchClassEvent(actor, 'basic-hit', { targetId: 'enemy_1' });
        assert.equal(result.notifications.length, 0);
    });

    it('nao aplica pressão quando ja usou no turno', () => {
        const actor = makeActor({
            nivel: 6,
            slayer_class_mb_pressao_used_turn: 1,
            slayer_class_mb_pressao_alvo: '',
        });
        const result = dispatchClassEvent(actor, 'basic-hit', { targetId: 'enemy_1' });
        assert.equal(result.notifications.length, 0);
    });
});

describe('class-event-dispatcher - MB Contraataque', () => {
    it('ativa contraataque quando rank SS e elegivel', () => {
        const actor = makeActor({
            nivel: 12,
            slayer_class_mb_contraataque_used_round: 0,
        });
        const result = dispatchClassEvent(actor, 'enemy-misses-melee');
        assert.ok(result.notifications.some((n) => n.includes('Contraataque')));
        assert.ok(result.patches['system.props.slayer_class_mb_contraataque_used_round'] === 1);
    });

    it('nao ativa contraataque quando ja usou', () => {
        const actor = makeActor({
            nivel: 12,
            slayer_class_mb_contraataque_used_round: 1,
        });
        const result = dispatchClassEvent(actor, 'enemy-misses-melee');
        assert.ok(!result.notifications.some((n) => n.includes('Contraataque')));
    });
});

describe('class-event-dispatcher - MB Parry', () => {
    it('ativa parry quando rank S e elegivel', () => {
        const actor = makeActor({
            nivel: 11,
            slayer_class_mb_parry_used_round: 0,
            atr_dex_valor_config: 5,
        });
        const result = dispatchClassEvent(actor, 'enemy-misses-melee', { damageAmount: 10 });
        assert.ok(result.notifications.some((n) => n.includes('Parry')));
    });
});

describe('class-event-dispatcher - UV Veneno', () => {
    it('aplica veneno quando rank C+', () => {
        const actor = makeActor({
            classe_escolhida: 'classe_usuario_de_veneno',
            nivel: 4,
        });
        const result = dispatchClassEvent(actor, 'basic-hit', { attackerCAR: 4 });
        assert.ok(typeof result.patches === 'object');
    });
});

describe('class-event-dispatcher - Oni Resistência Elemental', () => {
    it('ativa resistencia quando rank S e tipo bate', () => {
        const actor = makeActor({
            classe_escolhida: 'classe_companheiro_oni',
            nivel: 11,
            slayer_class_companheiro_oni_resistencia_tipo: 'fogo',
        });
        const result = dispatchClassEvent(actor, 'physical-melee-damage', {
            damageType: 'fogo',
            amount: 20,
        });
        assert.ok(result.notifications.some((n) => n.includes('Resistência Elemental')));
    });

    it('nao ativa resistencia quando tipo nao bate', () => {
        const actor = makeActor({
            classe_escolhida: 'classe_companheiro_oni',
            nivel: 11,
            slayer_class_companheiro_oni_resistencia_tipo: 'fogo',
        });
        const result = dispatchClassEvent(actor, 'physical-melee-damage', {
            damageType: 'congelante',
            amount: 20,
        });
        assert.ok(!result.notifications.some((n) => n.includes('Resistência Elemental')));
    });
});

describe('class-event-dispatcher - Oni Escudo Instintivo', () => {
    it('ativa escudo quando rank A e disponivel', () => {
        const actor = makeActor({
            classe_escolhida: 'classe_companheiro_oni',
            nivel: 8,
            slayer_class_companheiro_oni_escudo_used_round: 0,
            oni_minion_pdr_atual: 5,
        });
        const result = dispatchClassEvent(actor, 'physical-melee-damage', {
            damageType: 'cortante',
            amount: 10,
        });
        assert.ok(result.notifications.some((n) => n.includes('Escudo Instintivo')));
    });
});

describe('class-event-dispatcher - Oni Cercar e Proteger', () => {
    it('ativa cercar quando rank B+ e disponivel', () => {
        const actor = makeActor({
            classe_escolhida: 'classe_companheiro_oni',
            nivel: 6,
            slayer_class_companheiro_oni_cercar_used_round: 0,
            oni_minion_pdk_atual: 5,
        });
        const result = dispatchClassEvent(actor, 'enemy-misses-melee');
        assert.ok(result.notifications.some((n) => n.includes('Cercar')));
    });

    it('nao ativa cercar quando pdk < 2', () => {
        const actor = makeActor({
            classe_escolhida: 'classe_companheiro_oni',
            nivel: 6,
            slayer_class_companheiro_oni_cercar_used_round: 0,
            oni_minion_pdk_atual: 1,
        });
        const result = dispatchClassEvent(actor, 'enemy-misses-melee');
        assert.ok(!result.notifications.some((n) => n.includes('Cercar')));
    });
});

describe('class-event-dispatcher - turn-start e round-start', () => {
    it('turn-start reseta chaves de turno', () => {
        const actor = makeActor({
            slayer_class_mb_pressao_used_turn: 1,
            slayer_class_mb_parry_used_turn: 1,
        });
        const result = dispatchClassEvent(actor, 'turn-start');
        assert.equal(result.patches['system.props.slayer_class_mb_pressao_used_turn'], 0);
        assert.equal(result.patches['system.props.slayer_class_mb_parry_used_turn'], 0);
    });

    it('round-start reseta chaves de rodada', () => {
        const actor = makeActor({
            slayer_class_mb_parry_used_round: 1,
            slayer_class_mb_contraataque_used_round: 1,
        });
        const result = dispatchClassEvent(actor, 'round-start');
        assert.equal(result.patches['system.props.slayer_class_mb_parry_used_round'], 0);
        assert.equal(result.patches['system.props.slayer_class_mb_contraataque_used_round'], 0);
    });
});
