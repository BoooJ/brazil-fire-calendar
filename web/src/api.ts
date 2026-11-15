// The ONLY module that knows where data comes from.
// VITE_API_BASE_URL empty -> fake files in web/mocks/. Otherwise -> the real API (docs/api-contract.md).
import type { Analysis, AnalysisRequest, AreaGeometry, CalendarItem, Forecast, ForecastRequest, Hotspots, Preset, Status, UpdateResult } from './types';
import { areaBbox } from './geo';
import calendarCsvUrl from '../mocks/calendar.pantanal.csv?url';
import hotspotsCsvUrl from '../mocks/hotspots.pantanal.2020-09.csv?url';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
export const usingMocks = BASE === '';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function http<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the data server. Check your connection and try again.');
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

async function errorFrom(res: Response): Promise<ApiError> {
  let code = 'SERVER_ERROR';
  let message = `The data server answered with an error (${res.status}).`;
  try {
    const j = await res.json();
    if (j?.error?.code) code = j.error.code;
    if (j?.error?.message) message = j.error.message;
  } catch {
    /* keep defaults */
  }
  return new ApiError(code, message, res.status);
}

// A short pause so loading states are visible while we build against mocks.
const pause = (ms = 350) => new Promise((r) => setTimeout(r, ms));

// ---------- mock files (code-split: only loaded when VITE_API_BASE_URL is empty, or as the landing page's fallback) ----------

async function mockPresets(): Promise<Preset[]> {
  const m = await import('../mocks/presets.json');
  return m.default.presets as unknown as Preset[];
}

async function mockAnalysis(replay2020: boolean, weekly = false): Promise<Analysis> {
  const m = replay2020
    ? await import('../mocks/analysis.pantanal.ref-2020-09-14.json')
    : weekly
      ? await import('../mocks/analysis.pantanal.week.json')
      : await import('../mocks/analysis.pantanal.json');
  return m.default as unknown as Analysis;
}

async function mockHotspots(): Promise<Hotspots> {
  const m = await import('../mocks/hotspots.pantanal.2020-09.geojson?raw');
  return JSON.parse(m.default) as Hotspots;
}

// ---------- endpoints ----------

export async function getPresets(): Promise<Preset[]> {
  if (usingMocks) return mockPresets();
  return (await http<{ presets: Preset[] }>('/api/presets')).presets;
}

export async function getStatus(): Promise<Status> {
  if (usingMocks) {
    const m = await import('../mocks/status.json');
    return m.default as unknown as Status;
  }
  return http<Status>('/api/status');
}

/** The tool's one call: monthly fields plus the weekly calendar (contract v0.4, "period": "week"). */
export async function getAnalysis(req: AnalysisRequest): Promise<Analysis> {
  if (!usingMocks) return http<Analysis>('/api/analysis', { ...req, period: 'week' });

  // Mocks: two reference dates exist, and every area returns the Pantanal file (weeks only for 2026-11-14).
  await pause();
  const d = await mockAnalysis(!!req.ref_date && req.ref_date <= '2020-12-31', true);
  // Copy what the server does with start / end: it clips the period (display filter only, nothing is recomputed).
  if (!req.start && !req.end) return d;
  const [sy, sm] = (req.start ?? '2003-01-01').split('-').map(Number);
  const [ey, em] = (req.end ?? '9999-12-31').split('-').map(Number);
  const inRange = (y: number, m: number) => (y > sy || (y === sy && m >= sm)) && (y < ey || (y === ey && m <= em));
  return {
    ...d,
    calendar: d.calendar.filter((c) => inRange(c.year, c.month)),
    yearly: d.yearly.filter((r) => r.year >= sy && r.year <= ey),
    // the server keeps the weeks that touch the period (ISO dates compare as text)
    calendar_weekly: d.calendar_weekly?.filter((w) => w.end >= (req.start ?? '') && w.start <= (req.end ?? '9999-12-31')),
  };
}

export async function getHotspots(req: {
  area: AreaGeometry;
  year: number;
  month: number;
  limit?: number;
}): Promise<Hotspots> {
  if (usingMocks) {
    await pause();
    if (req.year !== 2020 || req.month !== 9) {
      throw new ApiError('MOCK_ONLY', 'Demo data has map points only for September 2020.');
    }
    return mockHotspots();
  }
  return http<Hotspots>('/api/hotspots', req);
}

/** Next-week fire chance: the science team's model, the only forecast in the app. Mocks: always the Pantanal file. */
export async function getForecast(req: ForecastRequest): Promise<Forecast> {
  if (usingMocks) {
    await pause(600);
    // the demo file is for 13 Nov 2026: a replayed past date would show next week's dates for a week years later
    if (req.ref_date && req.ref_date < '2026-11-13') {
      throw new ApiError('MOCK_ONLY', 'Demo data has a next-week estimate only for the latest data, not for past dates.');
    }
    const m = await import('../mocks/forecast.pantanal.json');
    return m.default as unknown as Forecast;
  }
  return http<Forecast>('/api/forecast', req);
}

/** The "Update now" button: asks the server to fetch the latest days from FIRMS. */
export async function requestUpdate(): Promise<UpdateResult> {
  if (usingMocks) {
    await pause(900);
    return { status: 'failed', data_updated: '', new_hotspots: 0, message: 'Demo data cannot be updated. Connect the real API first.' };
  }
  try {
    return await http<UpdateResult>('/api/update', {});
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) return { status: 'too_soon', data_updated: '', new_hotspots: 0 };
    throw e;
  }
}

/** Downloads a CSV export. Returns true if the server says the file was capped (1,000,000 rows). */
export async function downloadCsv(kind: 'hotspots' | 'calendar', req: AnalysisRequest, filename: string): Promise<boolean> {
  let blob: Blob;
  let truncated = false;
  if (usingMocks) {
    const res = await fetch(kind === 'calendar' ? calendarCsvUrl : hotspotsCsvUrl);
    blob = await res.blob();
  } else {
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/export/${kind}.csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    } catch {
      throw new ApiError('NETWORK', 'Could not reach the data server. Check your connection and try again.');
    }
    if (!res.ok) throw await errorFrom(res);
    truncated = res.headers.get('X-Truncated') === 'true';
    blob = await res.blob();
  }
  saveBlob(blob, filename);
  return truncated;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- landing page ----------

export interface Showcase {
  areaName: string;
  /** [west, south, east, north] of that area */
  bbox: [number, number, number, number];
  analysis: Analysis;
  /** the month the landing page opens on its map: the busiest finished month on record */
  month: CalendarItem | null;
  hotspots: Hotspots | null;
  /** data after this day is near-real-time (provisional) */
  finalUntil: string | null;
  /** true when these are the fake files from web/mocks/ (no API configured, or it did not answer) */
  demo: boolean;
}

const SHOWCASE_PRESET = 'pantanal';

function busiestMonth(a: Analysis): CalendarItem | null {
  let top: CalendarItem | null = null;
  for (const c of a.calendar) if (!c.partial && c.count != null && (!top || c.count > (top.count ?? 0))) top = c;
  return top;
}

/** The numbers drawn on the landing page: the Pantanal preset, from the API when there is one. */
export async function getShowcase(): Promise<Showcase> {
  if (!usingMocks) {
    try {
      const signal = AbortSignal.timeout(8000);
      const presets = (await http<{ presets: Preset[] }>('/api/presets', undefined, signal)).presets;
      const preset = presets.find((p) => p.id === SHOWCASE_PRESET) ?? presets[0];
      const analysis = await http<Analysis>('/api/analysis', { area: preset.area }, signal);
      const month = busiestMonth(analysis);
      const [hotspots, status] = await Promise.all([
        month
          ? http<Hotspots>('/api/hotspots', { area: preset.area, year: month.year, month: month.month, limit: 300 }, signal).catch(() => null)
          : null,
        http<Status>('/api/status', undefined, signal).catch(() => null),
      ]);
      return { areaName: preset.name, bbox: areaBbox(preset.area), analysis, month, hotspots, finalUntil: status?.final_until ?? null, demo: false };
    } catch {
      /* the landing page must still draw: fall through to the demo files, clearly labelled */
    }
  }
  const [presets, analysis, status] = await Promise.all([mockPresets(), mockAnalysis(false), import('../mocks/status.json')]);
  const preset = presets.find((p) => p.id === SHOWCASE_PRESET) ?? presets[0];
  const month = busiestMonth(analysis);
  // the only month the demo files have map points for
  const hotspots = month?.year === 2020 && month.month === 9 ? await mockHotspots() : null;
  return { areaName: preset.name, bbox: areaBbox(preset.area), analysis, month, hotspots, finalUntil: status.default.final_until, demo: true };
}
