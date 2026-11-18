import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeActor } from './fixtures/actor.mjs';
import { actorKind } from '../scripts/actor-kind.mjs';
import { SHEET_BONUS_KEYS } from '../scripts/derived-bonus-service.mjs';
import {
    consumeOniActions,
    consumeSlayerActions,
    resetOniActions,
    resetSlayerActions,
} from '../scripts/action-service.mjs';

const read = async (file) =>
    JSON.parse(await readFile(new URL(`../src/templates/actors/${file}`, import.meta.url), 'utf8'));

function walk(node, ancestors = [], out = []) {
    if (!node || typeof node !== 'object') return out;
    const path = [...ancestors, node];
    out.push({ node, path });
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((entry) => walk(entry, path, out));
        else if (value && typeof value === 'object') walk(value, path, out);
    }
    return out;
}

const index = (root) =>
    walk(root)
        .filter(({ node }) => typeof node.key === 'string' && node.key)
        .reduce((map, entry) => map.set(entry.node.key, entry), new Map());
const visible = ({ path }) => path.every((node) => (node.role ?? 0) === 0);
const inside = ({ path }, tab) => path.some((node) => node.key === tab);

function trackedActor(props, name) {
    const actor = makeActor({ name, props });
    const events = [];
    const patches = [];
    actor.sheet = { render: () => events.push('render') };
    actor.update = async (patch) => {
        events.push('update');
        patches.push(patch);
        for (const [key, value] of Object.entries(patch))
            if (key.startsWith('system.props.'))
                actor.system.props[key.replace('system.props.', '')] = value;
    };
    return { actor, events, patches };
}

const keysTouched = (patches, prefix) =>
    patches.flatMap((patch) => Object.keys(patch)).filter((key) => key.includes(prefix));

describe('NPC — contrato de ações na ficha (paridade com Slayer)', () => {
    it('botão Gerenciar Ações é visível e chama NAActionManage01', async () => {
        const entry = index((await read('npc-template.json')).system.body).get(
            'npc_acoes_gerenciar'
        );
        assert.ok(entry, 'npc_acoes_gerenciar existe');
        assert.equal(entry.node.role, 0);
        assert.equal(entry.node.style, 'button');
        assert.ok(visible(entry), 'botão não pode herdar role de aba GM');
        assert.ok(inside(entry, 'npc_ficha_tab'), 'botão fica na aba Combate');
        assert.match(entry.node.rollMessage, /NAActionManage01/);
    });

    it('resumo visível interpola acoes_slayer_resumo', async () => {
        const entry = index((await read('npc-template.json')).system.body).get('npc_acoes_display');
        assert.ok(entry, 'npc_acoes_display existe');
        assert.equal(entry.node.role, 0);
        assert.ok(visible(entry), 'resumo não pode herdar role de aba GM');
        assert.match(entry.node.value, /\$\{acoes_slayer_resumo\}\$/);
    });

    it('dados, resumo e bônus de ação ficam na aba Combate, nunca na Configuração GM', async () => {
        const npc = (await read('npc-template.json')).system.body;
        const entries = index(npc);
        const config = entries.get('npc_config_tab');
        assert.equal(config.node.role, 4, 'Configuração continua GM-only');

        const actionKeys = [
            'acoes_slayer_dados',
            'acoes_slayer_resumo',
            'acoes_slayer_ataque_bonus',
            'acoes_slayer_movimento_bonus',
            'acoes_slayer_especial_bonus',
            'acoes_slayer_reacao_bonus',
        ];
        for (const key of actionKeys) {
            const entry = entries.get(key);
            assert.ok(entry, `${key} existe no template`);
            assert.ok(inside(entry, 'npc_ficha_tab'), `${key} na aba Combate`);
            assert.ok(!inside(entry, 'npc_config_tab'), `${key} NÃO pode estar na aba GM`);
        }
        for (const key of actionKeys.filter((entry) => entry.endsWith('_bonus'))) {
            const { node } = entries.get(key);
            assert.equal(node.role, 0, `${key} visível para jogador`);
            assert.equal(node.editRole, 0, `${key} editável na ficha`);
        }
        for (const key of ['acoes_slayer_dados', 'acoes_slayer_resumo'])
            assert.equal(entries.get(key).node.role, 4, `${key} é estado interno`);

        const leaked = walk(config.node)
            .map(({ node }) => node.key)
            .filter((key) => typeof key === 'string' && /^(acoes_|npc_bonus_)/.test(key));
        assert.deepEqual(leaked, [], 'Configuração guarda só dados base');
    });

    it('controle negativo: gate rejeita resumo em aba GM e sem interpolação', () => {
        const regredido = {
            path: [{ key: 'npc_ficha_tab', role: 0 }, { key: 'npc_acoes_display', role: 4 }],
            node: { value: 'acoes_slayer_resumo' },
        };
        assert.equal(visible(regredido), false, 'role 4 na aba invalida a visibilidade');
        assert.throws(() => assert.match(regredido.node.value, /\$\{acoes_slayer_resumo\}\$/));
    });

    it('dez Bônus Fixos do NPC ficam na aba Combate com role 0', async () => {
        const entries = index((await read('npc-template.json')).system.body);
        const npcBonusKeys = Object.values(SHEET_BONUS_KEYS)
            .flat()
            .filter((key) => key.startsWith('npc_bonus_'));
        assert.equal(npcBonusKeys.length, 10);
        for (const key of npcBonusKeys) {
            const entry = entries.get(key);
            assert.ok(entry, `${key} existe`);
            assert.ok(visible(entry), `${key} visível na aba Combate`);
            assert.equal(entry.node.role, 0);
            assert.equal(entry.node.editRole, 0);
        }
    });
});

describe('NPC — runtime de ações com actorKind npc', () => {
    it('consome ataque, grava dados/resumo e renderiza a ficha depois do update', async () => {
        const { actor, events, patches } = trackedActor({ npc_nome: 'NPC Teste' }, 'NPC Teste');
        assert.equal(actorKind(actor), 'npc');

        const result = await consumeSlayerActions(actor, 'ataque');
        assert.equal(result.ok, true);
        assert.equal(actor.system.props.acoes_slayer_dados, result.patch['system.props.acoes_slayer_dados']);
        assert.equal(actor.system.props.acoes_slayer_resumo, result.patch['system.props.acoes_slayer_resumo']);
        assert.match(actor.system.props.acoes_slayer_resumo, /ATAQUE 0\/1/);
        assert.deepEqual(events, ['update', 'render'], 'render depois da gravação');
        assert.deepEqual(keysTouched(patches, 'acoes_oni_'), [], 'Nenhuma key Oni tocada');
    });

    it('restaura o turno do NPC sem mexer na rodada e renderiza a ficha', async () => {
        const spent = {
            version: 1,
            turn: { movimento: 1, ataque: 1, especial: 0 },
            round: { unica: 1, reacao: 1 },
        };
        const { actor, events, patches } = trackedActor(
            { npc_nome: 'NPC Teste', acoes_slayer_dados: JSON.stringify(spent) },
            'NPC Teste'
        );
        await resetSlayerActions(actor, 'turn');
        const state = JSON.parse(actor.system.props.acoes_slayer_dados);
        assert.deepEqual(state.turn, { movimento: 0, ataque: 0, especial: 0 });
        assert.deepEqual(state.round, spent.round);
        assert.match(actor.system.props.acoes_slayer_resumo, /UNICA 0\/1 · REACAO 0\/1/);
        assert.deepEqual(events, ['update', 'render']);
        assert.deepEqual(keysTouched(patches, 'acoes_oni_'), []);
    });

    it('resumo gravado pelo serviço é exatamente o que o painel visível interpola', async () => {
        const npc = index((await read('npc-template.json')).system.body);
        const display = npc.get('npc_acoes_display').node.value;
        const interpolated = display.match(/\$\{([^}]+)\}\$/);
        assert.ok(interpolated, 'painel interpola uma prop');
        const summaryKey = interpolated[1];
        assert.equal(summaryKey, 'acoes_slayer_resumo');

        const defaultValue = npc.get(summaryKey).node.defaultValue;
        assert.match(defaultValue, /ATAQUE 1\/1/, 'default do template é um resumo renderizável');
        const { actor } = trackedActor({ npc_nome: 'NPC Teste' }, 'NPC Teste');
        await consumeSlayerActions(actor, 'ataque');
        const rendered = actor.system.props[summaryKey];
        assert.ok(rendered, 'serviço gravou a prop lida pelo painel');
        assert.match(rendered, /ATAQUE 0\/1/);
        assert.notEqual(rendered, defaultValue, 'painel não fica stale após consumo');
        for (const label of ['MOVIMENTO', 'ATAQUE', 'ESPECIAL', 'UNICA', 'REACAO'])
            assert.ok(rendered.includes(label), `${label} presente no resumo`);
    });
});

describe('Oni Minion — gerenciador de ações', () => {
    it('painel, botão e resumo visíveis; dados na aba GM', async () => {
        const entries = index((await read('oni-minion-template.json')).system.body);
        for (const key of ['acoes_oni_panel', 'acoes_oni_gerenciar', 'acoes_oni_display']) {
            const entry = entries.get(key);
            assert.ok(entry, `${key} existe`);
            assert.equal(entry.node.role, 0);
            assert.ok(visible(entry), `${key} visível`);
        }
        assert.match(entries.get('acoes_oni_gerenciar').node.rollMessage, /NAActionManage01/);
        assert.match(entries.get('acoes_oni_display').node.value, /\$\{acoes_oni_resumo\}\$/);
        for (const key of [
            'acoes_oni_dados',
            'acoes_oni_resumo',
            'acoes_oni_ataque_bonus',
            'acoes_oni_movimento_bonus',
            'acoes_oni_especial_bonus',
            'acoes_oni_reacao_bonus',
        ]) {
            const entry = entries.get(key);
            assert.ok(entry, `${key} existe`);
            assert.ok(inside(entry, 'config_dados_tab'), `${key} na aba GM`);
        }
    });

    it('consome e restaura ações do minion sem tocar nas keys Slayer', async () => {
        const { actor, events, patches } = trackedActor({ oni_minion_nome: 'Lacaio' }, 'Lacaio');
        assert.equal(actorKind(actor), 'oni_minion');

        const consumed = await consumeOniActions(actor, 'ataque');
        assert.equal(consumed.ok, true);
        assert.equal(actor.system.props.acoes_oni_dados, consumed.patch['system.props.acoes_oni_dados']);
        assert.match(actor.system.props.acoes_oni_resumo, /ATAQUE 0\/1/);
        await resetOniActions(actor, 'turn');
        assert.equal(JSON.parse(actor.system.props.acoes_oni_dados).turn.ataque, 0);
        assert.deepEqual(events, ['update', 'render', 'update', 'render']);
        assert.deepEqual(keysTouched(patches, 'acoes_slayer_'), [], 'Nenhuma key Slayer tocada');
    });
});
