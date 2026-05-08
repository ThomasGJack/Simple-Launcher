// Stub no-op qui remplace `@/lib/sounds` côté site web (alias dans
// site/vite.config.ts). Évite de jouer des sons WebAudio sur les
// hover/click — intrusif sur une landing publique.
//
// Le launcher PlayButton appelle `sounds.hover()` au mouseEnter et
// `sounds.click()` au mouseDown ; ici les deux sont no-ops.

export const sounds = {
  hover: () => {},
  click: () => {},
  launch: () => {},
  success: () => {},
  error: () => {},
  notification: () => {},
  messageReceived: () => {},
  updateArrived: () => {},
  achievementBronze: () => {},
  achievementSilver: () => {},
  achievementGold: () => {},
  achievementPlatinum: () => {},
  achievementMilestone: () => {},
};

export function setSoundsEnabled(_value: boolean) {}
export function getSoundsEnabled(): boolean {
  return false;
}
export function setSoundpack(_id: string) {}
export function getActiveSoundpackId(): string {
  return "softlofi";
}
