/**
 * @fileoverview Menu de ferramentas do GM (dentro do Controle GM).
 *
 * Substitui 11 macros soltas do Compêndio que nenhum template usava: o GM abria
 * cada uma pela pasta de macros. Agora são botões num único painel, sem perder
 * função. As macros que os templates chamam por UUID continuam no Compêndio.
 */

import { MODULE_ID } from './constants.mjs';
import { actorKind } from './actor-kind.mjs';
import { diagnoseDuplicateWeapons } from './weapon-duplicates-tool.mjs';

const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

const GROUPS = Object.freeze([
    { key: 'personagem', label: 'Personagem selecionado' },
    { key: 'dupla-alma', label: 'Dupla Alma (um portador)' },
    { key: 'mundo', label: 'Manutenção do mundo' },
]);

/** `actor`: opcional passa o token/personagem se houver; `single`: exige um portador. */
const manager = (apiName, nested) => async (api, actor) => {
    const target = nested ? api[nested] : api;
    await target[apiName]({ actorUuid: actor?.uuid ?? null });
};
const dualSoul = (apiName) => async (api, actor) => api[apiName]({ actor, actorUuid: actor.uuid });

async function repairSummary(api, apiName, { title, noun, nothing }) {
    const result = await api[apiName]({});
    const items = Number(result.items) || 0;
    const actors = Number(result.actors) || 0;
    const text =
        items > 0 ? `${noun} corrigidas: ${items} itens em ${actors} Caçadores.` : nothing;
    if (items > 0)
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
            content: `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(noun)} corrigidas: <strong>${items}</strong> itens em <strong>${actors}</strong> Caçadores.</p>`,
        });
    ui.notifications?.info?.(text);
}

export const GM_TOOLS = Object.freeze([
    { key: 'rest', group: 'personagem', icon: 'fa-bed', label: 'Descanso', api: 'openRestManager', kind: 'slayer', run: manager('openRestManager') },
    { key: 'status', group: 'personagem', icon: 'fa-heart-crack', label: 'Status', api: 'openStatusManager', run: manager('openStatusManager') },
    { key: 'actions', group: 'personagem', icon: 'fa-hourglass-half', label: 'Ações', api: 'openActionManager', run: manager('openActionManager') },
    { key: 'resistances', group: 'personagem', icon: 'fa-shield-halved', label: 'Resistências', api: 'openResistanceManager', kind: 'slayer', run: manager('openResistanceManager') },
    { key: 'life-death', group: 'personagem', icon: 'fa-skull', label: 'Vida e Morte', api: 'openLifeDeathManager', kind: 'slayer', run: manager('openLifeDeathManager') },
    { key: 'recovery', group: 'personagem', icon: 'fa-wind', label: 'Respiração da Recuperação', api: 'openRecoveryManager', kind: 'slayer', run: manager('openRecoveryManager') },
    { key: 'advanced-states', group: 'personagem', icon: 'fa-bolt', label: 'Estados avançados', api: 'slayer.openAdvancedStatesManager', kind: 'slayer', run: manager('openAdvancedStatesManager', 'slayer') },
    { key: 'interlude', group: 'personagem', icon: 'fa-moon', label: 'Interlúdio', api: 'openInterludeManager', kind: 'slayer', run: manager('openInterludeManager') },
    { key: 'oni-regen', group: 'personagem', icon: 'fa-droplet', label: 'Regeneração Oni', api: 'oni.regenerate', run: manager('regenerate', 'oni') },
    {
        key: 'attribute-snapshot',
        group: 'personagem',
        icon: 'fa-chart-line',
        label: 'Atributos por nível',
        api: 'runAttributeSnapshot',
        needs: 'actor',
        run: async (api, actor) => {
            const props = actor.system?.props ?? {};
            await api.runAttributeSnapshot(actor, props.nvl_pj ?? props.nvl_num);
        },
    },
    { key: 'ceremony', group: 'dupla-alma', icon: 'fa-link', label: 'Cerimônia de Vínculo', api: 'openDualSoulCeremony', needs: 'single', kind: 'slayer', run: dualSoul('openDualSoulCeremony') },
    { key: 'resistance-awakening', group: 'dupla-alma', icon: 'fa-dice-d20', label: 'Resistir ao Despertar', api: 'openDualSoulAwakeningResistance', needs: 'single', kind: 'slayer', run: dualSoul('openDualSoulAwakeningResistance') },
    { key: 'consequence', group: 'dupla-alma', icon: 'fa-scale-balanced', label: 'Resolver Consequência', api: 'openDualSoulConsequenceManager', needs: 'single', kind: 'slayer', run: dualSoul('openDualSoulConsequenceManager') },
    { key: 'awaken', group: 'dupla-alma', icon: 'fa-unlock', label: 'Retirar do selamento', api: 'awakenSpecialWeapon', needs: 'single', kind: 'slayer', run: dualSoul('awakenSpecialWeapon') },
    { key: 'diagnostic', group: 'mundo', icon: 'fa-bug', label: 'Diagnóstico de erros', api: 'openDiagnosticManager', run: async (api) => api.openDiagnosticManager() },
    {
        key: 'repair-weapons',
        group: 'mundo',
        icon: 'fa-screwdriver-wrench',
        label: 'Corrigir armas',
        api: 'repairSlayerWeaponItems',
        run: (api) =>
            repairSummary(api, 'repairSlayerWeaponItems', {
                title: 'Correção de Armas dos Caçadores',
                noun: 'Armas',
                nothing: 'Nenhuma arma precisou de correção.',
            }),
    },
    {
        key: 'repair-breathings',
        group: 'mundo',
        icon: 'fa-screwdriver-wrench',
        label: 'Corrigir Respirações',
        api: 'repairBreathingItems',
        run: (api) =>
            repairSummary(api, 'repairBreathingItems', {
                title: 'Correção de Respirações dos Caçadores',
                noun: 'Respirações',
                nothing: 'Nenhuma respiração precisou de correção.',
            }),
    },
    {
        key: 'duplicate-weapons',
        group: 'mundo',
        icon: 'fa-clone',
        label: 'Armas duplicadas',
        needs: 'actor',
        run: async (_api, actor) => diagnoseDuplicateWeapons(actor),
    },
]);

function moduleApi() {
    return globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null;
}

function hasApi(api, path) {
    return path.split('.').reduce((node, key) => node?.[key], api) instanceof Function;
}

/** Token único selecionado, ou o personagem do usuário. `null` com aviso quando exigido. */
function resolveActor(tool) {
    const controlled = globalThis.canvas?.ready ? (globalThis.canvas.tokens?.controlled ?? []) : [];
    if (controlled.length > 1 && tool.needs === 'single') {
        ui.notifications?.warn?.('Selecione somente um token.');
        return { ok: false };
    }
    const actor = controlled[0]?.actor ?? globalThis.game?.user?.character ?? null;
    if (!actor && tool.needs) {
        ui.notifications?.warn?.(
            tool.needs === 'single'
                ? 'Selecione o portador da Arma de Dupla Alma ou defina um personagem.'
                : 'Selecione um token ou defina um personagem.'
        );
        return { ok: false };
    }
    if (actor && tool.kind && actorKind(actor) !== tool.kind) {
        ui.notifications?.warn?.(
            tool.kind === 'slayer'
                ? `"${tool.label}" só funciona em Caçadores.`
                : `"${tool.label}" só funciona em Onis.`
        );
        return { ok: false };
    }
    return { ok: true, actor };
}

/**
 * Roda uma ferramenta do menu.
 * @param {string} key
 * @returns {Promise<boolean>} true quando a ferramenta foi executada sem erro
 */
export async function runGmTool(key) {
    const tool = GM_TOOLS.find((entry) => entry.key === key);
    if (!tool) return false;
    if (!globalThis.game?.user?.isGM) {
        ui.notifications?.warn?.('As ferramentas de Mestre são exclusivas do GM.');
        return false;
    }
    const api = moduleApi();
    if (tool.api && !hasApi(api ?? {}, tool.api)) {
        ui.notifications?.error?.(
            `Night Assassins: atualize e ative o módulo para usar "${tool.label}".`
        );
        return false;
    }
    const { ok, actor } = resolveActor(tool);
    if (!ok) return false;
    try {
        await tool.run(api, actor);
        return true;
    } catch (error) {
        console.error(`[${MODULE_ID}] Falha na ferramenta ${tool.key}`, error);
        ui.notifications?.error?.(error?.message || `Falha em "${tool.label}".`);
        return false;
    }
}

/** Marcação do menu: um botão por ferramenta, agrupado. */
export function gmToolsMarkup() {
    const sections = GROUPS.map((group) => {
        const buttons = GM_TOOLS.filter((tool) => tool.group === group.key)
            .map(
                (tool) =>
                    `<button type="button" class="na-gm-tool" data-gm-tool="${tool.key}"><i class="fa-solid ${tool.icon}" aria-hidden="true"></i><span>${escapeHtml(tool.label)}</span></button>`
            )
            .join('');
        return `<div class="na-gm-tool-group"><h4>${escapeHtml(group.label)}</h4><div class="na-gm-tool-grid">${buttons}</div></div>`;
    }).join('');
    return `<details class="na-gm-tools"><summary>Ferramentas do GM</summary>${sections}</details>`;
}
