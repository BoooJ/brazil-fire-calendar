// Intensity levels of the calendar's bricks, shared by the calendar, the first screen and the coming months.
// Display only: the thresholds are quantiles of this area's own months, so colours and words always mean
// "for this place". The numbers themselves are the API's.
export interface Levels {
  thresholds: number[];
  /** 0 = lowest … 4 = highest */
  level: (count: number | null | undefined) => number;
}

export function makeCountLevels(items: { count: number | null }[]): Levels {
  const v = items.map((i) => i.count).filter((c): c is number => c != null && c > 0).sort((a, b) => a - b);
  const q = (p: number) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : Infinity);
  const t = [q(0.5), q(0.75), q(0.9), q(0.97)];
  return {
    thresholds: t,
    level: (c) => (c == null ? 0 : c >= t[3] ? 4 : c >= t[2] ? 3 : c >= t[1] ? 2 : c >= t[0] ? 1 : 0),
  };
}

/** One word per level, used wherever a brick's colour is put into words. */
export const LEVEL_WORDS = ['Minimal', 'Low', 'Moderate', 'High', 'Extreme'];
export const levelWord = (lv: Levels, count: number | null | undefined) => (!count ? 'No fire' : LEVEL_WORDS[lv.level(count)]);

/** What a month is usually like here, from its level: "usually a quiet month here" */
export const USUALLY = [
  'usually a quiet month here',
  'usually sees a little fire here',
  'usually a busy fire month here',
  'usually deep in the fire season here',
  'usually the height of the fire season here',
];

/** -2 … +2 for the diverging "vs typical" scale. */
export const vsLevel = (p: number | null) => (p == null ? 0 : p <= -50 ? -2 : p <= -20 ? -1 : p < 20 ? 0 : p < 100 ? 1 : 2);
