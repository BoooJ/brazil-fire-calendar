// Dates and view: jump to a day in the calendar ("Now" or "Select a day"), the first year shown (detailed view),
// and the Quick / Detailed switch. Picking a day never hides later data: the calendar scrolls to it and lights it.
import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { dateShort } from '../format';

export const FIRST_YEAR = 2003;

interface Props {
  /** the day picked, null = now */
  day: string | null;
  /** null = back to this month */
  onDay: (d: string | null) => void;
  fromYear: number;
  setFromYear: (y: number) => void;
  detailed: boolean;
  setDetailed: (d: boolean) => void;
  today: string;
}

export default function DateControls({ day, onDay, fromYear, setFromYear, detailed, setDetailed, today }: Props) {
  const [picking, setPicking] = useState(false);
  const lastYear = Number(today.slice(0, 4));
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const open = picking || day != null;

  return (
    <div className="controls" aria-label="Dates and view">
      <div className="controls-row">
        <div className="seg" role="radiogroup" aria-label="Where to look in the calendar">
          <button role="radio" aria-checked={!open} className={!open ? 'on' : ''} onClick={() => { setPicking(false); onDay(null); }}>Now</button>
          <button role="radio" aria-checked={open} className={open ? 'on' : ''} onClick={() => setPicking(true)}>Select a day</button>
        </div>
        <div className="seg" role="radiogroup" aria-label="View">
          <button role="radio" aria-checked={!detailed} className={!detailed ? 'on' : ''} onClick={() => setDetailed(false)}>Quick view</button>
          <button role="radio" aria-checked={detailed} className={detailed ? 'on' : ''} onClick={() => setDetailed(true)}>Detailed view</button>
        </div>
      </div>

      {(open || detailed) && (
        <div className="controls-row controls-fields">
          {open && (
            <DayField day={day} onDay={onDay} today={today} autoFocus={picking && day == null} />
          )}
          {detailed && (
            <label>
              Calendar starts in
              <select value={Math.min(fromYear, lastYear)} onChange={(e) => setFromYear(Number(e.target.value))}>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

const PARTS = [
  { key: 'd', len: 2, ph: 'DD', label: 'Day' },
  { key: 'm', len: 2, ph: 'MM', label: 'Month' },
  { key: 'y', len: 4, ph: 'YYYY', label: 'Year' },
] as const;
type Part = (typeof PARTS)[number]['key'];

/** Day · month · year typed as digits, no calendar popup: two digits jump to the month, two more to the year.
 *  Backspace in an empty part goes back; pasting "15.11.2026" (or 15/11/2026, 2026-11-15) fills all three. */
function DayField({ day, onDay, today, autoFocus }: { day: string | null; onDay: (d: string) => void; today: string; autoFocus: boolean }) {
  const split = (iso: string | null) => (iso ? { d: iso.slice(8, 10), m: iso.slice(5, 7), y: iso.slice(0, 4) } : { d: '', m: '', y: '' });
  const [v, setV] = useState<Record<Part, string>>(() => split(day));
  const [err, setErr] = useState<string | null>(null);
  const refs = useRef<Record<Part, HTMLInputElement | null>>({ d: null, m: null, y: null });
  const first = `${FIRST_YEAR}-01-01`;

  // follow the page (e.g. "Now" then "Select a day" again)
  useEffect(() => { if (day) setV(split(day)); }, [day]);
  useEffect(() => { if (autoFocus) refs.current.d?.focus(); }, [autoFocus]);

  const commit = (n: Record<Part, string>) => {
    if (n.d.length < 1 || n.m.length < 1 || n.y.length < 4) return setErr(null);
    const iso = `${n.y}-${n.m.padStart(2, '0')}-${n.d.padStart(2, '0')}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (isNaN(+dt) || dt.toISOString().slice(0, 10) !== iso) return setErr('That day does not exist.');
    if (iso < first || iso > today) return setErr(`Choose a day from ${dateShort(first)} to ${dateShort(today)}.`);
    setErr(null);
    onDay(iso);
  };

  const type = (k: Part, raw: string) => {
    const at = PARTS.findIndex((p) => p.key === k);
    const len = PARTS[at].len;
    const digits = raw.replace(/\D/g, '');
    const n = { ...v, [k]: digits.slice(0, len) };
    // typed past the end (e.g. a 3rd digit in the day): the rest spills into the next part
    let rest = digits.slice(len);
    let i = at;
    while (rest && i < PARTS.length - 1) {
      i++;
      const p = PARTS[i];
      n[p.key] = rest.slice(0, p.len);
      rest = rest.slice(p.len);
    }
    // a day 4-9 or a month 2-9 can only be one digit: jump on straight away
    const full = (p: Part) => n[p].length >= PARTS.find((x) => x.key === p)!.len || (p === 'd' && /^[4-9]$/.test(n.d)) || (p === 'm' && /^[2-9]$/.test(n.m));
    setV(n);
    const cur = PARTS[i].key;
    if (full(cur) && i < PARTS.length - 1) {
      const next = refs.current[PARTS[i + 1].key];
      next?.focus();
      next?.select();
    }
    commit(n);
  };

  const key = (k: Part, e: KeyboardEvent<HTMLInputElement>) => {
    const at = PARTS.findIndex((p) => p.key === k);
    const el = e.currentTarget;
    if (e.key === 'Backspace' && el.value === '' && at > 0) {
      e.preventDefault();
      const prev = PARTS[at - 1].key;
      const n = { ...v, [prev]: v[prev].slice(0, -1) };
      setV(n);
      refs.current[prev]?.focus();
      setErr(null);
    } else if ((e.key === 'ArrowLeft' && el.selectionStart === 0 && at > 0)) {
      e.preventDefault();
      refs.current[PARTS[at - 1].key]?.focus();
    } else if ((e.key === 'ArrowRight' && el.selectionStart === el.value.length && at < PARTS.length - 1) || ((e.key === '.' || e.key === '/' || e.key === '-') && at < PARTS.length - 1)) {
      e.preventDefault();
      refs.current[PARTS[at + 1].key]?.focus();
    }
  };

  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData('text').trim();
    const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const eu = t.match(/^(\d{1,2})[./\s-](\d{1,2})[./\s-](\d{4})$/);
    const m = iso ? { y: iso[1], m: iso[2], d: iso[3] } : eu ? { d: eu[1], m: eu[2], y: eu[3] } : null;
    if (!m) return;
    e.preventDefault();
    const n = { d: m.d.padStart(2, '0'), m: m.m.padStart(2, '0'), y: m.y };
    setV(n);
    refs.current.y?.focus();
    commit(n);
  };

  return (
    <div className="day-field-wrap">
      <span className="day-field-label" id="day-field-label">Find this day in the calendar</span>
      <div className={'day-field' + (err ? ' is-bad' : '')} role="group" aria-labelledby="day-field-label" onClick={(e) => { if (e.target === e.currentTarget) refs.current.d?.focus(); }}>
        {PARTS.map((p, i) => (
          <span key={p.key} className="day-field-part">
            {i > 0 && <span className="day-field-sep" aria-hidden="true">.</span>}
            <input ref={(el) => { refs.current[p.key] = el; }} className={`day-field-${p.key}`} inputMode="numeric" autoComplete="off"
              aria-label={p.label} placeholder={p.ph} maxLength={p.len + 8} value={v[p.key]}
              onChange={(e) => type(p.key, e.target.value)} onKeyDown={(e) => key(p.key, e)} onPaste={paste}
              onFocus={(e) => e.currentTarget.select()} />
          </span>
        ))}
      </div>
      {err && <span className="day-field-err" role="alert">{err}</span>}
    </div>
  );
}
