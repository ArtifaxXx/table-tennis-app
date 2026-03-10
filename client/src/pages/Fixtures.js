import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useDivisionContext } from '../context/DivisionContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import { VIOLATION_TOOLTIP_TEXT } from '../utils/violationTooltipText';

const Fixtures = () => {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const didInitRef = useRef(false);
  const { seasons, selectedSeasonId, selectedDivisionId, setSelectedSeasonId } = useDivisionContext();

  const fetchFixtures = useCallback(async (seasonId, divisionId) => {
    try {
      const res = await axios.get('/api/fixtures', { params: { seasonId, divisionId } });
      setFixtures(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (selectedSeasonId) {
      fetchFixtures(selectedSeasonId, selectedDivisionId);
    }
  }, [fetchFixtures, selectedSeasonId, selectedDivisionId]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    fetchFixtures(selectedSeasonId, selectedDivisionId);
  }, [fetchFixtures, selectedSeasonId, selectedDivisionId]);

  const { items: sortedFixtures, requestSort, sortConfig } = useSortableData(fixtures, {
    key: 'match_date',
    direction: 'desc',
  });

  const toDateTimeLocalValue = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const updateFixtureDate = async (fixtureId, dateTimeLocal) => {
    const asIso = dateTimeLocal ? new Date(dateTimeLocal).toISOString() : null;
    try {
      const res = await axios.put(`/api/fixtures/${fixtureId}`, { match_date: asIso });
      setFixtures((prev) => prev.map((f) => (f.id === fixtureId ? res.data : f)));
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const statusBadge = (s) => {
    const styles = {
      scheduled: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
    };
    return <span className={`px-2 py-1 text-xs rounded-full ${styles[s] || styles.scheduled}`}>{s}</span>;
  };

  const completenessBadge = (c) => {
    const styles = {
      complete: 'bg-green-50 text-green-800 border-green-200',
      violation: 'bg-red-50 text-red-800 border-red-200',
      missing_lineups: 'bg-gray-50 text-gray-700 border-gray-200',
      missing_games: 'bg-gray-50 text-gray-700 border-gray-200',
      missing_sets: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    const labels = {
      complete: 'Complete',
      violation: 'Violation',
      missing_lineups: 'Lineups',
      missing_games: 'Games',
      missing_sets: 'Sets',
    };
    if (!c) return null;

    const tooltipText = c === 'violation' ? VIOLATION_TOOLTIP_TEXT : null;

    const badge = (
      <span className={`px-2 py-1 text-xs rounded-full border ${styles[c] || styles.missing_lineups}`}>
        {labels[c] || c}
      </span>
    );

    if (!tooltipText) return badge;

    return (
      <span className="relative inline-block group">
        {badge}
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2 whitespace-normal break-words rounded-md bg-gray-700 px-2 py-1 text-left text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {tooltipText}
        </span>
      </span>
    );
  };

  if (loading) return <div className="text-center py-8">Loading fixtures...</div>;

  const selectedSeasonName = seasons.find((s) => s.id === selectedSeasonId)?.name || 'Season';
  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId) || null;
  const canEdit = !!isAdmin && selectedSeason?.status === 'active';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Season Fixtures"
        subtitle={
          <>
            Viewing: <span className="font-medium">{selectedSeasonName}</span>
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Season</span>
            <select
              className="input"
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.status === 'active' ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="cursor-pointer" onClick={() => requestSort('match_date')}>Date{sortIndicator(sortConfig, 'match_date')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('match_type')}>Type{sortIndicator(sortConfig, 'match_type')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('home_team_name')}>Home{sortIndicator(sortConfig, 'home_team_name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('away_team_name')}>Away{sortIndicator(sortConfig, 'away_team_name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('status')}>Status{sortIndicator(sortConfig, 'status')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('completeness_status')}>VALIDATION{sortIndicator(sortConfig, 'completeness_status')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('home_games_won', (f) => (f.home_games_won || 0) - (f.away_games_won || 0))}>Result{sortIndicator(sortConfig, 'home_games_won')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedFixtures.map((f) => (
                <tr key={f.id}>
                  <td>
                    <input
                      className="input"
                      type="datetime-local"
                      value={toDateTimeLocalValue(f.match_date)}
                      onChange={(e) => updateFixtureDate(f.id, e.target.value)}
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="text-sm text-gray-700">
                    {(f.match_type || 'league') === 'cup' ? 'Cup' : 'League'}
                  </td>
                  <td className="font-medium">{f.home_team_name}</td>
                  <td className="font-medium">{f.away_team_name}</td>
                  <td>{statusBadge(f.status)}</td>
                  <td>{completenessBadge(f.completeness_status)}</td>
                  <td>
                    {f.status === 'completed' || f.status === 'in_progress'
                      ? `${f.home_games_won}-${f.away_games_won}`
                      : '-'}
                  </td>
                  <td>
                    <Link className="btn btn-secondary" to={`/fixtures/${f.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fixtures.length === 0 && (
            <div className="text-center py-8 text-gray-500">No fixtures for this season yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Fixtures;
