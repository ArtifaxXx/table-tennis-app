import { useMemo, useState } from 'react';

const defaultCompare = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;

  const da = a instanceof Date ? a : (typeof a === 'string' && !Number.isNaN(Date.parse(a)) ? new Date(a) : null);
  const db = b instanceof Date ? b : (typeof b === 'string' && !Number.isNaN(Date.parse(b)) ? new Date(b) : null);
  if (da && db) return da.getTime() - db.getTime();

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
