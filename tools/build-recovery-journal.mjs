import { mkdir, writeFile } from 'node:fs/promises';
import { recoveryFormDefinition } from '../scripts/recovery-breathing-service.mjs';

const id = 'NARegRecup000001';
const pageId = 'NARecupRegras001';
const name = 'Respiração da Recuperação';
const rows = Array.from({ length: 14 }, (_, index) => {
    const def = recoveryFormDefinition('recuperacao', index + 1);
    return `<tr><td>${def.level}</td><td>${def.dc}</td><td>${def.pdv} + VIT</td><td>${def.pdr} + FDV</td></tr>`;
}).join('\n');

const journal = {
    _id: id,
    _key: `!journal!${id}`,
    name,
    pages: [{
        _id: pageId,
        _key: `!journal.pages!${id}.${pageId}`,
        name: 'Uso e tabela',
        type: 'text',
        title: { show: false, level: 1 },
        text: {
            format: 1,
            content: `<h1>${name}</h1>
<p>Na aba Combate, abra <strong>Respiração</strong> no Slayer ou <strong>Recuperação</strong> no NPC. Escolha o que quer recuperar antes de fazer um único teste de <strong>1d20 + FDV</strong>. O Nível de Personagem define a CD e os dados.</p>
<ul>
  <li><strong>Só PDV</strong> fica disponível quando falta pelo menos 1 PDV.</li>
  <li><strong>Só PDR</strong> fica disponível quando o gasto líquido atinge pelo menos metade do PDR máximo, arredondada para cima. Com máximo 37, é preciso ter 19 PDR gastos e estar com até 18 PDR atuais.</li>
  <li><strong>PDV e PDR</strong> fica disponível quando as duas condições são cumpridas.</li>
</ul>
<p>Com 54 de 105 PDV e 37 de 37 PDR, escolha <strong>Só PDV</strong>. Com a vida cheia e 18 de 37 PDR, escolha <strong>Só PDR</strong>.</p>
<p>Para o uso normal, tenha pelo menos 1 PDV atual e esteja em condições de agir. Ofegante, À Beira da Morte e incapacidade bloqueiam a técnica. Ela custa <strong>0 PDR</strong> e consome uma <strong>Ação Especial</strong> se o personagem estiver no combate. Pode ser repetida enquanto as condições forem cumpridas e a ação estiver disponível em combate.</p>
<p>Em sucesso, role apenas os recursos escolhidos, some os atributos da tabela e recupere <strong>75%</strong> de cada resultado, arredondando para baixo. Cada ganho é limitado ao que falta para chegar ao máximo. Em falha, a ação em combate é gasta e a recuperação é zero.</p>
<table><thead><tr><th scope="col">Nível de Personagem</th><th scope="col">CD de FDV</th><th scope="col">Rolagem de PDV</th><th scope="col">Rolagem de PDR</th></tr></thead><tbody>${rows}</tbody></table>
<p>Um 20 natural garante o sucesso e, se PDR foi escolhido, soma duas vezes o Nível de Personagem à rolagem de PDR antes dos 75%.</p>
<p>A partir do nível 4, o sucesso também remove Sangramento e Hemorragia. A partir do nível 8, pode ignorar o próximo dano periódico de Envenenamento. A partir do nível 12, pode suspender Fadiga Corporal ou Mental até o início do próximo turno em combate.</p>
<p><strong>Autocontrole Celular.</strong> Testes de resistência de VIT a Envenenamento ou Hemorragia têm Vantagem. No teste de VIT da ficha, escolha <strong>Vantagem</strong> quando o mestre pedir uma dessas resistências.</p>
<h2>Última Chance</h2>
<p>Quando um golpe reduziria o Slayer a 0 PDV, o fluxo de Vida e Morte pode oferecer a Reação se ele ainda não tentou Recuperação no combate. A CD é 15. Em sucesso, recupere 100% das rolagens de PDV e PDR da tabela, respeitando os máximos. Se o PDV atual continuar em 0 após a cura, o personagem cai. Um 20 natural soma duas vezes o Nível de Personagem à rolagem de PDR.</p>`,
        },
    }],
    ownership: { default: 2 },
};

const output = new URL('../build/compendium/regras/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL(`${id}.json`, output), `${JSON.stringify(journal, null, 2)}\n`);
