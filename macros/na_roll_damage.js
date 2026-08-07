// ============================================================================
// Night Assassin's Rolagem de Dano v12 (macro standalone + relay do GM)
// Suporte a CSB, alvos selecionados (game.user.targets) e atualização de pdr_gasto_valor.
//
// INTEGRAÇÃO CSB:
// %{return await game.macros.get('MACRO_ID_AQUI').execute({
//   actorUuid: entity.uuid,
//   nome: 'Golpe Supremo',
//   entradas: [
//     { tipoAcao: 'unica',   dado: '3d8',  fixo: 0, attrs: [],      tiposDano: ['trovejante'] },
//     { tipoAcao: 'ataque',  dado: '2d10', fixo: 8, attrs: ['dex'], tiposDano: ['cortante', 'perfurante'] },
//   ],
//   pdrCusto: 3
// });}%
// ============================================================================
(async () => {
  // ── 1. CSS Injetado (Guard) ────────────────────────────────────────────────
  if (!document.getElementById('na-roll-damage-style')) {
    const style = document.createElement('style');
    style.id = 'na-roll-damage-style';
    style.textContent = `
      .na-dmg-dialog {
        --na-bg: #100e0c; --na-panel: #191612; --na-raised: #24201b;
        --na-line: #4a4034; --na-gold: #e8bd55; --na-lime: #a4fe23;
        --na-text: #f4efe7; --na-muted: #a69b8d; --na-danger: #ff5964;
        font-family: "Lexend", sans-serif; color: var(--na-text); background: var(--na-bg);
        padding: 12px; box-sizing: border-box; width: 100%; border: 1px solid var(--na-line);
        border-radius: 8px; box-shadow: inset 0 1px rgba(255,255,255,.04);
      }
      .na-dmg-dialog * { box-sizing: border-box; }
      .na-dmg-kicker { color: var(--na-gold); font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      .na-dmg-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; }
      .na-marca-pill { padding:4px 8px; border:1px solid rgba(255,89,100,.55); border-radius:999px; color:#ff7b84; background:rgba(193,0,12,.16); font-size:10px; font-weight:800; }
      .na-dmg-dialog .na-label {
        font-weight: 700;
        font-size: 10px;
        color: var(--na-muted);
        display: block;
        margin-bottom: 3px;
        text-transform: uppercase;
        letter-spacing: .08em;
      }
      .na-dmg-dialog .na-hint {
        font-weight: 400;
        font-size: 10px;
        color: #9C9284;
        text-transform: none;
      }
      .na-dmg-dialog input[type=text],
      .na-dmg-dialog input[type=number],
      .na-dmg-dialog select {
        width: 100%;
        height: 34px;
        padding: 5px 9px;
        box-sizing: border-box;
        font-size: 12px;
        border: 1px solid var(--na-line);
        border-radius: 6px;
        background: var(--na-raised);
        color: var(--na-text); color-scheme: dark;
        transition: border-color .15s ease;
      }
      .na-dmg-dialog input[type=text]:focus,
      .na-dmg-dialog input[type=number]:focus,
      .na-dmg-dialog select:focus {
        border-color: var(--na-gold); outline: none; box-shadow: 0 0 0 2px rgba(232,189,85,.12);
      }
      .na-dmg-dialog select option {
        background: #24201b;
        color: #f4efe7;
      }
      .na-dmg-dialog input.na-dado-inp {
        font-family: "JetBrains Mono", Consolas, monospace;
      }
      #na-entradas-container {
        max-height: 52vh;
        overflow-y: auto;
        margin-bottom: 8px;
        padding-right: 4px;
      }
      #na-entradas-container::-webkit-scrollbar { width: 5px; }
      #na-entradas-container::-webkit-scrollbar-track { background: var(--na-bg); border-radius: 3px; }
      #na-entradas-container::-webkit-scrollbar-thumb { background: var(--na-line); border-radius: 3px; }

      .na-entrada {
        border: 1px solid var(--na-line); border-left: 3px solid var(--na-lime);
        border-radius: 7px; padding: 10px; margin-bottom: 9px; background: var(--na-panel);
      }
      .na-entry-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 9px; padding-bottom: 7px; border-bottom: 1px solid rgba(255,255,255,.07);
      }
      .na-entry-num {
        font-size: 11px;
        font-weight: 700;
        color: var(--na-gold);
        text-transform: uppercase;
        letter-spacing: .5px;
      }
      .na-remove-btn {
        font-size: 11px;
        line-height: 1;
        height: 24px; width: 26px;
        padding: 0;
        cursor: pointer;
        color: var(--na-danger); border: 1px solid rgba(255,89,100,.4);
        background: rgba(193,0,12,.12); border-radius: 5px;
        transition: background .15s;
      }
      .na-remove-btn:hover { background: rgba(193,0,12,.3); color: #fff; }

      .na-row-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px;
        margin-bottom: 4px;
      }

      .na-attrs { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 5px; padding: 2px 0; }
      .na-attr-label {
        display: flex; align-items: center; gap: 3px;
        cursor: pointer; white-space: nowrap; user-select: none;
        justify-content:center; background: var(--na-raised); border: 1px solid var(--na-line); border-radius: 5px;
        padding: 5px 6px; min-height:28px;
      }
      .na-attr-label:hover { border-color: var(--na-gold); }

      .na-dano-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; padding: 2px 0 5px; }
      .na-dano-label {
        display: inline-flex; align-items: center; gap: 3px;
        justify-content:center; background: var(--na-raised); border: 1px solid var(--na-line); border-radius: 5px;
        padding: 5px 6px; min-height:28px; cursor: pointer; user-select: none;
        color: var(--na-muted); transition: all .15s ease; font-size: 10px;
      }
      .na-dano-label:hover { border-color: var(--na-lime); color: var(--na-text); }
      .na-dmg-dialog input[type="checkbox"] { appearance:none; width:13px; height:13px; margin:0; border:1px solid #746858; border-radius:3px; background:#0d0b09; cursor:pointer; display:grid; place-items:center; flex:0 0 13px; }
      .na-dmg-dialog input[type="checkbox"]::after { content:""; width:7px; height:7px; border-radius:2px; background:var(--na-lime); transform:scale(0); transition:transform .12s ease; }
      .na-dmg-dialog input[type="checkbox"]:checked::after { transform:scale(1); }
      .na-attr-label:has(input:checked), .na-dano-label:has(input:checked) { border-color:var(--na-lime); background:rgba(164,254,35,.09); color:var(--na-text); }

      .na-dano-tip {
        display: none; margin: 4px 0;
        font-size: 10px; color: var(--na-muted); background: var(--na-raised); border-left: 2px solid var(--na-gold);
        border-radius: 0 5px 5px 0; padding: 6px 8px; line-height: 1.35;
      }

      .na-linha-preview {
        margin-top: 4px; font-family: "JetBrains Mono", monospace; font-size: 11px;
        color: var(--na-lime); background: #0b0908; border: 1px solid rgba(164,254,35,.22);
        padding: 5px 7px; border-radius: 5px; min-height: 24px;
      }

      #na-add-btn {
        width: 100%; height: 32px; margin-bottom: 9px; cursor: pointer;
        border: 1px dashed rgba(164,254,35,.45); border-radius: 6px;
        background: rgba(164,254,35,.05); color: var(--na-lime); font-size: 11px; font-weight: 800;
        transition: background .15s ease, border-color .15s ease;
      }
      #na-add-btn:hover { background: rgba(164,254,35,.12); border-color: var(--na-lime); }
      .na-dmg-footer { display:grid; grid-template-columns:140px minmax(0,1fr); gap:10px; align-items:end; padding-top:9px; border-top:1px solid var(--na-line); }
      .na-critical-toggle { display:flex; align-items:center; gap:10px; margin-top:10px; padding:9px 11px; border:1px solid #765b1c; border-radius:6px; background:linear-gradient(90deg,rgba(255,183,0,.14),rgba(255,183,0,.04)); cursor:pointer; }
      .na-critical-toggle input { width:18px; height:18px; margin:0; accent-color:#ffbf2f; }
      .na-critical-toggle span { display:flex; flex-direction:column; gap:2px; }
      .na-critical-toggle strong { color:#ffd166; font-size:12px; letter-spacing:.04em; text-transform:uppercase; }
      .na-critical-toggle small { color:#b9aa91; font-size:10px; }

      #na-total-preview {
        font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 700;
        min-height:34px; display:flex; align-items:center; padding: 6px 10px; background: #0b0908; color: var(--na-lime);
        border: 1px solid rgba(164,254,35,.3); border-radius: 6px;
        word-break: break-all; letter-spacing: .5px;
      }
      @media (max-width:620px) { .na-attrs{grid-template-columns:repeat(2,1fr)} .na-dano-grid{grid-template-columns:repeat(2,1fr)} .na-dmg-footer{grid-template-columns:1fr} }
    `;
    document.head.appendChild(style);
  }

  // ── 2. Seleção e Resolução Estrita do Ator ─────────────────────────────────
  if (!canvas.ready) return ui.notifications.warn('Canvas não pronto.');

  const args = (typeof scope !== 'undefined') ? (scope || {}) : {};

  let entity = null;
  if (args.actorUuid) {
    const doc = await fromUuid(args.actorUuid);
    entity = doc?.actor ?? doc;
  } else if (canvas.tokens?.controlled?.length > 0) {
    entity = canvas.tokens.controlled[0].actor;
  } else if (game.user?.character) {
    entity = game.user.character;
  }

  if (!entity) return ui.notifications.error('Sem personagem ativo. Selecione um token.');

  const actor = entity;
  const props = actor.system?.props ?? {};

  function parseNum(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const text = String(raw ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim().replace(',', '.');
    const m = text.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  }

  // ── 3. Definições Canônicas (7 Atributos) ───────────────────────────
  const ATTRS = {
    vit: { label: 'VIT', color: '#36D67A' },
    for: { label: 'FOR', color: '#C1000C' },
    dex: { label: 'DEX', color: '#28D7FF' },
    fdv: { label: 'FDV', color: '#BB97F9' },
    car: { label: 'CAR', color: '#FF9100' },
    int: { label: 'INT', color: '#F8EB4D' },
    sab: { label: 'SAB', color: '#D45CA4' },
  };

  const attrVal = Object.fromEntries(
    Object.keys(ATTRS).map(k => [k, parseNum(props[`${k}_display`])])
  );

  function getMarcaDamageFormula(entradas) {
    const currentProps = actor.system?.props ?? {};
    if (parseNum(currentProps.marca_ativa) !== 1) return '';

    const dados = Math.max(0, Math.trunc(parseNum(currentProps.marca_dano_dados)));
    const faces = Math.max(0, Math.trunc(parseNum(currentProps.marca_dano_faces)));
    if (dados < 1 || faces < 2) return '';

    const damageOverTime = new Set(['sangramento', 'envenenamento']);
    const hasDirectAttack = entradas.some(entry =>
      entry.tipoAcao === 'ataque' &&
      (entry.selTiposDano.length === 0 || entry.selTiposDano.some(tipo => !damageOverTime.has(tipo)))
    );

    return hasDirectAttack ? `${dados}d${faces}` : '';
  }

  const TIPOS_DANO = [
    { key: 'cortante', label: 'Cortante', cat: 'comum', desc: 'Reduzível e bloqueável. Dano por lâminas.' },
    { key: 'perfurante', label: 'Perfurante', cat: 'comum', desc: 'Reduzível e bloqueável. Dano por pontas e projéteis.' },
    { key: 'concussao', label: 'Concussão', cat: 'comum', desc: 'Reduzível e bloqueável. Dano por impacto e força bruta.' },
    { key: 'trovejante', label: 'Trovejante', cat: 'especial', desc: 'Irredutível. Pode ser anulado, nunca reduzido.' },
    { key: 'sonoro', label: 'Sonoro', cat: 'especial', desc: 'Inevitável. Não esquivado/bloqueado. Teste VIT (CD=10+DEX+FDV) para metade.' },
    { key: 'ferida', label: 'Ferida', cat: 'especial', desc: 'Reduz o PDV MÁXIMO permanentemente. Não regenera.' },
    { key: 'sangramento', label: 'Sangramento', cat: 'especial', desc: 'Dano por turno no início do turno do alvo.' },
    { key: 'envenenamento', label: 'Envenenamento', cat: 'especial', desc: 'Dano por turno no início do turno do alvo.' },
    { key: 'necrotico', label: 'Necrótico', cat: 'especial', desc: 'Incurável em combate. Só trata com descanso longo (mín. 24h).' },
    { key: 'acido', label: 'Ácido', cat: 'elemental', desc: 'Dano químico e corrosivo.' },
    { key: 'colapso', label: 'Colapso', cat: 'elemental', desc: 'Dano de desintegração e ruptura estrutural.' },
    { key: 'congelante', label: 'Congelante', cat: 'elemental', desc: 'Dano por frio extremo e congelamento.' },
    { key: 'eletrico', label: 'Elétrico', cat: 'elemental', desc: 'Dano por descarga elétrica.' },
    { key: 'fogo', label: 'Fogo', cat: 'elemental', desc: 'Dano por chamas e calor.' },
    { key: 'impacto', label: 'Impacto', cat: 'elemental', desc: 'Dano de choque e impacto concentrado.' },
    { key: 'mental', label: 'Mental', cat: 'elemental', desc: 'Dano direto à mente.' },
    { key: 'solar', label: 'Solar', cat: 'elemental', desc: 'Dano produzido por energia solar.' },
    { key: 'venenoso', label: 'Venenoso', cat: 'elemental', desc: 'Dano direto causado por veneno.' },
  ];

  const TIPOS_ACAO = [
    { key: 'ataque', label: 'Ação de Ataque', desc: '1 por turno. Ataque Padrão ou técnicas de ataque.' },
    { key: 'especial', label: 'Ação Especial', desc: '1 por turno. Técnicas de Ação Especial.' },
    { key: 'unica', label: 'Ação Única', desc: '1 por RODADA. Nenhum efeito pode dar mais de uma.' },
    { key: 'completa', label: 'Ação Completa', desc: 'Consome Movimento + Ataque.' },
    { key: 'reacao', label: 'Reação', desc: '1 por rodada. Reage a ataques como alvo.' },
    { key: 'livre', label: 'Ação Livre', desc: 'Limitada pelo Mestre. Sem efeito mecânico.' },
  ];

  // ── Helper de Fórmula ──────────────────────────────────────────────────────
  function buildEntryFormula(dado, fixo, selAttrs) {
    const parts = [];
    const cleanDado = (dado || '').trim();
    if (cleanDado) parts.push(cleanDado);

    if (fixo !== 0) {
      if (parts.length === 0) parts.push(String(fixo));
      else parts.push(fixo > 0 ? `+ ${fixo}` : `- ${Math.abs(fixo)}`);
    }

    for (const k of selAttrs) {
      const v = attrVal[k];
      if (v !== 0) {
        if (parts.length === 0) parts.push(String(v));
        else parts.push(v > 0 ? `+ ${v}` : `- ${Math.abs(v)}`);
      }
    }

    return parts.length > 0 ? parts.join(' ') : '0';
  }

  // ── Pré-preenchidos via CSB ───────────────────────────────────────────────
  const preNome = args.nome ?? '';
  const prePdr = Number.isFinite(Number(args.pdrCusto)) ? Number(args.pdrCusto) : 0;

  const preEntradas = Array.isArray(args.entradas) && args.entradas.length > 0
    ? args.entradas.map(e => ({
      tipoAcao: e.tipoAcao ?? '',
      dado: e.dado ?? '',
      fixo: Number.isFinite(Number(e.fixo)) ? Number(e.fixo) : 0,
      attrs: Array.isArray(e.attrs) ? e.attrs : (e.attr ? [e.attr] : []),
      tiposDano: Array.isArray(e.tiposDano) ? e.tiposDano : (e.tipoDano ? [e.tipoDano] : [])
    }))
    : [{
      tipoAcao: args.tipoAcao ?? '',
      dado: args.formulaBase ?? '',
      fixo: Number.isFinite(Number(args.fixo)) ? Number(args.fixo) : 0,
      attrs: Array.isArray(args.attrs) ? args.attrs : (args.attr ? [args.attr] : []),
      tiposDano: Array.isArray(args.tiposDano) ? args.tiposDano : (args.tipoDano ? [args.tipoDano] : [])
    }];

  // ── Helpers de Geração HTML ───────────────────────────────────────────────
  function makeAcaoOpts(sel) {
    return `<option value="">Nenhuma —</option>
      ${TIPOS_ACAO.map(t => `<option value="${t.key}" ${sel === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}`;
  }

  function makeDanoCheckboxes(selTipos, idx) {
    return TIPOS_DANO.map(t => {
      const chk = selTipos.includes(t.key) ? 'checked' : '';
      return `<label class="na-dano-label" title="${t.desc}">
        <input type="checkbox" class="na-dano-chk" data-idx="${idx}" value="${t.key}" ${chk} />
        <span>${t.label}</span>
      </label>`;
    }).join('');
  }

  function makeAttrCheckboxes(selAttrs, idx) {
    return Object.entries(ATTRS).map(([k, meta]) => {
      const chk = selAttrs.includes(k) ? 'checked' : '';
      return `<label class="na-attr-label">
        <input type="checkbox" class="na-attr-chk" data-idx="${idx}" value="${k}" ${chk} />
        <span style="color:${meta.color};font-weight:700;font-size:11px;">${meta.label}</span>
        <span style="color:#9C9284;font-size:10px;">${attrVal[k]}</span>
      </label>`;
    }).join('');
  }

  function makeEntradaHtml(e, idx) {
    return `
    <div class="na-entrada" data-idx="${idx}">
      <div class="na-entry-header">
        <strong class="na-entry-num"></strong>
        <button type="button" class="na-remove-btn" data-idx="${idx}">✕</button>
      </div>

      <div class="na-row-grid">
        <div>
          <label class="na-label">Tipo de Ação</label>
          <select class="na-acao-sel" data-idx="${idx}">${makeAcaoOpts(e.tipoAcao)}</select>
        </div>
        <div>
          <label class="na-label">Dado(s) <span class="na-hint">(ex: 3d8)</span></label>
          <input type="text" class="na-dado-inp" data-idx="${idx}"
            value="${e.dado ?? ''}" placeholder="sem dado" />
        </div>
      </div>

      <div class="na-row-grid" style="margin-top:4px;">
        <div>
          <label class="na-label">+ Fixo Adicional</label>
          <input type="number" class="na-fixo-inp" data-idx="${idx}"
            value="${e.fixo ?? 0}" placeholder="0" />
        </div>
        <div>
          <label class="na-label">Atributos no Dano</label>
          <div class="na-attrs">${makeAttrCheckboxes(e.attrs ?? [], idx)}</div>
        </div>
      </div>

      <label class="na-label" style="margin-top:6px;">Tipo(s) de Dano</label>
      <div class="na-dano-grid">${makeDanoCheckboxes(e.tiposDano ?? [], idx)}</div>

      <div class="na-dano-tip" data-idx="${idx}"></div>
      <div class="na-linha-preview" data-idx="${idx}"></div>
    </div>`;
  }

  // ── 4. Conteúdo do Dialog ─────────────────────────────────────────────────
  const entradasIniciais = preEntradas.map((e, i) => makeEntradaHtml(e, i)).join('');
  const marcaAtivaInicial = parseNum(props.marca_ativa) === 1;
  const marcaFormulaInicial = marcaAtivaInicial
    ? `${Math.max(0, Math.trunc(parseNum(props.marca_dano_dados)))}d${Math.max(0, Math.trunc(parseNum(props.marca_dano_faces)))}`
    : '';

  const content = `
  <div class="na-dmg-dialog">
    <div class="na-dmg-head">
      <span class="na-dmg-kicker">Console de dano</span>
      ${marcaAtivaInicial ? `<span class="na-marca-pill">Marca ativa · +${marcaFormulaInicial}</span>` : ''}
    </div>
    <div style="margin-bottom:8px;">
      <label class="na-label">Nome do Ataque / Técnica</label>
      <input type="text" id="na-dmg-nome" value="${preNome}" placeholder="ex: Corte Celestial" />
    </div>

    <div id="na-entradas-container">${entradasIniciais}</div>

    <button type="button" id="na-add-btn">+ Adicionar Entrada de Dano</button>

    <div class="na-dmg-footer">
      <div>
        <label class="na-label">Custo de PDR</label>
        <input type="number" id="na-dmg-pdr" min="0" value="${prePdr}" placeholder="0" />
      </div>
      <div>
        <label class="na-label">Fórmula total</label>
        <div id="na-total-preview">—</div>
      </div>
    </div>
    <label class="na-critical-toggle">
      <input type="checkbox" id="na-dmg-critical" ${args.critical === true ? 'checked' : ''} />
      <span><strong>Foi crítico?</strong><small>Dobra o dano final deste ataque antes da resistência.</small></span>
    </label>
  </div>`;

  // ── 5. Instanciação do Dialog ─────────────────────────────────────────────
  const DialogV2 = foundry.applications.api.DialogV2;
  let bindDialog;
  const dialog = new DialogV2({
    window: { title: 'Rolar Dano Night Assassins' },
    position: { width: 640, height: 'auto' },
    content,
    buttons: [
      {
        action: 'rolar',
        label: 'Rolar',
        default: true,
        callback: async (_event, _button, currentDialog) => {
          const html = $(currentDialog.element);
          const actionStartedAt = performance.now();
          const nome = html.find('#na-dmg-nome').val()?.trim() || 'Dano';
          const pdrGasto = Math.max(0, Number(html.find('#na-dmg-pdr').val()) || 0);
          const critical = html.find('#na-dmg-critical').is(':checked');

          const entradas = [];
          html.find('.na-entrada').each((_, el) => {
            const $el = $(el);
            const idx = $el.data('idx');
            const dado = $el.find(`.na-dado-inp[data-idx="${idx}"]`).val()?.trim() || '';
            const fixo = Number($el.find(`.na-fixo-inp[data-idx="${idx}"]`).val()) || 0;
            const tipoAcao = $el.find(`.na-acao-sel[data-idx="${idx}"]`).val() || '';

            const selTiposDano = [];
            $el.find(`.na-dano-chk[data-idx="${idx}"]:checked`).each((__, cb) => {
              selTiposDano.push(cb.value);
            });

            const selAttrs = [];
            $el.find(`.na-attr-chk[data-idx="${idx}"]:checked`).each((__, cb) => {
              if (ATTRS[cb.value]) selAttrs.push(cb.value);
            });

            entradas.push({ dado, fixo, tipoAcao, selTiposDano, selAttrs });
          });

          if (entradas.length === 0) return ui.notifications.warn('Adicione ao menos uma entrada de dano.');

          const formulaParts = entradas.map(e => buildEntryFormula(e.dado, e.fixo, e.selAttrs));
          const marcaFormula = getMarcaDamageFormula(entradas);
          const rollSpecs = entradas.map((entry, index) => {
            const action = TIPOS_ACAO.find(type => type.key === entry.tipoAcao)?.label ?? `Dano ${index + 1}`;
            const types = entry.selTiposDano.length > 0 ? entry.selTiposDano : ['sem_tipo'];
            return { label: action, types, formula: formulaParts[index] };
          }).filter(spec => spec.formula !== '0');
          if (marcaFormula) rollSpecs.push({ label: 'Marca do Caçador', types: ['ferida'], formula: marcaFormula });
          if (rollSpecs.length === 0) return ui.notifications.warn('Informe ao menos um dado, valor fixo ou atributo no dano.');

          let rolls;
          try {
            rolls = await Promise.all(rollSpecs.map(spec => Roll.create(critical ? `2 * (${spec.formula})` : spec.formula).evaluate()));
          } catch (_) {
            return ui.notifications.error(`Fórmula de dano inválida: ${rollSpecs.map(spec => spec.formula).join(' + ')}`);
          }

          if (game.dice3d?.showForRoll) {
            await Promise.allSettled(rolls.map(roll => game.dice3d.showForRoll(roll, game.user, true)));
          }

          const components = rollSpecs.map((spec, index) => ({
            label: spec.label,
            types: spec.types,
            subtotal: Math.max(0, Math.trunc(Number(rolls[index].total) || 0)),
          }));
          const finalDamage = components.reduce((total, component) => total + component.subtotal, 0);
          const damageTypes = [...new Set(components.flatMap(component => component.types).filter(type => type !== 'sem_tipo'))];

          // ── Atualizações imediatas e paralelas por Ator ─────────────────
          const updatesByActor = new Map();

          if (pdrGasto > 0) {
            const pdrAtual = parseNum(actor.system?.props?.pdr_gasto_valor);
            updatesByActor.set(actor.uuid, {
              actor,
              changes: { 'system.props.pdr_gasto_valor': pdrAtual + pdrGasto },
              damageTotal: null,
            });
          }

          const oniDamageRequests = [];
          if (game.user.targets && game.user.targets.size > 0 && finalDamage > 0) {
            for (const targetToken of game.user.targets) {
              const targetActor = targetToken.actor;
              if (!targetActor) continue;
              oniDamageRequests.push({ actor: targetActor, amount: finalDamage });
            }
          } else if (finalDamage > 0) {
            ui.notifications.warn('Nenhum alvo marcado. O dano foi rolado, mas nenhuma ficha foi atualizada. Marque o token com T e role novamente.');
          }

          const updateStartedAt = performance.now();
          const pendingUpdates = [...updatesByActor.values()];
          const updateResults = await Promise.allSettled([
            ...pendingUpdates.map(async pending => {
              await pending.actor.update(pending.changes);
            }),
            ...oniDamageRequests.map(async ({ actor: targetActor, amount }) => {
              let result;
              const automationModule = game.modules.get('night-assassins-csb-automation');
              if (automationModule?.active && typeof automationModule.api?.applyOniDamage === 'function') {
                result = await automationModule.api.applyOniDamage(targetActor, amount, {
                  attackName: nome,
                  critical,
                  rolledTotal: finalDamage,
                  damageTypes,
                  components,
                  requireApproval: true,
                });
              } else if (game.user.isGM || targetActor.isOwner) {
                const atual = parseNum(targetActor.system?.props?.pdv_oni_dano_tomado);
                const total = atual + amount;
                await targetActor.update({ 'system.props.pdv_oni_dano_tomado': total });
                result = { total, actorName: targetActor.name };
              } else {
                  throw new Error('Ative o módulo Night Assassins — CSB Automation e recarregue o mundo.');
              }
              ui.notifications.info(`Dano de ${result.appliedDamage ?? amount} adicionado a ${result.actorName} (total sofrido: ${result.total})`);
            }),
          ]);
          const updateElapsed = performance.now() - updateStartedAt;

          for (const [index, result] of updateResults.entries()) {
            if (result.status === 'fulfilled') continue;
            const targetName = index < pendingUpdates.length
              ? pendingUpdates[index].actor.name
              : oniDamageRequests[index - pendingUpdates.length]?.actor?.name ?? 'alvo';
            console.warn(`[NA Macro] Falha ao atualizar ${targetName}`, result.reason);
            ui.notifications.warn(result.reason?.message || `Não foi possível atualizar ${targetName}.`);
          }

          // Mantém o cartão nativo do Foundry e usa o flavor apenas para identificar a divisão.
          const componentLines = components.map(component => {
            const typeNames = component.types.map(key => TIPOS_DANO.find(type => type.key === key)?.label ?? 'Sem tipo').join(' · ');
            return `<div><strong>${component.label}</strong> — ${typeNames}: <strong>${component.subtotal}</strong></div>`;
          }).join('');
          const targetLine = oniDamageRequests.length > 0
            ? `<div>Alvo(s): ${oniDamageRequests.map(request => request.actor.name).join(', ')}</div>`
            : '<div><strong>Nenhum alvo — ficha não atualizada</strong></div>';
          const flavor = `<div><strong>${nome}</strong>${critical ? ' · CRÍTICO (dobrado)' : ''}${pdrGasto > 0 ? ` · −${pdrGasto} PDR` : ''}</div>${componentLines}<hr><div><strong>Total: ${finalDamage}</strong></div>${targetLine}`;

          const modeMap = { publicroll: 'public', gmroll: 'gm', blindroll: 'blind', selfroll: 'self' };
          const chatData = ChatMessage.applyMode({ flavor, rolls, speaker: ChatMessage.getSpeaker({ actor }) }, modeMap[game.settings.get('core', 'rollMode')] ?? 'public');
          await ChatMessage.create(chatData);
          if (args.debug === true) {
            console.log(
              `[TANG-ROU] ${nome} | ${components.map(component => `${component.label}=${component.subtotal}`).join(', ')} | total ${finalDamage} | updates ${updateElapsed.toFixed(2)}ms | ação ${(performance.now() - actionStartedAt).toFixed(2)}ms`
            );
          }
        },
      },
      { action: 'cancelar', label: 'Cancelar', callback: () => null },
    ],
    naBind: bindDialog = (html) => {
      let nextIdx = preEntradas.length;

      function renumberEntries() {
        html.find('.na-entry-num').each((i, el) => {
          el.textContent = `Dano ${i + 1}`;
        });
      }

      function updateLinePreview($entry, idx) {
        const dado = $entry.find(`.na-dado-inp[data-idx="${idx}"]`).val()?.trim() || '';
        const fixo = Number($entry.find(`.na-fixo-inp[data-idx="${idx}"]`).val()) || 0;
        const selAttrs = [];
        $entry.find(`.na-attr-chk[data-idx="${idx}"]:checked`).each((_, cb) => {
          if (ATTRS[cb.value]) selAttrs.push(cb.value);
        });

        const f = buildEntryFormula(dado, fixo, selAttrs);
        $entry.find(`.na-linha-preview[data-idx="${idx}"]`).text(f);
      }

      function updateTotalPreview() {
        const parts = [];
        const previewEntries = [];
        html.find('.na-entrada').each((_, el) => {
          const $el = $(el);
          const idx = $el.data('idx');
          const dado = $el.find(`.na-dado-inp[data-idx="${idx}"]`).val()?.trim() || '';
          const fixo = Number($el.find(`.na-fixo-inp[data-idx="${idx}"]`).val()) || 0;
          const tipoAcao = $el.find(`.na-acao-sel[data-idx="${idx}"]`).val() || '';
          const selAttrs = [];
          const selTiposDano = [];
          $el.find(`.na-attr-chk[data-idx="${idx}"]:checked`).each((__, cb) => {
            if (ATTRS[cb.value]) selAttrs.push(cb.value);
          });
          $el.find(`.na-dano-chk[data-idx="${idx}"]:checked`).each((__, cb) => selTiposDano.push(cb.value));

          const f = buildEntryFormula(dado, fixo, selAttrs);
          if (f !== '0') parts.push(f);
          previewEntries.push({ tipoAcao, selTiposDano });
        });
        const marcaPreview = getMarcaDamageFormula(previewEntries);
        if (marcaPreview) parts.push(marcaPreview);
        html.find('#na-total-preview').text(parts.length ? parts.join(' + ') : '0');
      }

      function updateDanoTip($entry, idx) {
        const selKeys = [];
        $entry.find(`.na-dano-chk[data-idx="${idx}"]:checked`).each((_, cb) => {
          selKeys.push(cb.value);
        });

        const descs = selKeys.map(k => {
          const meta = TIPOS_DANO.find(t => t.key === k);
          return meta ? `<strong>${meta.label}:</strong> ${meta.desc}` : '';
        }).filter(Boolean);

        const $tip = $entry.find(`.na-dano-tip[data-idx="${idx}"]`);
        if (descs.length > 0) {
          $tip.html(descs.join('<br/>')).show();
        } else {
          $tip.hide();
        }
      }

      const $container = html.find('#na-entradas-container');

      function bindEntry($entry, idx) {
        $entry.find('.na-dado-inp, .na-fixo-inp').on('change input', () => {
          updateLinePreview($entry, idx);
          updateTotalPreview();
        });
        $entry.find('.na-attr-chk').on('change', () => {
          updateLinePreview($entry, idx);
          updateTotalPreview();
        });
        $entry.find('.na-acao-sel').on('change', updateTotalPreview);
        $entry.find('.na-dano-chk').on('change', () => {
          updateDanoTip($entry, idx);
          updateTotalPreview();
        });
        $entry.find('.na-remove-btn').on('click', () => {
          if (html.find('.na-entrada').length <= 1) {
            ui.notifications.warn('Mantenha ao menos uma entrada de dano.');
            return;
          }
          $entry.remove();
          renumberEntries();
          updateTotalPreview();
        });

        updateLinePreview($entry, idx);
        updateDanoTip($entry, idx);
      }

      html.find('.na-entrada').each((_, el) => {
        const $el = $(el);
        bindEntry($el, $el.data('idx'));
      });
      renumberEntries();
      updateTotalPreview();

      html.find('#na-add-btn').on('click', () => {
        const idx = nextIdx++;
        const $new = $(makeEntradaHtml({ tipoAcao: '', dado: '', fixo: 0, attrs: [], tiposDano: [] }, idx));
        $container.append($new);
        bindEntry($new, idx);
        renumberEntries();
        updateTotalPreview();
      });
    },
  });

  Hooks.once('renderDialogV2', (app, element) => {
    if (app === dialog) bindDialog($(element));
  });

  // Singleton guard
  if (window.__NARollDamageDialog) {
    try { window.__NARollDamageDialog.close(); } catch (_) { }
  }
  window.__NARollDamageDialog = dialog;

  dialog.render({ force: true });
})();
