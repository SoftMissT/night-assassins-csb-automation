import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeActor } from './fixtures/actor.mjs';

let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () =>
    Array.isArray(_dialogReturn) ? _dialogReturn.shift() : _dialogReturn;
ChatMessage.create = async (data) => data;

let _rollResult = {
    total: 10,
    toMessage: async () => {},
    dice: [{ results: [{ result: 1, active: true }] }],
};
Roll.create = () => ({
    evaluate: async () => _rollResult,
    dice: [{ results: [{ result: 1, active: true }] }],
});

import { rollHit } from '../scripts/hit-service.mjs';
import { canChainBreathForms, resolveAutoDamage } from '../scripts/attack-follow-up.mjs';

/** Actor.items precisa iterar como array E responder a .get(id), como a EmbeddedCollection real do Foundry. */
function itemsCollection(items) {
    const collection = [...items];
    collection.get = (id) => collection.find((item) => item.id === id);
    return collection;
}

function makeWeaponItem({ id = 'weapon1', uuid = 'Item.weapon1', name = 'Nichirin' } = {}) {
    return {
        id,
        uuid,
        name,
        system: {
            props: {
                arma_nome: name,
                arma_dano_dados: '2d6',
                arma_dano_fixo: 0,
                arma_dano_atributo: 'FOR',
                arma_tipos_dano: 'cortante',
                arma_critico: 20,
            },
        },
    };
}

describe('attack-follow-up — pipeline Acerto → Dano (Problemas 1, 2 e 3)', () => {
    it('não oferece encadeamento para Oni comum e libera Exterminador Corrompido', () => {
        const oni = makeActor({ props: { nome_oni: 'Oni', origem_oni_dropdown: 'origem_oni_comum' } });
        const corrupted = makeActor({
            props: {
                nome_oni: 'Corrompido',
                origem_oni_dropdown: 'origem_oni_exterminador_corrompido',
            },
        });
        assert.equal(canChainBreathForms(oni), false);
        assert.equal(canChainBreathForms(corrupted), true);
    });

    it('Problema 1 — Acerto confirmado com arma dispara o dano automaticamente, sem clique manual na arma', async () => {
        const weapon = makeWeaponItem();
        const actor = makeActor({ props: { acerto_label: 'acerto_label_for', for_display: '6' } });
        actor.items = itemsCollection([weapon]);

        const chatFlavors = [];
        ChatMessage.create = async (data) => {
            chatFlavors.push(data?.flavor ?? '');
            return data;
        };

        _rollResult = {
            total: 14,
            toMessage: async () => ({ id: 'hit' }),
            dice: [{ results: [{ result: 10, active: true }] }],
        };
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
                weaponId: 'weapon1',
                weaponProfileIndex: 0,
                weaponAttribute: '',
            }, // openHitDialog
            { hit: true, continue: false }, // openHitConfirmationDialog
            { chain: false }, // openChainFormDialog (Problema 2)
            {
                nome: 'Nichirin',
                pdrGasto: 0,
                entradas: [
                    {
                        dado: '1d10',
                        fixo: 3,
                        selAttrs: [],
                        selTiposDano: ['cortante'],
                        tipoAcao: 'ataque',
                    },
                ],
                critical: false,
            }, // openDamageDialog (rollWeaponItem -> rollDamage)
        ];

        const result = await rollHit({ actor });
        assert.strictEqual(result.hits, 1);
        // Nenhum clique manual na arma aconteceu — a rolagem de dano (com o
        // "Total:" característico do flavor de damage-service.mjs) já está no
        // chat só por ter confirmado o Acerto.
        assert.ok(
            chatFlavors.some((flavor) => flavor.includes('Total:')),
            `esperava um chat de dano automático; flavors: ${JSON.stringify(chatFlavors)}`
        );
    });

    it('Problema 2 — encadear outra Forma no diálogo pós-Acerto NÃO rola o dano da técnica atual', async () => {
        const weapon = makeWeaponItem();
        const actor = makeActor({ props: { acerto_label: 'acerto_label_for', for_display: '6' } });
        actor.items = itemsCollection([weapon]);

        const chatFlavors = [];
        const warnings = [];
        ChatMessage.create = async (data) => {
            chatFlavors.push(data?.flavor ?? '');
            return data;
        };
        ui.notifications.warn = (message) => warnings.push(message);

        _rollResult = {
            total: 14,
            toMessage: async () => ({ id: 'hit' }),
            dice: [{ results: [{ result: 10, active: true }] }],
        };
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
                weaponId: 'weapon1',
                weaponProfileIndex: 0,
                weaponAttribute: '',
            }, // openHitDialog
            { hit: true, continue: false }, // openHitConfirmationDialog
            { chain: true, itemUuid: 'Item.proxima-forma' }, // openChainFormDialog: jogador escolhe encadear
        ];

        const result = await rollHit({ actor });
        assert.strictEqual(result.hits, 1);
        // O dano da ARMA/técnica atual não deve ter sido rolado — o fluxo
        // delega para a próxima Forma (useBreathForm), que aqui não encontra o
        // item (fromUuid mockado devolve null) e apenas avisa, sem quebrar.
        assert.ok(
            !chatFlavors.some((flavor) => flavor.includes('Total:')),
            `dano não deveria ter sido rolado ao encadear; flavors: ${JSON.stringify(chatFlavors)}`
        );
        assert.ok(
            warnings.some((message) => message.includes('Item não encontrado')),
            `esperava que useBreathForm tentasse resolver a próxima Forma; warnings: ${JSON.stringify(warnings)}`
        );
    });

    it('Problema 3 — técnica sem dado de dano próprio (ex.: 2ª Forma das Chamas) usa a arma equipada quando nenhuma foi escolhida no diálogo de Acerto', async () => {
        const weapon = makeWeaponItem();
        const actor = makeActor({ props: {} });
        actor.items = itemsCollection([weapon]);

        const formulas = [];
        Roll.create = (formula) => {
            formulas.push(formula);
            return { evaluate: async () => ({ total: 12, dice: [] }) };
        };
        _dialogReturn = [
            {
                nome: 'Nichirin',
                pdrGasto: 0,
                entradas: [
                    {
                        dado: '2d6',
                        fixo: 0,
                        selAttrs: [],
                        selTiposDano: ['cortante'],
                        tipoAcao: 'ataque',
                    },
                ],
                critical: false,
            },
        ];

        // Simula o Acerto confirmado da 2ª Forma das Chamas: nenhuma arma foi
        // escolhida no diálogo (hitResult.weapon === null) e a técnica em si
        // não tem entradas de dano próprias (techniqueEntradas: []).
        const hitResult = { hits: 1, attempts: [{ hit: true, critical: false }], weapon: null };
        await resolveAutoDamage({
            actor,
            hitResult,
            techniqueLabel: 'Chamas Céu em Chamas Ascendentes',
            techniqueEntradas: [],
        });

        assert.ok(
            formulas.some((formula) => formula.includes('2d6')),
            `esperava o dano da arma na fórmula final; formulas: ${JSON.stringify(formulas)}`
        );
    });

    it('Problema 3 (controle) — com MAIS de uma arma distinta, não adivinha: sem entrada, avisa e não inclui dano de arma nenhuma', async () => {
        const weaponA = makeWeaponItem({ id: 'weaponA', uuid: 'Item.weaponA', name: 'Nichirin' });
        const weaponB = makeWeaponItem({ id: 'weaponB', uuid: 'Item.weaponB', name: 'Kunai' });
        const actor = makeActor({ props: {} });
        actor.items = itemsCollection([weaponA, weaponB]);

        const formulas = [];
        const warnings = [];
        Roll.create = (formula) => {
            formulas.push(formula);
            return { evaluate: async () => ({ total: 0, dice: [] }) };
        };
        ui.notifications.warn = (message) => warnings.push(message);
        _dialogReturn = { nome: 'Técnica', pdrGasto: 0, entradas: [] };

        const hitResult = { hits: 1, attempts: [{ hit: true, critical: false }], weapon: null };
        await resolveAutoDamage({
            actor,
            hitResult,
            techniqueLabel: 'Técnica sem dado próprio',
            techniqueEntradas: [],
        });

        assert.ok(
            !formulas.some((formula) => formula.includes('2d6') || formula.includes('2d8')),
            'não deveria adivinhar qual das duas armas usar'
        );
        assert.ok(
            warnings.some((message) => message.includes('Adicione ao menos uma entrada')),
            'deveria avisar que falta informar o dano, em vez de escolher uma arma arbitrariamente'
        );
    });
});
