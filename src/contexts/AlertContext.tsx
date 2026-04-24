import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Vibration } from 'react-native';
import { getAlerts, Alert as AlertType, USE_MOCK } from '../services/api';

const POLL_INTERVAL_MS = 5000;

interface AlertContextType {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenAlertId = useRef<number>(0);
  const initialLoad = useRef(true);

  const pollAlerts = useCallback(async () => {
    if (USE_MOCK) return;
    try {
      const alerts = await getAlerts();
      const unread = alerts.filter(a => !a.read);
      setUnreadCount(unread.length);

      if (alerts.length > 0) {
        const maxId = Math.max(...alerts.map(a => a.id));

        // On first load, just record the latest ID without notifying
        if (initialLoad.current) {
          lastSeenAlertId.current = maxId;
          initialLoad.current = false;
          return;
        }

        // Find new alerts since last poll
        const newAlerts = alerts.filter(
          a => a.id > lastSeenAlertId.current && !a.read,
        );

        if (newAlerts.length > 0) {
          lastSeenAlertId.current = maxId;
          Vibration.vibrate(400);
        }
      }
    } catch {
      // Silently fail — Pi may be offline
    }
  }, []);

  useEffect(() => {
    pollAlerts();
    const interval = setInterval(pollAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollAlerts]);

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
