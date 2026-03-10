import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AlertContextType {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  return (
    <AlertContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlertContext() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlertContext must be used within AlertProvider');
  }
  return context;
}
