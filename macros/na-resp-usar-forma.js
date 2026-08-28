// Night Assassins Usar Forma de Respiração
// Compatível com Foundry VTT 14+ / Custom System Builder
// Lançador universal: resolve o item da técnica de forma defensiva
// (actorUuid → itemUuid → forma_id → itemName → seletor de formas).
//
// Uso por item/CSB:
// game.macros.getName("na-resp-usar-forma")?.execute({
//   actorUuid: entity.parent?.uuid,
//   itemUuid: entity.uuid,
//   formaId: entity.system?.props?.forma_id,
//   itemName: entity.name
// });

const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.useBreathForm) {
    ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
    return '';
}

const input = typeof scope !== 'undefined' && scope ? scope : {};

async function resolveActor() {
    if (input.actorUuid) {
        const doc = await fromUuid(input.actorUuid);
        const candidate = doc?.actor ?? doc;
        if (candidate?.system?.props) return candidate;
    }
    return canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
}

function getProps(doc) {
    return doc?.system?.props ?? {};
}

async function resolveItem(actor) {
    if (input.itemUuid) {
        const item = await fromUuid(input.itemUuid);
        if (item) return item;
    }

    const formaId = String(input.formaId ?? '').trim();
    if (formaId && actor?.items) {
        const owned = actor.items.find((item) => {
            const props = getProps(item);
            return String(props.forma_id ?? '') === formaId;
        });
        if (owned) return owned;
    }

    if (input.itemName && actor?.items) {
        const wanted = String(input.itemName).toLowerCase().trim();
        const owned = actor.items.find((item) => item.name.toLowerCase().includes(wanted));
        if (owned) return owned;
    }

    const respiracoes =
        actor?.items?.filter((item) => {
            const props = getProps(item);
            return String(props.inventario_categoria ?? '') === 'respiracao';
        }) ?? [];

    if (respiracoes.length === 1) return respiracoes[0];

    if (respiracoes.length > 1) {
        const options = respiracoes
            .sort(
                (a, b) =>
                    Number(getProps(a).forma_ordem ?? 999) - Number(getProps(b).forma_ordem ?? 999)
            )
            .map((item) => {
                const props = getProps(item);
                const label = `${props.respiracao_nome ?? 'Respiração'} ${props.nome_forma ?? item.name}`;
                return `<option value="${item.uuid}">${label}</option>`;
            })
            .join('');

        const chosenUuid = await foundry.applications.api.DialogV2.wait({
            window: { title: 'Usar Forma de Respiração' },
            content: `
        <div style="display:grid;gap:8px">
          <p>Escolha a forma que deseja usar.</p>
          <select id="na-resp-item" style="width:100%">${options}</select>
        </div>
      `,
            modal: true,
            rejectClose: false,
            buttons: [
                {
                    action: 'usar',
                    label: 'Usar Forma',
                    callback: (_event, _button, dialog) =>
                        String(dialog.element.querySelector('#na-resp-item')?.value ?? ''),
                },
                {
                    action: 'cancelar',
                    label: 'Cancelar',
                    callback: () => null,
                },
            ],
        });

        return chosenUuid ? fromUuid(chosenUuid) : null;
    }

    return null;
}

const actor = await resolveActor();
if (!actor) {
    ui.notifications.warn('Selecione um token ou defina um personagem ativo.');
    return '';
}

if (!actor.isOwner) {
    ui.notifications.error('Você não pode usar técnicas com este personagem.');
    return '';
}

const item = await resolveItem(actor);
if (!item) {
    ui.notifications.warn('Nenhuma Forma de Respiração encontrada neste personagem.');
    return '';
}

await moduleApi.useBreathForm({
    actorUuid: actor.uuid,
    itemUuid: item.uuid,
});

return '';
