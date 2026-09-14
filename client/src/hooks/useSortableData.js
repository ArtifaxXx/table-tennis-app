import { useMemo, useState } from 'react';

const ISO_DATE_LIKE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

const toTime = (v) => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && ISO_DATE_LIKE.test(v.trim())) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

const defaultCompare = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;

  const da = toTime(a);
  const db = toTime(b);
  if (da != null && db != null) return da - db;

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export function useSortableData(items, initialConfig = null) {
  const [sortConfig, setSortConfig] = useState(initialConfig);

  const sortedItems = useMemo(() => {
    const list = Array.isArray(items) ? [...items] : [];
    if (!sortConfig?.key) return list;

    const { key, direction = 'asc', getValue } = sortConfig;
    const dir = direction === 'desc' ? -1 : 1;

    list.sort((x, y) => {
      const a = getValue ? getValue(x) : x?.[key];
      const b = getValue ? getValue(y) : y?.[key];
      return defaultCompare(a, b) * dir;
    });

    return list;
  }, [items, sortConfig]);

  const requestSort = (key, getValue) => {
    setSortConfig((prev) => {
      const isSame = prev?.key === key;
      const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
      return { key, direction: nextDirection, getValue };
    });
  };

  return { items: sortedItems, requestSort, sortConfig };
}

export function sortIndicator(sortConfig, key) {
  if (!sortConfig || sortConfig.key !== key) return '';
  return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
}
