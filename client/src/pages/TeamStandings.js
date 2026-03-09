import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useDivisionContext } from '../context/DivisionContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const TeamStandings = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const didInitRef = useRef(false);
  const { seasons, selectedSeasonId, selectedDivisionId, setSelectedSeasonId } = useDivisionContext();

  const fetchRows = useCallback(async (seasonId, divisionId) => {
    try {
      const res = await axios.get('/api/team-standings', { params: { seasonId, divisionId } });
      setRows(res.data);
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
      fetchRows(selectedSeasonId, selectedDivisionId);
    }
  }, [fetchRows, selectedSeasonId, selectedDivisionId]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    fetchRows(selectedSeasonId, selectedDivisionId);
  }, [fetchRows, selectedSeasonId, selectedDivisionId]);

  const { items: sortedRows, requestSort, sortConfig } = useSortableData(rows, {
    key: 'rank',
    direction: 'asc',
  });

  if (loading) return <div className="text-center py-8">Loading standings...</div>;

  const selectedSeasonName = seasons.find((s) => s.id === selectedSeasonId)?.name || 'Season';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Standings"
        subtitle={
          <>
            Viewing: <span className="font-medium">{selectedSeasonName}</span>
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Season</span>
            <select className="input" value={selectedSeasonId} onChange={(e) => setSelectedSeasonId(e.target.value)}>
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
                <th className="cursor-pointer" onClick={() => requestSort('rank')}>Rank{sortIndicator(sortConfig, 'rank')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('team_name')}>Team{sortIndicator(sortConfig, 'team_name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('played')}>P{sortIndicator(sortConfig, 'played')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('wins')}>W{sortIndicator(sortConfig, 'wins')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('losses')}>L{sortIndicator(sortConfig, 'losses')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('games_won')}>Games Won{sortIndicator(sortConfig, 'games_won')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('games_lost')}>Games Lost{sortIndicator(sortConfig, 'games_lost')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('sets_won')}>Sets Won{sortIndicator(sortConfig, 'sets_won')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('sets_lost')}>Sets Lost{sortIndicator(sortConfig, 'sets_lost')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.team_id}>
                  <td className="font-medium">{r.rank}</td>
                  <td className="font-medium">{r.team_name}</td>
                  <td>{r.played}</td>
                  <td className="text-green-700 font-medium">{r.wins}</td>
                  <td className="text-red-700 font-medium">{r.losses}</td>
                  <td className="font-medium">{r.games_won}</td>
                  <td>{r.games_lost}</td>
                  <td className="font-medium">{r.sets_won}</td>
                  <td>{r.sets_lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-gray-500 text-center py-8">No results yet</div>}
        </div>
      </Card>

      <div className="text-sm text-gray-500">
        Tie-breakers: wins, games won, head-to-head games won among tied teams, sets won.
      </div>
    </div>
  );
};

export default TeamStandings;
