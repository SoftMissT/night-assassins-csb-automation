import { actorKind } from "../actor-kind.mjs";

function actorFromDocument(document) {
  if (document?.documentName === "Actor") return document;
  if (document?.actor?.documentName === "Actor") return document.actor;
  return document?.system?.props ? document : document?.actor ?? null;
}

export async function resolveActorReference(reference) {
  const direct = actorFromDocument(reference);
  if (direct) return direct;
  if (typeof reference !== "string" || reference.length === 0) return null;
  const document = await globalThis.fromUuid?.(reference);
  return actorFromDocument(document);
}

async function resolveDocument(reference) {
  if (reference && typeof reference === "object") return reference;
  if (typeof reference !== "string" || reference.length === 0) return null;
  return globalThis.fromUuid?.(reference) ?? null;
}

export function combatantsForActor(actor, combat = globalThis.game?.combat) {
  if (!actor || !combat?.combatants) return [];
  return [...combat.combatants].filter((combatant) => combatant.actor?.id === actor.id);
}

export async function createCombatContext(options = {}) {
  const actor = await resolveActorReference(options.actor ?? options.actorUuid)
    ?? globalThis.canvas?.tokens?.controlled?.[0]?.actor
    ?? globalThis.game?.user?.character
    ?? null;
  const item = await resolveDocument(options.item ?? options.itemUuid);
  const targets = options.targets
    ? [...options.targets]
    : [...(globalThis.game?.user?.targets ?? [])].map((token) => token.actor).filter(Boolean);
  const combat = options.combat ?? globalThis.game?.combat ?? null;
  return {
    actor,
    actorKind: actorKind(actor),
    item: item?.documentName === "Actor" ? null : item,
    targets,
    combat,
    combatants: combatantsForActor(actor, combat),
    user: options.user ?? globalThis.game?.user ?? null,
    startedAt: globalThis.performance?.now?.() ?? Date.now(),
  };
}

export function validateCombatContext(context, definition = {}) {
  const issues = [];
  if (!context?.actor) issues.push("Actor não encontrado.");
  if (definition.ownerKind && context?.actorKind !== definition.ownerKind) {
    issues.push(`A técnica exige um Actor ${definition.ownerKind}.`);
  }
  const targetMode = definition.target?.mode ?? "none";
  if (targetMode !== "none" && (context?.targets?.length ?? 0) === 0) issues.push("Nenhum alvo selecionado.");
  const maximum = Number(definition.target?.maximum);
  if (Number.isFinite(maximum) && maximum >= 0 && (context?.targets?.length ?? 0) > maximum) {
    issues.push(`A técnica aceita no máximo ${maximum} alvo(s).`);
  }
  return { ok: issues.length === 0, issues };
}
