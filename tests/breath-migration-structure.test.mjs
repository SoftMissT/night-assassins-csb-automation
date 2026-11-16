import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { breathingItemPatch } from '../scripts/breath-migration.mjs';

/**
 * "Corrigir Respirações" só reparava Itens fora do padrão. Um Item já canônico no mundo, com
 * custos antigos (nível 1 repetido nos quatro níveis), ficava para sempre com o custo errado
 * mesmo depois de o catálogo ser corrigido. O reparo agora também refresca só os campos
 * estruturais (tipo, nível mínimo, níveis liberados e custos) e nunca mexe no resto.
 */

const structure = (overrides = {}) => ({
    tipo_manobra: 'Única',
    nivel_req: 1,
    tem_nvl1: 1, nvl1_custo: 1,
    tem_nvl2: 1, nvl2_custo: 2,
    tem_nvl3: 1, nvl3_custo: 3,
    tem_nvl4: 1, nvl4_custo: 3,
    ...overrides,
});

const form = (structureOverrides = {}, extra = {}, template = 'NABreathTpl00001') => ({
    id: 'item-1',
    name: 'Som - 1º Estilo Rugido',
    ownership: { default: 2 },
    system: {
        template,
        props: {
            inventario_categoria: 'respiracao',
            forma_id: 'som_01',
            respiracao_nome: 'Som',
            nome_forma: 'Rugido',
            descricao: 'texto do catálogo',
            ...structure(structureOverrides),
            ...extra,
        },
    },
});

const canonical = form();

describe('reparo de Respirações: campos estruturais', () => {
    it('Item com a estrutura em dia não gera patch (idempotente)', () => {
        assert.equal(breathingItemPatch(form(), canonical), null);
    });

    it('custos antigos repetidos nos quatro níveis são corrigidos só nos campos que mudaram', () => {
        const stale = form({ nvl2_custo: 1, nvl3_custo: 1, nvl4_custo: 1 });
        const patch = breathingItemPatch(stale, canonical);
        assert.deepEqual(patch, {
            _id: 'item-1',
            'system.props.nvl2_custo': 2,
            'system.props.nvl3_custo': 3,
            'system.props.nvl4_custo': 3,
        });
    });

    it('tipo "Não informada" e nível bloqueado no catálogo são refletidos', () => {
        const stale = form({ tipo_manobra: 'Não informada' });
        const locked = form({ tem_nvl1: 0, nvl1_custo: 0, nivel_req: 2 });
        const patch = breathingItemPatch(stale, locked);
        assert.equal(patch['system.props.tipo_manobra'], 'Única');
        assert.equal(patch['system.props.tem_nvl1'], 0);
        assert.equal(patch['system.props.nvl1_custo'], 0);
        assert.equal(patch['system.props.nivel_req'], 2);
    });

    it('não toca em descrição nem em dados próprios do Item', () => {
        const stale = form({ nvl2_custo: 1 }, { descricao: 'texto editado pelo mestre', anotacao_do_jogador: 'x' });
        const patch = breathingItemPatch(stale, canonical);
        assert.deepEqual(Object.keys(patch).sort(), ['_id', 'system.props.nvl2_custo']);
    });

    it('compara como texto: 4 e "4" são a mesma coisa', () => {
        assert.equal(breathingItemPatch(form({ nvl2_custo: '2', tem_nvl3: '1' }), canonical), null);
    });
});
