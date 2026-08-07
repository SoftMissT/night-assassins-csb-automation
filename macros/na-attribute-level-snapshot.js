// Night Assassins — criação, progressão e snapshot manual dos atributos
// Roll Message do Label CSB:
// %{return await game.macros.getName('na-attribute-level-snapshot').execute({actorUuid:entity.uuid,level:entity.system.props.nvl_pj});}%
(async () => {
  const startedAt = performance.now();
  if (!canvas.ready) return ui.notifications.warn("Canvas não pronto.");

  await game.macros?.getName("na-special-ability-watcher")?.execute({ installOnly: true });

  const input = (typeof scope !== "undefined" && scope) ? scope : {};
  const { DialogV2 } = foundry.applications.api;
  const ATTRIBUTES = Object.freeze([
    { key: "vit", label: "VIT", name: "Vitalidade", color: "#36D67A" },
    { key: "dex", label: "DEX", name: "Destreza", color: "#28D7FF" },
    { key: "for", label: "FOR", name: "Força", color: "#C0392B" },
    { key: "car", label: "CAR", name: "Carisma", color: "#FF9100" },
    { key: "fdv", label: "FDV", name: "Força de Vontade", color: "#BB97F9" },
    { key: "int", label: "INT", name: "Inteligência", color: "#F8EB4D" },
    { key: "sab", label: "SAB", name: "Sabedoria", color: "#D45CA4" },
  ]);
  const SNAPSHOT_LEVELS = Object.freeze([1, 3, 7]);
  const ATTRIBUTE_GAIN_LEVELS = Object.freeze([3, 7]);

  function parseNumber(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const text = String(raw ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(",", ".");
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function getLevel(props) {
    return parseNumber(input.level ?? input.nvl ?? props?.nvl_pj ?? props?.nvl_num);
  }

  function currentConfigValues(props) {
    return Object.fromEntries(ATTRIBUTES.map(attribute => [
      attribute.key,
      parseNumber(props[`atr_${attribute.key}_valor_config`]),
    ]));
  }

  function latestValues(props, level) {
    return Object.fromEntries(ATTRIBUTES.map(attribute => {
      for (let previous = Math.min(14, level - 1); previous >= 1; previous -= 1) {
        const key = `${attribute.key}_nvl${previous}`;
        if (props[key] !== undefined && props[key] !== null && props[key] !== "") {
          return [attribute.key, parseNumber(props[key])];
        }
      }
      return [attribute.key, parseNumber(props[`atr_${attribute.key}_valor`])];
    }));
  }

  function poolMatches(values, pool) {
    const a = [...values].map(Number).sort((x, y) => x - y);
    const b = [...pool].map(Number).sort((x, y) => x - y);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  async function resolveActor() {
    if (input.actorUuid) {
      const document = await fromUuid(input.actorUuid);
      return document?.actor ?? document;
    }
    return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
  }

  async function rollPool(attempt) {
    const roll = await Roll.create("7d4").evaluate();
    await roll.toMessage({
      flavor: `Atributos — ${attempt}ª rolagem de 7d4`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
    return roll.dice[0].results.filter(result => result.active !== false).map(result => Number(result.result));
  }

  async function chooseRolledPool() {
    const first = await rollPool(1);
    const afterFirst = await DialogV2.wait({
      window: { title: "Atributos — 1ª rolagem" },
      content: `<p>Resultado: <strong>${first.join(" · ")}</strong></p><p>Você pode usar esta rolagem ou tentar novamente.</p>`,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "use-first", label: "Usar 1ª rolagem", callback: () => "first" },
        { action: "roll-second", label: "Rolar novamente", callback: () => "second" },
      ],
    });
    if (!afterFirst) return null;
    if (afterFirst === "first") return first;

    const second = await rollPool(2);
    const afterSecond = await DialogV2.wait({
      window: { title: "Atributos — escolha entre as rolagens" },
      content: `<p>1ª: <strong>${first.join(" · ")}</strong></p><p>2ª: <strong>${second.join(" · ")}</strong></p><p>Se fizer a terceira rolagem, será obrigado a usá-la.</p>`,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "use-first", label: "Usar 1ª", callback: () => "first" },
        { action: "use-second", label: "Usar 2ª", callback: () => "second" },
        { action: "roll-third", label: "Fazer 3ª obrigatória", callback: () => "third" },
      ],
    });
    if (!afterSecond) return null;
    if (afterSecond === "first") return first;
    if (afterSecond === "second") return second;

    const third = await rollPool(3);
    await DialogV2.wait({
      window: { title: "Atributos — 3ª rolagem obrigatória" },
      content: `<p>Resultado obrigatório: <strong>${third.join(" · ")}</strong></p>`,
      modal: true,
      rejectClose: true,
      buttons: [{ action: "distribute-third", label: "Distribuir 3ª rolagem", callback: () => true }],
    });
    return third;
  }

  async function readDiscordPool() {
    while (true) {
      const result = await DialogV2.wait({
        window: { title: "Atributos — resultados do Discord" },
        content: `<div style="padding:6px 0;"><p>Digite os sete resultados separados por vírgula.</p><input id="na-discord-pool" type="text" placeholder="4, 3, 2, 2, 1, 1, 1" style="width:100%;" /></div>`,
        modal: true,
        rejectClose: false,
        buttons: [
          {
            action: "use-discord-results",
            label: "Usar resultados",
            callback: () => String(document.getElementById("na-discord-pool")?.value ?? ""),
          },
          { action: "cancel", label: "Cancelar", callback: () => null },
        ],
      });
      if (result === null || result === undefined) return null;
      const pool = result.split(/[;,\s]+/).filter(Boolean).map(parseNumber);
      if (pool.length === 7 && pool.every(value => Number.isFinite(value) && value >= 1)) return pool;
      ui.notifications.warn("Informe exatamente sete valores numéricos.");
    }
  }

  async function distributePool(pool, level, currentValues) {
    while (true) {
      const fields = ATTRIBUTES.map((attribute, attributeIndex) => {
        const options = pool.map((value, poolIndex) =>
          `<option value="${poolIndex}:${value}" ${poolIndex === attributeIndex ? "selected" : ""}>${value} — resultado ${poolIndex + 1}</option>`
        ).join("");
        return `
          <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#171411;border-left:3px solid ${attribute.color};padding:7px 9px;">
            <span style="display:flex;flex-direction:column;gap:2px;color:${attribute.color};font-weight:700;">
              <span>${attribute.label} · ${attribute.name}</span>
              <small style="color:#a99f93;font-size:10px;font-weight:500;">Atual: ${currentValues[attribute.key]}</small>
            </span>
            <select id="na-distribute-${attribute.key}" style="width:145px;">${options}</select>
          </label>`;
      }).join("");
      const selected = await DialogV2.wait({
        window: { title: `Distribuir atributos — Nível ${level}` },
        content: `<div style="display:grid;gap:5px;padding:4px 0;"><p style="margin:0 0 5px;">Use cada resultado exatamente uma vez.</p>${fields}</div>`,
        modal: true,
        rejectClose: false,
        buttons: [
          {
            action: "save-distribution",
            label: "Salvar atributos",
            callback: () => ATTRIBUTES.map(attribute => String(document.getElementById(`na-distribute-${attribute.key}`)?.value ?? "")),
          },
          { action: "cancel", label: "Cancelar", callback: () => null },
        ],
      });
      if (!selected) return null;
      const indexes = selected.map(value => parseNumber(value.split(":")[0]));
      const values = selected.map(value => parseNumber(value.split(":")[1]));
      if (new Set(indexes).size === 7 && poolMatches(values, pool)) {
        return Object.fromEntries(ATTRIBUTES.map((attribute, index) => [attribute.key, values[index]]));
      }
      ui.notifications.warn("Cada resultado precisa ser usado uma única vez.");
    }
  }

  async function createLevelOneValues(currentValues) {
    const method = await DialogV2.wait({
      window: { title: "Criar atributos — Nível 1" },
      content: `<div style="padding:5px 0;"><p>Escolha como gerar os sete atributos.</p><p><strong>Padrão:</strong> 4 · 3 · 2 · 2 · 1 · 1 · 1</p><p><strong>Rolagem:</strong> até três tentativas de 7d4.</p></div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "standard", label: "Valores padrão", callback: () => "standard" },
        { action: "roll", label: "Rolar 7d4", callback: () => "roll" },
        { action: "discord", label: "Inserir do Discord", callback: () => "discord" },
      ],
    });
    if (!method) return null;
    const pool = method === "standard"
      ? [4, 3, 2, 2, 1, 1, 1]
      : method === "roll"
        ? await chooseRolledPool()
        : await readDiscordPool();
    return pool ? distributePool(pool, 1, currentValues) : null;
  }

  async function applyAttributeGain(values, level) {
    const cards = ATTRIBUTES.map(attribute => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#171411;border-left:3px solid ${attribute.color};border-radius:3px;padding:7px 9px;">
        <span style="color:${attribute.color};font-weight:700;">${attribute.label} · ${attribute.name}</span>
        <span style="white-space:nowrap;color:#ddd;">${values[attribute.key]} <strong style="color:${attribute.color};">→ ${values[attribute.key] + 1}</strong></span>
      </div>`).join("");
    const options = ATTRIBUTES.map(attribute =>
      `<option value="${attribute.key}">${attribute.label} · ${attribute.name} (${values[attribute.key]} → ${values[attribute.key] + 1})</option>`
    ).join("");
    const chosen = await DialogV2.wait({
      window: { title: `Nível ${level} — aumento de atributo` },
      content: `
        <div style="display:grid;gap:8px;padding:4px 0;">
          <p style="margin:0;">Neste nível, escolha <strong>um atributo base</strong> para receber <strong>+1 permanente</strong>.</p>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;">${cards}</div>
          <label style="display:grid;gap:4px;margin-top:4px;">
            <strong>Atributo escolhido</strong>
            <select id="na-gain-attribute" style="width:100%;">${options}</select>
          </label>
          <small style="color:#a99f93;">Bônus de Marca, Respiração, habilidade ou treinamento não entram neste aumento.</small>
        </div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "confirm-gain",
          label: "Aplicar +1 permanente",
          callback: () => String(document.getElementById("na-gain-attribute")?.value ?? ""),
        },
        { action: "cancel", label: "Cancelar", callback: () => null },
      ],
    });
    if (!ATTRIBUTES.some(attribute => attribute.key === chosen)) return null;
    return { ...values, [chosen]: values[chosen] + 1 };
  }

  async function confirmSnapshot(values, currentValues, level) {
    const cards = ATTRIBUTES.map(attribute => `
      <div style="background:#171411;border:1px solid ${attribute.color}66;border-radius:5px;padding:8px 6px;text-align:center;">
        <div style="color:${attribute.color};font-weight:700;letter-spacing:.1em;">${attribute.label}</div>
        <div style="color:#fff;font-size:22px;font-weight:700;">${values[attribute.key]}</div>
        <div style="color:#a99f93;font-size:9px;">Atual: ${currentValues[attribute.key]}</div>
      </div>`).join("");
    return DialogV2.wait({
      window: { title: `Confirmar atributos — Nível ${level}` },
      content: `<div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">${cards}</div><p>Confirme para atualizar os atributos da ficha.</p></div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "confirm-save", label: "Confirmar e salvar", callback: () => true },
        { action: "cancel", label: "Cancelar", callback: () => false },
      ],
    });
  }

  const actor = await resolveActor();
  if (!actor) return ui.notifications.warn("Não foi possível encontrar a ficha que chamou a macro.");
  const props = actor.system?.props ?? {};
  const level = getLevel(props);
  const currentValues = currentConfigValues(props);
  if (!SNAPSHOT_LEVELS.includes(level)) {
    const message = level > 7
      ? "Os atributos-base permanecem no snapshot do nível 7. Bônus posteriores são derivados ou temporários."
      : `O nível ${level} não concede aumento fixo de atributo.`;
    return ui.notifications.info(message);
  }

  let values;
  if (level === 1) {
    values = await createLevelOneValues(currentValues);
  } else {
    values = latestValues(props, level);
    if (ATTRIBUTE_GAIN_LEVELS.includes(level)) values = await applyAttributeGain(values, level);
  }
  if (!values || !(await confirmSnapshot(values, currentValues, level))) return;

  const patch = Object.fromEntries(ATTRIBUTES.flatMap(attribute => [
    [`system.props.${attribute.key}_nvl${level}`, values[attribute.key]],
    [`system.props.atr_${attribute.key}_valor_config`, values[attribute.key]],
  ]));
  await actor.update(patch);
  ui.notifications.info(`Os sete atributos do nível ${level} foram salvos para ${actor.name}.`);

  if (input.debug === true) {
    console.log(`[TANG-ROU] atributos salvos em ${(performance.now() - startedAt).toFixed(2)}ms`);
  }
})();
