// "November over the years": one month, every year since the calendar starts, as bars on one scale.
// Its own card under the first screen: the page's month, each year's against a typical one.
// Display only: every number is the API's (calendar counts, vs_avg_pct, rank, average_by_month).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Analysis, CalendarItem } from '../types';
import { MONTHS, num, ordinal, pctShort } from '../format';
import './MonthHistory.css';

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The same ±20 % "about typical" band as the rest of the app, in words. */
function against(p: number | null, month: string): string | null {
  if (p == null) return null;
  if (p <= -20) return `quieter than a typical ${month}`;
  if (p >= 20) return `busier than a typical ${month}`;
  return `close to a typical ${month}`;
}

/** "the most active of 24 years" · "the quietest of 24 years" · "5th most active of 24" (rank 1 = most active) */
function rankWords(i: CalendarItem): string | null {
  if (i.rank == null || i.of_years == null || i.of_years < 3 || !i.count) return null;
  if (i.rank === 1) return `the most active of ${i.of_years} years`;
  if (i.rank === i.of_years) return `the quietest of ${i.of_years} years`;
  return `${ordinal(i.rank)} most active of ${i.of_years}`;
}

/** Arrow keys inside a roving group: the index to move to, or null for any other key. */
function step(key: string, at: number, n: number): number | null {
  const to = key === 'ArrowRight' || key === 'ArrowDown' ? at + 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? at - 1 : key === 'Home' ? 0 : key === 'End' ? n - 1 : null;
  return to == null ? null : (to + n) % n;
}

export default function MonthHistory({ data }: { data: Analysis }) {
  const c = data.cards;
  const month = c.ref_month; // always the page's month (the current month by default)
  const [active, setActive] = useState<number | null>(null); // the year under the pointer or keyboard focus
  const [grown, setGrown] = useState(still);
  const bars = useRef<(HTMLButtonElement | null)[]>([]);

  // follow the page when its reference month changes ("Select a day")
  useEffect(() => setActive(null), [c.ref_month, c.ref_year]);
  // bars grow from the baseline on first show; later month changes animate height to height
  useEffect(() => {
    if (grown) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [grown]);

  const items = useMemo(() => data.calendar.filter((i) => i.month === month).sort((a, b) => a.year - b.year), [data.calendar, month]);
  // colours against this month's own years (every year with fire gets a colour, darker = more): lv1 … lv4 by quartile
  const level = useMemo(() => {
    const v = items.map((i) => i.count).filter((n): n is number => n != null && n > 0).sort((a, b) => a - b);
    const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    const t = v.length ? [q(0.25), q(0.5), q(0.75)] : [];
    return (n: number | null) => (!n || !t.length ? 0 : n >= t[2] ? 4 : n >= t[1] ? 3 : n >= t[0] ? 2 : 1);
  }, [items]);
  const name = MONTHS[month - 1];
  const avg = data.average_by_month.find((a) => a.month === month)?.mean ?? null;
  const top = Math.max(1, avg ?? 0, ...items.map((i) => i.count ?? 0));
  const latest = [...items].reverse().find((i) => i.count != null) ?? null;
  const record = items.reduce<CalendarItem | null>((best, i) => (i.count && (best == null || i.count > (best.count ?? 0)) ? i : best), null);
  const shown = items.find((i) => i.year === active) ?? latest;
  const first = items[0]?.year;
  const last = items[items.length - 1]?.year;
  const isNow = (i: CalendarItem) => i.year === c.ref_year && i.month === c.ref_month;

  const barKey = (e: KeyboardEvent, at: number) => {
    const to = step(e.key, at, items.length);
    if (to == null) return;
    e.preventDefault();
    bars.current[to]?.focus();
  };

  const lead = latest && against(latest.vs_avg_pct, name);
  const anyFire = items.some((i) => i.count);

  return (
    <section className="mh" aria-labelledby="mh-title">
      <div className="mh-head">
        <h2 id="mh-title">{name} over the years</h2>
      </div>

      {!anyFire ? (
        <p className="mh-lead">No fire seen here in any {name} since {first ?? data.query.start.slice(0, 4)}.</p>
      ) : (
        <>
          <p className="mh-lead">
            {latest && lead && <><b>{name} {latest.year}</b>{latest.partial ? ' so far' : ''} {isNow(latest) ? 'is' : 'was'} {lead}. </>}
            {record && <>The most active was <b>{record.year}</b>.</>}
          </p>

          <div className="mh-chart">
            <div className={'mh-plot' + (active != null ? ' is-hot' : '')} onPointerLeave={() => setActive(null)}>
              {avg != null && (
                <div className="mh-avg" style={{ bottom: `${(avg / top) * 100}%` }} aria-hidden="true">
                  <em>average</em><span>{num(avg)}</span>
                </div>
              )}
              <ol className="mh-bars" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
                {items.map((i, at) => {
                  const h = i.count == null ? 0 : grown ? Math.max(i.count ? 3 : 1.5, (i.count / top) * 100) : 0;
                  // the record's value always; any other year's only while it is pointed at or focused
                  const label = i === record || i.year === active;
                  const vs = i.vs_avg_pct == null ? null : `${pctShort(i.vs_avg_pct)} vs typical`;
                  return (
                    <li key={i.year} className={(i.year === shown?.year ? 'is-lit' : '') + (i.provisional || i.partial ? ' is-prov' : '') + (i.count == null ? ' is-none' : '')}>
                      <button type="button" tabIndex={i === shown ? 0 : -1} ref={(el) => { bars.current[at] = el; }}
                        aria-label={`${name} ${i.year}${i.partial ? `, first ${i.days_covered} days` : ''}: ${i.count == null ? 'no data' : `${num(i.count)} hotspots`}${vs ? `, ${vs}` : ''}${i.provisional ? ', provisional' : ''}`}
                        onPointerEnter={() => setActive(i.year)} onFocus={() => setActive(i.year)} onBlur={() => setActive(null)}
                        onKeyDown={(e) => barKey(e, at)}>
                        <i className={`lv${level(i.count)}`} style={{ height: `${h}%`, transitionDelay: `${at * 12}ms` }}>
                          {label && <span className={'mh-val' + (i === record ? '' : ' is-hover') + (at < 2 ? ' at-start' : at > items.length - 3 ? ' at-end' : '')}>{num(i.count)}{i.partial && ' so far'}</span>}
                        </i>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <ol className="mh-years" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} aria-hidden="true">
              {items.map((i) => {
                const tick = i.year === first || i.year === last || (i.year % 5 === 0 && first != null && last != null && i.year - first >= 3 && last - i.year >= 3);
                return <li key={i.year} className={(i.year === shown?.year ? 'is-lit' : '') + (i.year % 10 !== 0 && i.year !== first && i.year !== last ? ' minor' : '')}>{tick && <span>{i.year}</span>}</li>;
              })}
            </ol>
          </div>

          <p className="mh-read" aria-live="polite">
            {shown && (
              <>
                <span><b>{name} {shown.year}</b>{shown.partial && `, first ${shown.days_covered} days`} · {shown.count == null ? 'no data' : `${num(shown.count)} hotspots`}{shown.vs_avg_pct != null && <> · {pctShort(shown.vs_avg_pct)} vs typical</>}</span>
                <span className="mh-read-rank">{[rankWords(shown), shown.provisional ? 'provisional' : null].filter(Boolean).join(' · ')}</span>
              </>
            )}
          </p>
          <p className="mh-note">
            Year over year data on one scale, based on satellite imagery from MODIS and VIIRS, harmonized.
          </p>

          <table className="sr-only">
            <caption>{name} in each year, hotspots (satellite-adjusted)</caption>
            <thead><tr><th scope="col">Year</th><th scope="col">Hotspots</th><th scope="col">Against a typical {name}</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.year}><th scope="row">{i.year}{i.partial ? ` (first ${i.days_covered} days)` : ''}</th><td>{num(i.count)}</td><td>{i.vs_avg_pct == null ? '–' : pctShort(i.vs_avg_pct)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
