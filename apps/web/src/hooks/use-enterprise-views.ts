'use client';

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'gip:enterprise-views-v2';

export interface CustomView {
  id: string;
  label: string;
  connectorName: string;
}

function load(): CustomView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomView[]) : [];
  } catch {
    return [];
  }
}

function persist(views: CustomView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

/**
 * Manages user-saved connector filter tabs stored in localStorage.
 * Each view pins a specific connector name as a quick-access tab on the enterprise list.
 */
export function useEnterpriseViews() {
  const [views, setViews] = useState<CustomView[]>(() => load());

  const addView = useCallback((connectorName: string) => {
    setViews((prev) => {
      if (prev.some((v) => v.connectorName === connectorName)) return prev;
      const next = [...prev, { id: `view-${Date.now()}`, label: connectorName, connectorName }];
      persist(next);
      return next;
    });
  }, []);

  const removeView = useCallback((id: string) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const isPinned = useCallback(
    (connectorName: string) => views.some((v) => v.connectorName === connectorName),
    [views],
  );

  return { views, addView, removeView, isPinned };
}
