import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBreathChatFlavor } from '../scripts/breath-service.mjs';

// Pedido do operador (2026-11-22): o chat não traz a Forma inteira, só o que a mesa usa.
test('cartão de Forma traz nome, Respiração, nível, custo e dano — sem a descrição', () => {
    const flavor = buildBreathChatFlavor({
        form: { id: 'chamas_05', nome: 'Tigre Ardente', jp: 'Go no Kata Enko', respiracao: 'Chamas', tipo: 'ataque' },
        selected: {
            level: 1, custo: 3, pdv: 0,
            efeito: '<p>Uma série de ataques...</p><table><tr><td>Nível 1</td><td>4d10</td></tr></table>',
            status: '<strong>Queimando</strong> por 2 turnos se acertar',
        },
        damageTotal: 22,
    });
    assert.match(flavor, /Tigre Ardente/);
    assert.match(flavor, /Chamas · ataque · Nível 1 · <strong>−3 PDR<\/strong>/);
    assert.match(flavor, /<span>Dano<\/span><strong>22<\/strong>/);
    assert.match(flavor, /<span>Status<\/span>Queimando por 2 turnos se acertar/);
    assert.match(flavor, /--na-breath-color:#ff7a2f/);
    assert.doesNotMatch(flavor, /<table|Uma série de ataques/, 'descrição da Forma fora do chat');
});

test('sem dano rolado, o cartão não inventa linha de dano', () => {
    const flavor = buildBreathChatFlavor({
        form: { id: 'vento_01', nome: 'Redemoinho', respiracao: 'Vento', tipo: 'ataque' },
        selected: { level: 2, custo: 4 },
    });
    assert.doesNotMatch(flavor, /<span>Dano<\/span>/);
});

test('Forma com dano: o cartão vai para a mensagem de dano do mesmo uso', async () => {
    const { pickDamageMessageForForm } = await import('../scripts/breath-service.mjs');
    const damage = { id: 'd', timestamp: 200, speaker: { actor: 'A' }, flavor: '<div class="na-damage-chat">Total: 26</div>' };
    const messages = [
        { id: 'velho', timestamp: 50, speaker: { actor: 'A' }, flavor: '<div class="na-damage-chat">Total: 5</div>' },
        { id: 'acerto', timestamp: 150, speaker: { actor: 'A' }, flavor: 'Acerto 1/2' },
        { id: 'outro', timestamp: 210, speaker: { actor: 'B' }, flavor: '<div class="na-damage-chat">Total: 9</div>' },
        damage,
    ];
    assert.equal(pickDamageMessageForForm(messages, 'A', 'velho')?.id, 'd');
    assert.equal(pickDamageMessageForForm(messages, 'A', 'd'), null, 'sem dano neste uso: cartão sai sozinho');
    const jaFundida = { ...damage, flavor: `<div class="na-breath-chat">X</div>${damage.flavor}` };
    assert.equal(pickDamageMessageForForm([jaFundida], 'A', ''), null, 'não funde duas vezes');
});
