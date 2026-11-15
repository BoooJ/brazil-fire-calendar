// The first screen: one status line (is this unusual here, right now?), then the practical context:
// is fire active, how this month compares, what this month is usually like, and a typical year at a glance.
// Wording and layout only: every number shown is the API's (cards, average_by_month).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, Status as ApiStatus } from '../types';
import type { Area } from '../geo';
import { anomalyPosition } from '../colors';
import { MON, MONTHS, dateTime, headlineParts, rankLine, trendOf, vsTypical } from '../format';
import { LEVEL_WORDS, USUALLY, makeCountLevels } from '../levels';

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that rolls to its new value when the data changes (display only). */
export function Roll({ n }: { n: number }) {
  // on first show it rolls up from zero, later from the value before
  const [shown, setShown] = useState(still() ? n : 0);
  const from = useRef(0);
  useEffect(() => {
    const a = from.current;
    from.current = n;
    if (a === n || still()) return setShown(n);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 520);
      setShown(Math.round(a + (n - a) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <span className="roll">{shown}</span>;
}

interface Props {
  data: Analysis;
  area: Area;
  status: ApiStatus | null;
  updating: boolean;
  onUpdate: () => void;
  /** jumps to the next-week panel (the only forecast); absent while the model is unavailable */
  onForecast?: () => void;
}

export default function StatusHero({ data, area, status, updating, onUpdate, onForecast }: Props) {
  const c = data.cards;
  const month = MONTHS[c.ref_month - 1];
  const trend = trendOf(c);
  const rankText = rankLine(c);
  const provisional = data.calendar.find((i) => i.year === c.ref_year && i.month === c.ref_month)?.provisional;
  const levels = useMemo(() => makeCountLevels(data.calendar), [data.calendar]);
  const avg = data.average_by_month;
  const typical = avg.find((a) => a.month === c.ref_month)?.mean ?? null;
  const typicalLevel = levels.level(typical);
  const period = data.average_period ? `${data.average_period.from}–${data.average_period.to}` : null;
  const days = c.partial ? `the first ${c.days_covered} days of ${month}` : `${month} ${c.ref_year}`;
  // the quietest month of the typical year: the lowest of the API's twelve averages, read off as it is
  const quiet = avg.reduce<number | null>((best, a) => (a.mean == null ? best : best == null || a.mean < (avg.find((x) => x.month === best)?.mean ?? Infinity) ? a.month : best), null);
  // where this month sits between half and double a typical one (log scale, display only)
  const pos = anomalyPosition(c.count ? c.vs_avg_pct : null);

  // the headline is a few words and one number; the full sentence sits under it, small
  const p = c.vs_avg_pct;
  const h = headlineParts(c);
  // the sentence under it does not repeat "Fire activity is"
  const sub = [h.lead ? '' : h.strong, h.lead ? h.strong : '', h.tail].filter(Boolean).join(' ');
  const big = !c.count ? 'No fire detected'
    : p == null ? 'Fire detected'
    : trend === 'flat' ? 'Fire activity is typical'
    : <>Fire activity <span className="hero-mark" aria-hidden="true">{trend === 'up' ? '▲' : '▼'}</span><span className="sr-only">{trend === 'up' ? 'up ' : 'down '}</span>{p >= 200 ? `${(p / 100 + 1).toFixed(1)}×` : <><Roll n={Math.abs(Math.round(p))} />%</>}</>;

  return (
    <section className="hero">
      <p className="eyebrow">{area.label} · {month} {c.ref_year}{c.partial && `, first ${c.days_covered} days`}</p>
      <h1 className={trend ? `is-${trend}` : undefined}>{big}</h1>
      <p className="hero-sub">
        {sub.charAt(0).toUpperCase() + sub.slice(1)}{period && !!c.count && p != null && <>, comparing the same days in {period}</>}.
        {rankText && <> {rankText}.</>}
      </p>

      <dl className="answers">
        <div>
          <dt>Fire right now</dt>
          <dd>{c.count ? 'Detected' : 'None detected'}</dd>
          <dd className="answers-note">Satellites {c.count ? 'saw fire here' : 'saw no fire here'} in {days}.</dd>
        </div>
        <div>
          <dt>Against a typical {month}</dt>
          <dd>{c.count ? vsTypical(c.vs_avg_pct).replace(' typical', '') : '–'}</dd>
          <dd className="meter" aria-hidden="true">
            <span className="meter-track"><i className="meter-mid" />{pos != null && <i className={`meter-dot is-${trend ?? 'flat'}`} style={{ left: `${((pos + 2) / 4) * 100}%` }} />}</span>
            <span className="meter-ends"><span>half</span><span>typical</span><span>double</span></span>
          </dd>
        </div>
        <div>
          <dt>Is this the season?</dt>
          <dd>{typical == null ? '–' : typicalLevel >= 2 ? 'Yes' : typicalLevel === 1 ? 'Edge of it' : 'No'}</dd>
          <dd className="answers-note">{typical == null ? 'No typical year to compare with yet.' : <>{month} is {USUALLY[typicalLevel]}.</>}</dd>
        </div>
      </dl>

      <Season data={data} levels={levels} quiet={quiet} period={period} />

      <p className="hero-meta">
        {provisional && <span className="tag" title="Recent days use NASA's near-real-time data and may still change">Provisional</span>}
        <span className="hero-meta-upd">
          <span>Updated {dateTime(status?.data_updated ?? data.data_updated)}</span>
          <button className="textlink" onClick={onUpdate} disabled={updating}>{updating ? 'Updating…' : 'Update now'}</button>
        </span>
        {onForecast && <button className="textlink" onClick={onForecast}>Next week's fire chance ↓</button>}
      </p>
      <p className="hero-smoke">Smoke from fires can lower air quality nearby. We don’t measure air quality.</p>
    </section>
  );
}

/** A typical year here: the API's twelve monthly averages as bars. Hover (or focus) lights one and dims the rest. */
function Season({ data, levels, quiet, period }: { data: Analysis; levels: ReturnType<typeof makeCountLevels>; quiet: number | null; period: string | null }) {
  const c = data.cards;
  const [on, setOn] = useState<number | null>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const means = data.average_by_month.map((a) => a.mean ?? 0);
  const top = Math.max(1, ...means);
  if (!period || means.every((m) => !m)) return null;
  const peak = c.peak_month;
  const lit = on ?? c.ref_month;
  const litLevel = levels.level(data.average_by_month.find((a) => a.month === lit)?.mean);
  // this month sits in the middle: five months behind it on the left, the six coming months on the right
  const order = Array.from({ length: 12 }, (_, i) => ((c.ref_month - 1 - 5 + i + 12) % 12) + 1);
  const byMonth = new Map(data.average_by_month.map((a) => [a.month, a]));

  return (
    <div className="season">
      <div className="season-head">
        <h2>A typical year here</h2>
        <p>
          {peak != null && <>Peaks in <b>{MONTHS[peak - 1]}</b></>}
          {peak != null && quiet != null && quiet !== peak && <>, calmest in <b>{MONTHS[quiet - 1]}</b></>}.
        </p>
      </div>
      <ol className={'season-bars' + (on != null ? ' is-hot' : '')} onPointerLeave={() => setOn(null)}>
        {order.map((m, i) => {
          const a = byMonth.get(m);
          const lv = levels.level(a?.mean);
          const now = m === c.ref_month;
          const ahead = i > 5;
          return (
            <li key={m} className={(m === lit ? 'is-lit' : '') + (now ? ' is-now' : '') + (ahead ? ' is-ahead' : '')}>
              <button type="button" aria-label={`${MONTHS[m - 1]}: usually ${LEVEL_WORDS[lv].toLowerCase()}${m === peak ? ', the peak' : ''}${now ? ', this month' : ahead ? ', coming up' : ''}`}
                onPointerEnter={() => setOn(m)} onFocus={() => setOn(m)} onBlur={() => setOn(null)}>
                <span className="season-col"><i className={`lv${lv}`} style={{ height: `${grown ? Math.max(4, ((a?.mean ?? 0) / top) * 100) : 4}%`, transitionDelay: `${i * 18}ms` }} /></span>
                <span className="season-mon">{MON[m - 1][0]}<span>{MON[m - 1].slice(1)}</span></span>
              </button>
            </li>
          );
        })}
        <li className="season-est" aria-hidden="true"><b>Estimate</b></li>
      </ol>
      <p className="season-split" aria-hidden="true"><span>Earlier</span><span>Now</span><span>Coming up</span></p>
      <p className="season-read" aria-live="polite">
        <span><b>{MONTHS[lit - 1]}</b> · {LEVEL_WORDS[litLevel].toLowerCase()}{lit === peak && ' · the peak'}{lit === c.ref_month && ' · this month'}</span>
        <span className="season-src">From the {period} average.</span>
      </p>
    </div>
  );
}
