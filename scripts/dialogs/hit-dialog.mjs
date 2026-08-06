/**
 * @fileoverview DialogV2 para rolagem de acerto.
 */

function parseBonus(raw) {
  const s = (raw || "").trim();
  if (!s) return { extra: "", display: "" };
  const clean = s.replace(/^\+/, "");
  return { extra: clean ? `+ ${clean}` : "", display: s };
}

/**
 * Abre o dialog de acerto e retorna os parâmetros escolhidos.
 * @param {object} options
 * @param {string} options.attrName
 * @param {number} options.attrVal
 * @param {string} options.color
 * @returns {Promise<{mode:string,rollMode:string,bonusRaw:string,cdVal:number}|null>}
 */
export async function openHitDialog({ attrName, attrVal, color }) {
  const content = `
    <div class="na-csb-automation">
      <div style="margin-bottom:12px;">
        <div style="font-size:13px;color:${color};margin-bottom:4px;font-weight:600;">${attrName} = ${attrVal}</div>
        <div id="na-ac-formula" style="font-family:monospace;font-size:14px;background:#f5f5f5;padding:6px 8px;border-radius:3px;border:1px solid #ddd;">1d20 + ${attrVal}</div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Bônus Situacional?</label>
        <input type="text" id="na-ac-bonus" placeholder="ex: 1d4, +2, 5" style="width:100%;padding:4px;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">CD do Teste (opcional)</label>
        <input type="number" id="na-ac-cd" min="0" placeholder="ex: 15" style="width:100%;padding:4px;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:6px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Modo de Rolagem</label>
        <select id="na-ac-rollmode" style="width:100%;padding:4px;box-sizing:border-box;">
          <option value="publicroll">Rolar Público</option>
          <option value="gmroll">Rolar Privado (GM)</option>
          <option value="blindroll">Rolar Cego (GM)</option>
          <option value="selfroll">Rolar Para Si</option>
        </select>
      </div>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Acerto" },
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "advantage",
        label: "Vantagem",
        callback: (event, button) => {
          const form = button.form;
          return {
            mode: "advantage",
            rollMode: form.elements["na-ac-rollmode"].value ?? "publicroll",
            bonusRaw: form.elements["na-ac-bonus"].value ?? "",
            cdVal: Number(form.elements["na-ac-cd"].value) || 0,
          };
        },
      },
      {
        action: "normal",
        label: "Normal",
        callback: (event, button) => {
          const form = button.form;
          return {
            mode: "normal",
            rollMode: form.elements["na-ac-rollmode"].value ?? "publicroll",
            bonusRaw: form.elements["na-ac-bonus"].value ?? "",
            cdVal: Number(form.elements["na-ac-cd"].value) || 0,
          };
        },
      },
      {
        action: "disadvantage",
        label: "Desvantagem",
        callback: (event, button) => {
          const form = button.form;
          return {
            mode: "disadvantage",
            rollMode: form.elements["na-ac-rollmode"].value ?? "publicroll",
            bonusRaw: form.elements["na-ac-bonus"].value ?? "",
            cdVal: Number(form.elements["na-ac-cd"].value) || 0,
          };
        },
      },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });

  return result ?? null;
}
