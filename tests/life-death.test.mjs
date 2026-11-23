import assert from 'node:assert/strict';
import test from 'node:test';
import {
    defaultLifeDeathState,
    formatLifeDeathSummary,
    parseLifeDeathState,
    reconcileActor,
    slayerCurrentPdv,
    slayerMaxPdv,
} from '../scripts/life-death-service.mjs';

function baseProps(overrides = {}) {
    return {
        pdv_slayer_total_conta: 20,
        pdv_slayer_dano_tomado: 0,
        pdv_slayer_dano_ferida: 0,
        pdv_slayer_extra: 0,
        pdv_slayer_curado: 0,
        status_slayer_exaustao: 0,
        status_slayer_dados: '',
        vida_morte_slayer_dados: JSON.stringify(defaultLifeDeathState()),
        vit_display: 2,
        ...overrides,
    };
}

function makeActor(overrides = {}) {
    const updates = [];
    const actor = {
        id: 'actor-1',
        uuid: 'Actor.actor-1',
        name: 'Rin',
        system: { props: baseProps(overrides) },
        update: async (...args) => {
            updates.push(args);
            return actor;
        },
    };
    return { actor, updates };
}

function stubGlobals(dialogResult = { action: 'fall' }) {
    globalThis.ChatMessage = {
        getSpeaker: () => ({}),
        create: async (msg) => {
            chatMessages.push(msg);
            return {};
        },
    };
    const chatMessages = [];
    globalThis.chatMessages = chatMessages;
    globalThis.game = {
        combats: [],
        user: { isGM: true, id: 'gm' },
        users: [{ id: 'gm', isGM: true, active: true }],
    };
    globalThis.Roll = {
        create: () => ({
            evaluate: async () => ({
                total: 21,
                dice: [{ results: [{ result: 20 }] }],
                toMessage: async () => {},
            }),
        }),
    };
    globalThis.foundry = {
        applications: { api: { DialogV2: { wait: async () => dialogResult } } },
    };
}

function lastVidaMorte(updates) {
    const patch = updates[updates.length - 1][0];
    return JSON.parse(patch['system.props.vida_morte_slayer_dados']);
}

function lastStatus(updates) {
    for (let i = updates.length - 1; i >= 0; i--) {
        const patch = updates[i][0];
        if (patch['system.props.status_slayer_dados'])
            return JSON.parse(patch['system.props.status_slayer_dados']);
    }
    return null;
}

test('Vida e Morte cria estado Slayer canônico', () => {
    assert.deepEqual(parseLifeDeathState(''), defaultLifeDeathState());
});

test('Vida e Morte normaliza estado persistido pelo CSB', () => {
    const state = parseLifeDeathState(
        '&quot;{&quot;dying&quot;:true,&quot;deathMarks&quot;:9,&quot;fallsThisCombat&quot;:2}&quot;'
    );
    assert.equal(state.dying, true);
    assert.equal(state.deathMarks, 3);
    assert.equal(state.fallsThisCombat, 2);
});

test('Vida e Morte calcula PDV pelas parcelas numéricas canônicas', () => {
    assert.equal(
        slayerCurrentPdv({
            pdv_slayer_total_conta: 20,
            pdv_slayer_dano_ferida: 2,
            pdv_slayer_extra: 3,
            pdv_slayer_curado: 4,
            pdv_slayer_dano_tomado: 10,
        }),
        15
    );
});

test('Vida e Morte calcula PDV máximo abatendo Dano de Ferida', () => {
    assert.equal(
        slayerMaxPdv({
            pdv_slayer_total_conta: 20,
            pdv_slayer_dano_ferida: 2,
            pdv_slayer_extra: 3,
        }),
        21
    );
    assert.equal(slayerMaxPdv({ pdv_slayer_total_conta: 20, pdv_slayer_dano_ferida: 30 }), 0);
    assert.equal(slayerMaxPdv({ pdv_slayer_total_conta: 20, pdv_slayer_total: 28, pdv_slayer_dano_ferida: 2, pdv_slayer_extra: 3 }), 31);
    assert.equal(slayerMaxPdv({ pdv_slayer_total_conta: 20, pdv_slayer_total: 0 }), 0);
});

test('Vida e Morte apresenta estado legível', () => {
    assert.equal(
        formatLifeDeathSummary({ ...defaultLifeDeathState(), dying: true, deathMarks: 2 }),
        'À Beira da Morte · 2/3 Marcas'
    );
    assert.equal(
        formatLifeDeathSummary({
            ...defaultLifeDeathState(),
            dying: true,
            stabilized: true,
            deathMarks: 1,
        }),
        'À Beira da Morte · Estabilizado · 1/3 Marcas'
    );
    assert.equal(formatLifeDeathSummary({ ...defaultLifeDeathState(), dead: true }), 'Morto');
});

test('Vida e Morte preserva <br> real do motivo e escapa o restante', async () => {
    const { escapeReason } = await import('../scripts/life-death-service.mjs');
    const out = escapeReason("<script>x</script><br>A morte foi aceita.");
    assert.equal(out, '&lt;script&gt;x&lt;/script&gt;<br>A morte foi aceita.');
    assert.equal(escapeReason(undefined), '');
});

test('Vida e Morte sanitiza nome do actor e motivo no ChatMessage contra XSS', async () => {
    const chatMessages = [];
    globalThis.ChatMessage = {
        getSpeaker: () => ({}),
        create: async (msg) => {
            chatMessages.push(msg);
            return {};
        },
    };
    globalThis.game = {
        combats: [],
        user: { isGM: true },
        users: [{ id: 'gm', isGM: true, active: true }],
    };
    globalThis.Roll = {
        create: () => ({
            evaluate: async () => ({
                total: 1,
                dice: [{ results: [{ result: 1 }] }],
                toMessage: async () => {},
            }),
        }),
    };

    const maliciousActor = {
        name: "<script>alert('xss')</script>",
        system: {
            props: {
                vida_morte_slayer_dados: JSON.stringify({
                    dying: true,
                    stabilized: false,
                    dead: false,
                }),
                pdv_slayer_total_conta: 20,
                pdv_slayer_dano_tomado: 20,
                vit_display: 2,
            },
        },
        update: async () => {},
    };

    const { processDeathTest } = await import('../scripts/life-death-service.mjs');
    await processDeathTest(maliciousActor, { force: true });

    assert.ok(chatMessages.length > 0);
    const reviveMessage = chatMessages.find((m) => m.content.includes('voltou com'));
    assert.ok(reviveMessage, 'Mensagem de revive deve ter sido gerada');
    assert.ok(
        !reviveMessage.content.includes('<script>'),
        'Conteúdo do chat não deve conter tags <script> não escapadas'
    );
    assert.ok(
        reviveMessage.content.includes('&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;'),
        'Nome do actor deve estar escapado em HTML'
    );
});

test('reconcileActor derruba o Slayer na primeira queda', async () => {
    stubGlobals();
    const { actor, updates } = makeActor({ pdv_slayer_dano_tomado: 20 });
    await reconcileActor(actor);
    const state = lastVidaMorte(updates);
    assert.equal(state.dying, true);
    assert.equal(state.fallsThisCombat, 1);
    assert.equal(state.deathMarks, 0);
    const status = lastStatus(updates);
    assert.ok(status.active.includes('derrubado'));
});

test('Última Chance só evita a queda se o PDV após a cura ficar acima de zero', async () => {
    for (const [damage, healedPdv] of [[20, 2], [30, 0]]) {
        stubGlobals();
        globalThis.Roll = class {
            static create() { return { evaluate: async () => ({ total: 15, toMessage: async () => {} }) }; }
            async evaluate() { return { total: 2, toMessage: async () => {} }; }
        };
        const { actor, updates } = makeActor({
            nvl_num: 4,
            pdv_slayer_dano_tomado: damage,
            status_slayer_dados: JSON.stringify({ active: ['sangramento'], effects: {} }),
        });
        const update = actor.update;
        actor.update = async (patch, options) => {
            for (const [key, value] of Object.entries(patch)) {
                actor.system.props[key.replace('system.props.', '')] = value;
            }
            return update(patch, options);
        };
        await reconcileActor(actor);
        assert.equal(slayerCurrentPdv(actor.system.props), healedPdv);
        assert.equal(parseLifeDeathState(actor.system.props.vida_morte_slayer_dados).dying, healedPdv === 0);
        assert.equal(lastStatus(updates).active.includes('sangramento'), false);
    }
});

test('reconcileActor dá +1 Marca a dano comum no chão', async () => {
    stubGlobals();
    const { actor, updates } = makeActor({
        pdv_slayer_dano_tomado: 20,
        vida_morte_slayer_dados: JSON.stringify({
            ...defaultLifeDeathState(),
            dying: true,
            lastDamage: 0,
        }),
    });
    await reconcileActor(actor);
    const state = lastVidaMorte(updates);
    assert.equal(state.dying, true);
    assert.equal(state.deathMarks, 1);
});

test('reconcileActor leva a Dano crítico no chão à Determinação Final', async () => {
    stubGlobals({ motive: '' });
    const { actor, updates } = makeActor({
        pdv_slayer_dano_tomado: 20,
        vida_morte_slayer_dados: JSON.stringify({
            ...defaultLifeDeathState(),
            dying: true,
            lastDamage: 0,
        }),
    });
    await reconcileActor(actor, { naCritical: true });
    const state = lastVidaMorte(updates);
    assert.equal(state.dead, true);
});

test('reconcileActor mata por Dano de Ferida zerando o máximo (Regra 11)', async () => {
    stubGlobals({ action: 'die', reason: 'Ferida devastadora' });
    const { actor, updates } = makeActor({ pdv_slayer_dano_ferida: 30 });
    await reconcileActor(actor);
    const state = lastVidaMorte(updates);
    assert.equal(state.dead, true);
    assert.ok(chatMessages.some((m) => m.content.includes('Ferida devastadora')));
});

test('reconcileActor converte cura a 0 PDV em revive com Sem Reação e Desequilibrado', async () => {
    stubGlobals();
    const { actor, updates } = makeActor({
        pdv_slayer_dano_tomado: 15,
        vida_morte_slayer_dados: JSON.stringify({
            ...defaultLifeDeathState(),
            dying: true,
            lastDamage: 15,
        }),
    });
    await reconcileActor(actor);
    const state = lastVidaMorte(updates);
    assert.equal(state.dying, false);
    const status = lastStatus(updates);
    assert.ok(status.active.includes('sem_reacao'));
    assert.ok(status.active.includes('desequilibrado'));
    assert.equal(status.exhaustion, 1);
});

test('reconcileActor grava o snapshot de dano comum sem re-renderizar a ficha', async () => {
    stubGlobals();
    const { actor, updates } = makeActor({ pdv_slayer_dano_tomado: 5 });
    await reconcileActor(actor);
    assert.equal(updates.length, 1, 'dano comum de pé gera só a gravação do snapshot');
    const [patch, options] = updates[0];
    assert.equal(JSON.parse(patch['system.props.vida_morte_slayer_dados']).lastDamage, 5);
    assert.equal(options.render, false, 'snapshot sem mudança visível não pode re-renderizar a ficha');
});
