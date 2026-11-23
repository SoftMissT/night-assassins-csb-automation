import { MODULE_ID } from './constants.mjs';

const WEAPON_PACK_ID = `${MODULE_ID}.night-assassins-armas-slayer`;
const TEMPLATE_ID = 'NAWeaponTpl00001';
const GENERIC_TEMPLATE_ID = 'NAGenericItem001';
const SPECIAL_TEMPLATE_ID = 'NASpecialWeaponTpl00001';
const SPECIAL_WEAPON_ICON = `modules/${MODULE_ID}/assets/icons/items/na_Slayer_Weapon_icon.webp`;

export const GENERIC_ITEM_ICON = `modules/${MODULE_ID}/assets/icons/items/na-Generic_Item_icon.svg`;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function asHtml(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return `<p>${escapeHtml(text).replaceAll('\n', '<br>')}</p>`;
}

function sourceDocument(document) {
    if (!document) return null;
    if (typeof document.toObject === 'function') return document.toObject();
    return structuredClone(document);
}

export function catalogItemChoices(documents = []) {
    return documents
        .filter((document) => document?.type === 'equippableItem' && document.system?.props?.arma_nome)
        .map((document) => ({
            id: String(document._id ?? document.id ?? document.name),
            name: String(document.name ?? document.system.props.arma_nome),
            category: String(document.system.props.arma_categoria ?? 'basica'),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

export function catalogItemData(document, templateId = '') {
    const source = sourceDocument(document);
    if (!source?.system?.props?.arma_nome) return null;
    const { _id, _key, folder, sort, sorting, _stats, ...data } = source;
    return {
        ...data,
        system: { ...data.system, template: templateId || data.system.template || TEMPLATE_ID },
        flags: {
            ...(data.flags ?? {}),
            [MODULE_ID]: { ...(data.flags?.[MODULE_ID] ?? {}), createdFromCatalog: true },
        },
    };
}

export async function createCatalogItem(actor, document, { templateId = TEMPLATE_ID } = {}) {
    if (!actor?.createEmbeddedDocuments)
        return { ok: false, reason: 'Actor inválido.' };
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return { ok: false, reason: 'Você não pode criar Item nesta ficha.' };
    const data = catalogItemData(document, templateId);
    if (!data) return { ok: false, reason: 'Item do catálogo inválido.' };
    const created = await actor.createEmbeddedDocuments('Item', [data], {
        naCsbAutomation: true,
        naCatalogItem: true,
    });
    return { ok: true, item: created?.[0] ?? null };
}

async function resolveActor(actorUuid) {
    const document = actorUuid ? await globalThis.fromUuid?.(actorUuid) : null;
    const controlledActor = globalThis.canvas?.ready
        ? globalThis.canvas.tokens?.controlled?.[0]?.actor
        : null;
    return document?.actor ?? document ?? controlledActor ?? globalThis.game?.user?.character ?? null;
}

// `NASpecialWeaponTpl00001` tem 23 caracteres: o Foundry recusa o keepId (exige 16) e o
// CSB grava o id aleatório também em `uniqueId`. Sem casar pelo nome, cada uso de Criar
// Arma Especial importava outra cópia do template (QA 2026-11-22: 4 cópias no mundo).
// ponytail: casamento por nome; trocar o id por um de 16 caracteres exige migrar as armas já criadas.
const TEMPLATE_NAMES = Object.freeze({ [SPECIAL_TEMPLATE_ID]: 'NA Arma Especial - Slayer' });

const isTemplate = (item, templateKey) =>
    item?.type === '_equippableItemTemplate' &&
    (item.id === templateKey ||
        item.system?.uniqueId === templateKey ||
        (Boolean(TEMPLATE_NAMES[templateKey]) && item.name === TEMPLATE_NAMES[templateKey]));

export async function resolveTemplateId(actor, pack, templateKey = TEMPLATE_ID) {
    const owned = [...(actor?.items ?? [])].find((item) => isTemplate(item, templateKey));
    if (owned) return owned.id;
    const world =
        globalThis.game?.items?.get?.(templateKey) ??
        globalThis.game?.items?.find?.((item) => isTemplate(item, templateKey));
    if (world) return world.id;
    if (!globalThis.game?.user?.isGM || !pack) return '';
    const imported = await globalThis.game.items.importFromCompendium(pack, templateKey, {}, { keepId: true });
    return imported?.id ?? '';
}

/** Item genérico: dados normalizados para o template NA Item Genérico. */
export function genericItemData(values = {}, templateId = GENERIC_TEMPLATE_ID) {
    const name = String(values.name ?? '').trim();
    if (!name) return null;
    const quantity = Math.max(0, Math.trunc(Number(values.quantity) || 0));
    const spaces = Math.max(0, Math.trunc(Number(values.spaces) || 0));
    return {
        name,
        type: 'equippableItem',
        img: GENERIC_ITEM_ICON,
        system: {
            template: templateId,
            props: {
                inventario_categoria: 'item',
                item_nome: name,
                item_raridade: String(values.rarity ?? '').trim(),
                item_preco: String(values.price ?? '').trim(),
                item_quantidade: quantity,
                item_espacos: spaces,
                item_efeito: String(values.effect ?? '').trim(),
                item_historia: String(values.history ?? '').trim(),
            },
        },
        flags: {
            [MODULE_ID]: { createdByMacro: true },
        },
    };
}

export async function createGenericItem(actor, values, { templateId = GENERIC_TEMPLATE_ID } = {}) {
    if (!actor?.createEmbeddedDocuments) return { ok: false, reason: 'Actor inválido.' };
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return { ok: false, reason: 'Você não pode criar Item nesta ficha.' };
    const data = genericItemData(values, templateId);
    if (!data) return { ok: false, reason: 'Informe o nome do Item.' };
    const created = await actor.createEmbeddedDocuments('Item', [data], {
        naCsbAutomation: true,
        naGenericItem: true,
    });
    const item = created?.[0] ?? null;
    if (item?.templateSystem?.reloadTemplate) {
        try {
            await item.templateSystem.reloadTemplate(templateId);
        } catch {
            // O Item já existe; a ficha abre com os campos padrão do template.
        }
    }
    item?.sheet?.render?.({ force: true });
    return { ok: true, item };
}

async function chooseItemRecipient() {
    const candidates = [...(globalThis.game?.actors ?? [])].filter(
        (actor) => actor.isOwner && actor.type === 'character'
    );
    if (candidates.length === 0) {
        globalThis.ui?.notifications?.warn?.('Nenhuma ficha disponível para receber o Item.');
        return null;
    }
    const options = candidates
        .map((actor) => `<option value="${escapeHtml(actor.id)}">${escapeHtml(actor.name)}</option>`)
        .join('');
    const id = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Criar Item' },
        content: `<div class="na-item-creator"><label>Ficha de destino <select name="recipient" required>
            <option value="">Selecione uma ficha</option>${options}</select></label></div>`,
        rejectClose: false,
        buttons: [
            { action: 'cancelar', label: 'Cancelar', callback: () => null },
            {
                action: 'continuar',
                label: 'Continuar',
                default: true,
                callback: (_event, button) => button.form.elements.recipient.value || null,
            },
        ],
    });
    return id ? (globalThis.game.actors.get(id) ?? null) : null;
}

export async function openGenericItemCreator({ actorUuid } = {}) {
    if (!globalThis.game?.user?.isGM)
        return globalThis.ui?.notifications?.warn?.('O criador de Item é exclusivo do GM.');
    let actor = await resolveActor(actorUuid);
    if (!actor) {
        actor = await chooseItemRecipient();
        if (!actor) return null;
    }
    if (!actor.isOwner || typeof actor.createEmbeddedDocuments !== 'function')
        return globalThis.ui?.notifications?.warn?.('Selecione uma ficha que você possa editar.');
    const pack = globalThis.game?.packs?.get?.(WEAPON_PACK_ID);
    if (!pack)
        return globalThis.ui?.notifications?.error?.('Compêndio canônico de itens não encontrado.');
    const templateId = await resolveTemplateId(actor, pack, GENERIC_TEMPLATE_ID);
    if (!templateId)
        return globalThis.ui?.notifications?.warn?.('Template NA Item Genérico ausente neste mundo.');
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: `Criar Item — ${actor.name ?? 'Ficha'}` },
        position: { width: 520 },
        content: `<div class="na-item-creator">
            <label>Nome <input name="nome" required maxlength="70" autofocus></label>
            <label>Raridade <input name="raridade" maxlength="20"></label>
            <label>Preço <input name="preco" maxlength="60"></label>
            <label>Quantidade <input name="quantidade" type="number" min="0" max="999" value="1"></label>
            <label>Espaço <input name="espacos" type="number" min="0" max="999" value="0"></label>
            <label>Efeito <textarea name="efeito" rows="3"></textarea></label>
            <label>História <textarea name="historia" rows="3"></textarea></label>
        </div>`,
        rejectClose: false,
        buttons: [
            {
                action: 'criar',
                label: 'Criar Item',
                default: true,
                callback: (_event, button) => ({
                    name: button.form.elements.nome.value,
                    rarity: button.form.elements.raridade.value,
                    price: button.form.elements.preco.value,
                    quantity: button.form.elements.quantidade.value,
                    spaces: button.form.elements.espacos.value,
                    effect: button.form.elements.efeito.value,
                    history: button.form.elements.historia.value,
                }),
            },
            { action: 'cancelar', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!result) return null;
    const created = await createGenericItem(actor, result, { templateId });
    if (created.ok)
        globalThis.ui?.notifications?.info?.(`${created.item?.name ?? 'Item'} adicionado a ${actor.name}.`);
    else globalThis.ui?.notifications?.warn?.(created.reason);
    return created;
}

/** Arma especial: dados normalizados para o template NA Arma Especial - Slayer. */
export function specialWeaponData(values = {}, templateId = SPECIAL_TEMPLATE_ID) {
    const name = String(values.name ?? '').trim();
    if (!name) return null;
    const entity = String(values.entity ?? '').trim();
    const demon = String(values.demon ?? '').trim();
    const sealedName = String(values.sealedName ?? '').trim() || 'Forma Selada';
    const firstName = String(values.firstAwakening ?? '').trim() || 'Primeiro Despertar';
    const bondIntensity = String(values.bondIntensity ?? '').trim();
    const bondValue = Math.max(0, Math.trunc(Number(values.bondValue) || 0));
    const ritual = String(values.ritual ?? '').trim();
    const states = [
        {
            id: 'selado',
            nome: `Estado Selado: ${sealedName}`,
            estado: 'Selado',
            forma: sealedName,
            regras: [],
            bloqueios: [
                `nenhum efeito de ${entity || 'Entidade'} fica ativo`,
                `nenhum efeito de ${demon || 'Demônio'} fica ativo`,
            ],
        },
        {
            id: 'primeiro_despertar',
            nome: `Primeiro Despertar: ${firstName}`,
            estado: 'Primeiro Despertar',
            forma: firstName,
            ritual,
        },
    ];
    return {
        name,
        type: 'equippableItem',
        img: SPECIAL_WEAPON_ICON,
        system: {
            template: templateId,
            props: {
                inventario_categoria: 'arma',
                arma_nome: name,
                arma_categoria: 'especial',
                arma_tipo: 'Arma Especial',
                arma_entidade: entity,
                arma_demonio: demon,
                arma_lado_dominante: String(values.dominantSide ?? '').trim(),
                arma_vinculo_intensidade: bondIntensity,
                arma_vinculo_valor: bondValue,
                arma_gatilho_despertar: String(values.awakeningTrigger ?? '').trim(),
                arma_reacao_entidade: String(values.entityReaction ?? '').trim(),
                arma_especial_estado_atual: 'Selado',
                arma_especial_forma_atual: sealedName,
                arma_especial_recurso_resumo: '',
                arma_especial_estados_json: JSON.stringify(states),
                arma_especial_habilidades_json: '{}',
                arma_especial_rank_effects_json: '{}',
                arma_especial_integracao_json: '{}',
                dupla_alma_vinculo_json: JSON.stringify({
                    entidade: entity,
                    demonio: demon,
                    intensidade: bondIntensity,
                    valor: bondValue,
                    teste_2: {},
                }),
                dupla_alma_cerimonia_json: '{}',
                dupla_alma_despertar_json: '{}',
                dupla_alma_despertar_runtime_json: '{}',
                arma_especial_despertar_runtime_json: '{}',
                arma_marcas_demonio_tabela_json: JSON.stringify({ bonus: {}, consequencias: {} }),
                arma_marcas_demonio: 0,
                descricao: asHtml(values.description),
                arma_regra_completa: asHtml(values.rules),
            },
        },
        flags: {
            [MODULE_ID]: { createdByMacro: true },
        },
    };
}

async function finishSpecialWeapon(item, templateId) {
    if (item?.templateSystem?.reloadTemplate) {
        try {
            await item.templateSystem.reloadTemplate(templateId);
        } catch {
            // O Item já existe; a ficha abre com os campos padrão do template.
        }
    }
    item?.sheet?.render?.({ force: true });
    return item;
}

export async function createSpecialWeapon(actor, values, { templateId = SPECIAL_TEMPLATE_ID } = {}) {
    const data = specialWeaponData(values, templateId);
    if (!data) return { ok: false, reason: 'Informe o nome da arma.' };
    if (actor) {
        if (!actor.createEmbeddedDocuments) return { ok: false, reason: 'Actor inválido.' };
        if (!actor.isOwner && !globalThis.game?.user?.isGM)
            return { ok: false, reason: 'Você não pode criar Item nesta ficha.' };
        const created = await actor.createEmbeddedDocuments('Item', [data], {
            naCsbAutomation: true,
            naSpecialWeapon: true,
        });
        return { ok: true, item: await finishSpecialWeapon(created?.[0], templateId) };
    }
    const create = globalThis.Item?.implementation?.createDocuments;
    if (typeof create !== 'function')
        return { ok: false, reason: 'Não foi possível criar o Item no mundo.' };
    const created = await create([data]);
    return { ok: true, item: await finishSpecialWeapon(created?.[0], templateId) };
}

export async function openSpecialWeaponCreator({ actorUuid } = {}) {
    if (!globalThis.game?.user?.isGM)
        return globalThis.ui?.notifications?.warn?.('O criador de Armas Especiais é exclusivo do GM.');
    const actor = await resolveActor(actorUuid);
    const pack = globalThis.game?.packs?.get?.(WEAPON_PACK_ID);
    if (!pack)
        return globalThis.ui?.notifications?.error?.('Compêndio canônico de armas não encontrado.');
    const templateId = await resolveTemplateId(actor, pack, SPECIAL_TEMPLATE_ID);
    if (!templateId)
        return globalThis.ui?.notifications?.warn?.('Template NA Arma Especial ausente neste mundo.');
    const destination = actor
        ? `<option value="mundo">Itens do mundo</option><option value="ator">${escapeHtml(actor.name)}</option>`
        : '<option value="mundo">Itens do mundo</option>';
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Criar Arma Especial' },
        position: { width: 620 },
        content: `<div class="na-special-weapon-creator">
            <label>Nome <input name="nome" required maxlength="70" autofocus></label>
            <label>Salvar em <select name="destino">${destination}</select></label>
            <label>Entidade <input name="entidade" maxlength="70"></label>
            <label>Demônio <input name="demonio" maxlength="70"></label>
            <label>Lado dominante <input name="lado" maxlength="70"></label>
            <label>Intensidade do vínculo <input name="intensidade" maxlength="70"></label>
            <label>Valor de vínculo <input name="valor" type="number" min="0" max="999" value="0"></label>
            <label>Nome do estado selado <input name="selado" maxlength="70"></label>
            <label>Nome do primeiro despertar <input name="despertar" maxlength="70"></label>
            <label>Ritual <input name="ritual" maxlength="140"></label>
            <label>Gatilho de despertar <input name="gatilho" maxlength="140"></label>
            <label>Reação da Entidade <input name="reacao" maxlength="140"></label>
            <label>Descrição curta <textarea name="descricao" rows="2"></textarea></label>
            <label>Regras, técnicas e despertar <textarea name="regras" rows="3"></textarea></label>
        </div>`,
        rejectClose: false,
        buttons: [
            {
                action: 'criar',
                label: 'Criar Arma Especial',
                default: true,
                callback: (_event, button) => ({
                    name: button.form.elements.nome.value,
                    destination: button.form.elements.destino.value,
                    entity: button.form.elements.entidade.value,
                    demon: button.form.elements.demonio.value,
                    dominantSide: button.form.elements.lado.value,
                    bondIntensity: button.form.elements.intensidade.value,
                    bondValue: button.form.elements.valor.value,
                    sealedName: button.form.elements.selado.value,
                    firstAwakening: button.form.elements.despertar.value,
                    ritual: button.form.elements.ritual.value,
                    awakeningTrigger: button.form.elements.gatilho.value,
                    entityReaction: button.form.elements.reacao.value,
                    description: button.form.elements.descricao.value,
                    rules: button.form.elements.regras.value,
                }),
            },
            { action: 'cancelar', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!result) return null;
    const target = result.destination === 'ator' && actor ? actor : null;
    const created = await createSpecialWeapon(target, result, { templateId });
    if (created.ok) {
        const where = target ? ` em ${target.name}` : ' nos Itens do mundo';
        globalThis.ui?.notifications?.info?.(`${created.item?.name ?? 'Arma Especial'} criada${where}.`);
    } else {
        globalThis.ui?.notifications?.warn?.(created.reason);
    }
    return created;
}

export async function openItemCreator({ actorUuid } = {}) {
    if (!globalThis.game?.user?.isGM) return globalThis.ui?.notifications?.warn?.('O criador de Item é exclusivo do GM.');
    const actor = await resolveActor(actorUuid);
    if (!actor) return globalThis.ui?.notifications?.warn?.('Selecione uma ficha para receber o Item.');
    const pack = globalThis.game?.packs?.get?.(WEAPON_PACK_ID);
    if (!pack) return globalThis.ui?.notifications?.error?.('Compêndio canônico de armas não encontrado.');
    const documents = await pack.getDocuments();
    const choices = catalogItemChoices(documents);
    if (choices.length === 0) return globalThis.ui?.notifications?.warn?.('Nenhum Item canônico disponível.');
    const options = choices
        .map((choice) => `<option value="${escapeHtml(choice.id)}">${escapeHtml(choice.name)} · ${escapeHtml(choice.category)}</option>`)
        .join('');
    const chosen = await foundry.applications.api.DialogV2.wait({
        window: { title: `Adicionar Item — ${actor.name ?? 'Ficha'}` },
        content: `<label>Item canônico</label><select name="catalogItem">${options}</select>`,
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'add', label: 'Adicionar ao Actor', callback: (_event, button) => button.form.elements.catalogItem.value },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!chosen) return null;
    const document = documents.find((entry) => String(entry._id ?? entry.id) === String(chosen));
    const sourceTemplate = String(document?.system?.template ?? TEMPLATE_ID);
    const templateId = await resolveTemplateId(actor, pack, sourceTemplate);
    if (!templateId) return globalThis.ui?.notifications?.warn?.('Template de arma ausente neste mundo.');
    const result = await createCatalogItem(actor, document, { templateId });
    if (result.ok) globalThis.ui?.notifications?.info?.(`${document.name} adicionado a ${actor.name}.`);
    else globalThis.ui?.notifications?.warn?.(result.reason);
    return result;
}
