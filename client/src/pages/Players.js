import React, { useRef, useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const Players = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('simple');
  const [formData, setFormData] = useState({
    name: '',
  });

  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      const response = await axios.get('/api/players');
      setPlayers(response.data);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      if (editingPlayer) {
        await axios.put(`/api/players/${editingPlayer.id}`, formData);
      } else {
        await axios.post('/api/players', formData);
      }
      fetchPlayers();
      resetForm();
      toast.success('Save successful');
    } catch (error) {
      console.error('Error saving player:', error);
      toast.error(error?.response?.data?.error || error.message);
    }
  };

  const handleEdit = (player) => {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
    });
    setShowAddForm(true);
  };

  const handleDelete = async (playerId) => {
    if (!isAdmin) return;
    if (window.confirm('Are you sure you want to delete this player?')) {
      try {
        await axios.delete(`/api/players/${playerId}`);
        fetchPlayers();
        toast.success('Delete successful');
      } catch (error) {
        console.error('Error deleting player:', error);
        toast.error(error?.response?.data?.error || error.message);
      }
    }
  };

  const resetForm = () => {
    setFormData({ name: '' });
    setEditingPlayer(null);
    setShowAddForm(false);
  };

  const filteredPlayers = players.filter(player =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { items: sortedPlayers, requestSort, sortConfig } = useSortableData(filteredPlayers, {
    key: 'name',
    direction: 'asc',
  });

  const getNumber = (value) => Number(value || 0);

  if (loading) {
    return <div className="text-center py-8">Loading players...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Players"
        right={
          isAdmin ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="btn btn-primary flex items-center space-x-2"
            >
              <Plus size={20} />
              <span>Add Player</span>
            </button>
          ) : null
        }
      />

      {showAddForm && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {isAdmin ? (editingPlayer ? 'Edit Player' : 'Add New Player') : 'Player Details'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="input"
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="flex space-x-3">
              {isAdmin && (
                <button type="submit" className="btn btn-success">
                  {editingPlayer ? 'Update' : 'Add'} Player
                </button>
              )}
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                {isAdmin ? 'Cancel' : 'Close'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div className="flex items-center space-x-2 flex-1">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input flex-1"
            />
          </div>
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className={`px-3 py-1 text-sm rounded-md ${viewMode === 'simple' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              onClick={() => setViewMode('simple')}
            >
              Simple
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-sm rounded-md ${viewMode === 'detailed' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              onClick={() => setViewMode('detailed')}
            >
              Detailed
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              {viewMode === 'simple' ? (
                <tr>
                  <th className="cursor-pointer" onClick={() => requestSort('name')}>Name{sortIndicator(sortConfig, 'name')}</th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('matches_played', (p) => getNumber(p.matches_played ?? (p.singles_played ?? p.total_matches) + getNumber(p.doubles_played)))}
                  >
                    Matches Played{sortIndicator(sortConfig, 'matches_played')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_wins', (p) => getNumber(p.singles_wins ?? p.wins))}
                  >
                    Singles W/L{sortIndicator(sortConfig, 'singles_wins')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_win_pct', (p) => getNumber(p.singles_win_pct ?? p.win_rate))}
                  >
                    Singles %{sortIndicator(sortConfig, 'singles_win_pct')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_wins', (p) => getNumber(p.doubles_wins))}
                  >
                    Doubles W/L{sortIndicator(sortConfig, 'doubles_wins')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_win_pct', (p) => getNumber(p.doubles_win_pct))}
                  >
                    Doubles %{sortIndicator(sortConfig, 'doubles_win_pct')}
                  </th>
                  <th>Actions</th>
                </tr>
              ) : (
                <tr>
                  <th className="cursor-pointer" onClick={() => requestSort('name')}>Name{sortIndicator(sortConfig, 'name')}</th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('matches_played', (p) => getNumber(p.matches_played ?? (p.singles_played ?? p.total_matches) + getNumber(p.doubles_played)))}
                  >
                    Matches Played{sortIndicator(sortConfig, 'matches_played')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('overall_win_pct', (p) => getNumber(p.overall_win_pct ?? p.win_rate))}
                  >
                    Win %{sortIndicator(sortConfig, 'overall_win_pct')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_played', (p) => getNumber(p.singles_played ?? p.total_matches))}
                  >
                    Singles Played{sortIndicator(sortConfig, 'singles_played')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_wins', (p) => getNumber(p.singles_wins ?? p.wins))}
                  >
                    Singles Won{sortIndicator(sortConfig, 'singles_wins')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_losses', (p) => getNumber(p.singles_losses ?? p.losses))}
                  >
                    Singles Lost{sortIndicator(sortConfig, 'singles_losses')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_win_pct', (p) => getNumber(p.singles_win_pct ?? p.win_rate))}
                  >
                    Singles %{sortIndicator(sortConfig, 'singles_win_pct')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_sets_won', (p) => getNumber(p.singles_sets_won))}
                  >
                    Singles Sets W/L{sortIndicator(sortConfig, 'singles_sets_won')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('singles_points_won', (p) => getNumber(p.singles_points_won))}
                  >
                    Singles Points W/L{sortIndicator(sortConfig, 'singles_points_won')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_played', (p) => getNumber(p.doubles_played))}
                  >
                    Doubles Played{sortIndicator(sortConfig, 'doubles_played')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_wins', (p) => getNumber(p.doubles_wins))}
                  >
                    Doubles Won{sortIndicator(sortConfig, 'doubles_wins')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_losses', (p) => getNumber(p.doubles_losses))}
                  >
                    Doubles Lost{sortIndicator(sortConfig, 'doubles_losses')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_win_pct', (p) => getNumber(p.doubles_win_pct))}
                  >
                    Doubles %{sortIndicator(sortConfig, 'doubles_win_pct')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_sets_won', (p) => getNumber(p.doubles_sets_won))}
                  >
                    Doubles Sets W/L{sortIndicator(sortConfig, 'doubles_sets_won')}
                  </th>
                  <th
                    className="cursor-pointer"
                    onClick={() => requestSort('doubles_points_won', (p) => getNumber(p.doubles_points_won))}
                  >
                    Doubles Points W/L{sortIndicator(sortConfig, 'doubles_points_won')}
                  </th>
                  <th>Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {sortedPlayers.map((player) => {
                const singlesPlayed = getNumber(player.singles_played ?? player.total_matches);
                const singlesWins = getNumber(player.singles_wins ?? player.wins);
                const singlesLosses = getNumber(player.singles_losses ?? player.losses);
                const singlesWinPct = getNumber(player.singles_win_pct ?? player.win_rate);
                const singlesSetsWon = getNumber(player.singles_sets_won);
                const singlesSetsLost = getNumber(player.singles_sets_lost);
                const singlesPointsWon = getNumber(player.singles_points_won);
                const singlesPointsLost = getNumber(player.singles_points_lost);
                const doublesPlayed = getNumber(player.doubles_played);
                const doublesWins = getNumber(player.doubles_wins);
                const doublesLosses = getNumber(player.doubles_losses);
                const doublesWinPct = getNumber(player.doubles_win_pct);
                const doublesSetsWon = getNumber(player.doubles_sets_won);
                const doublesSetsLost = getNumber(player.doubles_sets_lost);
                const doublesPointsWon = getNumber(player.doubles_points_won);
                const doublesPointsLost = getNumber(player.doubles_points_lost);
                const matchesPlayed = getNumber(player.matches_played ?? (singlesPlayed + doublesPlayed));
                const overallWinPct = getNumber(player.overall_win_pct ?? (matchesPlayed ? ((singlesWins + doublesWins) / matchesPlayed) * 100 : 0));

                return (
                  <tr
                    key={player.id}
                    className={isAdmin ? 'cursor-pointer' : undefined}
                    onClick={() => handleEdit(player)}
                  >
                    <td className="font-medium">{player.name}</td>
                    <td>{matchesPlayed}</td>
                    {viewMode === 'simple' ? (
                      <>
                        <td className="font-medium">
                          <span className="text-green-700">{singlesWins}</span>
                          <span className="text-gray-500">/</span>
                          <span className="text-red-700">{singlesLosses}</span>
                        </td>
                        <td>{singlesWinPct.toFixed(1)}%</td>
                        <td className="font-medium">
                          <span className="text-green-700">{doublesWins}</span>
                          <span className="text-gray-500">/</span>
                          <span className="text-red-700">{doublesLosses}</span>
                        </td>
                        <td>{doublesWinPct.toFixed(1)}%</td>
                      </>
                    ) : (
                      <>
                        <td>{overallWinPct.toFixed(1)}%</td>
                        <td>{singlesPlayed}</td>
                        <td>{singlesWins}</td>
                        <td>{singlesLosses}</td>
                        <td>{singlesWinPct.toFixed(1)}%</td>
                        <td>
                          {singlesSetsWon}
                          <span className="text-gray-500">/</span>
                          {singlesSetsLost}
                        </td>
                        <td>
                          {singlesPointsWon}
                          <span className="text-gray-500">/</span>
                          {singlesPointsLost}
                        </td>
                        <td>{doublesPlayed}</td>
                        <td>{doublesWins}</td>
                        <td>{doublesLosses}</td>
                        <td>{doublesWinPct.toFixed(1)}%</td>
                        <td>
                          {doublesSetsWon}
                          <span className="text-gray-500">/</span>
                          {doublesSetsLost}
                        </td>
                        <td>
                          {doublesPointsWon}
                          <span className="text-gray-500">/</span>
                          {doublesPointsLost}
                        </td>
                      </>
                    )}
                    <td>
                      {isAdmin && (
                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(player.id);
                            }}
                            className="btn btn-danger"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredPlayers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'No players found' : 'No players registered yet'}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Players;
