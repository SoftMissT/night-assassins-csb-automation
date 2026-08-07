// UUID no Foundry: Macro.C1tfpemr4wqRHTUo
// Integração CSB: %{return await game.macros.get('C1tfpemr4wqRHTUo').execute({actorUuid:entity.uuid});}%
(async () => {
  const args = (typeof scope !== 'undefined') ? (scope || {}) : {};
  const actor = args.actorUuid
    ? await fromUuid(args.actorUuid)
    : canvas.tokens.controlled[0]?.actor ?? game.user?.character;
  if (!actor) return ui.notifications?.error("Sem personagem ativo.");

  const props = actor.system?.props ?? {};
  const acertoLabel = props.acerto_label ?? '';

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

  let attrName = '';
  let attrVal = 0;
  let color = '';

  if (acertoLabel === 'acerto_label_dex') {
    attrName = 'DEX';
    attrVal = parseAttributeValue(props.dex_display);
    color = '#28D7FF';
  } else if (acertoLabel === 'acerto_label_for') {
    attrName = 'FOR';
    attrVal = parseAttributeValue(props.for_display);
    color = '#C1000C';
  } else {
    return ui.notifications?.warn("Escolha DEX ou FOR no campo 'Como Acerta'.");
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

  function buildFormula(mode, bonusExtra) {
    const dice = getDice(mode);
    const base = `${dice} + ${attrVal}`;
    return bonusExtra ? `${base} ${bonusExtra}` : base;
  }

  async function doRoll(mode, rollMode, bonusRaw, cdVal) {
    const { extra, display } = parseBonus(bonusRaw);
    const formula = buildFormula(mode, extra);

    let roll;
    try {
      roll = await Roll.create(formula).evaluate();
    } catch (err) {
      ui.notifications?.error(`Erro na fórmula: ${formula}`);
      return;
    }

    const modeLabel = getModeLabel(mode);
    const bonusLine = display ? ` | Bônus: ${display}` : '';

    let cdLine = '';
    if (cdVal > 0) {
      const passou = roll.total >= cdVal;
      cdLine = ` | CD ${cdVal} → ${passou ? '✅ Sucesso!' : '❌ Falha!'}`;
    }

    await roll.toMessage({
      flavor: `<strong>Acerto</strong> (${modeLabel}) — ${attrName} = ${attrVal}${bonusLine}${cdLine}`,
      speaker: ChatMessage.getSpeaker(),
      rollMode: rollMode,
    });
  }

  // ── Dialog Content (look nativo Foundry) ──────────────────────────────
  const content = `
    <div style="margin-bottom:12px;">
      <div style="font-size:13px;color:${color};margin-bottom:4px;font-weight:600;">${attrName} = ${attrVal}</div>
      <div id="na-ac-formula" style="font-family:monospace;font-size:14px;background:#f5f5f5;padding:6px 8px;border-radius:3px;border:1px solid #ddd;">1d20 + ${attrVal}</div>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Bônus Situacional?</label>
      <input type="text" id="na-ac-bonus" placeholder="ex: 1d4, +2, 5" style="width:100%;padding:4px;box-sizing:border-box;" />
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">CD do Teste (opcional)</label>
      <input type="number" id="na-ac-cd" min="0" placeholder="ex: 15" style="width:100%;padding:4px;box-sizing:border-box;" />
    </div>
    <div style="margin-bottom:6px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Modo de Rolagem</label>
      <select id="na-ac-rollmode" style="width:100%;padding:4px;box-sizing:border-box;">
        <option value="publicroll">Rolar Público</option>
        <option value="gmroll">Rolar Privado (GM)</option>
        <option value="blindroll">Rolar Cego (GM)</option>
        <option value="selfroll">Rolar Para Si</option>
      </select>
    </div>
  `;

  // ── Dialog nativo ──────────────────────────────────────────────────────
  new Dialog({
    title: 'Acerto',
    content: content,
    buttons: {
      advantage: {
        label: 'Vantagem',
        callback: (html) => {
          const bonusRaw = html.find('#na-ac-bonus').val() ?? '';
          const rollMode = html.find('#na-ac-rollmode').val() ?? 'publicroll';
          const cdVal = Number(html.find('#na-ac-cd').val()) || 0;
          doRoll('advantage', rollMode, bonusRaw, cdVal);
        }
      },
      normal: {
        label: 'Normal',
        callback: (html) => {
          const bonusRaw = html.find('#na-ac-bonus').val() ?? '';
          const rollMode = html.find('#na-ac-rollmode').val() ?? 'publicroll';
          const cdVal = Number(html.find('#na-ac-cd').val()) || 0;
          doRoll('normal', rollMode, bonusRaw, cdVal);
        }
      },
      disadvantage: {
        label: 'Desvantagem',
        callback: (html) => {
          const bonusRaw = html.find('#na-ac-bonus').val() ?? '';
          const rollMode = html.find('#na-ac-rollmode').val() ?? 'publicroll';
          const cdVal = Number(html.find('#na-ac-cd').val()) || 0;
          doRoll('disadvantage', rollMode, bonusRaw, cdVal);
        }
      },
      cancel: {
        label: 'Cancelar',
        callback: () => {}
      }
    },
    default: 'normal',
    render: (html) => {
      const bonusInput = html.find('#na-ac-bonus');
      const formulaDisplay = html.find('#na-ac-formula');

      bonusInput.on('input', () => {
        const { extra } = parseBonus(bonusInput.val() ?? '');
        formulaDisplay.text(buildFormula('normal', extra));
      });
    }
  }).render(true);
})();
