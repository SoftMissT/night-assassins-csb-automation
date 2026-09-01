import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    canonicalWeaponForItem,
    rehydrateSlayerWeaponItem,
    repairSlayerWeaponItems,
    weaponRepairChanges,
} from '../scripts/weapon-migration.mjs';
import { normalizeWeaponTechnique } from '../scripts/items/item-technique-normalizers.mjs';
import { readFile } from 'node:fs/promises';

const armedItem = {
    id: 'abc123',
    name: 'Gilgamesh Yoroi do Sol',
    ownership: { default: 2 },
    system: {
        template: 'NAWeaponTpl00001',
        props: {
            inventario_categoria: 'arma',
            arma_nome: 'Gilgamesh Yoroi do Sol',
            arma_propriedades: 'Acuidade',
            arma_perfis_ataque: [
                {
                    nome: 'Ataque Base',
                    dano_fixo: 4,
                    tipos_dano: ['cortante'],
                    atributos: [{ key: 'DEX', multiplicador: 1 }],
                },
            ],
        },
    },
};

describe('weapon-migration', () => {
    it('gera o patch de resumos para uma arma com perfis', () => {
        const changes = weaponRepairChanges(armedItem);
        assert.ok(changes);
        assert.equal(changes._id, 'abc123');
        assert.ok(changes['system.props.arma_perfis_ataque_json']);
        assert.ok(changes['system.props.arma_mecanicas_json']);
        assert.equal(changes['system.props.arma_perfis_resumo'], 'Ataque Base');
        assert.equal(changes['system.props.arma_tipos_dano_resumo'], 'cortante');
        assert.equal(changes['system.props.arma_atributos_resumo'], 'DEX');
        assert.equal(changes['system.props.arma_tipos_dano'], 'cortante');
        assert.equal(changes['system.props.arma_dano_atributo'], 'DEX');
    });

    it('é idempotente: após aplicar, não gera novo patch', () => {
        const first = weaponRepairChanges(armedItem);
        assert.ok(first);
        const appliedProps = { ...armedItem.system.props };
        for (const [path, value] of Object.entries(first)) {
            if (path.startsWith('system.props.')) appliedProps[path.slice('system.props.'.length)] = value;
        }
        assert.equal(
            weaponRepairChanges({
                ...armedItem,
                system: { ...armedItem.system, props: appliedProps },
            }),
            null
        );
    });

    it('ignora itens que não são armas', () => {
        assert.equal(
            weaponRepairChanges({
                id: 'x',
                name: 'Erva',
                system: { props: { inventario_categoria: 'item' } },
            }),
            null
        );
    });

    it('arma sem perfil de ataque ainda recebe correção de ownership (P0: player abre item)', () => {
        assert.deepEqual(
            weaponRepairChanges({
                id: 'x',
                name: 'Adaga',
                system: { props: { inventario_categoria: 'arma' } },
            }),
            { _id: 'x', ownership: { default: 2 } }
        );
    });

    it('contabiliza Actors corrigidos e itens atualizados', async () => {
        let calls = 0;
        const actors = [
            {
                items: [
                    armedItem,
                    { id: 'y', name: 'Erva', system: { props: { inventario_categoria: 'item' } } },
                ],
                updateEmbeddedDocuments(type, updates) {
                    calls += 1;
                    assert.equal(type, 'Item');
                    return Promise.resolve(updates);
                },
            },
        ];
        const result = await repairSlayerWeaponItems({ actors, canonicalWeapons: [] });
        assert.equal(result.actors, 1);
        assert.equal(result.items, 1);
        assert.equal(calls, 1);
    });

    it('retorna vazio sem Actors no ambiente de testes', async () => {
        const result = await repairSlayerWeaponItems({ canonicalWeapons: [] });
        assert.deepEqual(result, { actors: 0, items: 0 });
    });

    it('é estritamente idempotente e nunca duplica um Cutelos após dez reparos', async () => {
        const cutelos = {
            id: 'cutelos-1',
            name: 'Cutelos Gêmeos',
            ownership: { default: 0 },
            system: {
                template: 'runtime-template',
                props: {
                    inventario_categoria: 'arma',
                    arma_nome: 'Cutelos Gêmeos',
                    arma_perfis_ataque: [{ nome: 'Ataque Base', dano_fixo: 4, critico: 20 }],
                },
            },
        };
        const actor = {
            items: [cutelos],
            async updateEmbeddedDocuments(type, updates) {
                assert.equal(type, 'Item');
                for (const update of updates) {
                    const item = this.items.find((entry) => entry.id === update._id);
                    for (const [path, value] of Object.entries(update)) {
                        if (path.startsWith('system.props.')) item.system.props[path.slice(13)] = value;
                        if (path === 'ownership') item.ownership = value;
                    }
                }
            },
        };
        for (let iteration = 0; iteration < 10; iteration += 1) {
            await repairSlayerWeaponItems({ actors: [actor], canonicalWeapons: [] });
            assert.equal(actor.items.filter((item) => item.name === 'Cutelos Gêmeos').length, 1);
        }
    });

    it('repair não contém nenhum caminho de criação de Item', async () => {
        const source = await readFile(new URL('../scripts/weapon-migration.mjs', import.meta.url), 'utf8');
        assert.doesNotMatch(source, /createEmbeddedDocuments\(\s*['"]Item['"]/u);
        assert.doesNotMatch(source, /createDocuments\s*\(/u);
    });

    it('reidrata perfil e crítico pelo nome mesmo com template remapeado pelo CSB', async () => {
        const canonical = {
            ...armedItem,
            id: 'catalog-double-blade',
            name: 'Double Blade',
            system: {
                template: 'NAWeaponTpl00001',
                props: {
                    ...armedItem.system.props,
                    arma_nome: 'Double Blade',
                    arma_critico: 19,
                    arma_dano_fixo: 5,
                    arma_perfis_ataque: [
                        {
                            nome: 'Ryōtō',
                            modo: 'ryoto',
                            dano_fixo: 5,
                            critico: 19,
                            tipos_dano: ['cortante', 'perfurante'],
                            atributos: [],
                        },
                    ],
                },
            },
        };
        const updates = [];
        const embedded = {
            id: 'embedded-double-blade',
            name: 'Double Blade',
            parent: { documentName: 'Actor' },
            ownership: { default: 2 },
            system: {
                template: 'DPHpPEzWtkoFHzdQ',
                props: {
                    inventario_categoria: 'arma',
                    arma_nome: 'Double Blade',
                    arma_critico: 20,
                    arma_perfis_ataque_json: '[]',
                },
            },
            async update(patch, options) {
                updates.push({ patch, options });
            },
        };

        assert.equal(canonicalWeaponForItem(embedded, [canonical]), canonical);
        assert.equal(
            await rehydrateSlayerWeaponItem(embedded, { canonicalWeapons: [canonical] }),
            true
        );
        assert.equal(updates.length, 1);
        assert.equal(updates[0].patch['system.props.arma_critico'], 19);
        const profiles = JSON.parse(updates[0].patch['system.props.arma_perfis_ataque_json']);
        assert.equal(profiles[0].critico, 19);
        const normalized = normalizeWeaponTechnique({
            ...embedded,
            system: {
                ...embedded.system,
                props: {
                    ...embedded.system.props,
                    arma_critico: updates[0].patch['system.props.arma_critico'],
                    arma_perfis_ataque_json:
                        updates[0].patch['system.props.arma_perfis_ataque_json'],
                },
            },
        });
        assert.equal(normalized.definition.attack.critical.threshold, 19);
        assert.equal(updates[0].options.naWeaponRehydrate, true);
    });
});
