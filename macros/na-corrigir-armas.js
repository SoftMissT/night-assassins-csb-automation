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
    const summaryText =
        result.items > 0
            ? `Armas corrigidas: ${result.items} itens em ${result.actors} Caçadores.`
            : 'Nenhuma arma precisou de correção.';
    const summaryHtml =
        result.items > 0
            ? `Armas corrigidas: <strong>${result.items}</strong> itens em <strong>${result.actors}</strong> Caçadores.`
            : summaryText;
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
        content: `<h3>Correção de Armas dos Caçadores</h3><p>${summaryHtml}</p>`,
    });
    ui.notifications.info(summaryText);
} catch (error) {
    console.error('[NA-WEAPON-REPAIR] Falha ao corrigir armas.', error);
    ui.notifications.error(error?.message || 'Falha ao corrigir as armas dos Caçadores.');
}
return '';
