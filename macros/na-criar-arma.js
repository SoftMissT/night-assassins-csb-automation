// Foundry 14 / CSB. Cria um Item de arma normal no mundo ou no ator selecionado.
if (!game.user.isGM || game.system.id !== 'custom-system-builder')
    return ui.notifications.warn('Criar Arma exige GM em um mundo Custom System Builder.');

const templateId = 'NAWeaponTpl00001';
const template = game.items.get(templateId);
if (template?.type !== '_equippableItemTemplate')
    return ui.notifications.warn('Importe o template NA Arma - Slayer antes de criar uma arma.');

const selected = canvas?.ready ? canvas.tokens.controlled : [];
const actor = selected.length === 1 ? selected[0]?.actor : null;
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const asHtml = (value) => value ? `<p>${escapeHtml(value).replaceAll('\n', '<br>')}</p>` : '';
const attrs = ['FOR', 'DEX', 'VIT', 'FDV', 'INT', 'SAB', 'CAR'];
const attrOptions = attrs.map((key) => `<option>${key}</option>`).join('');
const types = {
    cortante: 'Cortante', perfurante: 'Perfurante', concussao: 'Concussão',
    trovejante: 'Trovejante', sonoro: 'Sonoro', solar: 'Solar', fogo: 'Fogo',
    congelante: 'Congelante', acido: 'Ácido', eletrico: 'Elétrico', impacto: 'Impacto',
    mental: 'Mental', venenoso: 'Venenoso', necrotico: 'Necrótico', ferida: 'Ferida',
    sangramento: 'Sangramento', envenenamento: 'Envenenamento',
};
const propriedades = [
    'Acuidade', 'Concussão', 'Manejável', 'Nitoryu', 'Ryōtō', 'Morote', 'Municiada',
    'Precisão', 'Sōjutsu', 'Ágil', 'Arremesso', 'Dual (par obrigatório)', 'Equilibrada',
    'Haste', 'Leve', 'Nichirin', 'Pesada', 'Retornante', 'Veloz',
].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const field = (label, control) => `<label class="na-ca-field"><span>${label}</span>${control}</label>`;
const bonusFields = (index) => `
    <div class="na-ca-bonus-row">
        ${field(`Atributo ${index}`, `<select name="bonus${index}"><option value="">Nenhum</option>${attrOptions}</select>`)}
        ${field(`Multiplicador ${index}`, `<select name="mult${index}"><option value="1">Inteiro</option><option value="0.5">Metade</option></select>`)}
    </div>
`;

const stylesheet = /* na-criar-arma.css */ '';
const content = document.createElement('div');
content.innerHTML = `
        <style>${stylesheet}</style>
        <div class="na-ca">
            <fieldset>
                <legend>Arma</legend>
                ${field('Nome', '<input name="nome" required maxlength="70" autofocus>')}
                <div class="na-ca-grid">
                    ${field('Tipo de arma', '<select name="tipo"><option>Corpo a corpo</option><option>Arremesso</option><option>À distância</option><option>Híbrida</option></select>')}
                    ${field('Alcance', '<input name="alcance" value="1,5 m" maxlength="50">')}
                    ${field('Salvar em', `<select name="destino"><option value="mundo">Itens do mundo</option>${actor ? `<option value="ator">${escapeHtml(actor.name)}</option>` : ''}</select>`)}
                </div>
                ${field('Propriedades', `<multi-select name="propriedades" aria-label="Propriedades">${propriedades.map(p => `<option>${p}</option>`).join('')}</multi-select>`)}
            </fieldset>
            <fieldset>
                <legend>Combate</legend>
                <div class="na-ca-grid na-ca-numeros">
                    ${field('Dados de dano', '<input name="dado" value="1d6" placeholder="Ex.: 2d6" maxlength="8">')}
                    ${field('Dano fixo', '<input name="fixo" type="number" value="0" min="0" max="999">')}
                    ${field('Crítico natural', '<input name="critico" type="number" value="20" min="1" max="20" required>')}
                    ${field('Golpes', '<input name="golpes" type="number" value="1" min="1" max="9" required>')}
                </div>
                <div class="na-ca-grid na-ca-damage">
                    ${field('Acerto', `<select name="acerto">${attrOptions}</select>`)}
                    ${field('Tipos de dano', `<multi-select name="tipos" aria-label="Tipos de dano">${Object.entries(types).map(([key, label]) => `<option value="${key}" ${key === 'cortante' ? 'selected' : ''}>${label}</option>`).join('')}</multi-select>`)}
                </div>
            </fieldset>
            <details>
                <summary>Bônus de atributo e munição</summary>
                <div class="na-ca-details-body">
                    ${bonusFields(1)}${bonusFields(2)}
                    <div class="na-ca-bonus-row">
                        ${field('Capacidade (Municiada)', '<input name="municao" type="number" min="0" max="999" value="0">')}
                    </div>
                </div>
            </details>
            <details>
                <summary>Descrição e habilidades</summary>
                <div class="na-ca-details-body">
                    ${field('Descrição', '<textarea name="descricao" rows="2"></textarea>')}
                    ${field('Habilidades e regras', '<textarea name="regras" rows="3"></textarea>')}
                </div>
            </details>
        </div>
    `;
const dados = await foundry.applications.api.DialogV2.wait({
    classes: ['na-create-weapon'],
    window: { title: 'Criar Arma · Night Assassins', resizable: true },
    position: { width: 620 },
    modal: true,
    rejectClose: false,
    content,
    render: (_event, dialog) => {
        for (const picker of dialog.element.querySelectorAll('.na-ca multi-select')) {
            const select = picker.querySelector('select');
            const label = picker.getAttribute('aria-label');
            select.setAttribute('aria-label', label);
            select.options[0].textContent = label === 'Propriedades' ? 'Adicionar propriedade' : 'Adicionar tipo de dano';
        }
    },
    buttons: [
        { action: 'criar', label: 'Criar arma', default: true,
          callback: (_event, button) => ({
              form: new FormData(button.form),
              properties: button.form.querySelector('multi-select[name="propriedades"]').value,
              types: button.form.querySelector('multi-select[name="tipos"]').value,
          }) },
        { action: 'cancelar', label: 'Cancelar', callback: () => false },
    ],
});
if (!(dados?.form instanceof FormData)) return;

const value = (key) => String(dados.form.get(key) ?? '').trim();
const nome = value('nome');
const dado = value('dado').toLowerCase();
const fixo = Number(value('fixo'));
const critico = Number(value('critico'));
const ataques = Number(value('golpes'));
const acerto = value('acerto');
const tipos = dados.types.filter((key) => Object.hasOwn(types, key));
const propriedadesSelecionadas = dados.properties.filter((label) => propriedades.includes(label));
const municao = propriedadesSelecionadas.includes('Municiada') ? Number(value('municao')) : 0;
const atributos = [1, 2].flatMap((n) => {
    const key = value(`bonus${n}`);
    return attrs.includes(key) ? [{ key, multiplicador: value(`mult${n}`) === '0.5' ? 0.5 : 1, escolha: false }] : [];
});
if (!nome || !tipos.length || !attrs.includes(acerto) ||
    (dado && !/^(?:[1-9]|[1-9]\d)d(?:4|6|8|10|12|20|100)$/u.test(dado)) ||
    !Number.isInteger(fixo) || fixo < 0 || fixo > 999 ||
    !Number.isInteger(critico) || critico < 1 || critico > 20 ||
    !Number.isInteger(ataques) || ataques < 1 || ataques > 9 ||
    (!dado && !fixo && atributos.length === 0) ||
    new Set(atributos.map(({ key }) => key)).size !== atributos.length) {
    return ui.notifications.warn('Confira o nome, os dados, os tipos e os atributos antes de criar.');
}
if (propriedadesSelecionadas.includes('Municiada') &&
    (!Number.isInteger(municao) || municao < ataques || municao > 999))
    return ui.notifications.warn('Em Bônus de atributo e munição, informe uma capacidade igual ou maior que o número de golpes.');

const portador = value('destino') === 'ator' ? actor : null;
if (value('destino') === 'ator' && !portador) return;
const destino = portador?.items ?? game.items;
if (destino.some((item) => item.name.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR')))
    return ui.notifications.warn('Já existe uma arma com esse nome no destino.');

const alcance = value('alcance');
const tipoTexto = tipos.map((key) => types[key]).join(' + ');
const attrKeys = atributos.map(({ key }) => key);
const formula = [dado, fixo || '', ...atributos.map(({ key, multiplicador }) =>
    multiplicador === 0.5 ? `½ ${key}` : key
)].filter(Boolean).join(' + ');
const resumo = `${formula} / ${tipoTexto}`;
const data = {
    name: nome, type: 'equippableItem', img: 'icons/svg/sword.svg',
    system: { template: templateId, props: {
        inventario_categoria: 'arma', arma_nome: nome, arma_categoria: 'basica',
        arma_alcance: alcance, arma_tipo: value('tipo'), arma_propriedades: propriedadesSelecionadas.join(' / '),
        ...(municao ? { arma_municao_capacidade: municao, arma_municao_atual: municao } : {}),
        arma_critico: critico, arma_dano_dados: dado, arma_dano_fixo: fixo,
        arma_dano_atributo: attrKeys.join(' / '), arma_dano_atributo_json: JSON.stringify(attrKeys),
        arma_tipos_dano: tipos.join(', '), arma_tipos_dano_json: JSON.stringify(tipos),
        arma_atributo_acerto_json: JSON.stringify([acerto]), arma_tipos_dano_resumo: tipoTexto,
        arma_perfis_resumo: ataques > 1 ? `${ataques} golpes · ${resumo}` : resumo,
        arma_perfis_ataque_json: JSON.stringify([{
            nome: 'Ataque Base', formula_texto: resumo, dano_dados: dado, dano_fixo: fixo,
            atributos, tipos_dano: tipos, alcance, critico, ataques, dano_segundo_golpe: 'normal',
        }]),
        descricao: asHtml(value('descricao')), arma_regra_completa: asHtml(value('regras')),
    } },
};
const [criada] = portador ? await portador.createEmbeddedDocuments('Item', [data])
    : await Item.implementation.createDocuments([data]);
if (!criada) return ui.notifications.warn('O Foundry não criou a arma.');
await criada.templateSystem.reloadTemplate(templateId);
criada.sheet.render({ force: true });
