import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useFetch(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [path]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}
