import assert from "node:assert/strict";
import test from "node:test";
import { buildInterludeProgressPatch } from "../scripts/interlude-service.mjs";

test("Cabaca acumula sucessos consecutivos e conclui no terceiro", () => {
  const first = buildInterludeProgressPatch({}, "cabaca_pequena", true);
  assert.equal(first.progress, 1);
  const third = buildInterludeProgressPatch({ interludio_cabaca_pequena_sucessos: 2 }, "cabaca_pequena", true);
  assert.equal(third.complete, true);
  assert.equal(third.patch["system.props.interludio_cabaca_pequena_completa"], 1);
});

test("Falha em Cabaca zera a sequencia", () => {
  const result = buildInterludeProgressPatch({ interludio_cabaca_media_sucessos: 2 }, "cabaca_media", false);
  assert.equal(result.progress, 0);
});

test("Copo de Cha preserva vitorias ao falhar", () => {
  const result = buildInterludeProgressPatch({ interludio_copo_cha_vitorias: 2 }, "copo_cha", false);
  assert.equal(result.progress, 2);
});

test("Cabaca Gigante desbloqueia Concentracao Total Constante", () => {
  const result = buildInterludeProgressPatch({ interludio_cabaca_gigante_sucessos: 2 }, "cabaca_gigante", true);
  assert.equal(result.patch["system.props.interludio_concentracao_total_constante"], 1);
  assert.equal(result.patch["system.props.interludio_respiracao_repouso"], 1);
});
