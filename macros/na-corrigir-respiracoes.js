const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.repairBreathingItems) {
    ui.notifications.error(
        'Night Assassins — atualize e ative o módulo para corrigir as respirações.'
    );
    return '';
}
if (!game.user?.isGM) {
    ui.notifications.warn('Apenas o Mestre pode corrigir as respirações dos Caçadores.');
    return '';
}

try {
    const result = await moduleApi.repairBreathingItems({});
    const summary =
        result.items > 0
            ? `Respirações corrigidas: **${result.items}** itens em **${result.actors}** Caçadores.`
            : 'Nenhuma respiração precisou de correção.';
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
        content: `**Correção de Respirações dos Caçadores**\n\n${summary}`,
    });
    ui.notifications.info(summary);
} catch (error) {
    ui.notifications.error(error?.message || 'Falha ao corrigir as respirações dos Caçadores.');
}
return '';
