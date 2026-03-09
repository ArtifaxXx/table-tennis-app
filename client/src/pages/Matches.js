import React, { useState, useEffect } from 'react';
import { Plus, Edit, Check, Clock, Trophy } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Matches = () => {
  const { isAdmin } = useAuth();
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [formData, setFormData] = useState({
    player1_id: '',
    player2_id: '',
    match_date: '',
    player1_score: '',
    player2_score: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [matchesResponse, playersResponse] = await Promise.all([
        axios.get('/api/matches'),
        axios.get('/api/players')
      ]);
      setMatches(matchesResponse.data);
      setPlayers(playersResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      const submitData = {
        ...formData,
        player1_score: formData.player1_score ? parseInt(formData.player1_score) : null,
        player2_score: formData.player2_score ? parseInt(formData.player2_score) : null
      };

      if (editingMatch) {
        await axios.put(`/api/matches/${editingMatch.id}`, submitData);
      } else {
        await axios.post('/api/matches', submitData);
      }
      fetchData();
      resetForm();
    } catch (error) {
      console.error('Error saving match:', error);
    }
  };

  const handleCompleteMatch = async (matchId) => {
    if (!isAdmin) return;
    const match = matches.find(m => m.id === matchId);
    const player1Score = prompt(`Enter ${match.player1_name}'s score:`);
    const player2Score = prompt(`Enter ${match.player2_name}'s score:`);

    if (player1Score && player2Score) {
      try {
        await axios.put(`/api/matches/${matchId}`, {
          player1_score: parseInt(player1Score),
          player2_score: parseInt(player2Score),
          status: 'completed'
        });
        fetchData();
      } catch (error) {
        console.error('Error completing match:', error);
      }
    }
  };

  const handleEdit = (match) => {
    if (!isAdmin) return;
    setEditingMatch(match);
    setFormData({
      player1_id: match.player1_id,
      player2_id: match.player2_id,
      match_date: match.match_date ? new Date(match.match_date).toISOString().slice(0, 16) : '',
      player1_score: match.player1_score || '',
      player2_score: match.player2_score || ''
    });
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      player1_id: '',
      player2_id: '',
      match_date: '',
      player1_score: '',
      player2_score: ''
    });
    setEditingMatch(null);
    setShowAddForm(false);
  };

  const getStatusBadge = (status) => {
    const styles = {
      scheduled: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.scheduled}`}>
        {status}
      </span>
    );
  };

  const upcomingMatches = matches.filter(m => m.status === 'scheduled');
  const completedMatches = matches.filter(m => m.status === 'completed');

  if (loading) {
    return <div className="text-center py-8">Loading matches...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Matches</h2>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>Schedule Match</span>
          </button>
        )}
      </div>

      {isAdmin && showAddForm && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {editingMatch ? 'Edit Match' : 'Schedule New Match'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Player 1 *
                </label>
                <select
                  required
                  value={formData.player1_id}
                  onChange={(e) => setFormData({...formData, player1_id: e.target.value})}
                  className="input"
                >
                  <option value="">Select Player 1</option>
                  {players.map(player => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Player 2 *
                </label>
                <select
                  required
                  value={formData.player2_id}
                  onChange={(e) => setFormData({...formData, player2_id: e.target.value})}
                  className="input"
                >
                  <option value="">Select Player 2</option>
                  {players.filter(p => p.id !== formData.player1_id).map(player => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Match Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={formData.match_date}
                  onChange={(e) => setFormData({...formData, match_date: e.target.value})}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Player 1 Score
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.player1_score}
                    onChange={(e) => setFormData({...formData, player1_score: e.target.value})}
                    className="input"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Player 2 Score
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.player2_score}
                    onChange={(e) => setFormData({...formData, player2_score: e.target.value})}
                    className="input"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
            <div className="flex space-x-3">
              <button type="submit" className="btn btn-success">
                {editingMatch ? 'Update' : 'Schedule'} Match
              </button>
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <Clock size={20} className="mr-2" />
            Upcoming Matches ({upcomingMatches.length})
          </h3>
          <div className="space-y-3">
            {upcomingMatches.map((match) => (
              <div key={match.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800">
                      {match.player1_name} vs {match.player2_name}
                    </p>
                    {match.match_date && (
                      <p className="text-sm text-gray-600">
                        {new Date(match.match_date).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    {getStatusBadge(match.status)}
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleEdit(match)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleCompleteMatch(match.id)}
                          className="text-green-600 hover:text-green-800"
                          title="Complete Match"
                        >
                          <Check size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {upcomingMatches.length === 0 && (
              <p className="text-gray-500 text-center py-4">No upcoming matches scheduled</p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <Trophy size={20} className="mr-2" />
            Recent Results ({completedMatches.length})
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {completedMatches.slice(0, 10).map((match) => (
              <div key={match.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800">
                      {match.player1_name} vs {match.player2_name}
                    </p>
                    <p className="text-sm font-medium text-gray-700">
                      {match.player1_score} - {match.player2_score}
                    </p>
                    {match.match_date && (
                      <p className="text-xs text-gray-500">
                        {new Date(match.match_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {getStatusBadge(match.status)}
                    {match.winner_name && (
                      <p className="text-sm font-medium text-green-600 mt-1">
                        Winner: {match.winner_name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {completedMatches.length === 0 && (
              <p className="text-gray-500 text-center py-4">No completed matches yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Matches;
