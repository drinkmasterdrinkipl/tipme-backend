import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Wywołuje `onNewDay` gdy aplikacja wraca na pierwszy plan po zmianie dnia.
 * WAŻNE: `onNewDay` musi być owiniętny w useCallback w komponencie nadrzędnym.
 */
export function useRefreshOnNewDay(onNewDay: () => void) {
  const lastDateRef = useRef(todayStr());
  // Przechowujemy aktualny callback w ref — event listener nie musi być re-rejestrowany przy każdej zmianie
  const callbackRef = useRef(onNewDay);
  useEffect(() => { callbackRef.current = onNewDay; });

  useEffect(() => {
    const handler = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const current = todayStr();
        if (current !== lastDateRef.current) {
          lastDateRef.current = current;
          callbackRef.current();
        }
      }
    };

    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, []); // pusta tablica — listener rejestrujemy raz, callback zawsze aktualny przez ref
}
