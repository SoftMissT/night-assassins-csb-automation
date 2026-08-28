const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.repairSlayerWeaponItems) {
    ui.notifications.error('Night Assassins — atualize e ative o módulo para corrigir as armas.');
    return '';
}
if (!game.user?.isGM) {
    ui.notifications.warn('Apenas o Mestre pode corrigir as armas dos Caçadores.');
    return '';
}

try {
    const result = await moduleApi.repairSlayerWeaponItems({});
    const summary =
        result.items > 0
            ? `Armas corrigidas: **${result.items}** itens em **${result.actors}** Caçadores.`
            : 'Nenhuma arma precisou de correção.';
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
        content: `**Correção de Armas dos Caçadores**\n\n${summary}`,
    });
    ui.notifications.info(summary);
} catch (error) {
    ui.notifications.error(error?.message || 'Falha ao corrigir as armas dos Caçadores.');
}
return '';
