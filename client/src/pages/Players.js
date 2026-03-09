import React, { useRef, useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useAuth } from '../context/AuthContext';

const Players = () => {
  const { isAdmin } = useAuth();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
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
    } catch (error) {
      console.error('Error saving player:', error);
    }
  };

  const handleEdit = (player) => {
    if (!isAdmin) return;
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
      } catch (error) {
        console.error('Error deleting player:', error);
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

  if (loading) {
    return <div className="text-center py-8">Loading players...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Players</h2>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Add Player</span>
          </button>
        )}
      </div>

      {isAdmin && showAddForm && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {editingPlayer ? 'Edit Player' : 'Add New Player'}
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
                />
              </div>
            </div>
            <div className="flex space-x-3">
              <button type="submit" className="btn btn-primary">
                {editingPlayer ? 'Update' : 'Add'} Player
              </button>
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <Search size={20} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input flex-1"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="cursor-pointer" onClick={() => requestSort('name')}>Name{sortIndicator(sortConfig, 'name')}</th>
                <th
                  className="cursor-pointer"
                  onClick={() => requestSort('total_matches', (p) => Number(p.total_matches || 0))}
                >
                  Singles Played{sortIndicator(sortConfig, 'total_matches')}
                </th>
                <th
                  className="cursor-pointer"
                  onClick={() => requestSort('win_rate', (p) => Number(p.win_rate || 0))}
                >
                  Singles Win Rate{sortIndicator(sortConfig, 'win_rate')}
                </th>
                <th
                  className="cursor-pointer"
                  onClick={() => requestSort('singles_sets_won', (p) => Number(p.singles_sets_won || 0))}
                >
                  Sets Won{sortIndicator(sortConfig, 'singles_sets_won')}
                </th>
                <th
                  className="cursor-pointer"
                  onClick={() => requestSort('singles_sets_lost', (p) => Number(p.singles_sets_lost || 0))}
                >
                  Sets Lost{sortIndicator(sortConfig, 'singles_sets_lost')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player) => (
                <tr key={player.id}>
                  <td className="font-medium">{player.name}</td>
                  <td>{player.total_matches || 0}</td>
                  <td>{player.win_rate}%</td>
                  <td className="font-medium">{player.singles_sets_won || 0}</td>
                  <td>{player.singles_sets_lost || 0}</td>
                  <td>
                    {isAdmin && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(player)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(player.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPlayers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'No players found' : 'No players registered yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Players;
