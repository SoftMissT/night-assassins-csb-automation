import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { rollHit } from '../scripts/hit-service.mjs';
import { rollTest } from '../scripts/roll-service.mjs';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

const sheets = [
    ['npc', { npc_for_base: 5, for_marca_temp: 2, bonus_atr_for_valor_temp: 3 }, 10],
    ['slayer', { atr_for_valor_config: 4, for_marca_temp: 2 }, 6],
    ['oni', { atr_for_oni_valor_config: 4, bonus_atr_for_oni_valor_temp: 1 }, 5],
    ['oni-minion', { oni_minion_for_base: 4 }, 4],
];

for (const [sheet, attributes, expected] of sheets) {
    test(`${sheet}: Acerto e Bloqueio pelo UUID da ficha sem for_display`, async () => {
        const template = JSON.parse(await readFile(
            new URL(`../src/templates/actors/${sheet}-template.json`, import.meta.url), 'utf8'
        ));
        const body = JSON.stringify(template.system.body);
        assert.match(body, /NAHitRoll0000001'\)\)\?\.execute\(\{actorUuid:entity\.uuid\}\)/);
        assert.match(body, /NARollMode000001'\)\)\?\.execute\(\{actorUuid:entity\.uuid,test:'Bloqueio',attr:'FOR'/);

        setupFoundryMocks();
        const actor = {
            id: sheet,
            uuid: `Actor.${sheet}`,
            system: { props: { ...attributes, acerto_label: 'acerto_label_for' } },
            update: async () => {},
        };
        globalThis.fromUuid = async (uuid) => {
            assert.equal(uuid, actor.uuid);
            return actor;
        };
        const formulas = [];
        const alerts = [];
        ui.notifications.error = (error) => alerts.push(error);
        foundry.applications.api.DialogV2.wait = async () => ({
            mode: 'normal',
            rollMode: 'publicroll',
            bonusRaw: '',
            cdVal: 10,
        });
        const createRoll = Roll.create;
        Roll.create = (formula) => {
            formulas.push(formula);
            return createRoll(formula);
        };
        ChatMessage.create = async (data) => data;

        await rollHit({ actorUuid: actor.uuid, autoDamage: false });
        await rollTest({ actorUuid: actor.uuid, test: 'Bloqueio', attr: 'FOR' });
        assert.deepEqual(alerts, []);
        assert.deepEqual(formulas, [`1d20 + ${expected}`, `1d20 + ${expected}`]);
    });
}
