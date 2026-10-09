import { RATING_STYLE, REFS } from '../data/evidence';
import type { Rating } from '../data/evidence';

export function RatingBadge({ rating }: { rating: Rating }) {
  const s = RATING_STYLE[rating];
  return (
    <span className="rating" style={{ color: s.color, background: `${s.color}14` }} title={s.note}>
      {s.label}
    </span>
  );
}

export function RefNote({ refKey, rating }: { refKey: string; rating?: Rating }) {
  const r = REFS[refKey];
  if (!r) return null;
  return (
    <div className="ref">
      {rating && <RatingBadge rating={rating} />}
      <p className="ref-finding">{r.finding}</p>
      <p className="ref-cite">{r.cite}</p>
    </div>
  );
}
