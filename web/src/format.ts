import { MONTHS_LONG, MONTHS_SHORT } from './types';

const nf = new Intl.NumberFormat('en-US');

export const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : nf.format(Math.round(v)));

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const r = Math.round(v);
  if (r === 0) return '≈ average';
  return `${r > 0 ? '▲' : '▼'} ${Math.abs(r)}% ${r > 0 ? 'above' : 'below'} avg`;
}

export function fmtPctShort(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const r = Math.round(v);
  if (r === 0) return '±0%';
  return `${r > 0 ? '▲ +' : '▼ −'}${Math.abs(r)}%`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const monthName = (m: number) => MONTHS_LONG[m - 1];
export const monthShort = (m: number) => MONTHS_SHORT[m - 1];

export function fmtDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
}

export function fmtTimeUtc(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)} UTC`;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
