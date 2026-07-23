import { useCallback, useEffect, useState } from "react";
import { parseError, type AppError } from "@/api/errors";

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  reload: () => void;
};

/** Run an async loader on mount (and on `deps` change), tracking loading/error. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [nonce, setNonce] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    run()
      .then((result) => alive && setData(result))
      .catch((err) => alive && setError(parseError(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [run, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}
