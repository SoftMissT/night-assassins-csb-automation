// Night Assassins — Dom do Sangue (Blood Gift)
// Compatível com Foundry VTT 14+ / Custom System Builder
// Rola 1d100 para determinar o Dom Demoníaco do Oni.
//
// Uso:
// game.macros.getName("na-oni-blood-gift")?.execute({
//   actorUuid: entity.parent?.uuid
// });

const input = typeof scope !== "undefined" && scope ? scope : {};

async function resolveActor() {
  if (input.actorUuid) {
    const doc = await fromUuid(input.actorUuid);
    const candidate = doc?.actor ?? doc;
    if (candidate?.system?.props) return candidate;
  }
  return canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
}

const actor = await resolveActor();
if (!actor) {
  ui.notifications.warn("Selecione um token Oni ou defina um personagem ativo.");
  return "";
}

if (!actor.isOwner) {
  ui.notifications.error("Você não pode rolar Dom do Sangue para este personagem.");
  return "";
}

// Roll 1d100
const roll = await Roll.create("1d100").evaluate();
const total = roll.total;

// Blood Gift table (d100)
const bloodGifts = [
  { min: 1, max: 5, name: "Sentidos Aguçados", desc: "+2 em todos os testes de perceção. Perception range doubled." },
  { min: 6, max: 10, name: "Regeneração Acelerada", desc: "Regeneração ativa: recupera 1d4 PDV por turno se não estiver usando ação ofensiva." },
  { min: 11, max: 15, name: "Força Descomunal", desc: "+2 FOR permanente enquanto dom ativo. Dano corpo a corpo +1d4." },
  { min: 16, max: 20, name: "Velocidade Sobre-Humana", desc: "+3m de deslocamento. Pode fazer uma ação de movimento extra por turno." },
  { min: 21, max: 25, name: "Visão Noturna", desc: "Visão no escuro em 30m. Imune a penalidades de baixa luminosidade." },
  { min: 26, max: 30, name: "Resistência Demoníaca", desc: "+2 VIT permanente. Resistência a veneno e doença." },
  { min: 31, max: 35, name: "Chamado do Instinto", desc: "Sentir presença de seres vivos em 15m. Prevenção contra surpresa." },
  { min: 36, max: 40, name: "Garras Afiadas", desc: "Ataque natural: 1d6+FOR perfurante. Alcance 1.5m." },
  { min: 41, max: 45, name: "Presas Revigorantes", desc: "Mordida: 1d4+FOR perfurante. Cura 1d4 PDK ao acertar." },
  { min: 46, max: 50, name: "Pele Endurecida", desc: "+1 a todas as resistências. Reduz dano não-mágico em 1." },
  { min: 51, max: 55, name: "Sopro Gelido", desc: "Ação especial: cone 6m, 1d6 gelo, teste VIT CD 12 ou congelado 1 turno." },
  { min: 56, max: 60, name: "Olhar Hipnótico", desc: "Ação especial: 1 alvo em 9m, teste CAR CD 13 ou atordoado 1 turno." },
  { min: 61, max: 65, name: "Sombra Móvel", desc: "Ação de movimento: teleportar 6m para área sombria. 1x/turno." },
  { min: 66, max: 70, name: "Sangue Fervente", desc: "Quando abaixo de 50% PDV, +2 em todos os ataques." },
  { min: 71, max: 75, name: "Aura de Medo", desc: "Inimigos em 6m fazem teste de FDV CD 12 ou ficam amedrontados 1 turno." },
  { min: 76, max: 80, name: "Membro Extra", desc: "Braço adicional: ataque extra 1d6+FOR por turno. Ou carregar arma extra." },
  { min: 81, max: 85, name: "Corpo Elástico", desc: "Alcance corpo a corpodobrado. Pode atacar alvos a 3m sem penalidade." },
  { min: 86, max: 90, name: "Camuflagem Demoníaca", desc: "Invisível em áreas sombrias. Reaparece ao atacar." },
  { min: 91, max: 95, name: "Frenesi de Sangue", desc: "Ação lendária: ataque extra imediato ao reduzir inimigo a 0 PDV." },
  { min: 96, max: 100, name: "Dom de Munique", desc: "Rolar novamente e escolher entre o resultado original ou o novo." }
];

const gift = bloodGifts.find((g) => total >= g.min && total <= g.max) ?? bloodGifts[bloodGifts.length - 1];

// Build chat message
const html = `
<div class="na-kekki-card">
  <div class="na-kekki-title">DOM DO SANGUE</div>
  <div style="margin-bottom:6px">
    <span class="na-kekki-badge-rank na-kekki-badge-rank--a">ROLAGEM: ${total}</span>
  </div>
  <div style="font-size:13px;font-weight:700;color:#c026d3;margin-bottom:4px">${gift.name}</div>
  <div style="font-size:11px;color:#d1d5db">${gift.desc}</div>
</div>
`;

ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: html,
  rolls: [roll],
  type: CONST.CHAT_MESSAGE_TYPES.ROLL,
});

ui.notifications.info(`Dom do Sangue: ${gift.name} (rolou ${total})`);

return "";
