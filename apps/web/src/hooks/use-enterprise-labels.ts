'use client';

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'gip:enterprise-labels';

interface StoredLabels {
  important: string[];
  test: string[];
}

function load(): StoredLabels {
  if (typeof window === 'undefined') return { important: [], test: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredLabels) : { important: [], test: [] };
  } catch {
    return { important: [], test: [] };
  }
}

function persist(labels: StoredLabels) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
}

/**
 * Manages per-enterprise "Important" and "Test/UAT" labels stored in localStorage.
 * No server round-trips — purely client-side state that survives refresh and navigation.
 */
export function useEnterpriseLabels() {
  const [importantIds, setImportantIds] = useState<Set<string>>(
    () => new Set(load().important),
  );
  const [testIds, setTestIds] = useState<Set<string>>(
    () => new Set(load().test),
  );

  const toggleImportant = useCallback((id: string) => {
    setImportantIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      const stored = load();
      stored.important = [...next];
      persist(stored);
      return next;
    });
  }, []);

  const toggleTest = useCallback((id: string) => {
    setTestIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      const stored = load();
      stored.test = [...next];
      persist(stored);
      return next;
    });
  }, []);

  return {
    importantIds,
    testIds,
    isImportant: (id: string) => importantIds.has(id),
    isTest:      (id: string) => testIds.has(id),
    toggleImportant,
    toggleTest,
  };
}
