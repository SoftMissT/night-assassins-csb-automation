import { MODULE_ID } from './constants.mjs';

/**
 * Leva os templates do compêndio do módulo para o mundo depois de uma atualização.
 *
 * Por quê: atualizar o módulo não toca nos templates do mundo, e o CSB guarda uma
 * cópia do corpo do template em cada Actor e Item (lição 39). No QA de 2026-11-22
 * as três fichas e as armas seguiam com templates antigos, e a 0.14.0 "não aparecia".
 */
export const TEMPLATE_SYNC_SETTING = 'templateSyncVersion';
const TEMPLATE_PACKS = Object.freeze([
    'night-assassins-templates-de-ficha',
    'night-assassins-armas-slayer',
    'night-assassins-respiracoes',
]);

const isTemplateType = (type) => /template/i.test(String(type ?? ''));
const versionOf = (doc) => String(doc?.system?.templateSystemUniqueVersion ?? '');

/**
 * @param {{id:string,name:string,type:string,version:string}[]} world templates do mundo
 * @param {{id:string,name:string,type:string,version:string}[]} pack templates do compêndio
 * @returns {{worldId:string, packId:string, name:string}[]} templates do mundo a atualizar
 */
export function planTemplateSync(world = [], pack = []) {
    const plan = [];
    const claimed = new Set();
    for (const source of pack) {
        // Por id e também por nome+tipo: mundos antigos importaram o template com outro id.
        const targets = world.filter(
            (doc) => doc.id === source.id || (doc.name === source.name && doc.type === source.type)
        );
        for (const target of targets) {
            if (claimed.has(target.id) || target.version === source.version) continue;
            claimed.add(target.id);
            plan.push({ worldId: target.id, packId: source.id, name: target.name, collection: source.collection });
        }
    }
    return plan;
}

const summarize = (doc, collection) => ({
    id: doc.id ?? doc._id,
    name: doc.name,
    type: doc.type,
    version: versionOf(doc),
    collection,
});

async function collectPackTemplates() {
    const out = [];
    for (const name of TEMPLATE_PACKS) {
        const pack = game.packs.get(`${MODULE_ID}.${name}`);
        if (!pack) continue;
        const index = await pack.getIndex({ fields: ['type', 'system.templateSystemUniqueVersion'] });
        for (const entry of index) if (isTemplateType(entry.type)) out.push(summarize(entry, pack.collection));
    }
    return out;
}

function worldTemplates() {
    return [...(game.actors ?? []), ...(game.items ?? [])]
        .filter((doc) => isTemplateType(doc.type))
        .map((doc) => summarize(doc));
}

export async function computeTemplateSyncPlan() {
    return planTemplateSync(worldTemplates(), await collectPackTemplates());
}

async function reloadDocuments(templateIds) {
    let reloaded = 0;
    const failures = [];
    const reload = async (doc) => {
        const id = doc?.system?.template;
        if (!id || !templateIds.has(id) || !doc.templateSystem?.reloadTemplate) return;
        try {
            await doc.templateSystem.reloadTemplate(id);
            reloaded++;
        } catch (error) {
            failures.push(`${doc.name}: ${error.message}`);
        }
    };
    for (const actor of game.actors ?? []) {
        if (isTemplateType(actor.type)) continue;
        await reload(actor);
        for (const item of actor.items ?? []) await reload(item);
    }
    for (const item of game.items ?? []) if (!isTemplateType(item.type)) await reload(item);
    // ponytail: tokens não vinculados ficam de fora; recarregam pelo botão de template da ficha.
    return { reloaded, failures };
}

/** Executa o plano: atualiza os templates no lugar e recarrega quem aponta para eles. */
export async function runTemplateSync(plan) {
    const updated = [];
    const failures = [];
    for (const step of plan) {
        const target = game.actors.get(step.worldId) ?? game.items.get(step.worldId);
        const source = await game.packs.get(step.collection)?.getDocument(step.packId);
        if (!target || !source) {
            failures.push(`${step.name}: template não encontrado`);
            continue;
        }
        try {
            await target.update({ system: source.toObject().system }, { diff: false, recursive: false });
            updated.push(step.worldId);
        } catch (error) {
            failures.push(`${step.name}: ${error.message}`);
        }
    }
    const result = await reloadDocuments(new Set(updated));
    return { templates: updated.length, reloaded: result.reloaded, failures: [...failures, ...result.failures] };
}

/** Botão do Controle GM e pergunta pós-atualização. */
export async function syncWorldTemplates({ confirm = true } = {}) {
    if (!game.user?.isGM) return ui.notifications.warn('Somente o Mestre atualiza os templates do mundo.');
    const plan = await computeTemplateSyncPlan();
    if (!plan.length) {
        ui.notifications.info('Os templates do mundo já estão na versão do módulo.');
        return { templates: 0, reloaded: 0, failures: [] };
    }
    if (confirm) {
        const names = [...new Set(plan.map((step) => step.name))].join(', ');
        const ok = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Atualizar fichas Night Assassins' },
            content: `<p>O módulo trouxe templates novos: <strong>${names}</strong>.</p>
                <p>Atualizar esses templates no mundo e recarregar as fichas e itens que os usam?
                Valores preenchidos nas fichas são mantidos.</p>`,
        });
        if (!ok) return null;
    }
    const result = await runTemplateSync(plan);
    const message = `Templates atualizados: ${result.templates}. Fichas e itens recarregados: ${result.reloaded}.`;
    if (result.failures.length) ui.notifications.warn(`${message} Falhas: ${result.failures.join('; ')}`);
    else ui.notifications.info(message);
    return result;
}

/** Pergunta uma vez por versão do módulo, só ao GM principal. */
export async function promptTemplateSyncAfterUpdate() {
    const version = game.modules.get(MODULE_ID)?.version ?? '';
    if (!version || game.settings.get(MODULE_ID, TEMPLATE_SYNC_SETTING) === version) return;
    const plan = await computeTemplateSyncPlan();
    if (plan.length) await syncWorldTemplates({ confirm: true });
    await game.settings.set(MODULE_ID, TEMPLATE_SYNC_SETTING, version);
}
