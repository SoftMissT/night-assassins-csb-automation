import { MODULE_ID } from './constants.mjs';
import { itemSheetKind } from './item-sheet-skin.mjs';
import { buildWeaponDamageCatalog, reloadWeaponItem, rollWeaponItem } from './damage-service.mjs';
import { openDamageDialog } from './dialogs/damage-dialog.mjs';
import {
    itemDamageProfileFromProps,
    saveItemDamageProfile,
} from './item-damage-profile.mjs';

function sheetElement(value) {
    if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return value;
    const first = value?.[0];
    return typeof HTMLElement !== 'undefined' && first instanceof HTMLElement ? first : null;
}

function itemFromApp(app) {
    return app?.item ?? (app?.document?.documentName === 'Item' ? app.document : null);
}

export function itemHudMarkup(item) {
    const kind = itemSheetKind(item);
    if (kind !== 'arma' && kind !== 'especial') return '';
    const props = item?.system?.props ?? {};
    const locked = item?.isOwner || globalThis.game?.user?.isGM ? '' : ' disabled';
    const save = kind === 'arma'
        ? `<button type="button" class="na-item-action" data-na-item-action="save"${locked}><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Salvar dano</span></button>`
        : '';
    const reload = Number(props.arma_municao_capacidade) > 0
        ? '<button type="button" class="na-item-action" data-na-item-action="reload" title="Recarregar munição"><i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Recarregar</span></button>'
        : '';
    return `<div class="na-item-toolbar" data-na-item-toolbar="true" aria-label="Ações rápidas do Item">
      <span class="na-item-toolbar-label"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i> Ações do Item</span>
      <button type="button" class="na-item-action na-item-action-primary" data-na-item-action="roll"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i><span>Rolar ataque</span></button>
      <button type="button" class="na-item-action" data-na-item-action="damage"><i class="fa-solid fa-burst" aria-hidden="true"></i><span>Rolar dano</span></button>
      ${save}
      ${reload}
    </div>`;
}

async function runItemAction(action, item) {
    const options = { itemUuid: item.uuid, item };
    if (action === 'roll') return rollWeaponItem({ ...options, startWithHit: true });
    if (action === 'damage') return rollWeaponItem({ ...options, damageOnly: true });
    if (action === 'reload') return reloadWeaponItem(options);
    if (action === 'save') return openItemDamageProfileEditor(options);
    return null;
}

/**
 * Edita o perfil no mesmo editor de entradas usado pelo dano, mas persiste no Item.
 * @param {{item?: Item, itemUuid?: string}} options
 */
export async function openItemDamageProfileEditor({ item: directItem, itemUuid } = {}) {
    const resolved = itemUuid ? await globalThis.fromUuid?.(itemUuid) : null;
    const item = directItem ?? resolved;
    if (!item) return globalThis.ui?.notifications?.warn?.('Item não encontrado.');
    const canEdit = item.isOwner || globalThis.game?.user?.isGM;
    if (!canEdit) return globalThis.ui?.notifications?.warn?.('Você não pode editar este Item.');
    const actor = item.parent?.documentName === 'Actor' ? item.parent : globalThis.game?.user?.character;
    const weaponCatalog = actor ? buildWeaponDamageCatalog(actor) : [];
    const current = itemDamageProfileFromProps(item.system?.props ?? {});
    const seed = current?.entries ?? weaponCatalog.find((entry) => entry.id.startsWith(`${item.uuid}::`))?.entries ?? [];
    const result = await openDamageDialog({
        actor: actor ?? { name: item.name, system: { props: {} } },
        nome: item.name,
        entradas: seed,
        weaponLabel: item.name,
        weaponCatalog,
        presetDraft: {
            name: item.name,
            group: 'normal',
            groupLabel: 'Normal',
            breathing: 'Normal',
        },
    });
    if (!result?.preset) return null;
    const saved = await saveItemDamageProfile(item, { entries: result.preset.entries });
    if (!saved.ok) return globalThis.ui?.notifications?.warn?.(saved.reason);
    globalThis.ui?.notifications?.info?.(`Perfil de dano salvo em ${item.name}.`);
    return saved;
}

/**
 * Adiciona a barra uma vez por render. O HTML é estático e os valores do Item
 * só entram em opções de API, nunca em markup sem escape.
 */
export function attachItemSheetHud(app, html) {
    const item = itemFromApp(app);
    const root = sheetElement(html);
    const markup = itemHudMarkup(item);
    if (!root || !markup || root.querySelector?.('[data-na-item-toolbar="true"]')) return;
    root.insertAdjacentHTML?.('afterbegin', markup);
    const toolbar = root.querySelector?.('[data-na-item-toolbar="true"]');
    toolbar?.querySelectorAll?.('[data-na-item-action]')?.forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            button.disabled = true;
            try {
                await runItemAction(button.dataset.naItemAction, item);
            } catch (error) {
                console.error(`[${MODULE_ID}] Falha na ação da HUD do Item`, error);
                globalThis.ui?.notifications?.error?.(error?.message ?? 'Falha na ação do Item.');
            } finally {
                button.disabled = false;
            }
        });
    });
}
