import type { Heatmap } from "@/firebase/playHeatmap";

/**
 * Heatmap mock pour la démo profil + la heatmap collective. Pattern
 * réaliste d'un crew gaming :
 *  - Activité concentrée le soir 19h-23h
 *  - Pic le weekend (samedi/dimanche soir)
 *  - Quelques sessions à midi (pause déj)
 *  - Très peu la nuit (3h-7h) ou le matin
 *
 * Days : Lun=0, Mar=1, Mer=2, Jeu=3, Ven=4, Sam=5, Dim=6
 * Hours : 0-23
 */

function makeCells(): Record<string, number> {
  const cells: Record<string, number> = {};

  const setCell = (day: number, hour: number, value: number) => {
    cells[`${day}-${hour}`] = value;
  };

  // Soirées en semaine — activité montante 19h → 23h
  for (let day = 0; day <= 4; day++) {
    setCell(day, 19, 4 + Math.floor(Math.random() * 3));
    setCell(day, 20, 8 + Math.floor(Math.random() * 4));
    setCell(day, 21, 12 + Math.floor(Math.random() * 5));
    setCell(day, 22, 14 + Math.floor(Math.random() * 4));
    setCell(day, 23, 9 + Math.floor(Math.random() * 4));
    setCell(day, 0, 3 + Math.floor(Math.random() * 3)); // 0h = encore late
  }

  // Pauses déj
  for (let day = 0; day <= 4; day++) {
    setCell(day, 12, 2 + Math.floor(Math.random() * 2));
    setCell(day, 13, 3 + Math.floor(Math.random() * 3));
  }

  // Weekend — pic global
  for (const day of [5, 6]) {
    setCell(day, 14, 6 + Math.floor(Math.random() * 4));
    setCell(day, 15, 10 + Math.floor(Math.random() * 5));
    setCell(day, 16, 13 + Math.floor(Math.random() * 5));
    setCell(day, 17, 11 + Math.floor(Math.random() * 5));
    setCell(day, 18, 9 + Math.floor(Math.random() * 4));
    setCell(day, 19, 15 + Math.floor(Math.random() * 5));
    setCell(day, 20, 22 + Math.floor(Math.random() * 5)); // Pic absolu
    setCell(day, 21, 24 + Math.floor(Math.random() * 4));
    setCell(day, 22, 19 + Math.floor(Math.random() * 5));
    setCell(day, 23, 14 + Math.floor(Math.random() * 4));
    setCell(day, 0, 6 + Math.floor(Math.random() * 4));
    setCell(day, 1, 3 + Math.floor(Math.random() * 3));
  }

  return cells;
}

const cells = makeCells();
const totalLaunches = Object.values(cells).reduce((sum, v) => sum + v, 0);

export const MOCK_HEATMAP_PERSONAL: Heatmap = {
  cells,
  totalLaunches,
  updatedAtMs: Date.now(),
};

/**
 * Heatmap collective (toute la communauté agrégée) — reprend le même
 * pattern mais avec des valeurs ~6× plus grosses pour figurer la
 * somme de tous les membres.
 */
export const MOCK_HEATMAP_COMMUNITY: Heatmap = {
  cells: Object.fromEntries(
    Object.entries(cells).map(([k, v]) => [k, v * 6 + Math.floor(Math.random() * 8)]),
  ),
  totalLaunches: totalLaunches * 6 + 421,
  updatedAtMs: Date.now(),
};
