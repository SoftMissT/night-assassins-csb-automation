/**
 * Blood Gift Service — Dom do Sangue
 * Roll 1d100 twice (or 3x if Descendente Perdido), keep the highest.
 * Map result to the Blood Gift table and set hab_escolhida on the actor.
 *
 * @module blood-gift-service
 */

import { normalizeAbilityKey } from "./parsing.mjs";

const BLOOD_GIFT_TABLE = [
  { min: 1, max: 25, key: "hab_escolhida_sem", label: "Sem Habilidade" },
  { min: 26, max: 36, key: "hab_escolhida_tato", label: "Tato Sensitivo" },
  { min: 37, max: 47, key: "hab_escolhida_audicao", label: "Audição Sobrenatural" },
  { min: 48, max: 58, key: "hab_escolhida_visao", label: "Visão Aguçada" },
  { min: 59, max: 69, key: "hab_escolhida_olfato", label: "Olfato Sobrenatural" },
  { min: 70, max: 80, key: "hab_escolhida_metamorfose", label: "Metamorfose Carnívora" },
  { min: 81, max: 91, key: "hab_escolhida_tsuyoi", label: "Tsuyoi (O Inabalável)" },
  { min: 92, max: 98, key: "hab_escolhida_marechi", label: "Marechi (O Sangue Raro)" },
  { min: 99, max: 99, key: "hab_escolhida_oketsu", label: "Ōketsu (O Sangue Real)" },
  { min: 100, max: 100, key: "hab_escolhida_marca_destino", label: "Marca do Destino" },
];

/**
 * Determine how many rolls to make.
 * 3 rolls if actor has "Descendente Perdido" origin or narrative ancient blood condition.
 * @param {Actor} actor
 * @returns {number}
 */
function getRollCount(actor) {
  const origin = String(actor.system?.props?.origem ?? "").toLowerCase();
  if (origin.includes("descendente perdido") || origin.includes("descendente_perdido")) {
    return 3;
  }
  return 2;
}

/**
 * Map a d100 result to the Blood Gift table entry.
 * @param {number} result - The d100 result (1-100)
 * @returns {{ key: string, label: string } | null}
 */
function mapResultToGift(result) {
  return BLOOD_GIFT_TABLE.find((entry) => result >= entry.min && result <= entry.max) ?? null;
}

/**
 * Roll 1d100 N times and return the highest result.
 * @param {number} count - Number of rolls (2 or 3)
 * @returns {Promise<{ rolls: number[], best: number }>}
 */
async function rollBloodGift(count) {
  const rolls = [];
  for (let i = 0; i < count; i++) {
    const roll = await new Roll("1d100").evaluate();
    rolls.push(roll.total);
  }
  const best = Math.max(...rolls);
  return { rolls, best };
}

/**
 * Build the chat message content for the Blood Gift roll.
 * @param {Actor} actor
 * @param {number[]} rolls
 * @param {number} best
 * @param {{ key: string, label: string }} gift
 * @returns {string}
 */
function buildChatContent(actor, rolls, best, gift) {
  const rollList = rolls.map((r, i) => `Rolagem ${i + 1}: <strong>${r}</strong>${r === best ? " (melhor)" : ""}`).join("<br>");
  const isNoGift = gift.key === "hab_escolhida_sem";

  return `
    <div class="na-csb-automation" style="display:grid;gap:8px">
      <h3 style="margin:0;color:#FF2B4A">Dom do Sangue — ${actor.name}</h3>
      <div>${rollList}</div>
      <div style="font-size:1.1em;margin-top:4px">
        Melhor resultado: <strong style="color:#FFD700">${best}</strong>
      </div>
      <div style="padding:8px;background:#1C1915;border:1px solid ${isNoGift ? "#555" : "#FFD700"};border-radius:4px">
        <strong>${gift.label}</strong>
        ${isNoGift ? "<br><em>Sem dom sanguíneo especial.</em>" : ""}
      </div>
    </div>
  `.trim();
}

/**
 * Execute the Blood Gift roll for an actor.
 * @param {Actor} actor - The actor rolling for Blood Gift
 * @param {object} [options]
 * @param {boolean} [options.apply=true] - Whether to set hab_escolhida on the actor
 * @returns {Promise<{ rolls: number[], best: number, gift: { key: string, label: string } }>}
 */
export async function rollBloodGiftForActor(actor, { apply = true } = {}) {
  if (!actor) throw new Error("Blood Gift: actor is required");

  const count = getRollCount(actor);
  const { rolls, best } = await rollBloodGift(count);
  const gift = mapResultToGift(best);

  if (!gift) {
    throw new Error(`Blood Gift: no table entry for result ${best}`);
  }

  // Show dice 3D if available
  if (game.dice3d?.showForRoll) {
    for (const total of rolls) {
      const tempRoll = new Roll("1d100");
      tempRoll.total = total;
      await game.dice3d.showForRoll(tempRoll, game.user, true);
    }
  }

  // Post results to chat
  const content = buildChatContent(actor, rolls, best, gift);
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    rollMode: game.settings.get("core", "rollMode"),
  });

  // Apply to actor if requested
  if (apply) {
    await actor.update({ "system.props.hab_escolhida": gift.key });
  }

  return { rolls, best, gift };
}

/**
 * Get the full Blood Gift table for display.
 * @returns {Array<{ min: number, max: number, key: string, label: string }>}
 */
export function getBloodGiftTable() {
  return [...BLOOD_GIFT_TABLE];
}
