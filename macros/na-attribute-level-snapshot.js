// Night Assassins — snapshot de atributos (Slayer 1/3/7 · Oni 1/3/4/6/8/11/12/13/16)
// Roll Message do Label CSB:
// %{return await game.macros.getName('na-attribute-level-snapshot').execute({actorUuid:entity.uuid,level:entity.system.props.nvl_pj});}%
(async () => {
    const startedAt = performance.now();
    if (!canvas.ready) return ui.notifications.warn('Canvas não pronto.');

    const automationModule = game.modules.get('night-assassins-csb-automation');
    if (
        !automationModule?.active ||
        typeof automationModule.api?.runAttributeSnapshot !== 'function'
    ) {
        return ui.notifications.error(
            'Ative ou atualize o módulo Night Assassins CSB Automation e recarregue o mundo.'
        );
    }

    const input = typeof scope !== 'undefined' && scope ? scope : {};
    let actor = null;
    if (input.actorUuid) {
        const document = await fromUuid(input.actorUuid);
        actor = document?.actor ?? document;
    } else {
        actor = canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
    }
    if (!actor)
        return ui.notifications.warn('Não foi possível encontrar a ficha que chamou a macro.');

    const level =
        input.level ?? input.nvl ?? actor.system?.props?.nvl_pj ?? actor.system?.props?.nvl_num;
    await automationModule.api.runAttributeSnapshot(actor, level);
    if (input.debug === true) {
        console.log(
            `[TANG-ROU] snapshot de atributos em ${(performance.now() - startedAt).toFixed(2)}ms`
        );
    }
})();
