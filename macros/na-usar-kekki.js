// Night Assassins — Usar Kekkijutsu
// Compatível com Foundry VTT 14+ / Custom System Builder
// Lançador universal: lista técnicas kekkijutsu do actor, valida e executa.
//
// Uso por item/CSB:
// game.macros.getName("na-usar-kekki")?.execute({
//   actorUuid: entity.parent?.uuid,
//   itemUuid: entity.uuid,
//   kekkiId: entity.system?.props?.kekki_id,
//   itemName: entity.name
// });

const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;
if (!moduleApi?.oni?.kekkijutsu) {
  ui.notifications.error("Night Assassins CSB Automation não está ativo ou a API de Kekkijutsu não está disponível.");
  return "";
}

const kekkiApi = moduleApi.oni.kekkijutsu;
const consumeActions = moduleApi.oni.consumeActions;

const input = typeof scope !== "undefined" && scope ? scope : {};

async function resolveActor() {
  if (input.actorUuid) {
    const doc = await fromUuid(input.actorUuid);
    const candidate = doc?.actor ?? doc;
    if (candidate?.system?.props) return candidate;
  }
  return canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
}

function getProps(doc) {
  return doc?.system?.props ?? {};
}

function findKekkijutsuItems(actor) {
  if (!actor?.items) return [];
  return actor.items.filter((item) => {
    const props = getProps(item);
    return kekkiApi.isItem(item) ||
      String(props.inventario_categoria ?? "") === "kekkijutsu" ||
      String(props.kekki_id ?? "").length > 0;
  });
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

async function resolveItem(actor) {
  // Direct item UUID
  if (input.itemUuid) {
    const item = await fromUuid(input.itemUuid);
    if (item) return item;
  }

  // By kekki_id
  const kekkiId = String(input.kekkiId ?? "").trim();
  if (kekkiId && actor?.items) {
    const owned = actor.items.find((item) => {
      const props = getProps(item);
      return String(props.kekki_id ?? "") === kekkiId ||
        String(props.kekkijutsu_id ?? "") === kekkiId;
    });
    if (owned) return owned;
  }

  // By name
  if (input.itemName && actor?.items) {
    const wanted = String(input.itemName).toLowerCase().trim();
    const owned = actor.items.find((item) => item.name.toLowerCase().includes(wanted));
    if (owned) return owned;
  }

  // Auto-detect: if only one kekkijutsu item, use it
  const kekkijutsus = findKekkijutsuItems(actor);
  if (kekkijutsus.length === 1) return kekkijutsus[0];

  // Multiple: show selector
  if (kekkijutsus.length > 1) {
    const options = kekkijutsus
      .map((item) => {
        const props = getProps(item);
        const name = props.kekki_nome ?? item.name;
        const origin = props.kekki_origem ?? "";
        const pdk = props.kekki_pdk_custo ?? "?";
        const label = origin ? `${name} (${origin}) — ${pdk} PDK` : `${name} — ${pdk} PDK`;
        return `<option value="${item.uuid}">${label}</option>`;
      })
      .join("");

    const chosenUuid = await foundry.applications.api.DialogV2.wait({
      window: { title: "Usar Kekkijutsu" },
      content: `
        <div style="display:grid;gap:8px">
          <p>Escolha a técnica kekkijutsu que deseja usar.</p>
          <select id="na-kekki-item" style="width:100%">${options}</select>
        </div>
      `,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "usar",
          label: "Usar Técnica",
          callback: (_event, _button, dialog) =>
            String(dialog.element.querySelector("#na-kekki-item")?.value ?? "")
        },
        {
          action: "cancelar",
          label: "Cancelar",
          callback: () => null
        }
      ]
    });

    return chosenUuid ? fromUuid(chosenUuid) : null;
  }

  return null;
}

// --- Main ---
const actor = await resolveActor();
if (!actor) {
  ui.notifications.warn("Selecione um token ou defina um personagem ativo.");
  return "";
}

if (!actor.isOwner) {
  ui.notifications.error("Você não pode usar técnicas com este personagem.");
  return "";
}

const item = await resolveItem(actor);
if (!item) {
  ui.notifications.warn("Nenhuma técnica Kekkijutsu encontrada neste personagem.");
  return "";
}

const props = getProps(item);
const catalogId = props.kekki_id ?? props.kekkijutsu_id ?? null;
const catalogTech = catalogId ? kekkiApi.get(catalogId) : null;
const technique = catalogTech ?? kekkiApi.normalize(item);

if (!technique) {
  ui.notifications.error("Não foi possível resolver esta técnica Kekkijutsu.");
  return "";
}

// Validate
const actorProps = getProps(actor);
const level = integer(actorProps.nvl_num ?? actorProps.nivel_oni_num ?? 1);
const currentPdk = integer(actorProps.pdk_oni_atual_num ?? 0);

const validation = kekkiApi.validate(actor, technique, { level, currentPdk });
if (!validation.ok) {
  ui.notifications.error(`Não é possível usar ${technique.name}: ${validation.errors.join(" ")}`);
  return "";
}

// Build attack profile
const actorAttrs = {
  FOR: integer(actorProps.for_display ?? actorProps.atr_for_valor ?? 0),
  DEX: integer(actorProps.dex_display ?? actorProps.atr_dex_valor ?? 0),
  VIT: integer(actorProps.vit_display ?? actorProps.atr_vit_valor ?? 0),
  CAR: integer(actorProps.car_display ?? actorProps.atr_car_valor ?? 0),
  INT: integer(actorProps.int_display ?? actorProps.atr_int_valor ?? 0),
  SAB: integer(actorProps.sab_display ?? actorProps.atr_sab_valor ?? 0),
  FDV: integer(actorProps.fdv_display ?? actorProps.atr_fdv_valor ?? 0),
};
const attack = kekkiApi.buildAttack(technique, actorAttrs);

// Consume PDK
const pdkPatch = kekkiApi.buildPdkPatch(actorProps.pdk_oni_gasto_valor ?? 0, technique.pdkCost);
await actor.update(pdkPatch, { naCsbAutomation: true, naKekkijutsu: true });

// Consume action
try {
  await consumeActions(actor, [technique.action], { update: true });
} catch (err) {
  console.warn("[night-assassins-csb-automation] Kekkijutsu action consume warning:", err);
}

// Register usage
const usePatch = kekkiApi.buildUsePatch(technique);
if (Object.keys(usePatch).length > 0) {
  await actor.update(usePatch, { naCsbAutomation: true, naKekkijutsu: true });
}

// Build chat message
const actionLabel = technique.action?.toUpperCase() ?? "ESPECIAL";
const pdkLabel = `${technique.pdkCost} PDK`;
const rangeLabel = technique.range > 0 ? `${technique.range}m` : "Corpo a corpo";
const damageLines = (attack.damage ?? [])
  .map((d) => `<li><strong>${d.label}</strong> (${d.types.join(", ")})</li>`)
  .join("");

const html = `
<div class="na-kekki-card">
  <div class="na-kekki-title">${technique.name}</div>
  <div style="margin-bottom:6px">
    <span class="na-kekki-badge-action">${actionLabel}</span>
    <span class="na-kekki-badge-pdk">${pdkLabel}</span>
    ${technique.rank ? `<span class="na-kekki-badge-rank na-kekki-badge-rank--${String(technique.rank).toLowerCase()}">${technique.rank}</span>` : ""}
    ${technique.origin ? `<span class="na-kekki-origin">${technique.origin}</span>` : ""}
  </div>
  <div style="font-size:11px;margin-bottom:6px">
    <strong>Alcance:</strong> ${rangeLabel} · <strong>Alvo:</strong> ${technique.target ?? "único"} · <strong>Duração:</strong> ${technique.duration ?? 0} turnos
  </div>
  ${technique.testType !== "none" && technique.testType ? `<div style="font-size:11px;margin-bottom:6px"><strong>Teste:</strong> ${technique.testType} ${technique.testFormula ?? ""}</div>` : ""}
  ${damageLines ? `<div style="font-size:11px;margin-bottom:6px"><strong>Dano:</strong><ul style="margin:2px 0;padding-left:18px">${damageLines}</ul></div>` : ""}
  ${technique.narrative ? `<div style="font-size:10px;color:#9ca3af;font-style:italic;margin-top:4px">${technique.narrative}</div>` : ""}
</div>
`;

ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: html,
  type: CONST.CHAT_MESSAGE_TYPES.OTHER,
});

ui.notifications.info(`${technique.name} usada! (${pdkLabel} consumido)`);

return "";
