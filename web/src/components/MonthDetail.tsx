import { useEffect, useRef } from 'react';
import type { CalendarItem } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { MONTHS, num, pctLong } from '../format';
import ErrorNote from './ErrorNote';
import { useClosing } from './useClosing';

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
}

export default function MonthDetail({ item, map, onShowMap, onCsv, onClose }: Props) {
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
    <aside className={'detail' + (closing ? ' is-closing' : '')} role="dialog" aria-label={`${MONTHS[item.month - 1]} ${item.year}`}>
      <button ref={closeRef} className="detail-close" onClick={close} aria-label="Close details">×</button>
      <p className="eyebrow dark">
        {MONTHS[item.month - 1]} {item.year}
        {item.partial && ` · first ${item.days_covered} days`}
      </p>
      <p className="detail-big">
        {num(item.count)} <span>corrected count</span>
      </p>
      <p className="detail-line">
        {pctLong(item.vs_avg_pct)}
        {item.rank != null && <> · rank {item.rank} of {item.of_years} years</>}
      </p>
      {(item.provisional || item.uncertain || item.partial) && (
        <ul className="flags">
          {item.partial && <li>Month not finished: compared with the same days in other years.</li>}
          {item.provisional && <li>Provisional: includes NASA near-real-time data that is replaced by final data about 5 months later.</li>}
          {item.uncertain && <li>Uncertain: very few fires or a large conversion error.</li>}
        </ul>
      )}
      <dl className="sats">
        {SATELLITES.map((k) => (
          <div key={k}>
            <dt>{SAT_NAMES[k]}</dt>
            <dd>{item.detected[k] == null ? <span className="muted">no data</span> : num(item.detected[k])}</dd>
          </div>
        ))}
      </dl>
      <p className="fineprint">Hotspots detected per satellite, before harmonization.</p>

      {map.kind === 'shown' ? (
        <p className="note">
          {map.returned === 0
            ? 'No hotspots in this month.'
            : map.truncated
              ? `Showing ${num(map.returned)} of ${num(map.total)} hotspots on the map.`
              : `Showing all ${num(map.total)} hotspots on the map.`}
        </p>
      ) : map.kind === 'error' ? null : (
        <button className="btn btn-light btn-wide" onClick={onShowMap} disabled={map.kind === 'loading'}>
          {map.kind === 'loading' ? 'Loading hotspots…' : 'Show this month on the map'}
        </button>
      )}
      {map.kind === 'error' && <ErrorNote title="The map could not load" message={map.message} onRetry={onShowMap} />}
      <button className="btn btn-quiet btn-wide" onClick={onCsv}>Download this month's hotspots (CSV)</button>
    </aside>
  );
}
