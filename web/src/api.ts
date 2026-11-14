// The ONLY place that knows where data comes from.
// VITE_API_BASE_URL empty  -> read the fake files in web/mocks/
// VITE_API_BASE_URL set    -> call the real API (docs/api-contract.md)

import type { Analysis, Area, Hotspots, Preset, Query, Status, UpdateResult } from './types';

import presetsUrl from '../mocks/presets.json?url';
import statusUrl from '../mocks/status.json?url';
import analysisUrl from '../mocks/analysis.pantanal.json?url';
import analysis2020Url from '../mocks/analysis.pantanal.ref-2020-09-14.json?url';
import hotspotsUrl from '../mocks/hotspots.pantanal.2020-09.geojson?url';
import calendarCsvUrl from '../mocks/calendar.pantanal.csv?url';
import hotspotsCsvUrl from '../mocks/hotspots.pantanal.2020-09.csv?url';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');

export const USING_MOCKS = BASE === '';
export const API_BASE = BASE;

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MOCK_DELAY_MS = 350; // so loading states are visible while developing on mocks

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(
      'NETWORK',
      USING_MOCKS
        ? 'Could not load the mock files.'
        : `Can't reach the API at ${BASE}. Is it running? (Leave VITE_API_BASE_URL empty to use the mocks.)`,
      0,
    );
  }
  if (!res.ok) {
    let code = 'SERVER_ERROR';
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      /* not JSON */
    }
    throw new ApiError(code, message, res.status);
  }
  return res.json() as Promise<T>;
}

const post = (path: string, body: unknown) =>
  getJson(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// ---------- endpoints ----------

export async function fetchPresets(): Promise<Preset[]> {
  if (USING_MOCKS) {
    const d = await getJson<{ presets: Preset[] }>(presetsUrl);
    return d.presets;
  }
  const d = await getJson<{ presets: Preset[] }>(`${BASE}/api/presets`);
  return d.presets;
}

export async function fetchStatus(): Promise<Status> {
  if (USING_MOCKS) return getJson<Status>(statusUrl);
  return getJson<Status>(`${BASE}/api/status`);
}

export async function fetchAnalysis(q: Query): Promise<Analysis> {
  if (!USING_MOCKS) return post('/api/analysis', q) as Promise<Analysis>;

  // Mocks: only two reference dates exist. Any area returns the Pantanal file.
  await wait(MOCK_DELAY_MS);
  const replay2020 = q.ref_date <= '2020-12-31';
  const d = await getJson<Analysis>(replay2020 ? analysis2020Url : analysisUrl);
  // Emulate the server clipping the period to start/end (display filter only).
  const [sy, sm] = q.start.split('-').map(Number);
  const [ey, em] = q.end.split('-').map(Number);
  const inRange = (y: number, m: number) => (y > sy || (y === sy && m >= sm)) && (y < ey || (y === ey && m <= em));
  return {
    ...d,
    calendar: d.calendar.filter((c) => inRange(c.year, c.month)),
    yearly: d.yearly.filter((r) => r.year >= sy && r.year <= ey),
  };
}

export async function fetchHotspots(area: Area, year: number, month: number, limit = 5000): Promise<Hotspots> {
  if (!USING_MOCKS) return post('/api/hotspots', { area, year, month, limit }) as Promise<Hotspots>;
  await wait(MOCK_DELAY_MS);
  // Mocks: only September 2020 exists; it is returned for every month.
  return getJson<Hotspots>(hotspotsUrl);
}

export async function requestUpdate(): Promise<UpdateResult> {
  if (USING_MOCKS) {
    await wait(900);
    return { status: 'updated', data_updated: new Date().toISOString(), new_hotspots: 0 };
  }
  try {
    return (await post('/api/update', {})) as UpdateResult;
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      return { status: 'too_soon', data_updated: '', new_hotspots: 0 };
    }
    throw e;
  }
}

/** Downloads a CSV export. Returns true if the server says the file was capped. */
export async function downloadCsv(kind: 'hotspots' | 'calendar', q: Query, filename: string): Promise<boolean> {
  let blob: Blob;
  let truncated = false;
  if (USING_MOCKS) {
    const res = await fetch(kind === 'calendar' ? calendarCsvUrl : hotspotsCsvUrl);
    blob = await res.blob();
  } else {
    const res = await fetch(`${BASE}/api/export/${kind}.csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
    });
    if (!res.ok) throw new ApiError('SERVER_ERROR', `Export failed (HTTP ${res.status})`, res.status);
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
