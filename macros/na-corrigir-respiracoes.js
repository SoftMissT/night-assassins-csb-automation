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
    const summaryText =
        result.items > 0
            ? `Respirações corrigidas: ${result.items} itens em ${result.actors} Caçadores.`
            : 'Nenhuma respiração precisou de correção.';
    const summaryHtml =
        result.items > 0
            ? `Respirações corrigidas: <strong>${result.items}</strong> itens em <strong>${result.actors}</strong> Caçadores.`
            : summaryText;
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
        content: `<h3>Correção de Respirações dos Caçadores</h3><p>${summaryHtml}</p>`,
    });
    ui.notifications.info(summaryText);
} catch (error) {
    console.error('[NA-BREATH-REPAIR] Falha ao corrigir respirações.', error);
    ui.notifications.error(error?.message || 'Falha ao corrigir as respirações dos Caçadores.');
}
return '';
