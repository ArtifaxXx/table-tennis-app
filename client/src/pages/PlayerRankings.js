import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useDivisionContext } from '../context/DivisionContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const PlayerRankings = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const didInitRef = useRef(false);
  const { seasons, selectedSeasonId, selectedDivisionId, setSelectedSeasonId } = useDivisionContext();

  const fetchRows = useCallback(async function fetchRows(seasonId, divisionId) {
    try {
      const res = await axios.get('/api/player-rankings', { params: { seasonId, divisionId } });
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

  if (loading) return <div className="text-center py-8">Loading player rankings...</div>;

  const selectedSeasonName = seasons.find((s) => s.id === selectedSeasonId)?.name || 'Season';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Player Rankings (Singles)"
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
                <th className="cursor-pointer" onClick={() => requestSort('player_name')}>Player{sortIndicator(sortConfig, 'player_name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_wins')}>Singles Wins{sortIndicator(sortConfig, 'singles_wins')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_losses')}>Singles Losses{sortIndicator(sortConfig, 'singles_losses')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_played')}>Singles Played{sortIndicator(sortConfig, 'singles_played')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_sets_won')}>Sets Won{sortIndicator(sortConfig, 'singles_sets_won')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_sets_lost')}>Sets Lost{sortIndicator(sortConfig, 'singles_sets_lost')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.player_id}>
                  <td className="font-medium">{r.rank}</td>
                  <td className="font-medium">{r.player_name}</td>
                  <td className="text-green-700 font-medium">{r.singles_wins}</td>
                  <td className="text-red-700 font-medium">{r.singles_losses}</td>
                  <td>{r.singles_played}</td>
                  <td className="font-medium">{r.singles_sets_won}</td>
                  <td>{r.singles_sets_lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-gray-500 text-center py-8">No data yet</div>}
        </div>
      </Card>

      <div className="text-sm text-gray-500">
        Ranking is based on singles games won. Ties share the same rank.
      </div>
    </div>
  );
};

export default PlayerRankings;
