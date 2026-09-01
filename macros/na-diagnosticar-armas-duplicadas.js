if (!game.user?.isGM) {
    ui.notifications.warn('Somente o GM pode diagnosticar ou remover armas duplicadas.');
    return '';
}

const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
if (!actor) {
    ui.notifications.warn('Selecione um token ou defina um personagem para diagnosticar.');
    return '';
}

const escapeHtml = (value) => foundry.utils.escapeHTML(String(value ?? ''));
const weapons = [...actor.items].filter((item) => {
    const props = item.system?.props ?? {};
    return props.inventario_categoria === 'arma' || Boolean(props.arma_nome);
});
const groups = new Map();
for (const item of weapons) {
    const name = String(item.system?.props?.arma_nome ?? item.name ?? '').trim();
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
}
const duplicates = [...groups.entries()].filter(([, items]) => items.length > 1);

if (duplicates.length === 0) {
    ui.notifications.info(`Nenhuma arma duplicada encontrada em ${actor.name}.`);
    return '';
}

const { DialogV2 } = foundry.applications.api;
for (const [name, items] of duplicates) {
    const rows = items
        .map((item) => {
            const props = item.system?.props ?? {};
            const createdTime = item._stats?.createdTime ?? item._source?._stats?.createdTime ?? '—';
            return `<tr><td>${escapeHtml(item.name)}</td><td><code>${escapeHtml(item.id)}</code></td><td><code>${escapeHtml(item.uuid)}</code></td><td><code>${escapeHtml(item.system?.template)}</code></td><td>${escapeHtml(props.arma_nome)}</td><td><code>${escapeHtml(props.arma_perfis_ataque_json)}</code></td><td>${escapeHtml(createdTime)}</td></tr>`;
        })
        .join('');
    await DialogV2.wait({
        window: { title: `Diagnóstico — ${name}` },
        content: `<p>Foram encontrados <strong>${items.length}</strong> Documents distintos. Nada será apagado sem confirmação individual.</p><div style="overflow:auto"><table><thead><tr><th>Nome</th><th>ID</th><th>UUID</th><th>Template</th><th>arma_nome</th><th>Perfis JSON</th><th>Criado</th></tr></thead><tbody>${rows}</tbody></table></div>`,
        buttons: [
            {
                action: 'review',
                label: 'Revisar exclusões',
                default: true,
                callback: () => true,
            },
            { action: 'cancel', label: 'Manter todos', callback: () => false },
        ],
        close: () => false,
    }).then(async (review) => {
        if (!review) return;
        for (const item of items) {
            const remove = await DialogV2.confirm({
                window: { title: `Excluir ${item.name}?` },
                content: `<p>Excluir somente este Document?</p><ul><li>ID: <code>${escapeHtml(item.id)}</code></li><li>UUID: <code>${escapeHtml(item.uuid)}</code></li></ul><p><strong>Esta ação não afeta as outras armas do grupo.</strong></p>`,
                yes: { label: 'Excluir este Item' },
                no: { label: 'Manter este Item' },
                modal: true,
            });
            if (remove) await actor.deleteEmbeddedDocuments('Item', [item.id]);
        }
    });
}

return '';
