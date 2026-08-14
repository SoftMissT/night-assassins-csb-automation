function mergeActorPatch(current, next) {
  return Object.assign(current ?? {}, next ?? {});
}

export class ActorTransaction {
  #entries = new Map();
  #committed = false;

  stage(actor, patch, options = {}) {
    if (this.#committed) throw new Error("A transação já foi finalizada.");
    if (!actor?.uuid || typeof actor.update !== "function") throw new Error("Actor inválido para a transação.");
    const current = this.#entries.get(actor.uuid) ?? { actor, patch: {}, options: {} };
    mergeActorPatch(current.patch, patch);
    mergeActorPatch(current.options, options);
    this.#entries.set(actor.uuid, current);
    return this;
  }

  preview() {
    return [...this.#entries.values()].map(({ actor, patch, options }) => ({ actor, patch: { ...patch }, options: { ...options } }));
  }

  async commit(options = {}) {
    if (this.#committed) throw new Error("A transação já foi finalizada.");
    this.#committed = true;
    const entries = this.preview();
    const results = await Promise.allSettled(entries.map(({ actor, patch, options: entryOptions }) => actor.update(patch, {
      naCsbAutomation: true,
      naTransaction: true,
      ...entryOptions,
      ...options,
    })));
    const failures = results.flatMap((result, index) => result.status === "rejected"
      ? [{ actor: entries[index].actor, reason: result.reason }]
      : []);
    return { ok: failures.length === 0, entries, results, failures };
  }
}

export function createActorTransaction() {
  return new ActorTransaction();
}
