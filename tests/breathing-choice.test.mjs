import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { makeActor } from './fixtures/actor.mjs';

setupFoundryMocks();

import { chosenBreathing, formsForBreathing } from '../scripts/breathing-choice.mjs';
import { createAttackBuilderModel, buildBreathingDamageCatalog } from '../scripts/items/attack-builder.mjs';
import { resolveBreathItem } from '../scripts/breath-form-launcher.mjs';
import { listChainableBreathForms } from '../scripts/attack-follow-up.mjs';

const catalog = JSON.parse(readFileSync(new URL('../catalogs/breathing-items.json', import.meta.url)));
const wanted = ['Vento', 'Chamas', 'Água', 'Sonhos', 'Som', 'Raposa', 'Eclipse'];

function form(actor, id, breathing, uuid) {
    return {
        id, uuid, name: `Forma ${breathing}`, parent: actor,
        system: {
            template: 'NABreathTpl00001',
            props: {
                forma_id: id, respiracao_nome: breathing, nome_forma: `Forma ${breathing}`,
                inventario_categoria: 'respiracao', tipo_manobra: 'Ação Especial',
                nivel_req: 1, tem_nvl1: 1, nvl1_custo: 1, nvl1_dano: '1d6',
            },
        },
    };
}

describe('vínculo respiração da ficha ↔ itens de Forma', () => {
    it('traduz o valor do dropdown para o nome canônico', () => {
        assert.equal(chosenBreathing({ resp_slayer_display: 'resp_slayer_chamas' }), 'Chamas');
        assert.equal(chosenBreathing({ resp_slayer_display: 'resp_slayer_nevoa' }), 'Névoa');
        assert.equal(chosenBreathing({ resp_slayer_display: 'resp_slayer_magma' }), null,
            'sem motor publicado, não é respiração jogável');
        assert.equal(chosenBreathing({ respiracao_escolhida: 'Vento' }), 'Vento');
        assert.equal(chosenBreathing({}), null);
    });

    it('filtra itens por respiração e devolve todos sem escolha', () => {
        const items = [form(null, 'chamas_01', 'Chamas', 'a'), form(null, 'som_01', 'Som', 'b')];
        assert.deepEqual(formsForBreathing(items, 'Chamas').map(i => i.system.props.forma_id), ['chamas_01']);
        assert.equal(formsForBreathing(items, null).length, 2);
    });

    it('monta o catálogo de dano só com a respiração escolhida na ficha', () => {
        const actor = makeActor({ props: { nome_slayer: 'Slayer', nvl_respiracao_num: 4, resp_slayer_display: 'resp_slayer_chamas' } });
        actor.items = catalog.documents.filter(i => wanted.includes(i.system?.props?.respiracao_nome));
        const groups = buildBreathingDamageCatalog(actor);
        assert.deepEqual([...new Set(groups.map(g => g.breathing))], ['Chamas']);
        const model = createAttackBuilderModel(actor);
        assert.deepEqual([...new Set(model.breathing.map(e => e.definition.metadata.breathing))], ['Chamas']);
    });

    it('lançador e encadeamento não oferecem Formas de outra respiração', async () => {
        const actor = makeActor({ props: { nome_slayer: 'Slayer', resp_slayer_display: 'resp_slayer_chamas' } });
        actor.items = [form(actor, 'chamas_01', 'Chamas', 'a'), form(actor, 'som_01', 'Som', 'b')];
        const picked = await resolveBreathItem(actor, {}, async () => assert.fail('seletor misto chamado'));
        assert.equal(picked.system.props.forma_id, 'chamas_01');
        assert.deepEqual(
            listChainableBreathForms(actor).map(entry => entry.uuid),
            ['a'],
        );
    });
});
