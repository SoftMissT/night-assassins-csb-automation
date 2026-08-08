// Night Assassins Marca do Caçador, Fase 1
// CSB: %{return await game.macros.getName('na-marca-cacador')?.execute({actorUuid:entity.uuid});}%
(async () => {
  const startedAt = performance.now();
  if (!canvas.ready) return ui.notifications.warn("Canvas não pronto.");

  const args = typeof scope !== "undefined" ? scope ?? {} : {};
  const actor = args.actorUuid
    ? await fromUuid(args.actorUuid)
    : canvas.tokens.controlled[0]?.actor ?? game.user.character;
  if (!actor) return ui.notifications.error("Sem personagem ativo.");
  if (!actor.isOwner) return ui.notifications.error("Você não pode alterar este personagem.");

  const { DialogV2 } = foundry.applications.api;
  const ATTRIBUTES = Object.freeze([
    { key: "vit", label: "VIT" },
    { key: "dex", label: "DEX" },
    { key: "for", label: "FOR" },
    { key: "car", label: "CAR" },
    { key: "fdv", label: "FDV" },
    { key: "int", label: "INT" },
    { key: "sab", label: "SAB" },
  ]);
  const PHYSICAL = new Set(["vit", "dex", "for", "fdv"]);
  const DIALOG_POSITION = Object.freeze({ width: 680 });

  function panel(content) {
    return `<div style="display:grid;gap:14px;padding:8px 4px;min-width:0">${content}</div>`;
  }

  function number(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const text = String(raw ?? "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(",", ".");
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function level(props) {
    return number(props.nvl_num ?? props.nvl_pj);
  }

  function attribute(props, key) {
    const display = props[`${key}_display`];
    if (display !== undefined && display !== null && display !== "") return number(display);
    const configured = props[`atr_${key}_valor_config`];
    if (configured !== undefined && configured !== null && configured !== "") return number(configured);
    return number(props[`atr_${key}_valor`]);
  }

  function isDestinyMark(props) {
    return String(props.hab_escolhida ?? "").includes("hab_escolhida_marca_destino");
  }

  function isLostDescendant(props) {
    return String(props.origem_dropdown ?? "").includes("origem_descendente_perdido");
  }

  function isBornMarked(props) {
    return isDestinyMark(props) && isLostDescendant(props);
  }

  function validScar(value) {
    return PHYSICAL.has(String(value ?? "").toLowerCase());
  }

  function emptyBonuses() {
    return Object.fromEntries(ATTRIBUTES.map(({ key }) => [`system.props.${key}_marca_temp`, 0]));
  }

  function activeBonuses(bornMarked, scar) {
    const patch = {};
    for (const { key } of ATTRIBUTES) {
      const base = bornMarked ? (PHYSICAL.has(key) ? 4 : 2) : (PHYSICAL.has(key) ? 3 : 1);
      patch[`system.props.${key}_marca_temp`] = base + (key === scar ? 2 : 0);
    }
    return patch;
  }

  async function chooseScar(props, bornMarked) {
    const destinyScar = String(props.hab_marca_destino_atributo ?? "").toLowerCase();
    if (bornMarked && ATTRIBUTES.some(({ key }) => key === destinyScar)) return destinyScar;

    const allowed = bornMarked ? ATTRIBUTES : ATTRIBUTES.filter(({ key }) => PHYSICAL.has(key));
    const options = allowed.map(({ key, label }) => {
      const current = attribute(props, key);
      return `<option value="${key}">${label} (${current} → ${current + (bornMarked ? (PHYSICAL.has(key) ? 6 : 4) : 5)})</option>`;
    }).join("");

    const chosen = await DialogV2.wait({
      window: { title: "Marca do Caçador Atributo da Cicatriz" },
      position: DIALOG_POSITION,
      content: panel(`
        <p style="margin:0">Escolha o atributo ligado à cicatriz.</p>
        <div class="form-group" style="margin:0">
          <label for="na-marca-cicatriz"><strong>Atributo da Cicatriz</strong></label>
          <select id="na-marca-cicatriz" style="width:100%">${options}</select>
        </div>`),
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "confirmar", label: "Confirmar", callback: (_event, _button, dialog) => String(dialog.element.querySelector("#na-marca-cicatriz")?.value ?? "") },
        { action: "cancelar", label: "Cancelar", callback: () => null },
      ],
    });
    return allowed.some(({ key }) => key === chosen) ? chosen : null;
  }

  function awakeningCd(props) {
    if (isBornMarked(props)) return 0;
    if (isDestinyMark(props) && level(props) >= 12) return 14;
    if (isLostDescendant(props)) return 16;
    return 18;
  }

  function lifeYears(total) {
    if (total <= 20) return 1;
    if (total <= 50) return 5;
    if (total <= 75) return 10;
    if (total <= 95) return 20;
    return 35;
  }

  async function awaken() {
    const props = actor.system.props ?? {};
    if (number(props.marca_despertada) === 1) return ui.notifications.info("A Marca já foi despertada.");
    if (level(props) < 12) return ui.notifications.warn("A Marca do Caçador exige Nível 12.");

    const bornMarked = isBornMarked(props);
    const scar = await chooseScar(props, bornMarked);
    if (!scar) return;

    if (!bornMarked) {
      const cd = awakeningCd(props);
      const fdv = attribute(props, "fdv");
      const roll = await new Roll(`1d20 + ${fdv}`).evaluate();
      await roll.toMessage({
        flavor: `<strong>Despertar da Marca do Caçador</strong> FDV ${fdv} contra CD ${cd}`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
      if (roll.total < cd) return ui.notifications.warn("A Marca não despertou.");
    }

    let remainingLife = number(props.vid_rest_num);
    if (!bornMarked && remainingLife <= 0) {
      const destinyBonus = isDestinyMark(props) && level(props) >= 12 ? 15 : 0;
      const roll = await new Roll(`1d100 + ${attribute(props, "vit")} + ${destinyBonus}`).evaluate();
      const rolledYears = lifeYears(roll.total);
      const age = number(props.idade);
      remainingLife = age >= 25
        ? (await new Roll("1d12").evaluate()).total / 12
        : Math.min(rolledYears, Math.max(1, 25 - age));
    }

    await actor.update({
      "system.props.marca_despertada": 1,
      "system.props.marca_ativa": 0,
      "system.props.marca_atributo_cicatriz": scar,
      "system.props.vid_rest_num": bornMarked ? number(props.vid_rest_num) : remainingLife,
      "system.props.marca_ressonancia_usada": 0,
    });
    ui.notifications.info(bornMarked ? "Nascido Marcado reconhecido." : "A Marca do Caçador despertou.");
    return activate();
  }

  async function chooseActivation(props, bornMarked) {
    const breathLevel = Math.max(1, number(props.nvl_respiracao_num));
    const normalMax = 1 + breathLevel + (isLostDescendant(props) && !bornMarked ? 1 : 0);
    const max = bornMarked ? breathLevel : Math.min(normalMax, Math.max(0, Math.floor(number(props.vid_rest_num))));
    if (max < 1) return null;
    const options = Array.from({ length: max }, (_, index) => index + 1)
      .map(value => `<option value="${value}">${value} ${bornMarked ? "de Intensidade" : value === 1 ? "Ano de Vida" : "Anos de Vida"}</option>`)
      .join("");
    return DialogV2.wait({
      window: { title: bornMarked ? "Ativar Marca Intensidade" : "Ativar Marca Anos de Vida" },
      position: DIALOG_POSITION,
      content: panel(`
        <p style="margin:0">${bornMarked ? `Intensidade máxima: ${breathLevel}.` : `Limite desta ativação: ${max}.`}</p>
        <div class="form-group" style="margin:0">
          <label for="na-marca-potencia"><strong>${bornMarked ? "Intensidade" : "Anos queimados"}</strong></label>
          <select id="na-marca-potencia" style="width:100%">${options}</select>
        </div>`),
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "ativar", label: "Ativar Marca", callback: (_event, _button, dialog) => number(dialog.element.querySelector("#na-marca-potencia")?.value) },
        { action: "cancelar", label: "Cancelar", callback: () => null },
      ],
    });
  }

  async function activate() {
    const props = actor.system.props ?? {};
    if (number(props.marca_despertada) !== 1) return awaken();
    if (number(props.marca_ativa) === 1) return ui.notifications.info("A Marca já está ativa.");

    const bornMarked = isBornMarked(props);
    const power = await chooseActivation(props, bornMarked);
    if (!power) return ui.notifications.warn("Não há potência válida para ativar a Marca.");
    const scar = String(props.marca_atributo_cicatriz ?? props.hab_marca_destino_atributo ?? "").toLowerCase();
    if (!ATTRIBUTES.some(({ key }) => key === scar)) return ui.notifications.error("Atributo da Cicatriz inválido.");

    await actor.update({
      "system.props.marca_ativa": 1,
      "system.props.marca_anos_queimados": bornMarked ? 0 : power,
      "system.props.marca_intensidade": bornMarked ? power : 0,
      "system.props.marca_overdrive": 0,
      "system.props.marca_dano_dados": power,
      "system.props.marca_dano_faces": bornMarked ? 20 : 12,
      "system.props.marca_critico_margem": bornMarked ? 18 : power >= 3 ? 17 : 19,
      "system.props.marca_ataque_extra": 1,
      "system.props.marca_corpo_recusa_usado": 0,
      "system.props.marca_corte_impossivel_usado": 0,
      "system.props.marca_resistencia_usada": 0,
      ...activeBonuses(bornMarked, scar),
    });
    ui.notifications.info(`Marca ativa: +${power}d${bornMarked ? 20 : 12} de Dano de Ferida.`);
  }

  async function finish() {
    const props = actor.system.props ?? {};
    if (number(props.marca_ativa) !== 1) return ui.notifications.info("A Marca não está ativa.");
    const bornMarked = isBornMarked(props);
    const years = number(props.marca_anos_queimados) + number(props.marca_overdrive);
    const activations = number(props.marca_ativacoes_dia) + 1;

    await actor.update({
      "system.props.marca_ativa": 0,
      "system.props.marca_anos_queimados": 0,
      "system.props.marca_intensidade": 0,
      "system.props.marca_overdrive": 0,
      "system.props.marca_dano_dados": 0,
      "system.props.marca_dano_faces": 0,
      "system.props.marca_critico_margem": 20,
      "system.props.marca_ataque_extra": 0,
      "system.props.marca_ativacoes_dia": activations,
      "system.props.marca_exaustao_final": bornMarked ? 0 : Math.min(8, activations * 2),
      "system.props.marca_dano_necrotico_dados": years,
      "system.props.vid_rest_num": bornMarked ? number(props.vid_rest_num) : Math.max(0, number(props.vid_rest_num) - years),
      ...emptyBonuses(),
    });
    ui.notifications.info(years > 0
      ? `Marca encerrada. Custo final pendente: ${years}d6 de dano necrótico irredutível.`
      : "Marca encerrada sem custo de vida.");
  }

  async function showMenu() {
    const props = actor.system.props ?? {};
    const awakened = number(props.marca_despertada) === 1;
    const active = number(props.marca_ativa) === 1;
    const bornMarked = isBornMarked(props);
    const status = !awakened ? "Não despertada" : active ? "Ativa" : "Despertada";
    const action = await DialogV2.wait({
      window: { title: "Marca do Caçador" },
      position: DIALOG_POSITION,
      content: panel(`
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
          <div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>ESTADO</small><br><strong>${status}</strong></div>
          <div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>TIPO</small><br><strong>${bornMarked ? "Nascido Marcado" : "Marca normal"}</strong></div>
          <div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>VIDA RESTANTE</small><br><strong>${number(props.vid_rest_num)}</strong></div>
          ${active ? `<div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>DANO DE FERIDA</small><br><strong>+${number(props.marca_dano_dados)}d${number(props.marca_dano_faces)}</strong></div>` : ""}
        </div>
        ${active ? `<p style="margin:0">Os bônus temporários permanecem ativos até o encerramento do combate.</p>` : ""}`),
      modal: true,
      rejectClose: false,
      buttons: !awakened
        ? [{ action: "despertar", label: "Despertar Marca", callback: () => "despertar" }, { action: "cancelar", label: "Cancelar", callback: () => null }]
        : active
          ? [{ action: "encerrar", label: "Encerrar Marca", callback: () => "encerrar" }, { action: "cancelar", label: "Fechar", callback: () => null }]
          : [{ action: "ativar", label: "Ativar Marca", callback: () => "ativar" }, { action: "cancelar", label: "Cancelar", callback: () => null }],
    });
    if (action === "despertar") return awaken();
    if (action === "ativar") return activate();
    if (action === "encerrar") return finish();
  }

  await showMenu();
  if (args.debug === true) ui.notifications.info(`Marca processada em ${(performance.now() - startedAt).toFixed(2)} ms.`);
})();
