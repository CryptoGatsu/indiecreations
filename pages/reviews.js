import { useEffect, useState } from 'react';
import Link from 'next/link';
import { shortAddress } from '../lib/config';

export default function Reviews() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/feedback')
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData([]));
  }, []);

  const average =
    data && data.length ? (data.reduce((sum, r) => sum + (r.rating || 0), 0) / data.length).toFixed(1) : null;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Reviews</p>
          <h1>Holder feedback</h1>
          <p className="muted">Every review comes from a verified holder who played the build.</p>
        </div>
        {average && (
          <div className="score">
            <strong>{average}</strong>
            <span className="muted small">
              from {data.length} review{data.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      {data && data.length === 0 && (
        <div className="card empty">
          <p className="muted">No reviews yet. Be the first to play and leave one.</p>
          <Link href="/playtest" className="btn btn-primary btn-sm">
            Enter playtest
          </Link>
        </div>
      )}

      <div className="review-list">
        {(data || []).map((item, index) => (
          <article key={index} className="card review">
            <div className="review-top">
              <div className="stars stars-static" aria-label={`${item.rating} of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={n <= item.rating ? 'star star-on' : 'star'} />
                ))}
              </div>
              <span className="muted small">{item.game}</span>
            </div>
            <p>{item.feedback}</p>
            <p className="muted small">
              {shortAddress(item.wallet)} · {new Date(item.date).toLocaleDateString()}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
