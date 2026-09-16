import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useDivisionContext } from '../context/DivisionContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import DivisionSelector from '../components/DivisionSelector';

const PlayerRankings = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { seasons, selectedSeasonId, selectedDivisionId, setSelectedSeasonId, loading: contextLoading } = useDivisionContext();

  const fetchRows = useCallback(async function fetchRows(seasonId, divisionId) {
    try {
      const res = await axios.get('/api/player-rankings', { params: { seasonId, divisionId } });
      setRows(res.data);
    } catch (e) {
      console.error(e);
      setRows([]);
      toast.error(e?.response?.data?.error || 'Failed to load player rankings');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (contextLoading) return;
    if (!selectedSeasonId) {
      setRows([]);
      setLoading(false);
      return;
    }
    fetchRows(selectedSeasonId, selectedDivisionId);
  }, [contextLoading, fetchRows, selectedSeasonId, selectedDivisionId]);

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
          <div className="flex flex-wrap items-center gap-2">
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
            <DivisionSelector />
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
                <th className="cursor-pointer" onClick={() => requestSort('team_name')}>Team{sortIndicator(sortConfig, 'team_name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_wins')}>Singles Wins{sortIndicator(sortConfig, 'singles_wins')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_losses')}>Singles Losses{sortIndicator(sortConfig, 'singles_losses')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_played')}>Singles Played{sortIndicator(sortConfig, 'singles_played')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('matches_diff')}>Match +/-{sortIndicator(sortConfig, 'matches_diff')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_games_won')}>Games Won{sortIndicator(sortConfig, 'singles_games_won')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('singles_games_lost')}>Games Lost{sortIndicator(sortConfig, 'singles_games_lost')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('games_diff')}>Game +/-{sortIndicator(sortConfig, 'games_diff')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.player_id}>
                  <td className="font-medium">{r.rank}</td>
                  <td className="font-medium">{r.player_name}</td>
                  <td>{r.team_name || '-'}</td>
                  <td className="text-green-700 font-medium">{r.singles_wins}</td>
                  <td className="text-red-700 font-medium">{r.singles_losses}</td>
                  <td>{r.singles_played}</td>
                  <td className="font-medium">{r.matches_diff > 0 ? '+' : ''}{r.matches_diff}</td>
                  <td className="font-medium">{r.singles_games_won}</td>
                  <td>{r.singles_games_lost}</td>
                  <td className="font-medium">{r.games_diff > 0 ? '+' : ''}{r.games_diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-gray-500 text-center py-8">No data yet</div>}
        </div>
      </Card>

      <div className="text-sm text-gray-500">
        Ranking is ordered by singles matches won, match difference, then game difference. Exact ties share the same rank.
      </div>
    </div>
  );
};

export default PlayerRankings;
