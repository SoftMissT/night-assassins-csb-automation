/** Respiração da Recuperação: ações internas do próprio Slayer. */
import { consumeSlayerActions } from './action-service.mjs';
import { parseNumber } from './parsing.mjs';
import { formatStatusSummary, parseStatusState } from './status-service.mjs';

const FORMS = Object.freeze({
  coagulação: { label: '1ª Forma — Coagulação Forçada', action: 'especial', test: true, dc: [14, 12, 10, 8], pdv: ['2d6','3d6','4d6','5d6'], pdr: ['2d6','3d6','4d6','5d6'] },
  expurgo: { label: '2ª Forma — Expurgo Térmico', action: 'especial', test: true, dc: [14, 12, 10, 8], pdv: ['', '2d6','3d6','4d6'], pdr: ['', '2d6','3d6','4d6'], reteste: [0,2,4,6] },
  choque: { label: '3ª Forma — Choque Adrenérgico', action: 'reacao', test: false, pdv: ['', '','',''], pdr: ['2d6','3d6','4d6','5d6'] },
  sinfonia: { label: '4ª Forma — Sinfonia dos Pulmões', action: 'completa', test: true, dc: [14, 12, 10, 8], pdv: ['', '', '6d8','8d8'], pdr: ['', '', '6d8','8d8'] },
});

const n = (v) => Math.max(0, Math.trunc(parseNumber(v)));
const levelOf = (props) => Math.min(4, Math.max(1, n(props.nvl_respiracao_num ?? props.respiracao_nivel ?? props.nivel_respiracao) || 1));
const attr = (props, key) => n(props[`${key}_display`] ?? props[key]);

export function recoveryBreathingLevel(props = {}) { return levelOf(props); }
/** Todo Slayer possui esta respiração; o nível da ficha define as Formas disponíveis. */
export function hasRecoveryBreathing(actor) {
  return actor?.type === 'slayer' || actor?.system?.props?.nvl_respiracao_num !== undefined;
}
export function recoveryFormDefinition(formId, level) {
  const form = FORMS[formId];
  if (!form) return null;
  const index = Math.min(4, Math.max(1, n(level) || 1)) - 1;
  return { ...form, formId, level: index + 1, dc: form.dc?.[index] ?? 0, pdv: form.pdv?.[index] ?? '', pdr: form.pdr?.[index] ?? '', reteste: form.reteste?.[index] ?? 0 };
}

function currentResources(props) {
  const pdvMax = Math.max(0, n(props.pdv_slayer_total_conta) - n(props.pdv_slayer_dano_ferida) + n(props.pdv_slayer_extra));
  const pdv = Math.min(pdvMax, Math.max(0, pdvMax + n(props.pdv_slayer_curado) - n(props.pdv_slayer_dano_tomado)));
  const pdrMax = Math.max(0, n(props.pdr_slayer_total_conta) + n(props.metal_slayer_pdr_bonus) + n(props.pdr_slayer_extra));
  const pdr = Math.min(pdrMax, Math.max(0, pdrMax + n(props.pdr_slayer_curado) - n(props.pdr_slayer_gasto_valor)));
  return { pdvMax, pdv, pdrMax, pdr };
}

async function rollFormula(formula, actor, flavor) {
  if (!formula) return 0;
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
  return n(roll.total);
}

export async function openRecoveryManager({ actorUuid } = {}) {
  const t0 = performance.now();
  if (!canvas.ready) return ui.notifications.warn('Canvas não pronto.');
  const doc = actorUuid ? await fromUuid(actorUuid) : null;
  const actor = doc?.actor ?? doc ?? canvas.tokens.controlled[0]?.actor ?? game.user?.character;
  if (!actor) return ui.notifications.warn('Nenhum personagem ativo.');
  if (!actor.isOwner && !game.user.isGM) return ui.notifications.error('Você não pode usar esta Respiração.');
  const props = actor.system?.props ?? {};
  const level = levelOf(props);
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Respiração da Recuperação' }, modal: true, rejectClose: false,
    content: `<p>Escolha a Forma (Nível ${level}). Custo de PDR: 0.</p><select name="form"><option value="coagulação">1ª Coagulação Forçada</option><option value="expurgo">2ª Expurgo Térmico</option><option value="choque">3ª Choque Adrenérgico</option><option value="sinfonia">4ª Sinfonia dos Pulmões</option><option value="recuperar_folego">Recuperar fôlego (remover Ofegante)</option></select>`,
    buttons: [{ action: 'use', label: 'Usar', default: true, callback: (_e, b) => b.form.elements.form.value }, { action: 'cancel', label: 'Cancelar', callback: () => null }],
  });
  if (!result) return null;
  const status = parseStatusState(props.status_slayer_dados);
  if (result === 'recuperar_folego') {
    if (!status.active.includes('ofegante')) return ui.notifications.warn('O personagem não está Ofegante.');
    const action = await consumeSlayerActions(actor, ['especial']);
    if (!action.ok) return ui.notifications.warn(action.reason);
    status.active = status.active.filter((key) => key !== 'ofegante');
    const patch = {
      'system.props.status_slayer_dados': JSON.stringify({ ...status, active: status.active }),
      'system.props.status_slayer_resumo': formatStatusSummary(status.active, status.exhaustion),
    };
    await actor.update(patch, { naCsbAutomation: true, naBreathing: true });
    return { ok: true, form: result, success: true, patch };
  }
  const def = recoveryFormDefinition(result, level);
  if (!def || !def.pdv && result !== 'choque') return ui.notifications.warn('Esta Forma não está disponível neste nível.');
  if (result === 'choque' && currentResources(props).pdv > 0) return ui.notifications.warn('Choque Adrenérgico só pode ser usado ao chegar a 0 PDV.');
  const action = await consumeSlayerActions(actor, [def.action]);
  if (!action.ok) return ui.notifications.warn(action.reason);
  let success = true;
  if (def.test) {
    const roll = await new Roll(`1d20 + ${attr(props, 'fdv')}`).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${def.label} — FDV CD ${def.dc}` });
    const naturalTwenty = (roll.dice?.[0]?.results?.[0]?.result ?? 0) === 20;
    success = n(roll.total) >= def.dc || naturalTwenty;
    if (naturalTwenty && def.pdr) def._nat20PdrBonus = level * 2;
  }
  const patch = {};
  const resources = currentResources(props);
  if (success) {
    const pdv = await rollFormula(def.pdv ? `${def.pdv} + ${attr(props, 'vit')}` : '', actor, `${def.label} — recuperação de PDV`);
    const pdr = await rollFormula(def.pdr ? `${def.pdr} + ${attr(props, 'fdv')}` : '', actor, `${def.label} — recuperação de PDR`);
    patch['system.props.pdv_slayer_curado'] = n(props.pdv_slayer_curado) + Math.min(Math.max(0, resources.pdvMax - resources.pdv), pdv) + (result === 'choque' ? 1 : 0);
    patch['system.props.pdr_slayer_curado'] = n(props.pdr_slayer_curado) + Math.min(Math.max(0, resources.pdrMax - resources.pdr), pdr + (def._nat20PdrBonus ?? 0));
    if (result === 'coagulação') status.active = status.active.filter((key) => !['sangramento', 'hemorragia'].includes(key));
    if (result === 'sinfonia') status.active = status.active.filter((key) => !['fadiga_corporal', 'fadiga_espiritual', 'fadiga_mental'].includes(key));
  }
  if (result === 'sinfonia' && !status.active.includes('ofegante')) status.active.push('ofegante');
  patch['system.props.status_slayer_dados'] = JSON.stringify({ ...status, active: status.active, effects: Object.fromEntries(Object.entries(status.effects).filter(([key]) => status.active.includes(key))) });
  patch['system.props.status_slayer_resumo'] = formatStatusSummary(status.active, status.exhaustion);
  await actor.update(patch, { naCsbAutomation: true, naBreathing: true });
  ui.notifications.info(`${def.label}: ${success ? 'sucesso' : 'falha'} (${(performance.now() - t0).toFixed(2)}ms).`);
  return { ok: true, form: result, success, patch };
}

export { FORMS as RECOVERY_FORMS };
