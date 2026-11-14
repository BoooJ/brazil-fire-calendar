import Globe from '../components/Globe';
import { Flame } from './Tool';

const TOOLS = [
  ['NASA FIRMS', 'Active-fire hotspots: the only data source'],
  ['MODIS C6.1', 'Terra and Aqua, 1 km, since 2000'],
  ['VIIRS', 'S-NPP and NOAA-20, 375 m, since 2012'],
  ['Python · DuckDB · FastAPI', 'Data pipeline and API'],
  ['React · Vite · D3', 'This website'],
  ['Claude Code', 'AI coding assistant used during the hackathon'],
];

const TEAM = [
  ['Infrastructure', 'Data pipeline, API, daily updates'],
  ['UI / UX', 'Website, calendar, map, accessibility'],
  ['Science', 'Harmonization method and validation'],
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="topbar">
        <a className="brand" href="#/"><Flame /> Brazil Fire Calendar</a>
        <a className="btn btn-light btn-small" href="#/app">Open the tool</a>
      </header>

      <section className="l-hero">
        <div className="l-hero-globe" aria-hidden="true">
          <Globe label="" zoom={1.35} />
        </div>
        <div className="l-hero-text">
          <p className="eyebrow">NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots</p>
          <h1>Brazil Fire Calendar</h1>
          <p className="l-lead">
            One consistent burning calendar for Brazil, built from more than 20 years of NASA satellite fire detections.
            See when fires usually happen where you live, and whether this month is unusual.
          </p>
          <a className="btn btn-fire" href="#/app">See the calendar for my area</a>
        </div>
      </section>

      <section className="l-section">
        <p className="eyebrow">The idea</p>
        <h2>The satellites changed. The fire record should not jump because of it.</h2>
        <div className="l-cols">
          <p>
            NASA has watched fires from space since 2000 with MODIS, at 1 km resolution. In 2012 the sharper VIIRS
            sensors arrived, at 375 m. They see many more small fires, so the raw numbers jump whenever a new satellite
            starts, even if nothing changed on the ground.
          </p>
          <p>
            We harmonize MODIS and VIIRS into one unit, the <strong>fire-day</strong>: a 1 km square that burned on a
            given day. That gives a single calendar from 2003 until today where years can be compared fairly.
          </p>
        </div>
        <ol className="l-steps">
          <li><span>1</span><h3>Pick your area</h3><p>Your location, a point with a radius, or a ready-made region of Brazil.</p></li>
          <li><span>2</span><h3>Read one clear message</h3><p>Is fire activity around you above or below normal for this time of year?</p></li>
          <li><span>3</span><h3>Look back in the calendar</h3><p>Every month since 2003, marked by how much burned and what is typical.</p></li>
        </ol>
      </section>

      <section className="l-cta" aria-labelledby="cta-title">
        <h2 id="cta-title">What is the fire calendar where you are?</h2>
        <p>It takes one tap. No account, and your location stays in your browser.</p>
        <a className="btn btn-light btn-big" href="#/app">Open the fire calendar</a>
      </section>

      <section className="l-section">
        <p className="eyebrow">Motivation</p>
        <h2>History you can read at a glance</h2>
        <div className="l-cols">
          <p>
            People who live with fire seasons, such as farmers, brigades, teachers and journalists, ask simple questions:
            is this normal, and when does it usually get worse? The data to answer them is public, but it is split
            across instruments and hard to read.
          </p>
          <p>
            We show history, not predictions. Recent months are marked as provisional, weak numbers as uncertain, and
            what is typical for the coming months is always labelled as history, <strong>not a forecast</strong>.
          </p>
        </div>
      </section>

      <section className="l-section l-grid2">
        <div>
          <p className="eyebrow">Team</p>
          <h2>Who built it</h2>
          <ul className="l-list">
            {TEAM.map(([a, b]) => <li key={a}><strong>{a}</strong><span>{b}</span></li>)}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Tools</p>
          <h2>What we used</h2>
          <ul className="l-list">
            {TOOLS.map(([a, b]) => <li key={a}><strong>{a}</strong><span>{b}</span></li>)}
          </ul>
        </div>
      </section>

      <footer className="l-footer">
        <p className="eyebrow">Credits</p>
        <p>
          Fire data: NASA FIRMS (Fire Information for Resource Management System), MODIS Collection 6.1 and VIIRS
          375 m active fire products. We acknowledge the use of data from NASA FIRMS, part of NASA Earth Science Data
          and Information System (ESDIS).
        </p>
        <p>Country outlines on the globe: Natural Earth, public domain. Used for display only, never for the numbers.</p>
        <p className="muted">Built for the NASA Space Apps Challenge 2026. Not an official NASA product.</p>
      </footer>
    </div>
  );
}
