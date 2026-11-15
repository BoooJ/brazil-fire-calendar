// Dates and view: the reference date (today, the 2020 replay or any past day), the first year shown,
// and the Quick / Detailed switch. The area is chosen in LocationGate.
import { MON } from '../format';

export const FIRST_YEAR = 2003;
export const REPLAY_DATE = '2020-09-14';

interface Props {
  /** null = today */
  refDate: string | null;
  setRefDate: (d: string | null) => void;
  fromYear: number;
  setFromYear: (y: number) => void;
  detailed: boolean;
  setDetailed: (d: boolean) => void;
  today: string;
  /** the reference date of the page on screen (the API's `query.ref_date`): where "Other day" starts */
  shown?: string;
}

export default function DateControls({ refDate, setRefDate, fromYear, setFromYear, detailed, setDetailed, today, shown }: Props) {
  const custom = refDate !== null && refDate !== REPLAY_DATE;
  const lastYear = Number((refDate ?? today).slice(0, 4));
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const [ry, rm, rd] = REPLAY_DATE.split('-').map(Number);
  // "Other day" opens on the day the page shows now (the latest data day, not the calendar's today)
  const start = shown && shown !== REPLAY_DATE && shown <= today ? shown : today;

  return (
    <div className="controls" aria-label="Dates and view">
      <div className="controls-row">
        <div className="seg" role="radiogroup" aria-label="Reference date">
          <button role="radio" aria-checked={refDate === null} className={refDate === null ? 'on' : ''} onClick={() => setRefDate(null)}>Today</button>
          <button role="radio" aria-checked={refDate === REPLAY_DATE} className={refDate === REPLAY_DATE ? 'on' : ''} onClick={() => setRefDate(REPLAY_DATE)}>
            Replay {rd} {MON[rm - 1]} {ry}
          </button>
          <button role="radio" aria-checked={custom} className={custom ? 'on' : ''} onClick={() => !custom && setRefDate(start)}>Other day</button>
        </div>
        <div className="seg" role="radiogroup" aria-label="View">
          <button role="radio" aria-checked={!detailed} className={!detailed ? 'on' : ''} onClick={() => setDetailed(false)}>Quick view</button>
          <button role="radio" aria-checked={detailed} className={detailed ? 'on' : ''} onClick={() => setDetailed(true)}>Detailed view</button>
        </div>
      </div>

      {(custom || detailed) && (
        <div className="controls-row controls-fields">
          {custom && (
            <label>
              See the page as it was on
              <input type="date" value={refDate ?? today} min={`${FIRST_YEAR}-01-01`} max={today}
                onChange={(e) => e.target.value && setRefDate(e.target.value)} />
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
