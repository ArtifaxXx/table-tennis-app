import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Calendar, Trophy } from 'lucide-react';
import axios from 'axios';

const Statistics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/statistics');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (loading) {
    return <div className="text-center py-8">Loading statistics...</div>;
  }

  const winRateData = stats.topPerformers?.map(player => ({
    name: player.name,
    winRate: parseFloat(player.win_rate),
    matches: player.matches_played
  })) || [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">League Statistics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Players</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalPlayers}</p>
            </div>
            <Users className="text-blue-500" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed Matches</p>
              <p className="text-2xl font-bold text-green-600">{stats.totalMatches}</p>
            </div>
            <Calendar className="text-green-500" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Upcoming Matches</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.upcomingMatches}</p>
            </div>
            <Trophy className="text-yellow-500" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Matches/Player</p>
              <p className="text-2xl font-bold text-purple-600">
                {stats.totalPlayers > 0 ? (stats.totalMatches * 2 / stats.totalPlayers).toFixed(1) : 0}
              </p>
            </div>
            <TrendingUp className="text-purple-500" size={32} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Performers Win Rates</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={winRateData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value) => [`${value}%`, 'Win Rate']} />
              <Bar dataKey="winRate" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Detailed Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Player Performance</h4>
            <div className="space-y-2">
              {stats.topPerformers?.map((player, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-800">{player.name}</p>
                    <p className="text-sm text-gray-600">{player.matches_played} matches</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">{player.win_rate}%</p>
                    <p className="text-sm text-gray-600">{player.wins}W - {player.matches_played - player.wins}L</p>
                  </div>
                </div>
              ))}
              {(!stats.topPerformers || stats.topPerformers.length === 0) && (
                <p className="text-gray-500 text-center py-4">Not enough data available</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-700 mb-3">Recent Match Activity</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {stats.recentActivity?.map((match, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">
                      {match.player1_name} vs {match.player2_name}
                    </p>
                    <p className="text-xs text-gray-600">
                      {new Date(match.match_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">{match.player1_score} - {match.player2_score}</p>
                    <p className="text-xs text-green-600">{match.winner_name}</p>
                  </div>
                </div>
              ))}
              {(!stats.recentActivity || stats.recentActivity.length === 0) && (
                <p className="text-gray-500 text-center py-4">No recent matches</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">League Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded">
            <h4 className="font-medium text-green-800">Highest Win Rate</h4>
            <p className="text-2xl font-bold text-green-600 mt-2">
              {winRateData.length > 0 
                ? `${winRateData[0].winRate}%`
                : 'N/A'}
            </p>
            <p className="text-sm text-green-700">
              {winRateData.length > 0 ? winRateData[0].name : ''}
            </p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded">
            <h4 className="font-medium text-purple-800">Match Completion Rate</h4>
            <p className="text-2xl font-bold text-purple-600 mt-2">
              {stats.totalMatches > 0 
                ? `${((stats.totalMatches / (stats.totalMatches + stats.upcomingMatches)) * 100).toFixed(1)}%`
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
