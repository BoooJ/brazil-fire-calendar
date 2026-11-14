export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = MONTHS.map((m) => m.slice(0, 3));

const nf = new Intl.NumberFormat('en-US');
export const num = (n: number | null | undefined) => (n == null ? '–' : nf.format(Math.round(n)));

/** 85 -> "85", 4812 -> "4.8k", 12345 -> "12k" */
export function compact(n: number | null | undefined): string {
  if (n == null) return '–';
  const r = Math.round(n);
  if (r < 1000) return String(r);
  if (r < 10000) return (r / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(r / 1000) + 'k';
}

/** +31.4 -> "▲ 31%", -12.5 -> "▼ 13%", 855 -> "▲ 9.6×" */
export function pctShort(p: number | null | undefined): string {
  if (p == null) return '–';
  const arrow = p > 0 ? '▲' : p < 0 ? '▼' : '';
  if (p >= 200) return `${arrow}${(p / 100 + 1).toFixed(p >= 900 ? 0 : 1)}×`;
  return `${arrow}${Math.abs(Math.round(p))}%`;
}

export function pctLong(p: number | null | undefined): string {
  if (p == null) return 'no average to compare with';
  const r = Math.round(p);
  if (r === 0) return 'equal to the average';
  if (p >= 200) return `▲ ${(p / 100 + 1).toFixed(1)}× the average`;
  return r > 0 ? `▲ ${r}% above average` : `▼ ${Math.abs(r)}% below average`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}
