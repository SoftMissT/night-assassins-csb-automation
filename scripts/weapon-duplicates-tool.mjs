/**
 * @fileoverview Diagnóstico de armas duplicadas de um personagem (ferramenta do GM).
 *
 * Era a macro `na-diagnosticar-armas-duplicadas`. Nada é apagado sem confirmação
 * individual por Item; a origem da duplicata é registrada automaticamente por
 * `weapon-creation-audit` (`[NA-ARMA-DUP]`), esta ferramenta só revisa e remove.
 */

const escapeHtml = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/**
 * Agrupa as armas do Actor por nome e devolve só os grupos repetidos.
 * @param {Actor} actor
 * @returns {Array<[string, Item[]]>}
 */
export function duplicateWeaponGroups(actor) {
    const groups = new Map();
    for (const item of [...(actor?.items ?? [])]) {
        const props = item.system?.props ?? {};
        if (props.inventario_categoria !== 'arma' && !props.arma_nome) continue;
        const name = String(props.arma_nome ?? item.name ?? '').trim();
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(item);
    }
    return [...groups.entries()].filter(([, items]) => items.length > 1);
}

function groupTable(items) {
    const rows = items
        .map((item) => {
            const props = item.system?.props ?? {};
            const created = item._stats?.createdTime ?? item._source?._stats?.createdTime ?? '—';
            return `<tr><td>${escapeHtml(item.name)}</td><td><code>${escapeHtml(item.id)}</code></td><td><code>${escapeHtml(item.uuid)}</code></td><td><code>${escapeHtml(item.system?.template)}</code></td><td>${escapeHtml(props.arma_nome)}</td><td><code>${escapeHtml(props.arma_perfis_ataque_json)}</code></td><td>${escapeHtml(created)}</td></tr>`;
        })
        .join('');
    return `<div style="overflow:auto"><table><thead><tr><th>Nome</th><th>ID</th><th>UUID</th><th>Template</th><th>arma_nome</th><th>Perfis JSON</th><th>Criado</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * @param {Actor} actor
 * @returns {Promise<{groups:number, deleted:number}>}
 */
export async function diagnoseDuplicateWeapons(actor) {
    if (!globalThis.game?.user?.isGM)
        throw new Error('Somente o GM pode diagnosticar ou remover armas duplicadas.');
    if (!actor) throw new Error('Selecione um personagem para diagnosticar armas duplicadas.');
    const duplicates = duplicateWeaponGroups(actor);
    if (duplicates.length === 0) {
        ui.notifications?.info?.(`Nenhuma arma duplicada encontrada em ${actor.name}.`);
        return { groups: 0, deleted: 0 };
    }
    const { DialogV2 } = foundry.applications.api;
    let deleted = 0;
    for (const [name, items] of duplicates) {
        const review = await DialogV2.wait({
            window: { title: `Diagnóstico ${name}` },
            content: `<p>Foram encontrados <strong>${items.length}</strong> Documents distintos. Nada será apagado sem confirmação individual.</p>${groupTable(items)}`,
            buttons: [
                { action: 'review', label: 'Revisar exclusões', default: true, callback: () => true },
                { action: 'cancel', label: 'Manter todos', callback: () => false },
            ],
            rejectClose: false,
            close: () => false,
        });
        if (!review) continue;
        for (const item of items) {
            const remove = await DialogV2.confirm({
                window: { title: `Excluir ${item.name}?` },
                content: `<p>Excluir somente este Document?</p><ul><li>ID: <code>${escapeHtml(item.id)}</code></li><li>UUID: <code>${escapeHtml(item.uuid)}</code></li></ul><p><strong>Esta ação não afeta as outras armas do grupo.</strong></p>`,
                yes: { label: 'Excluir este Item' },
                no: { label: 'Manter este Item' },
                modal: true,
            });
            if (remove) {
                await actor.deleteEmbeddedDocuments('Item', [item.id]);
                deleted += 1;
            }
        }
    }
    return { groups: duplicates.length, deleted };
}
