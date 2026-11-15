import { useCallback, useRef, useState } from 'react';

/** A short close animation before a card or dialog unmounts: `closing` adds the class, `close()` waits for it.
 *  With prefers-reduced-motion the close is immediate. */
export function useClosing(onClose: () => void, ms = 160) {
  const [closing, setClosing] = useState(false);
  const latest = useRef(onClose);
  latest.current = onClose;
  const close = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return latest.current();
    setClosing(true);
    window.setTimeout(() => latest.current(), ms);
  }, [ms]);
  return { closing, close };
}
