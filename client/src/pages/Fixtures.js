import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useDivisionContext } from '../context/DivisionContext';

const Fixtures = () => {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const didInitRef = useRef(false);
  const { seasons, selectedSeasonId, selectedDivisionId, setSelectedSeasonId } = useDivisionContext();

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (selectedSeasonId) {
      fetchFixtures(selectedSeasonId, selectedDivisionId);
    }
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) return;
    fetchFixtures(selectedSeasonId, selectedDivisionId);
  }, [selectedSeasonId, selectedDivisionId]);

  const { items: sortedFixtures, requestSort, sortConfig } = useSortableData(fixtures, {
    key: 'match_date',
    direction: 'desc',
  });

  const fetchFixtures = async (seasonId, divisionId) => {
    try {
      const res = await axios.get('/api/fixtures', { params: { seasonId, divisionId } });
      setFixtures(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

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
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || e.message);
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

  if (loading) return <div className="text-center py-8">Loading fixtures...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Season Fixtures</h2>
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
      </div>

      <div className="text-sm text-gray-500">
        Viewing: <span className="font-medium">{seasons.find((s) => s.id === selectedSeasonId)?.name || 'Season'}</span>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="cursor-pointer" onClick={() => requestSort('match_date')}>Date{sortIndicator(sortConfig, 'match_date')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('home_team_name')}>Home{sortIndicator(sortConfig, 'home_team_name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('away_team_name')}>Away{sortIndicator(sortConfig, 'away_team_name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('status')}>Status{sortIndicator(sortConfig, 'status')}</th>
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
                    />
                  </td>
                  <td className="font-medium">{f.home_team_name}</td>
                  <td className="font-medium">{f.away_team_name}</td>
                  <td>{statusBadge(f.status)}</td>
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
      </div>
    </div>
  );
};

export default Fixtures;
