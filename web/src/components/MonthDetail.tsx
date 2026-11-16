import { useEffect, useRef } from 'react';
import type { CalendarItem, Coverage, SatelliteKey } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { MONTHS, coverageNote, num, ordinal, vsTypicalShort } from '../format';
import ErrorNote from './ErrorNote';
import { useClosing } from './useClosing';

/** "ended 2 Nov 2026" on its own line under a satellite's name when it started or stopped in (or before) that month */
export function satNote(coverage: Coverage[] | null | undefined, sat: SatelliteKey, year: number, month: number) {
  const n = coverageNote(coverage, sat, year, month);
  return n ? <span className="sat-note">{n}</span> : null;
}

export type MapState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'shown'; total: number; returned: number; truncated: boolean };

interface Props {
  item: CalendarItem;
  map: MapState;
  onShowMap: () => void;
  onCsv: () => void;
  onClose: () => void;
  coverage?: Coverage[];
}

export default function MonthDetail({ item, map, onShowMap, onCsv, onClose, coverage }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { closing, close } = useClosing(onClose);

  // Keyboard: focus moves into the card when it opens and goes back to the calendar cell when it closes;
  // Escape closes it (unless the data sources dialog is open on top, which handles its own Escape).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) close();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [close]);

  return (
    <div className={'detail' + (closing ? ' is-closing' : '') + (map.kind === 'shown' ? ' has-map' : '')} role="dialog" aria-label={`${MONTHS[item.month - 1]} ${item.year}`}>
      <button ref={closeRef} className="detail-close" onClick={close} aria-label="Close details">×</button>
      <p className="eyebrow">
        {MONTHS[item.month - 1]} {item.year}
      </p>
      <p className="detail-big">
        {num(item.count)} <span>{item.count === 1 ? 'hotspot' : 'hotspots'}</span>
      </p>
      <p className="detail-line">
        {item.vs_avg_pct == null ? 'Nothing to compare with yet' : `${vsTypicalShort(item.vs_avg_pct)}${Math.abs(item.vs_avg_pct) < 20 ? '' : ' than typical'}`}
        {item.rank != null && <> · <span className="nobr">{item.rank === 1 ? 'the most active' : `${ordinal(item.rank)} most active`} {MONTHS[item.month - 1]} of {item.of_years}</span></>}
      </p>
      <p className="fineprint detail-unit">Hotspot: a 1 km square with fire on one day, satellite-adjusted.</p>
      {(item.provisional || item.uncertain || item.partial) && (
        <ul className="flags">
          {item.partial && <li>Month in progress: compared with the same days in other years.</li>}
          {item.provisional && <li>Provisional: recent data that NASA may still revise.</li>}
          {item.uncertain && <li>Uncertain: too few fires to compare reliably.</li>}
        </ul>
      )}
      <dl className="sats">
        {SATELLITES.map((k) => (
          <div key={k}>
            <dt>{SAT_NAMES[k]}{satNote(coverage, k, item.year, item.month)}</dt>
            <dd>{item.detected[k] == null ? <span className="muted">no data</span> : num(item.detected[k])}</dd>
          </div>
        ))}
      </dl>
      <p className="fineprint">Satellite detections, before adjustment.</p>

      {map.kind === 'shown' ? (
        <p className="note">
          {map.returned === 0
            ? 'No satellite detections this month.'
            : map.truncated
              ? `Showing ${num(map.returned)} of ${num(map.total)} satellite detections on the map.`
              : `Showing all ${num(map.total)} satellite detections on the map.`}
        </p>
      ) : map.kind === 'error' ? null : (
        <button className="btn btn-light btn-wide" onClick={onShowMap} disabled={map.kind === 'loading'}>
          {map.kind === 'loading' ? 'Loading the map…' : 'Show this month on the map'}
        </button>
      )}
      {map.kind === 'error' && <ErrorNote title="The map could not load" message={map.message} onRetry={onShowMap} />}
      <button className="btn btn-quiet btn-wide" onClick={onCsv}>Download this month's detections (CSV)</button>
    </div>
  );
}
