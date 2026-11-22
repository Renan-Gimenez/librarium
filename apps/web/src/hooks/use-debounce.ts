import { useEffect, useState } from "react";

/**
 * Hook to debounce a rapidly changing value by a given delay in milliseconds.
 *
 * @param value The value to debounce.
 * @param delay Milliseconds to wait after the last change before updating (default 300ms).
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

