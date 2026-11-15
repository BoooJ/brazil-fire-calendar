// Dates and view: jump to a day in the calendar ("Now" or "Select a day"), the first year shown (detailed view),
// and the Quick / Detailed switch. Picking a day never hides later data: the calendar scrolls to it and lights it.
import { useState } from 'react';

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
            <label>
              Find this day in the calendar
              <input type="date" autoFocus={picking && day == null} value={day ?? ''} min={`${FIRST_YEAR}-01-01`} max={today}
                onChange={(e) => e.target.value && onDay(e.target.value)} />
            </label>
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
