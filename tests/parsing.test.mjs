import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    parseNumber,
    parseAttributeValue,
    parseLevel,
    isDestinyMark,
    normalizeAbilityKey,
    changedProp,
    poolMatches,
    latestValues,
    currentConfigValues,
} from '../scripts/parsing.mjs';

describe('parsing', () => {
    describe('parseNumber', () => {
        it('retorna número direto', () => {
            assert.strictEqual(parseNumber(5), 5);
            assert.strictEqual(parseNumber(-3), -3);
        });

        it('ignora HTML', () => {
            assert.strictEqual(parseNumber('<span>7</span>'), 7);
            assert.strictEqual(parseNumber('<strong>12</strong>'), 12);
        });

        it('ignora &nbsp; e vírgula decimal', () => {
            assert.strictEqual(parseNumber('3,5'), 3.5);
            assert.strictEqual(parseNumber('2&nbsp;0'), 2);
        });

        it('retorna 0 para valor inválido', () => {
            assert.strictEqual(parseNumber('abc'), 0);
            assert.strictEqual(parseNumber(null), 0);
            assert.strictEqual(parseNumber(undefined), 0);
        });
    });

    describe('parseAttributeValue', () => {
        it('é alias de parseNumber', () => {
            assert.strictEqual(parseAttributeValue('<b>8</b>'), 8);
        });
    });

    describe('parseLevel', () => {
        it('aceita número', () => {
            assert.strictEqual(parseLevel(6), 6);
        });
        it('aceita string numérica', () => {
            assert.strictEqual(parseLevel('6'), 6);
        });
        it('aceita nvl_6', () => {
            assert.strictEqual(parseLevel('nvl_6'), 6);
        });
        it('aceita nvl 6', () => {
            assert.strictEqual(parseLevel('nvl 6'), 6);
        });
        it('retorna 0 para inválido', () => {
            assert.strictEqual(parseLevel('abc'), 0);
        });
    });

    describe('isDestinyMark', () => {
        it('reconhece option key', () => {
            assert.strictEqual(isDestinyMark('hab_escolhida_marca_destino'), true);
        });
        it('reconhece label', () => {
            assert.strictEqual(isDestinyMark('Marca do Destino'), true);
        });
        it('rejeita outras habilidades', () => {
            assert.strictEqual(isDestinyMark('Tato Sensitivo'), false);
            assert.strictEqual(isDestinyMark('hab_escolhida_tato'), false);
        });
    });

    describe('normalizeAbilityKey', () => {
        it('retorna key direta', () => {
            assert.strictEqual(
                normalizeAbilityKey('hab_escolhida_marca_destino'),
                'hab_escolhida_marca_destino'
            );
        });
        it('normaliza por label', () => {
            assert.strictEqual(
                normalizeAbilityKey('Marca do Destino'),
                'hab_escolhida_marca_destino'
            );
            assert.strictEqual(
                normalizeAbilityKey('Tsuyoi — O Inabalável'),
                'hab_escolhida_tsuyoi'
            );
        });
        it('retorna null para inválido', () => {
            assert.strictEqual(normalizeAbilityKey(''), null);
            assert.strictEqual(normalizeAbilityKey('Desconhecida'), null);
        });
    });

    describe('changedProp', () => {
        it('detecta changes.system.props', () => {
            const changes = { system: { props: { nvl_pj: 3 } } };
            assert.strictEqual(changedProp(changes, 'nvl_pj'), 3);
        });
        it("detecta changes['system.props.key']", () => {
            const changes = { 'system.props.nvl_pj': 3 };
            assert.strictEqual(changedProp(changes, 'nvl_pj'), 3);
        });
        it('retorna undefined quando não existe', () => {
            assert.strictEqual(changedProp({}, 'nvl_pj'), undefined);
        });
    });

    describe('poolMatches', () => {
        it('aceita ordem diferente', () => {
            assert.strictEqual(poolMatches([1, 2, 3], [3, 2, 1]), true);
        });
        it('rejeita tamanho diferente', () => {
            assert.strictEqual(poolMatches([1, 2], [1, 2, 3]), false);
        });
        it('rejeita valores diferentes', () => {
            assert.strictEqual(poolMatches([1, 2, 3], [1, 2, 4]), false);
        });
    });

    describe('latestValues', () => {
        it('usa snapshot mais recente', () => {
            const props = { vit_nvl3: 5, vit_nvl1: 4, atr_vit_valor_config: 4 };
            const values = latestValues(props, 7);
            assert.strictEqual(values.vit, 5);
        });
        it('lê snapshot Oni acima do nível 14', () => {
            const props = { vit_nvl16: 8, vit_nvl13: 6, atr_vit_valor_config: 4 };
            const values = latestValues(props, 20);
            assert.strictEqual(values.vit, 8);
        });
        it('fallback para _config quando não há snapshot', () => {
            const props = { atr_vit_valor_config: 4 };
            const values = latestValues(props, 3);
            assert.strictEqual(values.vit, 4);
        });
    });

    describe('currentConfigValues', () => {
        it('lê valores _config', () => {
            const props = {
                atr_vit_valor_config: 4,
                atr_dex_valor_config: 3,
            };
            const values = currentConfigValues(props);
            assert.strictEqual(values.vit, 4);
            assert.strictEqual(values.dex, 3);
        });
    });
});
