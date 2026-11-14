/** The flame mark beside the name, on both pages. */
export function Flame({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#ff6a1f" d="M12 2c1 3.5-1.5 5-3 7-1.6 2-2.5 3.7-2.5 6A5.5 5.5 0 0 0 12 20.5 5.5 5.5 0 0 0 17.5 15c0-2-.8-3.3-1.8-4.6-.3 1.3-1 2.2-2 2.6.6-3.5-.2-7.5-1.7-11z" />
      <path fill="#ffd166" d="M12 20.5c-1.7 0-3-1.3-3-3 0-1.5 1-2.5 3-4.5 2 2 3 3 3 4.5 0 1.7-1.3 3-3 3z" />
    </svg>
  );
}
