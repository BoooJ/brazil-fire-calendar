// One error message for the tool: what went wrong, the API's own words, and a way to try again.
interface Props {
  title: string;
  message: string;
  onRetry?: () => void;
  /** 'page' replaces the hero; 'inline' sits inside a panel */
  size?: 'page' | 'inline';
}

export default function ErrorNote({ title, message, onRetry, size = 'inline' }: Props) {
  return (
    <div className={`error-note error-note--${size}`} role="alert">
      <span className="error-note-icon" aria-hidden="true">!</span>
      <div className="error-note-body">
        {size === 'page' ? <h1>{title}</h1> : <strong>{title}</strong>}
        <p>{message}</p>
        {onRetry && (
          <button className={'btn ' + (size === 'page' ? 'btn-light' : 'btn-quiet btn-small')} onClick={onRetry}>Try again</button>
        )}
      </div>
    </div>
  );
}
