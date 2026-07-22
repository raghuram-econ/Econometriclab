import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface ReportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  footnote?: string;
}

export interface ReportEntry {
  id: string;
  timestamp: Date;
  moduleType: string;       // e.g. "OLS Regression"
  title: string;            // e.g. "OLS: ln_income on education age"
  tables: ReportTable[];    // array of data tables
  notes: string[];          // interpretation notes
}

export interface SessionReportContextType {
  entries: ReportEntry[];
  addToReport: (entry: Omit<ReportEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }) => void;
  removeFromReport: (id: string) => void;
  clearReport: () => void;
}

const SessionReportContext = createContext<SessionReportContextType | undefined>(undefined);

export const SessionReportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entries, setEntries] = useState<ReportEntry[]>(() => {
    try {
      const saved = localStorage.getItem('session_report_entries');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      }
    } catch (e) {
      console.error('Failed to parse session report entries:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('session_report_entries', JSON.stringify(entries));
    } catch (e) {
      console.error('Failed to save session report entries:', e);
    }
  }, [entries]);

  const addToReport = useCallback((entry: Omit<ReportEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }) => {
    const fullEntry: ReportEntry = {
      ...entry,
      id: entry.id || Math.random().toString(36).substring(2, 11),
      timestamp: entry.timestamp || new Date(),
    };
    setEntries((prev) => [...prev, fullEntry]);
  }, []);

  const removeFromReport = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearReport = useCallback(() => {
    setEntries([]);
  }, []);

  return (
    <SessionReportContext.Provider value={{ entries, addToReport, removeFromReport, clearReport }}>
      {children}
    </SessionReportContext.Provider>
  );
};

export const useSessionReport = () => {
  const context = useContext(SessionReportContext);
  if (context === undefined) {
    throw new Error('useSessionReport must be used within a SessionReportProvider');
  }
  return context;
};
