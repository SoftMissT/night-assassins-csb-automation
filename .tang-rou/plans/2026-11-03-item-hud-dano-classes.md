# Plano — Item HUD, dano persistido e classes

1. Extrair/normalizar o perfil de dano persistido no Item, reutilizando o formato de entradas dos presets existentes.
2. Adicionar ações rápidas à ficha de Item por hook, sem reescrever os templates CSB: editar/salvar perfil e rolar quando houver Actor proprietário.
3. Adicionar ferramenta GM para escolher Item canônico do Compêndio e criar uma cópia no Actor.
4. Implementar somente os comportamentos de `classe_usuario_de_duas_resp` e `classe_companheiro_oni` sustentados pelas fontes/catalogo; cobrir com testes.
5. Rodar suíte, auditar diff e deixar roteiro de QA Foundry.

## Decisão

O perfil fica no Item porque a fórmula acompanha a arma/Forma e pode ser reutilizada por qualquer Actor que a receba. Presets de Actor continuam compatíveis como atalho de grupo.
