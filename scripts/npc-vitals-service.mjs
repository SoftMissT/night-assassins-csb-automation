/**
 * @fileoverview Painel de Vida da ficha de NPC: dar dano e curar com um valor digitado.
 * Não calcula nada: o dano vai para `applyOniDamage` (que já mapeia NPC para `npc_pdv_dano`)
 * e a cura para `applyHealTo` (que mapeia para `npc_pdv_curado`).
 */
import { applyOniDamage } from './damage-relay.mjs';
import { applyHealTo } from './heal-relay.mjs';

/** @returns {number|null} inteiro positivo, ou null se o texto não for um. */
export function parseVitalAmount(raw) {
    const text = String(raw ?? '').trim();
    if (!/^\d+$/u.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function resolveActor(actorUuid) {
    const document = actorUuid ? await fromUuid(actorUuid) : null;
    return document?.actor ?? document ?? null;
}

const MODES = Object.freeze({
    damage: { title: 'Dar dano', label: 'Aplicar dano', hint: 'Dano a aplicar' },
    heal: { title: 'Recuperar vida', label: 'Curar', hint: 'PDV a recuperar' },
});

/**
 * Abre o diálogo de valor e aplica dano ou cura ao NPC.
 * @param {{actorUuid?: string, mode?: 'damage'|'heal'}} options
 */
export async function openNpcVitals({ actorUuid, mode = 'damage' } = {}) {
    const config = MODES[mode];
    if (!config) return globalThis.ui?.notifications?.error?.('Modo de vida inválido.');
    const actor = await resolveActor(actorUuid);
    if (!actor) return globalThis.ui?.notifications?.warn?.('Nenhum personagem ativo.');
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return globalThis.ui?.notifications?.error?.('Você não pode alterar a vida deste personagem.');

    const raw = await foundry.applications.api.DialogV2.prompt({
        window: { title: `${config.title}: ${actor.name}` },
        content: `<div class="form-group"><label>${config.hint}</label><input type="number" name="amount" min="1" step="1" autofocus></div>`,
        ok: {
            label: config.label,
            callback: (_event, button) => button.form.elements.amount.value,
        },
        rejectClose: false,
    });
    if (raw === null || raw === undefined) return null;
    const amount = parseVitalAmount(raw);
    if (amount === null) return globalThis.ui?.notifications?.warn?.('Digite um número inteiro maior que zero.');

    try {
        if (mode === 'damage') {
            const result = await applyOniDamage(actor, amount, { attackName: 'Dano manual', isAttack: false });
            globalThis.ui?.notifications?.info?.(`${actor.name}: ${result.appliedDamage} de dano aplicado.`);
            return result;
        }
        const result = await applyHealTo(actor, amount);
        globalThis.ui?.notifications?.info?.(`${actor.name}: ${result.appliedHeal} PDV recuperados.`);
        return result;
    } catch (error) {
        globalThis.ui?.notifications?.error?.(error?.message || 'Falha ao alterar a vida.');
        return null;
    }
}
