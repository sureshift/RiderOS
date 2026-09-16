import { useCallback, useEffect, useState } from 'react';
import { query } from '@/services/localDb';

export function useLocalQuery(sql, params = [], dependencies = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await query(sql, params));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [sql, ...params, ...dependencies]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, run, setData };
}
