// FOGO's logo on both pages: the seal, the FOGO wordmark and the full name. The artwork lives in ../brand.ts
// (plain SVG, also written into the loading screen by vite.config.ts). Each mark takes the text colour around it:
// set `color` (the logo's orange is #f2682a) and a width or height in CSS.
import { FULL_NAME, SEAL, WORDMARK, type Mark } from '../brand';

interface Props {
  className?: string;
  /** Read aloud as an image. Leave it out when the link or heading around the mark already names it. */
  label?: string;
}

function MarkSvg({ mark, className, label }: Props & { mark: Mark }) {
  return (
    <svg
      className={className}
      viewBox={mark.viewBox}
      width={mark.width}
      height={mark.height}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: mark.body }}
    />
  );
}

/** The round seal: rings, "Fire Occurrence Grid Outlook" around, the flame and FOGO. */
export const Seal = (p: Props) => <MarkSvg mark={SEAL} {...p} />;
/** "FOGO" on its own. */
export const Wordmark = (p: Props) => <MarkSvg mark={WORDMARK} {...p} />;
/** "FIRE OCCURRENCE GRID OUTLOOK" on one line. */
export const FullName = (p: Props) => <MarkSvg mark={FULL_NAME} {...p} />;
