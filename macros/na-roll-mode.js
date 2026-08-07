// UUID no Foundry: Macro.wjMm5abpGoLhTwg7
// Integração CSB: %{return await game.macros.get('wjMm5abpGoLhTwg7').execute({actorUuid:entity.uuid,test:'Presença',attr:'CAR',color:'#FF9100'});}%
(async () => {
  // Foundry V13 executa macros via AsyncFunction("scope", script).
  // Arrow IIFEs NÃO capturam 'arguments' de forma confiável dentro de AsyncFunction.
  // Sempre use 'scope' diretamente.
  const args = (typeof scope !== 'undefined') ? (scope || {}) : {};

  // Labels calculadas do CSB podem entregar o valor final dentro de HTML.
  function parseAttributeValue(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

    const text = String(raw ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .trim()
      .replace(',', '.');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  const test = args.test ?? 'Teste';
  const attr = args.attr ?? '';
  const color = args.color ?? '';

  // ── Leitura de Atributos do Ator ───────────────────────────────────────
  const actor = args.actorUuid
    ? await fromUuid(args.actorUuid)
    : canvas.tokens.controlled[0]?.actor ?? game.user?.character;
  if (!actor) return ui.notifications?.error('Sem personagem ativo.');
  const props = actor?.system?.props ?? {};

  const ATTR_KEYS = ['vit','for','dex','fdv','car','int','sab'];
  const ATTR_NAMES = { vit:'VIT', for:'FOR', dex:'DEX', fdv:'FDV', car:'CAR', int:'INT', sab:'SAB' };
  const ATTR_COLORS = { vit:'#36D67A', for:'#C1000C', dex:'#28D7FF', fdv:'#BB97F9', car:'#FF9100', int:'#F8EB4D', sab:'#D45CA4' };

  // Monta mapa de atributos com valores reais do ator
  const attrValues = {};
  for (const k of ATTR_KEYS) {
    const v = props[`${k}_display`];
    attrValues[k] = parseAttributeValue(v);
  }

  // Atributos disponíveis como secundários (exclui o primário se houver)
  const primaryKey = attr ? attr.toLowerCase() : '';
  const val = ATTR_KEYS.includes(primaryKey) ? attrValues[primaryKey] : 0;
  const secondaryOptions = [{ key:'', label:'Nenhum', val:0 }];
  for (const k of ATTR_KEYS) {
    if (k !== primaryKey) {
      secondaryOptions.push({ key:k, label:ATTR_NAMES[k], val:attrValues[k] });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function getDice(mode) {
    if (mode === 'advantage') return '2d20kh1';
    if (mode === 'disadvantage') return '2d20kl1';
    return '1d20';
  }

  function getModeLabel(mode) {
    if (mode === 'advantage') return 'Vantagem';
    if (mode === 'disadvantage') return 'Desvantagem';
    return 'Normal';
  }

  function parseBonus(raw) {
    const s = (raw || '').trim();
    if (!s) return { extra: '', display: '' };
    const clean = s.replace(/^\+/, '');
    return { extra: clean ? `+ ${clean}` : '', display: s };
  }

  function buildFormula(mode, secVal, bonusExtra) {
    const dice = getDice(mode);
    let base = `${dice} + ${val}`;
    if (secVal) base += ` + ${secVal}`;
    return bonusExtra ? `${base} ${bonusExtra}` : base;
  }

  async function doRoll(mode, rollMode, secVal, bonusRaw, cdVal) {
    const { extra, display } = parseBonus(bonusRaw);
    const formula = buildFormula(mode, secVal, extra);

    let roll;
    try {
      roll = await Roll.create(formula).evaluate();
    } catch (err) {
      ui.notifications?.error(`Erro na fórmula: ${formula}`);
      return;
    }

    const modeLabel = getModeLabel(mode);
    const attrLine = attr ? `${attr} = ${val}` : '';
    const secLine = secVal ? ` + ${ATTR_NAMES[secondaryOptions.find(o => o.val === secVal)?.key] || '?'} = ${secVal}` : '';
    const bonusLine = display ? ` | Bônus: ${display}` : '';

    let cdLine = '';
    if (cdVal > 0) {
      const passou = roll.total >= cdVal;
      const resultado = passou ? '✅ Sucesso!' : '❌ Falha!';
      cdLine = ` | CD ${cdVal} → ${resultado}`;
    }

    await roll.toMessage({
      flavor: `<strong>${test}</strong> (${modeLabel})${attrLine ? ' — ' + attrLine : ''}${secLine}${bonusLine}${cdLine}`,
      speaker: ChatMessage.getSpeaker(),
      rollMode: rollMode,
    });
  }

  // ── Dialog Content (estilos inline mínimos, look nativo Foundry) ───────
  const secOptionsHtml = secondaryOptions.map(o =>
    `<option value="${o.val}" data-key="${o.key}">${o.label}${o.val ? ` = ${o.val}` : ''}</option>`
  ).join('');

  const content = `
    <div style="margin-bottom:12px;">
      ${attr ? `<div style="font-size:13px;color:${color || '#666'};margin-bottom:4px;font-weight:600;">${attr} = ${val}</div>` : ''}
      <div id="na-rm-formula" style="font-family:monospace;font-size:14px;background:#f5f5f5;padding:6px 8px;border-radius:3px;border:1px solid #ddd;">1d20 + ${val}</div>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Atributo Secundário (até 1)</label>
      <select id="na-rm-secattr" style="width:100%;padding:4px;box-sizing:border-box;">
        ${secOptionsHtml}
      </select>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Bônus Situacional?</label>
      <input type="text" id="na-rm-bonus" placeholder="ex: 1d4, +2, 5" style="width:100%;padding:4px;box-sizing:border-box;" />
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">CD do Teste (opcional)</label>
      <input type="number" id="na-rm-cd" min="0" placeholder="ex: 15" style="width:100%;padding:4px;box-sizing:border-box;" />
    </div>
    <div style="margin-bottom:6px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Modo de Rolagem</label>
      <select id="na-rm-rollmode" style="width:100%;padding:4px;box-sizing:border-box;">
        <option value="publicroll">Rolar Público</option>
        <option value="gmroll">Rolar Privado (GM)</option>
        <option value="blindroll">Rolar Cego (GM)</option>
        <option value="selfroll">Rolar Para Si</option>
      </select>
    </div>
  `;

  // ── Dialog nativo (V1 deprecated em V13 mas ainda funciona; look nativo) ─
  new Dialog({
    title: test,
    content: content,
    buttons: {
      advantage: {
        label: 'Vantagem',
        callback: (html) => {
          const bonusRaw = html.find('#na-rm-bonus').val() ?? '';
          const rollMode = html.find('#na-rm-rollmode').val() ?? 'publicroll';
          const secVal = Number(html.find('#na-rm-secattr').val()) || 0;
          const cdVal = Number(html.find('#na-rm-cd').val()) || 0;
          doRoll('advantage', rollMode, secVal, bonusRaw, cdVal);
        }
      },
      normal: {
        label: 'Normal',
        callback: (html) => {
          const bonusRaw = html.find('#na-rm-bonus').val() ?? '';
          const rollMode = html.find('#na-rm-rollmode').val() ?? 'publicroll';
          const secVal = Number(html.find('#na-rm-secattr').val()) || 0;
          const cdVal = Number(html.find('#na-rm-cd').val()) || 0;
          doRoll('normal', rollMode, secVal, bonusRaw, cdVal);
        }
      },
      disadvantage: {
        label: 'Desvantagem',
        callback: (html) => {
          const bonusRaw = html.find('#na-rm-bonus').val() ?? '';
          const rollMode = html.find('#na-rm-rollmode').val() ?? 'publicroll';
          const secVal = Number(html.find('#na-rm-secattr').val()) || 0;
          const cdVal = Number(html.find('#na-rm-cd').val()) || 0;
          doRoll('disadvantage', rollMode, secVal, bonusRaw, cdVal);
        }
      },
      cancel: {
        label: 'Cancelar',
        callback: () => {}
      }
    },
    default: 'normal',
    render: (html) => {
      const bonusInput = html.find('#na-rm-bonus');
      const secAttrSelect = html.find('#na-rm-secattr');
      const formulaDisplay = html.find('#na-rm-formula');

      const updateFormula = () => {
        const { extra } = parseBonus(bonusInput.val() ?? '');
        const secVal = Number(secAttrSelect.val()) || 0;
        formulaDisplay.text(buildFormula('normal', secVal, extra));
      };

      bonusInput.on('input', updateFormula);
      secAttrSelect.on('change', updateFormula);
    }
  }).render(true);
})();
