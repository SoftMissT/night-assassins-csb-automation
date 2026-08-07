import { parseNumber } from "./parsing.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanChoice(value, prefix) {
  const raw = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim();
  if (!raw) return "Não definido";
  return raw
    .replace(new RegExp(`^${prefix}_?`, "i"), "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resource(props, currentKey, maxKey) {
  const max = Math.max(0, parseNumber(props[maxKey]));
  const current = Math.max(0, parseNumber(props[currentKey]));
  const percent = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  return { current, max, percent };
}

export function hunterData(actor) {
  const props = actor.system?.props ?? {};
  const trackedKeys = ["nome_cacador", "pdv_total_valor", "pdr_total_valor", "pdv_atual_valor_display", "pdr_atual_valor_display"];
  if (!trackedKeys.some((key) => props[key] !== undefined && props[key] !== null && props[key] !== "")) return null;

  return {
    actor,
    name: String(props.nome_cacador ?? "").replace(/<[^>]*>/g, " ").trim() || actor.name,
    pdv: resource(props, "pdv_atual_valor_display", "pdv_total_valor"),
    pdr: resource(props, "pdr_atual_valor_display", "pdr_total_valor"),
    ability: cleanChoice(props.hab_escolhida, "hab_escolhida"),
    metal: cleanChoice(props.metal_escolhido, "metal"),
  };
}

function resourceBar(label, data, color) {
  return `<div class="na-gm-resource">
    <div class="na-gm-resource-line"><strong style="color:${color}">${label}</strong><span>${data.current} / ${data.max}</span></div>
    <div class="na-gm-track"><i style="width:${data.percent.toFixed(2)}%;background:${color}"></i></div>
  </div>`;
}

function renderDashboard(hunters) {
  const cards = hunters.map(({ actor, name, pdv, pdr, ability, metal }) => `<article class="na-gm-card">
    <header><div><small>CAÇADOR</small><h3>${escapeHtml(name)}</h3></div><span>${escapeHtml(actor.name)}</span></header>
    ${resourceBar("PDV", pdv, "#ef3340")}
    ${resourceBar("PDR", pdr, "#15d7e6")}
    <dl><div><dt>Habilidade</dt><dd>${escapeHtml(ability)}</dd></div><div><dt>Metal / Cor</dt><dd>${escapeHtml(metal)}</dd></div></dl>
  </article>`).join("");

  return `<style>
    .na-gm-board{--ink:#eee8dc;--muted:#9f978b;--line:#443d34;background:#100f0d;color:var(--ink);padding:14px;border:1px solid #5d5142;border-radius:8px;}
    .na-gm-summary{display:flex;justify-content:space-between;align-items:end;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--line)}
    .na-gm-summary small,.na-gm-card small{color:#e5b84f;font-size:9px;font-weight:900;letter-spacing:.16em}.na-gm-summary h2{margin:2px 0 0;font-family:Georgia,serif;font-size:22px}.na-gm-summary strong{font-size:28px;color:#e5b84f}
    .na-gm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;max-height:65vh;overflow:auto;padding-right:4px}
    .na-gm-card{background:linear-gradient(145deg,#1c1915,#131210);border:1px solid var(--line);border-left:3px solid #e5b84f;border-radius:6px;padding:11px;box-shadow:0 8px 24px rgba(0,0,0,.22)}
    .na-gm-card header{display:flex;justify-content:space-between;gap:10px;align-items:start;margin-bottom:10px}.na-gm-card h3{margin:2px 0 0;font-size:16px}.na-gm-card header>span{color:var(--muted);font-size:9px;text-align:right}
    .na-gm-resource{margin:7px 0}.na-gm-resource-line{display:flex;justify-content:space-between;font-size:11px}.na-gm-track{height:8px;margin-top:4px;background:#080807;border:1px solid #34302a;border-radius:99px;overflow:hidden}.na-gm-track i{display:block;height:100%;border-radius:inherit;box-shadow:0 0 12px currentColor;transition:width .2s ease}
    .na-gm-card dl{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0 0}.na-gm-card dl div{background:#0c0b0a;border:1px solid #302c27;border-radius:4px;padding:6px}.na-gm-card dt{color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.1em}.na-gm-card dd{margin:3px 0 0;font-size:10px;font-weight:700}
    .na-gm-empty{padding:30px;text-align:center;color:var(--muted)}
  </style><section class="na-gm-board">
    <div class="na-gm-summary"><div><small>VISÃO TÁTICA DO MESTRE</small><h2>Controle dos Caçadores</h2></div><strong>${hunters.length}</strong></div>
    <div class="na-gm-grid">${cards || '<div class="na-gm-empty">Nenhum Actor com campos Night Assassins foi encontrado.</div>'}</div>
  </section>`;
}

export async function openGmDashboard() {
  if (!game.user?.isGM) return ui.notifications.error("Somente o GM pode abrir o Controle dos Caçadores.");
  const DialogV2 = foundry.applications.api.DialogV2;
  let action;
  do {
    const hunters = game.actors.contents.map(hunterData).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    action = await DialogV2.wait({
      window: { title: "Controle GM — Night Assassins" },
      position: { width: 940, height: "auto" },
      modal: false,
      rejectClose: false,
      content: renderDashboard(hunters),
      buttons: [
        { action: "close", label: "Fechar", callback: () => "close" },
        { action: "refresh", label: "Atualizar", default: true, callback: () => "refresh" },
      ],
    });
  } while (action === "refresh");
}
