/**
 * @fileoverview Criador de Forma de Respiração, no molde do Criar Arma.
 *
 * Contrato: uma Forma nova sempre tem 4 níveis. Cada nível registra
 * disponibilidade, custo de PDR, dano, efeito, status e tipos de dano.
 * Fonte da estrutura: `Respiração da Chamas.md` (lote-003) e
 * `src/templates/items/breathing-form-template.json`.
 */
import { MODULE_ID, TIPOS_DANO } from './constants.mjs';
import { breathingFormsFromCatalog, loadBreathingCatalog, resolveBreathTemplateId } from './breathing-catalog.mjs';
import { chosenBreathing } from './breathing-choice.mjs';
import { MAX_FORMULA_LENGTH, SAFE_FORMULA } from './breathing-contract.mjs';
import { resolveActorReference } from './core/combat-context.mjs';
import { isValidDamageFormula, resolveAttributeRefs } from './damage-formula.mjs';
import { secondaryBreathingForActor } from './slayer/dual-breathing-service.mjs';

const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

const LEVELS = [1, 2, 3, 4];
const MANEUVERS = [
    'Ação Especial', 'Ação de Ataque', 'Ação Completa', 'Ação Única', 'Reação',
];
const DAMAGE_TYPES = new Set(TIPOS_DANO.map(({ key }) => key));

/** Respirações publicadas com pelo menos uma Forma jogável. */
export function formCreatorBreathings(documents = []) {
    const names = new Set();
    for (const document of documents) {
        const name = String(document?.system?.props?.respiracao_nome ?? '').trim();
        if (!name || String(document?.system?.props?.forma_id ?? '').startsWith('hub_')) continue;
        if (breathingFormsFromCatalog(documents, name).length > 0) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Normaliza a entrada do diálogo ou devolve a razão da recusa. */
export function normalizeFormInput(input = {}) {
    const nome = String(input.nome ?? '').trim();
    if (!nome) return { reason: 'Informe o nome da Forma.' };
    const respiracao = String(input.respiracao ?? '').trim();
    if (!respiracao) return { reason: 'Escolha a Respiração.' };
    const nivelReq = Math.min(4, Math.max(1, Math.trunc(Number(input.nivelReq) || 1)));
    const niveis = {};
    for (const level of LEVELS) {
        const raw = input[`nvl${level}`] ?? {};
        const enabled = raw.ativo === true || raw.ativo === 'on' || raw.ativo === '1';
        if (!enabled) {
            niveis[level] = { ativo: false, custo: 0, dano: '', efeito: '', status: '', tiposDano: [] };
            continue;
        }
        const custo = Number(raw.custo ?? 0);
        if (!Number.isInteger(custo) || custo < 0) return { reason: `Nível ${level}: custo inválido.` };
        const dano = String(raw.dano ?? '').trim();
        const efeito = String(raw.efeito ?? '').trim();
        const status = String(raw.status ?? '').trim();
        if (dano) {
            const formula = resolveAttributeRefs(dano);
            if (dano.length > MAX_FORMULA_LENGTH || !SAFE_FORMULA.test(dano) ||
                formula.includes('@') || !isValidDamageFormula(formula))
                return { reason: `Nível ${level}: fórmula de dano inválida.` };
        }
        if (!dano && !efeito && !status) return { reason: `Nível ${level}: informe dano, efeito ou status.` };
        const tiposDano = [...new Set(String(raw.tiposDano ?? '')
            .split(/[,;]/u).map((key) => key.trim().toLowerCase()).filter(Boolean))];
        if (tiposDano.some((key) => !DAMAGE_TYPES.has(key)))
            return { reason: `Nível ${level}: tipo de dano desconhecido.` };
        niveis[level] = { ativo: true, custo, dano, efeito, status, tiposDano };
    }
    if (!LEVELS.some((level) => niveis[level].ativo))
        return { reason: 'Marque ao menos um dos 4 níveis.' };
    if (!LEVELS.some((level) => level >= nivelReq && niveis[level].ativo))
        return { reason: 'Marque algum nível disponível no nível requerido ou acima.' };
    return {
        nome,
        nomeJp: String(input.nomeJp ?? '').trim(),
        respiracao,
        tipoManobra: MANEUVERS.includes(input.tipoManobra) ? input.tipoManobra : 'Ação Especial',
        nivelReq,
        descricao: String(input.descricao ?? '').trim(),
        niveis,
    };
}

/** Props CSB da Forma nova, no contrato de `breathing-form-template.json`. */
export function buildFormProps(normalized, formaId) {
    const props = {
        nome_forma: normalized.nome,
        nome_jp: normalized.nomeJp,
        respiracao_nome: normalized.respiracao,
        tipo_manobra: normalized.tipoManobra,
        nivel_req: normalized.nivelReq,
        descricao: normalized.descricao,
        inventario_categoria: 'respiracao',
        forma_id: formaId,
        forma_ordem: 99,
        tem_requisito: 0,
        requisito_texto: '',
    };
    for (const level of LEVELS) {
        const data = normalized.niveis[level];
        props[`tem_nvl${level}`] = data.ativo ? 1 : 0;
        props[`nvl${level}_custo`] = data.custo;
        props[`nvl${level}_dano`] = data.dano;
        props[`nvl${level}_efeito`] = data.efeito;
        props[`nvl${level}_status`] = data.status;
        props[`nvl${level}_tipos_dano`] = data.tiposDano;
    }
    return props;
}

function levelFields(level, data = {}) {
    return `<fieldset class="na-form-nivel">
        <legend>Nível ${level}</legend>
        <label><input type="checkbox" name="nvl${level}.ativo" ${data.ativo ? 'checked' : ''}> Disponível</label>
        <label>Custo (PDR) <input type="number" name="nvl${level}.custo" min="0" value="${escapeHtml(data.custo ?? 0)}"></label>
        <label>Dano <input type="text" name="nvl${level}.dano" value="${escapeHtml(data.dano ?? '')}" placeholder="ex: 2d6 + @for"></label>
        <label>Efeito <textarea name="nvl${level}.efeito" rows="2">${escapeHtml(data.efeito ?? '')}</textarea></label>
        <label>Status <input type="text" name="nvl${level}.status" value="${escapeHtml(data.status ?? '')}"></label>
        <label>Tipos de dano <input type="text" name="nvl${level}.tiposDano" value="${escapeHtml((data.tiposDano ?? []).join(', '))}" placeholder="cortante, fogo"></label>
    </fieldset>`;
}

async function chooseFormRecipient() {
    const candidates = (globalThis.game?.actors?.contents ?? [])
        .filter((actor) => actor.isOwner && actor.type === 'character')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (candidates.length === 0) {
        globalThis.ui?.notifications?.warn?.('Nenhuma ficha disponível para receber a Forma.');
        return null;
    }
    const options = candidates
        .map((actor) => `<option value="${escapeHtml(actor.id)}">${escapeHtml(actor.name)}</option>`)
        .join('');
    const id = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Criar Forma de Respiração' },
        content: `<label>Ficha de destino <select name="recipient" required>
            <option value="">Selecione uma ficha</option>${options}</select></label>`,
        rejectClose: false,
        buttons: [
            { action: 'continuar', label: 'Continuar', default: true,
                callback: (_event, button) => button.form.elements.recipient.value },
            { action: 'cancelar', label: 'Cancelar', callback: () => null },
        ],
    });
    return candidates.find((actor) => actor.id === id) ?? null;
}

export async function openFormCreator({ actor, actorUuid } = {}) {
    if (!globalThis.game?.user?.isGM) {
        globalThis.ui?.notifications?.warn?.('O criador de Formas é exclusivo do GM.');
        return null;
    }
    let target = actor ?? (actorUuid
        ? await resolveActorReference(actorUuid)
        : globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? globalThis.game?.user?.character);
    if (!target && !actorUuid) {
        target = await chooseFormRecipient();
        if (!target) return null;
    }
    if (!target?.isOwner || typeof target.createEmbeddedDocuments !== 'function' ||
        target.type === '_template' || (target.documentName && target.documentName !== 'Actor')) {
        globalThis.ui?.notifications?.warn?.('Selecione uma ficha para receber a Forma.');
        return null;
    }
    const documents = await loadBreathingCatalog();
    const initial = chosenBreathing(target.system?.props ?? {});
    const secondary = secondaryBreathingForActor(target);
    const published = formCreatorBreathings(documents);
    const breathings = initial ? published.filter((name) => name === initial || name === secondary) : published;
    if (breathings.length === 0) {
        globalThis.ui?.notifications?.warn?.(initial
            ? `A Respiração ${initial} não está publicada neste módulo.`
            : 'Nenhuma Respiração publicada neste módulo.');
        return null;
    }
    const content = `<div class="na-form-creator">
        <p>Destino: <strong>${escapeHtml(target.name)}</strong></p>
        <label>Nome (PT) <input name="nome" maxlength="70" required autofocus></label>
        <label>Nome (JP) <input name="nomeJp" maxlength="70"></label>
        <label>Respiração <select name="respiracao">${breathings
            .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
            .join('')}</select></label>
        <label>Tipo de manobra <select name="tipoManobra">${MANEUVERS
            .map((name) => `<option>${name}</option>`).join('')}</select></label>
        <label>Nível requerido <select name="nivelReq">${LEVELS
            .map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
        <label>Descrição <textarea name="descricao" rows="2"></textarea></label>
        ${LEVELS.map((level) => levelFields(level)).join('')}
    </div>`;
    const result = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Criar Forma de Respiração',
            contentClasses: ['na-form-creator-window'],
            resizable: true,
        },
        content,
        position: { width: 640 },
        rejectClose: false,
        buttons: [
            {
                action: 'criar',
                label: 'Criar Forma',
                default: true,
                callback: (_event, button) => {
                    const form = button.form;
                    const value = (name) => form.querySelector(`[name="${name}"]`)?.value ?? '';
                    const niveis = Object.fromEntries(LEVELS.map((level) => [`nvl${level}`, {
                        ativo: form.querySelector(`[name="nvl${level}.ativo"]`)?.checked ?? false,
                        custo: value(`nvl${level}.custo`),
                        dano: value(`nvl${level}.dano`),
                        efeito: value(`nvl${level}.efeito`),
                        status: value(`nvl${level}.status`),
                        tiposDano: value(`nvl${level}.tiposDano`),
                    }]));
                    return { nome: value('nome'), nomeJp: value('nomeJp'), respiracao: value('respiracao'),
                        tipoManobra: value('tipoManobra'), nivelReq: value('nivelReq'),
                        descricao: value('descricao'), ...niveis };
                },
            },
            { action: 'cancelar', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!result || typeof result !== 'object') return null;
    const normalized = normalizeFormInput(result);
    if (normalized.reason) {
        globalThis.ui?.notifications?.warn?.(normalized.reason);
        return null;
    }
    if (!breathings.includes(normalized.respiracao)) {
        globalThis.ui?.notifications?.warn?.('Escolha uma Respiração disponível para a ficha.');
        return null;
    }
    const templateId = await resolveBreathTemplateId(target);
    if (!templateId) {
        globalThis.ui?.notifications?.warn?.('Template de Forma ausente neste mundo.');
        return null;
    }
    const slug = String(normalized.respiracao).normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
        .toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_|_$/gu, '').slice(0, 16);
    const formaId = `custom_${slug}_${Date.now().toString(36)}`;
    const [created] = await target.createEmbeddedDocuments('Item', [{
        name: normalized.nome,
        type: 'equippableItem',
        img: 'modules/night-assassins-csb-automation/assets/icons/items/na-Breathing_Form_icon.webp',
        system: { template: templateId, props: buildFormProps(normalized, formaId) },
        flags: { [MODULE_ID]: { customForm: true } },
    }], { naCsbAutomation: true });
    if (!created) {
        globalThis.ui?.notifications?.warn?.('O Foundry não criou a Forma.');
        return null;
    }
    await created.templateSystem?.reloadTemplate?.(templateId);
    created.sheet?.render?.({ force: true });
    globalThis.ui?.notifications?.info?.(`Forma criada em ${target.name}.`);
    return created;
}
