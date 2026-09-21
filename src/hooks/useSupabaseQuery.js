import { useCallback, useEffect, useState } from 'react';

/**
 * Runs a Supabase query builder chain and keeps its result in state.
 *
 * @param {() => PromiseLike<{ data: any[]|null, error: any }>} queryFn
 *   A function that returns a Supabase query (e.g. `() => supabase.from('orders').select('*')`).
 *   Called fresh on every `run()` so filters/params can close over component state.
 * @param {any[]} dependencies - re-run automatically when any of these change.
 */
export function useSupabaseQuery(queryFn, dependencies = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: queryError } = await queryFn();
      if (queryError) throw queryError;
      setData(rows || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, run, setData };
}
