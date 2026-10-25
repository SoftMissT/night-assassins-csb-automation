/**
 * @fileoverview Pele das fichas de item do Night Assassins.
 *
 * A ficha de item do CSB 6.1 é ApplicationV1 (`EquippableItemSheet`) e nunca
 * recebia `.na-sheet`: só a ficha de Actor era marcada. Aqui a janela ganha o
 * tipo do item e a cor de identidade ("a lâmina que muda de cor"). O CSS mira
 * as `key` dos componentes, que o CSB já põe como classe, então os templates
 * JSON não mudam e nada precisa ser reimportado.
 */

const KIND_BY_TEMPLATE_ID = new Map([
    ['naweapontpl00001', 'arma'],
    ['naspecialweapontpl00001', 'especial'],
    ['nabreathtpl00001', 'forma'],
    ['nakekkijutsutpl001', 'kekki'],
]);

/** Cor da Lâmina Nichirin por Respiração (AA sobre o fundo da ficha; ver teste). */
export const BREATHING_ACCENTS = Object.freeze({
    chamas: '#ff8a3d',
    agua: '#4fa8ff',
    metal: '#c3ccd6',
    neve: '#bfe9ff',
    nevoa: '#a9c1d6',
    pedra: '#c9a77a',
    vento: '#5fe3a1',
});

function slug(value) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[̀-ͯ]/gu, '')
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}

/**
 * @param {Item|object} item
 * @returns {'arma'|'especial'|'forma'|'kekki'|null}
 */
export function itemSheetKind(item) {
    if (!item) return null;
    const byTemplate =
        KIND_BY_TEMPLATE_ID.get(slug(item.id ?? item._id).replaceAll('-', '')) ??
        KIND_BY_TEMPLATE_ID.get(slug(item.system?.template).replaceAll('-', ''));
    const props = item.system?.props ?? {};
    if (Object.keys(props).some((key) => key.startsWith('kekki_'))) return 'kekki';
    if (props.inventario_categoria === 'respiracao' || (props.respiracao_nome && props.forma_id))
        return 'forma';
    if (slug(props.arma_categoria) === 'especial') return 'especial';
    if (
        props.arma_nome !== undefined ||
        props.arma_dano_fixo !== undefined ||
        props.arma_critico !== undefined
    )
        return 'arma';
    return byTemplate ?? null;
}

/**
 * Classes da janela da ficha. Vazio quando o item não é do sistema.
 * @param {Item|object} item
 * @returns {string[]}
 */
export function itemSheetClasses(item) {
    const kind = itemSheetKind(item);
    if (!kind) return [];
    const classes = ['na-sheet', 'na-item', `na-item--${kind}`];
    if (kind === 'forma') {
        const breathing = slug(item.system?.props?.respiracao_nome);
        if (breathing in BREATHING_ACCENTS) classes.push(`na-item--resp-${breathing}`);
    }
    return classes;
}

/**
 * Hook `renderItemSheet` (V1) e `renderApplicationV2` (caso o CSB migre).
 * @param {Application} app
 * @param {JQuery|HTMLElement} html
 */
export function tagItemSheet(app, html) {
    const item = app?.item ?? (app?.document?.documentName === 'Item' ? app.document : null);
    const classes = itemSheetClasses(item);
    if (classes.length === 0) return;
    const root = html?.[0] ?? html;
    const element = root instanceof HTMLElement ? root : null;
    const appElement =
        (app?.element?.[0] ?? app?.element) instanceof HTMLElement
            ? (app.element[0] ?? app.element)
            : element?.closest?.('.app, .application');
    for (const target of [appElement, element]) target?.classList?.add(...classes);
}
