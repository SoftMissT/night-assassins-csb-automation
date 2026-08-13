import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actorKind } from "../scripts/actor-kind.mjs";

describe("actor-kind", () => {
  it("classifica ONI antes de chaves Slayer herdadas", () => {
    assert.equal(actorKind({ system: { props: {
      classe_oni_escolha: "classe_oni_escolha",
      pdv_oni_total_conta: 40,
      pdv_slayer_total_valor: 20,
      pdr_slayer_total_valor: 10,
    } } }), "oni");
  });

  it("classifica Slayer sem marcador ONI", () => {
    assert.equal(actorKind({ system: { props: { nome_slayer: "Kwon", pdv_slayer_total_valor: 20 } } }), "slayer");
  });
});
