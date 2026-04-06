import React, { createContext, useContext } from 'react';

interface AppContextType {
  onLogout: () => void;
}

export const AppContext = createContext<AppContextType>({ onLogout: () => {} });
export const useAppContext = () => useContext(AppContext);
