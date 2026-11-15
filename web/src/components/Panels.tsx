// Small panels of the tool: the key numbers and the reliability note of the detailed view, and the data sources dialog.
import { useEffect } from 'react';
import { useClosing } from './useClosing';
import type { Analysis, Status } from '../types';
import { SAT_NAMES } from '../types';
import { SAT_COLOR } from '../colors';
import { MONTHS, dateShort, num, ordinal, pctLong } from '../format';

/** Every number comes from the API (`cards`); nothing is computed here. */
export function KeyCards({ data }: { data: Analysis }) {
  const c = data.cards;
  const month = MONTHS[c.ref_month - 1];
  const period = `${month} ${c.ref_year}${c.partial ? `, first ${c.days_covered} days` : ''}`;
  const p = c.vs_avg_pct;
  const tone = p == null ? '' : p >= 20 ? ' is-up' : p <= -20 ? ' is-down' : '';
  const avg = data.average_period ? `${data.average_period.from}–${data.average_period.to}` : null;
  return (
    <section className="keycards" aria-labelledby="key-title">
      <h2 id="key-title">Key numbers</h2>
      <p className="muted">{period}</p>
      <dl className="kc">
        <div className="kc-hot">
          <dt>Fire-days</dt>
          <dd>{num(c.count)}</dd>
          <dd className="kc-note">1 km squares with fire on a day, on the NOAA-20 scale</dd>
        </div>
        <div className={'kc-vs' + tone}>
          <dt>{avg ? `Against the ${avg} average` : 'Against the average'}</dt>
          <dd>{pctLong(p)}</dd>
          <dd className="kc-note">{c.partial ? 'the same days in other years' : 'for this month'}</dd>
        </div>
        <div>
          <dt>Rank</dt>
          <dd>{c.rank == null ? '–' : <>{ordinal(c.rank)}<small> of {c.of_years}</small></>}</dd>
          <dd className="kc-note">1st = the most fire-days</dd>
        </div>
        <div>
          <dt>Estimated fires</dt>
          <dd>{c.estimated_fires == null ? '–' : `≈ ${num(c.estimated_fires)}`}</dd>
          <dd className="kc-note">burning cells that touch count as one</dd>
        </div>
        <div>
          <dt>Peak month</dt>
          <dd>{c.peak_month == null ? '–' : MONTHS[c.peak_month - 1]}</dd>
          <dd className="kc-note">{c.worst_year == null ? 'in a typical year' : <>most active year: <b>{c.worst_year}</b></>}</dd>
        </div>
      </dl>
    </section>
  );
}

export function Reliability({ data, status }: { data: Analysis; status: Status | null }) {
  const r = data.reliability;
  return (
    <section className="reliability" aria-labelledby="rel-title">
      <h2 id="rel-title">Brazil Fire Calendar can make mistakes</h2>
      <dl className="kc kc-2">
        <div>
          <dt>Typical conversion error</dt>
          <dd>{r.median_error_pct == null ? '–' : `±${r.median_error_pct}%`}</dd>
          <dd className="kc-note">median, on years held out of the method</dd>
        </div>
        <div>
          <dt>Years checked</dt>
          <dd>{r.validated_years.join(', ') || '–'}</dd>
          <dd className="kc-note">against months seen by two satellites at once</dd>
        </div>
      </dl>
      <p className="muted">{r.note}</p>
      <ul className="points">
        <li><strong>Why correct at all?</strong> Newer satellites see smaller fires. VIIRS (2012 onwards) records many more hotspots than MODIS for the same burning, so raw counts jump when a satellite is added even if nothing changed on the ground.</li>
        <li><strong>What we count:</strong> fire-days, the 1 km squares that burned on a given day, converted to one common scale (NOAA-20 equivalent).</li>
        {status?.final_until && (
          <li><strong>Provisional:</strong> data after {dateShort(status.final_until)} is NASA's near-real-time version and may still change.</li>
        )}
      </ul>
    </section>
  );
}

export function SourcesDialog({ status, onClose }: { status: Status | null; onClose: () => void }) {
  const { closing, close } = useClosing(onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);
  return (
    <div className={'modal-backdrop' + (closing ? ' is-closing' : '')} onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sources-title" onClick={(e) => e.stopPropagation()}>
        <button className="detail-close" onClick={close} aria-label="Close" autoFocus>×</button>
        <p className="eyebrow">Data sources</p>
        <h2 id="sources-title">Every number comes from NASA FIRMS</h2>
        <p>
          Fire data: <strong>NASA FIRMS</strong> (Fire Information for Resource Management System) active-fire hotspots,
          MODIS Collection 6.1 and VIIRS 375 m. Nothing else goes into the counts.
        </p>
        <div className="table-scroll">
          <table className="sources">
            <thead><tr><th>Satellite</th><th>Instrument</th><th>From</th><th>To</th></tr></thead>
            <tbody>
              {(status?.coverage ?? []).map((c) => (
                <tr key={c.satellite}>
                  <td><span className="sat-dot" style={{ background: SAT_COLOR[c.satellite] }} />{SAT_NAMES[c.satellite] ?? c.satellite}</td>
                  <td>{c.satellite.startsWith('modis') ? 'MODIS C6.1, 1 km' : 'VIIRS, 375 m'}</td>
                  <td data-label="From">{dateShort(c.from)}</td>
                  <td data-label={c.to ? 'To' : undefined}>{c.to ? dateShort(c.to) : 'still active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="points">
          <li>Final (science-quality) data until <strong>{status?.final_until ? dateShort(status.final_until) : '–'}</strong>. Later days are near-real-time and marked provisional.</li>
          <li>Areas are plain boxes, circles or shapes you draw. No outside border data is used.</li>
          <li>For display only, never for the numbers: map imagery from NASA GIBS (Blue Marble), country outlines on the globe (and on the map if its imagery fails) from Natural Earth (public domain).</li>
        </ul>
        <p className="modal-links">
          <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS</a>
          <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer">NASA GIBS</a>
        </p>
        <p className="fineprint">
          Built for the NASA Space Apps Challenge 2026, "Harmonization of MODIS and VIIRS Hot Spots". Not an official NASA product.
          {status && <> API contract v{status.contract_version}.</>}
        </p>
      </div>
    </div>
  );
}
