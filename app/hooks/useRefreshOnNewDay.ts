import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Wywołuje `onNewDay` gdy aplikacja wraca na pierwszy plan po zmianie dnia
 * (np. po północy). Używaj w każdej zakładce, która pokazuje dane "dzisiaj".
 */
export function useRefreshOnNewDay(onNewDay: () => void) {
  const lastDateRef = useRef(todayStr());

  useEffect(() => {
    const handler = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const current = todayStr();
        if (current !== lastDateRef.current) {
          lastDateRef.current = current;
          onNewDay();
        }
      }
    };

    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [onNewDay]);
}
