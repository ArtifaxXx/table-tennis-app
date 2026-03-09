import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Award, Users } from 'lucide-react';
import axios from 'axios';

const Standings = () => {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStandings();
  }, []);

  const fetchStandings = async () => {
    try {
      const response = await axios.get('/api/standings');
      setStandings(response.data);
    } catch (error) {
      console.error('Error fetching standings:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="text-yellow-500" size={24} />;
    if (rank === 2) return <Medal className="text-gray-400" size={24} />;
    if (rank === 3) return <Award className="text-orange-600" size={24} />;
    return <span className="text-lg font-bold text-gray-600">#{rank}</span>;
  };

  const getRankBadge = (rank) => {
    const badges = {
      1: 'bg-yellow-100 text-yellow-800',
      2: 'bg-gray-100 text-gray-800',
      3: 'bg-orange-100 text-orange-800'
    };
    return badges[rank] || 'bg-blue-100 text-blue-800';
  };

  if (loading) {
    return <div className="text-center py-8">Loading standings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">League Standings</h2>
        <div className="flex items-center space-x-2 text-gray-600">
          <Users size={20} />
          <span>{standings.length} Active Players</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {standings.slice(0, 3).map((player, index) => (
          <div key={player.id} className={`card text-center ${index === 0 ? 'ring-2 ring-yellow-400' : ''}`}>
            <div className="flex justify-center mb-4">
              {getRankIcon(player.rank)}
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">{player.name}</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Points:</span>
                <span className="font-bold">{player.points}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Record:</span>
                <span className="font-medium">{player.wins}W - {player.losses}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Win Rate:</span>
                <span className="font-medium">{player.win_percentage}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Full Standings</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Matches</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Points</th>
                <th>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((player) => (
                <tr key={player.id} className={player.rank <= 3 ? 'bg-gray-50' : ''}>
                  <td>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${getRankBadge(player.rank)}`}>
                        #{player.rank}
                      </span>
                      {player.rank <= 3 && getRankIcon(player.rank)}
                    </div>
                  </td>
                  <td className="font-medium">{player.name}</td>
                  <td>{player.matches_played}</td>
                  <td className="text-green-600 font-medium">{player.wins}</td>
                  <td className="text-red-600 font-medium">{player.losses}</td>
                  <td className="font-bold text-blue-600">{player.points}</td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{player.win_percentage}%</span>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${player.win_percentage}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {standings.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No standings data available. Complete some matches to see standings.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card text-center">
          <h4 className="font-semibold text-gray-700 mb-2">Total Matches</h4>
          <p className="text-2xl font-bold text-blue-600">
            {standings.reduce((sum, player) => sum + player.matches_played, 0)}
          </p>
        </div>
        <div className="card text-center">
          <h4 className="font-semibold text-gray-700 mb-2">Total Wins</h4>
          <p className="text-2xl font-bold text-green-600">
            {standings.reduce((sum, player) => sum + player.wins, 0)}
          </p>
        </div>
        <div className="card text-center">
          <h4 className="font-semibold text-gray-700 mb-2">Average Win Rate</h4>
          <p className="text-2xl font-bold text-purple-600">
            {standings.length > 0 
              ? (standings.reduce((sum, player) => sum + parseFloat(player.win_percentage), 0) / standings.length).toFixed(1)
              : 0}%
          </p>
        </div>
        <div className="card text-center">
          <h4 className="font-semibold text-gray-700 mb-2">Active Players</h4>
          <p className="text-2xl font-bold text-orange-600">{standings.length}</p>
        </div>
      </div>
    </div>
  );
};

export default Standings;
