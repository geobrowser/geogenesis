import { useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T, callback?: (value: T) => void) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.log(error);
      return initialValue;
    }
  });
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.log(error);
    }
  };

  // Sync state across tabs
  useEffect(() => {
    const readLocalStore = (event: StorageEvent) => {
      if (event?.key && event.key !== key) {
        return;
      }

      try {
        const item = window.localStorage.getItem(key);
        const value = item ? JSON.parse(item) : initialValue;
        callback?.(value);
      } catch (e) {
        console.error(`Cannot read key: ${key} from local storage`, e);
        return initialValue;
      }
    };

    window.addEventListener('storage', readLocalStore);
    return () => window.removeEventListener('storage', readLocalStore);
  }, [initialValue, callback, key]);

  return [storedValue, setValue] as const;
}
