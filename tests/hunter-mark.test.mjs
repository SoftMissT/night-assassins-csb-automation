import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
    isBornMarked,
    markActivationFields,
    markCriticalMargin,
    markExtraAttack,
    markFinishOutcome,
    markOverdriveLimit,
} from '../scripts/slayer/hunter-mark.mjs';

/**
 * Regra: `docs/Sistema/04 - Marca do Caçador/Marca do Caçador.md` (v6).
 * Antes desta entrega o macro gravava a margem de crítico e o ataque adicional em campos que
 * nenhum código lia, e o Overdrive, a Exaustão 1 do Nascido Marcado e o −1 ano da Marca do
 * Destino nv12 não existiam.
 */

const normal = { marca_ativa: 1, marca_anos_queimados: 2, hab_escolhida: 'hab_escolhida_sem' };
const bornProps = {
    marca_ativa: 1,
    marca_intensidade: 2,
    marca_overdrive: 0,
    nvl_respiracao_num: 4,
    hab_escolhida: 'hab_escolhida_marca_destino',
    origem_dropdown: 'origem_descendente_perdido',
};

describe('Nascido Marcado = Marca do Destino + Descendente Perdido', () => {
    it('reconhece as duas condições juntas e nenhuma sozinha', () => {
        assert.equal(isBornMarked(bornProps), true);
        assert.equal(isBornMarked({ ...bornProps, origem_dropdown: 'origem_monge' }), false);
        assert.equal(isBornMarked({ ...bornProps, hab_escolhida: 'hab_escolhida_tato' }), false);
    });
});

describe('Crítico Marcado: margem só contra Oni', () => {
    it('Marca normal: 19; com 3 ou mais anos queimados: 17', () => {
        assert.equal(markCriticalMargin(normal, { targetIsOni: true }), 19);
        assert.equal(markCriticalMargin({ ...normal, marca_anos_queimados: 3 }, { targetIsOni: true }), 17);
        assert.equal(markCriticalMargin({ ...normal, marca_anos_queimados: 5 }, { targetIsOni: true }), 17);
    });

    it('Nascido Marcado: 18 contra Oni, mesmo com Overdrive', () => {
        assert.equal(markCriticalMargin(bornProps, { targetIsOni: true }), 18);
        assert.equal(markCriticalMargin({ ...bornProps, marca_overdrive: 3 }, { targetIsOni: true }), 18);
    });

    it('sem Marca ativa ou sem alvo Oni, a margem da arma segue valendo (null)', () => {
        assert.equal(markCriticalMargin({ ...normal, marca_ativa: 0 }, { targetIsOni: true }), null);
        assert.equal(markCriticalMargin(normal, { targetIsOni: false }), null);
        assert.equal(markCriticalMargin(normal), null);
    });
});

describe('Frequência Cardíaca Elevada: 1 ataque adicional por turno em Ação de Ataque', () => {
    const base = { actionType: 'ataque', classTechniquePending: false, usedThisTurn: false };

    it('libera com a Marca ativa em Ação de Ataque', () => {
        assert.equal(markExtraAttack(normal, base), true);
    });

    it('não vale em Ação Completa, com técnica de Respiração pendente ou já usado no turno', () => {
        assert.equal(markExtraAttack(normal, { ...base, actionType: 'completa' }), false);
        assert.equal(markExtraAttack(normal, { ...base, classTechniquePending: true }), false);
        assert.equal(markExtraAttack(normal, { ...base, usedThisTurn: true }), false);
    });

    it('não vale com a Marca inativa', () => {
        assert.equal(markExtraAttack({ ...normal, marca_ativa: 0 }, base), false);
    });
});

describe('Overdrive do Nascido Marcado', () => {
    it('o limite é a vida restante em anos inteiros; Marca normal não tem Overdrive', () => {
        assert.equal(markOverdriveLimit({ ...bornProps, vid_rest_num: 3.7 }), 3);
        assert.equal(markOverdriveLimit({ ...bornProps, vid_rest_num: 0 }), 0);
        assert.equal(markOverdriveLimit({ ...bornProps }), 0);
        assert.equal(markOverdriveLimit({ ...normal, vid_rest_num: 9 }), 0);
    });

    it('ativação: Intensidade 4 + Overdrive 2 = +6d20, queima 2 anos (Overdrive 2 do exemplo da regra)', () => {
        const fields = markActivationFields(
            { ...bornProps, vid_rest_num: 10 },
            { power: 4, overdrive: 2 }
        );
        assert.deepEqual(fields, {
            marca_anos_queimados: 0,
            marca_intensidade: 4,
            marca_overdrive: 2,
            marca_dano_dados: 6,
            marca_dano_faces: 20,
        });
    });

    it('o Overdrive pedido é limitado pela vida restante', () => {
        const fields = markActivationFields(
            { ...bornProps, vid_rest_num: 1 },
            { power: 4, overdrive: 5 }
        );
        assert.equal(fields.marca_overdrive, 1);
        assert.equal(fields.marca_dano_dados, 5);
    });

    it('Marca normal ignora Overdrive: d12 por ano queimado', () => {
        const fields = markActivationFields(normal, { power: 3, overdrive: 4 });
        assert.deepEqual(fields, {
            marca_anos_queimados: 3,
            marca_intensidade: 0,
            marca_overdrive: 0,
            marca_dano_dados: 3,
            marca_dano_faces: 12,
        });
    });
});

describe('Encerramento da Marca', () => {
    it('Marca normal: Exaustão 2/4/6/8 por ativação no dia e 1d6 necrótico por ano queimado', () => {
        const props = { ...normal, marca_anos_queimados: 3, marca_ativacoes_dia: 0 };
        const first = markFinishOutcome(props, 12);
        assert.equal(first.exhaustion, 2);
        assert.equal(first.necroticDice, 3);
        assert.equal(first.lifeCost, 3);
        assert.equal(markFinishOutcome({ ...props, marca_ativacoes_dia: 1 }, 12).exhaustion, 4);
        assert.equal(markFinishOutcome({ ...props, marca_ativacoes_dia: 3 }, 12).exhaustion, 8);
        assert.equal(markFinishOutcome({ ...props, marca_ativacoes_dia: 9 }, 12).exhaustion, 8);
    });

    it('Marca do Destino nv12 com Marca normal: a ativação custa +1 ano de vida, sem +1d6 necrótico', () => {
        const props = {
            marca_ativa: 1,
            marca_anos_queimados: 2,
            hab_escolhida: 'hab_escolhida_marca_destino',
            origem_dropdown: 'origem_monge',
        };
        const outcome = markFinishOutcome(props, 12);
        assert.equal(outcome.lifeCost, 3);
        assert.equal(outcome.necroticDice, 2);
        assert.equal(markFinishOutcome(props, 11).lifeCost, 2, 'abaixo do nível 12 não há o custo extra');
    });

    it('Nascido Marcado dentro da Intensidade segura: sem Exaustão, sem custo', () => {
        const outcome = markFinishOutcome({ ...bornProps, marca_intensidade: 2 }, 12);
        assert.equal(outcome.exhaustion, 0);
        assert.equal(outcome.lifeCost, 0);
        assert.equal(outcome.necroticDice, 0);
    });

    it('Nascido Marcado acima de ⌈nível de Respiração ÷ 2⌉: Exaustão 1 (nível 4 → seguro até 2)', () => {
        assert.equal(markFinishOutcome({ ...bornProps, marca_intensidade: 3 }, 12).exhaustion, 1);
        assert.equal(markFinishOutcome({ ...bornProps, marca_intensidade: 4 }, 12).exhaustion, 1);
        assert.equal(
            markFinishOutcome({ ...bornProps, nvl_respiracao_num: 3, marca_intensidade: 2 }, 12).exhaustion,
            0,
            'nível 3 → ⌈1,5⌉ = 2, então Intensidade 2 é segura'
        );
        assert.equal(
            markFinishOutcome({ ...bornProps, nvl_respiracao_num: 3, marca_intensidade: 3 }, 12).exhaustion,
            1
        );
    });

    it('Nascido Marcado com Overdrive: perde os anos, 1d6 necrótico por ano e conta na Intensidade total', () => {
        const outcome = markFinishOutcome(
            { ...bornProps, marca_intensidade: 2, marca_overdrive: 2 },
            12
        );
        assert.equal(outcome.lifeCost, 2);
        assert.equal(outcome.necroticDice, 2);
        assert.equal(outcome.exhaustion, 1, 'Intensidade total 4 > ⌈4/2⌉');
    });
});

describe('ligação no pipeline e no macro (contrato estático)', () => {
    const hit = readFileSync(new URL('../scripts/hit-service.mjs', import.meta.url), 'utf8');
    const macro = readFileSync(new URL('../macros/na-marca-cacador.js', import.meta.url), 'utf8');
    const main = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');

    it('hit-service usa a margem e o ataque adicional da Marca e não depende dos campos antigos', () => {
        assert.match(hit, /markCriticalMargin\(/);
        assert.match(hit, /markExtraAttack\(/);
        assert.match(hit, /Math\.min\([^)]*markMargin/);
        assert.match(hit, /'markExtraAttack'/);
    });

    it('o macro não grava mais campos que ninguém lê', () => {
        assert.doesNotMatch(macro, /marca_critico_margem/);
        assert.doesNotMatch(macro, /marca_ataque_extra/);
    });

    it('o macro usa a API do módulo para Overdrive e encerramento', () => {
        assert.match(macro, /huntersMark/);
        assert.match(main, /huntersMark/);
    });
});
