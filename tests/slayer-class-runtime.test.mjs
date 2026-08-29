import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveClassRank,
    classStateKey,
    mbDamageBonus,
    mbShouldApplyPermanentPdv,
    mbPermanentPdvPatch,
    mbParryAvailable,
    mbParryConsume,
    mbParryReduction,
    mbParryApply,
    mbCriticoBrutalBleeding,
    mbCriticoBrutalFerimento,
    mbContraataqueEligible,
    mbContraataqueConsume,
    mbPressaoCombate,
    poisonApply,
    poisonTick,
    cortaCuraMultiplier,
    mbVenenoPenalidadeDefesa,
    uvAtaqueAdicionalAvailable,
    uvAtaqueAdicionalConsume,
    kakushiAmpararHeal,
    kakushiAmpararAvailable,
    kakushiAmpararConsume,
    kakushiAmpararBuffChoice,
    kakushiIdentifyStatuses,
    kakushiRetiradaDisponivel,
    kakushiRetiradaConsume,
    kakushiPrioridadeMedica,
    kakushiPrioridadeMedicaConsume,
    kakushiPrioridadeMedicaReset,
    kakushiAdrenalinaAvailable,
    kakushiAdrenalinaConsume,
    kakushiAdrenalinaPdrPatch,
    kakushiAdrenalinaPulso,
    kakushiTatakaaeeeRoll,
    kakushiTatakaaeeeApply,
    kakushiTatakaaeeeAvailable,
    oniCercarProtegerAvailable,
    oniCercarProtegerConsume,
    oniCercarProtegerDefesaPenalty,
    oniGuardaVinculadaPresenca,
    oniGuardaVinculadaPresencaCheck,
    oniResistenciaElementalSet,
    oniResistenciaElementalCheck,
    oniEscudoInstintivoAvailable,
    oniEscudoInstintivoConsume,
    oniPresencaIntimidadoraBonus,
    oniSinergiaAvailable,
    oniSinergiaConsume,
    resetClassTurnState,
    resetClassRoundState,
    classEventContext,
} from '../scripts/slayer/class-runtime.mjs';

describe('class-runtime - rank resolution', () => {
    it('nivel 1-3 sem rank', () => {
        assert.equal(resolveClassRank('classe_mb', 1), null);
        assert.equal(resolveClassRank('classe_mb', 3), null);
    });

    it('nivel 4-5 rank C', () => {
        assert.equal(resolveClassRank('classe_mb', 4), 'C');
        assert.equal(resolveClassRank('classe_mb', 5), 'C');
    });

    it('nivel 11 rank S', () => {
        assert.equal(resolveClassRank('classe_mb', 11), 'S');
    });

    it('nivel 12+ rank SS', () => {
        assert.equal(resolveClassRank('classe_mb', 12), 'SS');
        assert.equal(resolveClassRank('classe_mb', 14), 'SS');
    });
});

describe('class-runtime - Mestre de Batalha', () => {
    it('rank C da +2 de dano em ataque basico', () => {
        assert.equal(mbDamageBonus('C'), 2);
    });

    it('rank B da +4 de dano (substitui C)', () => {
        assert.equal(mbDamageBonus('B'), 4);
    });

    it('rank A/S/SS nao da bonus de Dilacerador', () => {
        assert.equal(mbDamageBonus('A'), 0);
        assert.equal(mbDamageBonus('S'), 0);
    });

    it('ganho permanente de 2d6 PDV so aplica uma vez (idempotente)', () => {
        const props = { nvl_num: 11, classe_escolhida: 'classe_mb' };
        assert.equal(mbShouldApplyPermanentPdv(props), true);
        const appliedProps = {
            nvl_num: 11,
            classe_escolhida: 'classe_mb',
            slayer_class_mb_corpo_guerra_applied: 12,
        };
        assert.equal(mbShouldApplyPermanentPdv(appliedProps), false);
    });

    it('mbPermanentPdvPatch soma ao ja aplicado', () => {
        const patch = mbPermanentPdvPatch(7, 5);
        assert.equal(patch['system.props.pdv_slayer_extra'], 12);
        assert.equal(patch['system.props.slayer_class_mb_corpo_guerra_applied'], 12);
    });

    it('parry disponivel no inicio da rodada', () => {
        assert.equal(mbParryAvailable({}), true);
        assert.equal(mbParryAvailable({ slayer_class_mb_parry_used_round: 1 }), false);
    });

    it('parry consume marca uso', () => {
        const patch = mbParryConsume();
        assert.equal(patch['system.props.slayer_class_mb_parry_used_round'], 1);
    });

    it('parry reduction usa atributo de defesa', () => {
        assert.equal(mbParryReduction('S', 5), 5);
        assert.equal(mbParryReduction('SS', 7), 7);
        assert.equal(mbParryReduction('C', 5), 0);
    });
});

describe('class-runtime - Usuario de Veneno', () => {
    it('rank C aplica 1 instancia CAR dano por 2 rodadas', () => {
        const patch = poisonApply({}, 4, 'C');
        assert.equal(patch['system.props.slayer_veneno_1_dano'], 4);
        assert.equal(patch['system.props.slayer_veneno_1_rodadas'], 2);
        assert.equal(patch['system.props.slayer_veneno_ativas'], 1);
    });

    it('rank B aplica veneno CAR+2 por 3 rodadas', () => {
        const patch = poisonApply({}, 4, 'B');
        assert.equal(patch['system.props.slayer_veneno_1_dano'], 6);
        assert.equal(patch['system.props.slayer_veneno_1_rodadas'], 3);
    });

    it('rank A aplica veneno CAR+2 por 3 rodadas', () => {
        const patch = poisonApply({}, 4, 'A');
        assert.equal(patch['system.props.slayer_veneno_1_dano'], 6);
        assert.equal(patch['system.props.slayer_veneno_1_rodadas'], 3);
    });

    it('rank S permite ate 3 instancias independentes', () => {
        const p1 = poisonApply({}, 4, 'S');
        assert.equal(p1['system.props.slayer_veneno_1_dano'], 4);
        assert.equal(p1['system.props.slayer_veneno_1_rodadas'], 3);
        assert.equal(p1['system.props.slayer_veneno_ativas'], 1);

        const p2 = poisonApply(
            { slayer_veneno_1_dano: 4, slayer_veneno_1_rodadas: 3 },
            5,
            'S'
        );
        assert.equal(p2['system.props.slayer_veneno_2_dano'], 5);
        assert.equal(p2['system.props.slayer_veneno_2_rodadas'], 3);
        assert.equal(p2['system.props.slayer_veneno_ativas'], 2);

        const p3 = poisonApply(
            { slayer_veneno_1_dano: 4, slayer_veneno_1_rodadas: 3, slayer_veneno_2_dano: 5, slayer_veneno_2_rodadas: 3 },
            6,
            'S'
        );
        assert.equal(p3['system.props.slayer_veneno_3_dano'], 6);
        assert.equal(p3['system.props.slayer_veneno_3_rodadas'], 3);
        assert.equal(p3['system.props.slayer_veneno_ativas'], 3);
    });

    it('rank S overflow substitui instancia mais curta', () => {
        const existing = {
            slayer_veneno_1_dano: 4,
            slayer_veneno_1_rodadas: 1,
            slayer_veneno_2_dano: 5,
            slayer_veneno_2_rodadas: 3,
            slayer_veneno_3_dano: 6,
            slayer_veneno_3_rodadas: 2,
        };
        const patch = poisonApply(existing, 7, 'S');
        assert.equal(patch['system.props.slayer_veneno_1_dano'], 7);
        assert.equal(patch['system.props.slayer_veneno_1_rodadas'], 3);
        assert.equal(patch['system.props.slayer_veneno_ativas'], 3);
    });

    it('rank SS permite ate 3 instancias', () => {
        const p1 = poisonApply({}, 4, 'SS');
        assert.equal(p1['system.props.slayer_veneno_ativas'], 1);
        const p2 = poisonApply({ slayer_veneno_1_dano: 4, slayer_veneno_1_rodadas: 3 }, 5, 'SS');
        assert.equal(p2['system.props.slayer_veneno_ativas'], 2);
    });

    it('poisonTick causa dano de todas instancias e decrementa individualmente', () => {
        const result = poisonTick({
            slayer_veneno_ativas: 2,
            slayer_veneno_1_dano: 4,
            slayer_veneno_1_rodadas: 3,
            slayer_veneno_2_dano: 5,
            slayer_veneno_2_rodadas: 2,
        });
        assert.equal(result.damage, 9);
        assert.equal(result.patch['system.props.slayer_veneno_1_rodadas'], 2);
        assert.equal(result.patch['system.props.slayer_veneno_2_rodadas'], 1);
    });

    it('poisonTick expira instancia individual e mantem outras', () => {
        const result = poisonTick({
            slayer_veneno_ativas: 2,
            slayer_veneno_1_dano: 4,
            slayer_veneno_1_rodadas: 1,
            slayer_veneno_2_dano: 5,
            slayer_veneno_2_rodadas: 3,
        });
        assert.equal(result.damage, 9);
        assert.equal(result.patch['system.props.slayer_veneno_1_rodadas'], 0);
        assert.equal(result.patch['system.props.slayer_veneno_1_dano'], 0);
        assert.equal(result.patch['system.props.slayer_veneno_2_rodadas'], 2);
        assert.equal(result.patch['system.props.slayer_veneno_ativas'], 1);
    });

    it('poisonTick fallback legado funciona sem ativas', () => {
        const result = poisonTick({
            slayer_veneno_stacks: 2,
            slayer_veneno_dano: 4,
            slayer_veneno_rodadas: 3,
        });
        assert.equal(result.damage, 8);
        assert.equal(result.patch['system.props.slayer_veneno_rodadas'], 2);
    });

    it('poisonTick fallback legado expira', () => {
        const result = poisonTick({
            slayer_veneno_stacks: 1,
            slayer_veneno_dano: 4,
            slayer_veneno_rodadas: 1,
        });
        assert.equal(result.damage, 4);
        assert.equal(result.patch['system.props.slayer_veneno_rodadas'], 0);
        assert.equal(result.patch['system.props.slayer_veneno_stacks'], 0);
    });

    it('poisonTick sem veneno retorna 0', () => {
        const result = poisonTick({});
        assert.equal(result.damage, 0);
        assert.deepEqual(result.patch, {});
    });

    it('cortaCuraMultiplier reduz cura em 50% quando envenenado', () => {
        assert.equal(cortaCuraMultiplier({ slayer_veneno_ativas: 1 }), 0.5);
        assert.equal(cortaCuraMultiplier({ slayer_veneno_ativas: 3 }), 0.5);
        assert.equal(cortaCuraMultiplier({}), 1);
    });

    it('mbVenenoPenalidadeDefesa retorna -1 com 3+ instancias', () => {
        assert.equal(mbVenenoPenalidadeDefesa({ slayer_veneno_ativas: 3 }), -1);
        assert.equal(mbVenenoPenalidadeDefesa({ slayer_veneno_ativas: 2 }), 0);
        assert.equal(mbVenenoPenalidadeDefesa({}), 0);
    });
});

describe('class-runtime - Kakushi', () => {
    it('rank C cura INT ou SAB', () => {
        assert.equal(kakushiAmpararHeal('C', 5), 5);
    });

    it('rank B cura 3 + INT ou SAB', () => {
        assert.equal(kakushiAmpararHeal('B', 5), 8);
    });

    it('amparar disponivel no inicio da rodada', () => {
        assert.equal(kakushiAmpararAvailable({}), true);
        assert.equal(
            kakushiAmpararAvailable({ slayer_class_kakushi_amparar_used_round: 1 }),
            false
        );
    });

    it('tatakaaeee calcula bonus por CAR', () => {
        const result = kakushiTatakaaeeeRoll(5);
        assert.equal(result.threshold, 15);
        assert.equal(result.bonus, 10);
    });

    it('amparar buff choice esquiva', () => {
        const patch = kakushiAmpararBuffChoice('esquiva');
        assert.equal(patch['system.props.slayer_class_kakushi_amparar_buff_choice'], 'esquiva');
    });

    it('amparar buff choice bloqueio', () => {
        const patch = kakushiAmpararBuffChoice('bloqueio');
        assert.equal(patch['system.props.slayer_class_kakushi_amparar_buff_choice'], 'bloqueio');
    });

    it('amparar buff choice invalida retorna vazio', () => {
        const patch = kakushiAmpararBuffChoice('invalido');
        assert.equal(patch['system.props.slayer_class_kakushi_amparar_buff_choice'], '');
    });

    it('identify statuses retorna negativos visiveis', () => {
        const result = kakushiIdentifyStatuses({ status_slayer_dados: 'corrupcao,exaustao_2' });
        assert.equal(result.length, 2);
        assert.ok(result.includes('corrupcao'));
    });

    it('identify statuses retorna vazio sem dados', () => {
        assert.deepEqual(kakushiIdentifyStatuses({}), []);
    });

    it('retirada disponivel no inicio do turno', () => {
        assert.equal(kakushiRetiradaDisponivel({}), true);
        assert.equal(
            kakushiRetiradaDisponivel({ slayer_class_kakushi_retirada_used_turn: 1 }),
            false
        );
    });

    it('retirada consume marca uso', () => {
        const patch = kakushiRetiradaConsume();
        assert.equal(patch['system.props.slayer_class_kakushi_retirada_used_turn'], 1);
    });

    it('prioridade medica ativa quando flag setada', () => {
        assert.equal(kakushiPrioridadeMedica({ slayer_class_kakushi_amparar_prioridade_medica: 1 }), true);
        assert.equal(kakushiPrioridadeMedica({}), false);
    });

    it('prioridade medica consume e reset', () => {
        const consume = kakushiPrioridadeMedicaConsume();
        assert.equal(consume['system.props.slayer_class_kakushi_amparar_prioridade_medica'], 1);
        const reset = kakushiPrioridadeMedicaReset();
        assert.equal(reset['system.props.slayer_class_kakushi_amparar_prioridade_medica'], 0);
    });

    it('adrenalina disponivel no inicio do combate', () => {
        assert.equal(kakushiAdrenalinaAvailable({}), true);
        assert.equal(
            kakushiAdrenalinaAvailable({ slayer_class_kakushi_adrenalina_used_combat: 1 }),
            false
        );
    });

    it('adrenalina consume patch', () => {
        const patch = kakushiAdrenalinaConsume();
        assert.equal(patch['system.props.slayer_class_kakushi_adrenalina_used_combat'], 1);
    });

    it('adrenalina pdr patch soma VIT + INT/SAB', () => {
        const patch = kakushiAdrenalinaPdrPatch(8, 5);
        assert.equal(patch['system.props.pdr_slayer_curado'], 13);
    });

    it('adrenalina pulso valid choices', () => {
        const firmar = kakushiAdrenalinaPulso('firmar_corpo');
        assert.equal(firmar['system.props.slayer_class_kakushi_pulso_escolhido'], 'firmar_corpo');
        const clarear = kakushiAdrenalinaPulso('clarearemente');
        assert.equal(clarear['system.props.slayer_class_kakushi_pulso_escolhido'], 'clarearemente');
        const levantar = kakushiAdrenalinaPulso('levantar_agora');
        assert.equal(levantar['system.props.slayer_class_kakushi_pulso_escolhido'], 'levantar_agora');
    });

    it('adrenalina pulso invalido retorna vazio', () => {
        const patch = kakushiAdrenalinaPulso('invalido');
        assert.equal(patch['system.props.slayer_class_kakushi_pulso_escolhido'], '');
    });

    it('tatakaaeee available no inicio da rodada', () => {
        assert.equal(kakushiTatakaaeeeAvailable({}), true);
        assert.equal(
            kakushiTatakaaeeeAvailable({ slayer_class_kakushi_tatakaaeee_used_round: 1 }),
            false
        );
    });

    it('tatakaaeee apply marca uso', () => {
        const patch = kakushiTatakaaeeeApply(6);
        assert.equal(patch['system.props.slayer_class_kakushi_tatakaaeee_used_round'], 1);
        assert.equal(patch.car, 6);
    });
});

describe('class-runtime - Companheiro de Oni', () => {
    it('oniCercarProteger disponivel quando sem uso e pdk >= 2', () => {
        assert.ok(oniCercarProtegerAvailable({ oni_minion_pdk_atual: 5 }));
    });
    it('oniCercarProteger indisponivel quando ja usou', () => {
        assert.equal(oniCercarProtegerAvailable({ slayer_class_companheiro_oni_cercar_used_round: 1, oni_minion_pdk_atual: 5 }), false);
    });
    it('oniCercarProteger indisponivel quando pdk < 2', () => {
        assert.equal(oniCercarProtegerAvailable({ oni_minion_pdk_atual: 1 }), false);
    });
    it('oniCercarProteger consume retorna patch com pdk_gasto', () => {
        const patch = oniCercarProtegerConsume();
        assert.equal(patch['system.props.slayer_class_companheiro_oni_cercar_used_round'], 1);
        assert.equal(patch['system.props.oni_minion_pdk_gasto'], 2);
    });
    it('oniCercarProteger penalty -2 em rank C', () => {
        assert.equal(oniCercarProtegerDefesaPenalty('C'), -2);
    });
    it('oniCercarProteger penalty 0 em rank B', () => {
        assert.equal(oniCercarProtegerDefesaPenalty('B'), 0);
    });
    it('oniGuardaVinculada presenca retorna enemy id e flag', () => {
        const patch = oniGuardaVinculadaPresenca('enemy_42');
        assert.equal(patch['system.props.slayer_class_companheiro_oni_guarda_presenca_inimigo'], 'enemy_42');
        assert.equal(patch['system.props.slayer_class_companheiro_oni_guarda_presenca_aplicado'], 1);
    });
    it('oniGuardaVinculada check combina enemy id e flag', () => {
        const props = { slayer_class_companheiro_oni_guarda_presenca_inimigo: 'e1', slayer_class_companheiro_oni_guarda_presenca_aplicado: 1 };
        assert.ok(oniGuardaVinculadaPresencaCheck(props, 'e1'));
        assert.equal(oniGuardaVinculadaPresencaCheck(props, 'e2'), false);
    });
    it('oniResistenciaElemental set valida tipo', () => {
        const patch = oniResistenciaElementalSet('fogo');
        assert.equal(patch['system.props.slayer_class_companheiro_oni_resistencia_tipo'], 'fogo');
    });
    it('oniResistenciaElemental set tipo invalido retorna vazio', () => {
        const patch = oniResistenciaElementalSet('magnetismo');
        assert.equal(patch['system.props.slayer_class_companheiro_oni_resistencia_tipo'], '');
    });
    it('oniResistenciaElemental check combina tipo armazenado e dano', () => {
        const props = { slayer_class_companheiro_oni_resistencia_tipo: 'fogo' };
        assert.ok(oniResistenciaElementalCheck(props, 'Fogo'));
        assert.equal(oniResistenciaElementalCheck(props, 'congelante'), false);
    });
    it('oniEscudoInstintivo disponivel no inicio da rodada', () => {
        assert.ok(oniEscudoInstintivoAvailable({}));
    });
    it('oniEscudoInstintivo consumido bloqueia segundo uso', () => {
        const used = oniEscudoInstintivoConsume();
        assert.equal(used['system.props.slayer_class_companheiro_oni_escudo_used_round'], 1);
    });
    it('oniPresencaIntimidadora bonus +2', () => {
        assert.equal(oniPresencaIntimidadoraBonus(), 2);
    });
    it('oniSinergia disponivel no inicio da rodada', () => {
        assert.ok(oniSinergiaAvailable({}));
    });
    it('oniSinergia consumido bloqueia segundo uso', () => {
        const used = oniSinergiaConsume('pressao_conjunta');
        assert.equal(used['system.props.slayer_class_companheiro_oni_sinergia_used_round'], 1);
        assert.equal(used['system.props.slayer_class_companheiro_oni_sinergia_alvo'], 'pressao_conjunta');
    });
    it('oniSinergia invalid choice retorna vazio', () => {
        const used = oniSinergiaConsume('invalida');
        assert.equal(used['system.props.slayer_class_companheiro_oni_sinergia_alvo'], '');
    });
    it('oniSinergia consume invalida e reset', () => {
        const used = oniSinergiaConsume('rastro_sangue');
        assert.equal(used['system.props.slayer_class_companheiro_oni_sinergia_alvo'], 'rastro_sangue');
    });
    it('oniSinergia - 3 choices validas', () => {
        assert.equal(oniSinergiaConsume('pressao_conjunta')['system.props.slayer_class_companheiro_oni_sinergia_alvo'], 'pressao_conjunta');
        assert.equal(oniSinergiaConsume('rastro_sangue')['system.props.slayer_class_companheiro_oni_sinergia_alvo'], 'rastro_sangue');
        assert.equal(oniSinergiaConsume('abertura_demoniaca')['system.props.slayer_class_companheiro_oni_sinergia_alvo'], 'abertura_demoniaca');
    });
});

describe('class-runtime - estado e resets', () => {
    it('classStateKey gera chave namespaced', () => {
        assert.equal(
            classStateKey('classe_mb', 'parry_used_round'),
            'slayer_class_mb_parry_used_round'
        );
        assert.equal(
            classStateKey('classe_kakushi', 'amparar_used_round'),
            'slayer_class_kakushi_amparar_used_round'
        );
    });

    it('resetClassTurnState zera chaves de turno', () => {
        const props = { slayer_class_mb_parry_used_turn: 1, slayer_class_mb_parry_used_round: 1 };
        const patch = resetClassTurnState('classe_mb', props);
        assert.equal(patch['system.props.slayer_class_mb_parry_used_turn'], 0);
        assert.ok(!('system.props.slayer_class_mb_parry_used_round' in patch));
    });

    it('resetClassRoundState zera chaves de rodada', () => {
        const props = { slayer_class_mb_parry_used_turn: 1, slayer_class_mb_parry_used_round: 1 };
        const patch = resetClassRoundState('classe_mb', props);
        assert.equal(patch['system.props.slayer_class_mb_parry_used_round'], 0);
        assert.ok(!('system.props.slayer_class_mb_parry_used_turn' in patch));
    });
});

describe('class-runtime - event dispatcher', () => {
    it('basic-hit e aplicavel para rank C e B', () => {
        const ctx = classEventContext({ classKey: 'classe_mb', level: 4, event: 'basic-hit' });
        assert.equal(ctx.rank, 'C');
        assert.equal(ctx.applicable, true);
    });

    it('basic-critical e aplicavel para rank A', () => {
        const ctx = classEventContext({ classKey: 'classe_mb', level: 8, event: 'basic-critical' });
        assert.equal(ctx.rank, 'A');
        assert.equal(ctx.applicable, true);
    });

    it('physical-melee-damage e aplicavel para rank S', () => {
        const ctx = classEventContext({
            classKey: 'classe_mb',
            level: 11,
            event: 'physical-melee-damage',
        });
        assert.equal(ctx.rank, 'S');
        assert.equal(ctx.applicable, true);
    });

    it('evento nao aplicavel retorna false', () => {
        const ctx = classEventContext({ classKey: 'classe_mb', level: 1, event: 'basic-hit' });
        assert.equal(ctx.applicable, false);
    });
});

describe('class-runtime - Critico Brutal (Rank A)', () => {
    it('bleeding com FOR arredonda pra cima', () => {
        assert.equal(mbCriticoBrutalBleeding(5, 10, 'for'), 3);
        assert.equal(mbCriticoBrutalBleeding(4, 10, 'for'), 2);
    });

    it('bleeding com DEX', () => {
        assert.equal(mbCriticoBrutalBleeding(5, 7, 'dex'), 4);
        assert.equal(mbCriticoBrutalBleeding(5, 6, 'dex'), 3);
    });

    it('ferimento tatilico valida chave', () => {
        const f = mbCriticoBrutalFerimento('tendao_rompido');
        assert.equal(f.key, 'tendao_rompido');
        assert.equal(f.label, 'Tendão Rompido');
    });

    it('ferimento invalido retorna null', () => {
        assert.equal(mbCriticoBrutalFerimento('invalido'), null);
    });
});

describe('class-runtime - Corpo de Guerra (Rank S)', () => {
    it('parry apply reduz dano', () => {
        const result = mbParryApply('S', 10, 5);
        assert.equal(result.reduced, 5);
        assert.equal(result.zeroed, false);
    });

    it('parry apply zera dano quando reduzido a 0', () => {
        const result = mbParryApply('S', 3, 5);
        assert.equal(result.reduced, 3);
        assert.equal(result.zeroed, true);
    });

    it('parry apply nao funciona em rank A', () => {
        const result = mbParryApply('A', 10, 5);
        assert.equal(result.reduced, 0);
        assert.equal(result.zeroed, false);
    });
});

describe('class-runtime - Contraataque (Rank SS)', () => {
    it('contraataque disponivel no inicio da rodada', () => {
        assert.equal(mbContraataqueEligible({}), true);
    });

    it('contraataque consumido bloqueia segundo uso', () => {
        const stateKey = classStateKey('classe_mb', 'contraataque_used_round');
        assert.equal(mbContraataqueEligible({ [stateKey]: 1 }), false);
    });

    it('contraataque consume retorna patch', () => {
        const patch = mbContraataqueConsume();
        const stateKey = classStateKey('classe_mb', 'contraataque_used_round');
        assert.equal(patch[`system.props.${stateKey}`], 1);
    });
});

describe('class-runtime - Pressao de Combate (Rank B)', () => {
    it('pressao aplica quando primeiro ataque no turno', () => {
        const result = mbPressaoCombate({}, 'target_1');
        assert.equal(result.apply, true);
        assert.ok(result.patch);
    });

    it('pressao nao aplica se ja usou no turno', () => {
        const stateKey = classStateKey('classe_mb', 'pressao_used_turn');
        const result = mbPressaoCombate({ [stateKey]: 1 }, 'target_1');
        assert.equal(result.apply, false);
    });

    it('pressao nao aplica se mesmo alvo', () => {
        const stateKey = classStateKey('classe_mb', 'pressao_alvo');
        const result = mbPressaoCombate({ [stateKey]: 'target_1' }, 'target_1');
        assert.equal(result.apply, false);
    });
});

describe('class-runtime - Usuario de Veneno - Ataque Adicional (Rank A)', () => {
    it('ataque adicional disponivel no inicio do turno', () => {
        assert.equal(uvAtaqueAdicionalAvailable({}), true);
    });

    it('ataque adicional consumido bloqueia segundo uso', () => {
        const stateKey = classStateKey('classe_usuario_de_veneno', 'ataque_adicional_used_turn');
        assert.equal(uvAtaqueAdicionalAvailable({ [stateKey]: 1 }), false);
    });

    it('ataque adicional consume retorna patch', () => {
        const patch = uvAtaqueAdicionalConsume();
        const stateKey = classStateKey('classe_usuario_de_veneno', 'ataque_adicional_used_turn');
        assert.equal(patch[`system.props.${stateKey}`], 1);
    });
});
