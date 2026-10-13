/**
 * Panel layout shared by every /data tab. A flex column with one `gap-3`
 * (the same gap every card grid uses) so tile rows and card rows sit on one
 * spacing step. `space-y-*` broke here: CardData's `contents` wrapper has no
 * box, so the margin it was given vanished and the tiles touched the cards.
 */
export const TAB_PANEL = "mt-4 flex flex-col gap-3";
