import { defaultCompare, sortIndicator } from './useSortableData';

const sortStrings = (arr) => [...arr].sort(defaultCompare);

describe('defaultCompare', () => {
  test('team names with trailing numbers sort alphabetically, not as dates', () => {
    // Regression: Date.parse('Arklow 1') used to return a timestamp,
    // making the comparator non-transitive and scrambling the order.
    const teams = ['Roundwood 1', 'Dublin Raptors', 'Arklow 1', 'Wayside 2', 'Wayside 1'];
    expect(sortStrings(teams)).toEqual([
      'Arklow 1',
      'Dublin Raptors',
      'Roundwood 1',
      'Wayside 1',
      'Wayside 2',
    ]);
  });

  test('is transitive across mixed name shapes', () => {
    const teams = ['Bray 10', 'Bray 2', 'Arklow 1', 'Zebra'];
    const sorted = sortStrings(teams);
    expect(sorted).toEqual(['Arklow 1', 'Bray 2', 'Bray 10', 'Zebra']);
    // and reversing the input must not change the result
    expect(sortStrings([...teams].reverse())).toEqual(sorted);
  });

  test('ISO date strings still sort chronologically', () => {
    const dates = ['2026-03-01', '2025-11-20', '2026-01-15T18:30:00'];
    expect(sortStrings(dates)).toEqual([
      '2025-11-20',
      '2026-01-15T18:30:00',
      '2026-03-01',
    ]);
  });

  test('numbers sort numerically', () => {
    expect([10, 2, 30].sort(defaultCompare)).toEqual([2, 10, 30]);
  });

  test('null and undefined sort last', () => {
    const arr = [null, 'B', undefined, 'A'];
    expect(sortStrings(arr)).toEqual(['A', 'B', null, undefined]);
  });

  test('non-ISO strings are not treated as dates', () => {
    // 'April 1, 2026' < 'Feb 5, 2025' alphabetically, but not chronologically —
    // a date-based comparison would return > 0 here.
    expect(defaultCompare('April 1, 2026', 'Feb 5, 2025')).toBeLessThan(0);
  });

  test('mixed types fall back to string comparison', () => {
    expect(defaultCompare(5, 'abc')).toBe('5'.localeCompare('abc', undefined, { numeric: true, sensitivity: 'base' }));
    expect(defaultCompare('abc', 'abc')).toBe(0);
    expect(defaultCompare(5, 5)).toBe(0);
  });
});

describe('sortIndicator', () => {
  test('shows arrows only for the active column', () => {
    expect(sortIndicator({ key: 'name', direction: 'asc' }, 'name')).toBe(' ▲');
    expect(sortIndicator({ key: 'name', direction: 'desc' }, 'name')).toBe(' ▼');
    expect(sortIndicator({ key: 'name', direction: 'asc' }, 'other')).toBe('');
    expect(sortIndicator(null, 'name')).toBe('');
  });
});
