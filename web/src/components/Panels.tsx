import { useState } from 'react';
import type { Analysis, Status } from '../types';
import { SATELLITES, SATELLITE_LABEL } from '../types';
import { fmt, fmtPct, monthName, ordinal } from '../format';
import { SAT_COLOR } from './Charts';

export function KeyCards({ a, detailed }: { a: Analysis; detailed: boolean }) {
  const c = a.cards;
  const period = `${monthName(c.ref_month)} ${c.ref_year}${c.partial ? ` · first ${c.days_covered} days` : ''}`;
  const pct = c.vs_avg_pct;
  const tone = pct === null ? '' : pct > 15 ? 'up' : pct < -15 ? 'down' : 'flat';
  return (
    <section className="cards" aria-label={`Key numbers for ${period}`}>
      <div className="card card-hero">
        <div className="card-label">Fire-days · {period}</div>
        <div className="card-value">{fmt(c.count)}</div>
        <div className="card-sub">{a.unit.main}</div>
      </div>
      <div className={`card card-anomaly ${tone}`}>
        <div className="card-label">vs the {a.average_period.from}–{a.average_period.to} average</div>
        <div className="card-value">{fmtPct(pct)}</div>
        <div className="card-sub">{c.partial ? 'compared with the same days in other years' : 'for this month'}</div>
      </div>
      <div className="card">
        <div className="card-label">Rank</div>
        <div className="card-value">{ordinal(c.rank)}<small> / {c.of_years}</small></div>
        <div className="card-sub">{c.rank <= 3 ? 'one of the most active' : 'years, 1 = most fires'}</div>
      </div>
      <div className="card">
        <div className="card-label">Estimated fires</div>
        <div className="card-value">{fmt(c.estimated_fires)}</div>
        <div className="card-sub">touching burning cells grouped</div>
      </div>
      <div className="card">
        <div className="card-label">Peak month</div>
        <div className="card-value">{monthName(c.peak_month)}</div>
        <div className="card-sub">worst year: <b>{c.worst_year}</b></div>
      </div>
      {detailed && (
        <div className="card card-wide">
          <div className="card-label">Raw hotspots detected, per satellite</div>
          <ul className="sat-list">
            {SATELLITES.map((s) => (
              <li key={s}>
                <span className="dot" style={{ background: SAT_COLOR[s] }} />
                <span>{SATELLITE_LABEL[s]}</span>
                <b>{c.detected[s] === null ? <span className="muted">not in orbit</span> : fmt(c.detected[s])}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function Briefing({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="briefing">
      <div className="briefing-head">
        <h2>Fire briefing</h2>
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p>{text}</p>
    </section>
  );
}

export function NextMonths({ a }: { a: Analysis }) {
  return (
    <section className="panel next">
      <h2>What's normal for the coming months</h2>
      <p className="not-forecast">{a.next_months_label}</p>
      <ul className="next-list">
        {a.next_months.map((n) => (
          <li key={`${n.year}-${n.month}`}>
            <div className="next-month">{monthName(n.month)} <span className="muted">{n.year}</span></div>
            <div className="next-val">{fmt(n.median)}</div>
            <div className="next-range">usually {fmt(n.p10)}–{fmt(n.p90)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Reliability({ a, status }: { a: Analysis; status: Status | null }) {
  const r = a.reliability;
  return (
    <section className="panel reliability">
      <h2>How reliable is this?</h2>
      <div className="rel-grid">
        <div>
          <div className="rel-big">±{fmt(r.median_error_pct)}%</div>
          <div className="muted">median conversion error</div>
        </div>
        <div>
          <div className="rel-big">{r.validated_years.join(', ') || '—'}</div>
          <div className="muted">years checked against overlap data</div>
        </div>
      </div>
      <p>{r.note}</p>
      <ul className="rel-points">
        <li><b>Why correct at all?</b> New satellites see more, smaller fires. VIIRS (2012+) detects many more hotspots than MODIS, so raw counts jump when a satellite is added, even if fires didn't change.</li>
        <li><b>What we count:</b> fire-days — distinct ≈1 km cells burning on a day — converted to one common scale (NOAA-20 equivalent).</li>
        {status && <li><b>Provisional:</b> data after {status.final_until} is NASA's near-real-time version and may still change.</li>}
      </ul>
    </section>
  );
}

export function SourcesDialog({ status, onClose }: { status: Status | null; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sources-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="sources-title">Data sources — 100% NASA</h2>
        <p>
          Every number on this site comes from <b>NASA FIRMS</b> (Fire Information for Resource Management System) active-fire hotspots.
          The background map is NASA GIBS Blue Marble imagery and is not used in any calculation.
        </p>
        <table className="sources-table">
          <thead><tr><th>Satellite</th><th>Instrument</th><th>From</th><th>To</th></tr></thead>
          <tbody>
            {(status?.coverage ?? []).map((c) => (
              <tr key={c.satellite}>
                <td><span className="dot" style={{ background: SAT_COLOR[c.satellite] }} /> {SATELLITE_LABEL[c.satellite]}</td>
                <td>{c.satellite.startsWith('modis') ? 'MODIS C6.1, 1 km' : 'VIIRS, 375 m'}</td>
                <td>{c.from}</td>
                <td>{c.to ?? 'active'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li>Final (science-quality) data until <b>{status?.final_until ?? '—'}</b>; later days are near-real-time and marked provisional.</li>
          <li>Areas are plain boxes or shapes you draw — no external borders.</li>
          <li><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS</a> · <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer">NASA GIBS</a></li>
        </ul>
        <p className="muted small">Built for the NASA Space Apps Challenge 2026 — "Harmonization of MODIS and VIIRS Hot Spots".</p>
      </div>
    </div>
  );
}
