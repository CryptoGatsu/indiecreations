import { useCallback, useEffect, useState } from 'react';
import { RULES } from '../lib/platform/guidelines';

// Shared by the developer pages: build status names, the developer state hook, and rule codes with their text.
export const BUILD_STATUS = {
  draft: 'Draft',
  submitted: 'In review',
  approved: 'Approved',
  rejected: 'Changes needed',
  superseded: 'Replaced',
  withdrawn: 'Withdrawn',
};

export function useDevState() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    fetch('/api/dev/state', { cache: 'no-store' })
      .then(async (r) => {
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || 'Could not load.');
        setState(out);
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);
  return { state, error, reload: load };
}

export function Codes({ codes, list = RULES }) {
  if (!codes?.length) return null;
  return (
    <ul className="code-list">
      {codes.map((c) => {
        const r = list.find((x) => x.code === c);
        return (
          <li key={c}>
            <span className="rule-code small-code">{c}</span> <strong>{r?.title || c}</strong>
            {r ? <span className="muted"> {r.body}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

