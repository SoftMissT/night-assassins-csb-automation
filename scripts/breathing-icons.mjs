export const BREATHING_ICONS = Object.freeze({
    Água: 'resp_agua.webp',
    Amor: 'resp_amor.webp',
    Chamas: 'resp_chamas.webp',
    Flores: 'resp_flor.webp',
    Madeira: 'resp_madeira.webp',
    Metal: 'resp_metal.webp',
    Neve: 'resp_neve.webp',
    Pedra: 'resp_pedra.webp',
    Raposa: 'resp_raposa.webp',
    Serpente: 'resp_serpente.webp',
    Sombras: 'resp_sombras.webp',
});

export function breathingIconPath(breathing) {
    const file = BREATHING_ICONS[breathing];
    return file ? `modules/night-assassins-csb-automation/assets/icons/breathing/${file}` : null;
}
