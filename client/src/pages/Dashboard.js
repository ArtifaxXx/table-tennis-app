import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Users, Calendar, Trophy } from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);

  const fetchStats = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const response = await axios.get('/api/dashboard', {
        params: {},
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchStats();

    const onFocus = () => fetchStats();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchStats]);

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>;
  }

  if (!stats) {
    return <div className="text-center py-8">No dashboard data</div>;
  }

  const statCards = [
    {
      title: 'Teams',
      value: stats.totalTeams,
      icon: Users,
      color: 'bg-blue-500',
      scope: 'Global',
      to: '/teams'
    },
    {
      title: 'Players',
      value: stats.totalPlayers,
      icon: Users,
      color: 'bg-indigo-500',
      scope: 'Global',
      to: '/players'
    },
    {
      title: 'Completed Fixtures',
      value: stats.completedFixtures,
      icon: Trophy,
      color: 'bg-green-500',
      scope: 'Current season/division',
      to: '/fixtures'
    },
    {
      title: 'Scheduled Fixtures',
      value: stats.scheduledFixtures,
      icon: Calendar,
      color: 'bg-yellow-500',
      scope: 'Current season/division',
      to: '/fixtures'
    }
  ];

  const seasonLabel = (() => {
    const s = stats.currentSeason;
    if (!s) return null;
    if (s.status === 'active') return `Season ${s.name} - Active`;
    if (s.status === 'ready') return `Season ${s.name} - Ready`;
    if (s.status === 'concluded') return `Season ${s.name} concluded`;
    return `Season ${s.name} - ${s.status}`;
  })();

  const completenessBadge = (c) => {
    const styles = {
      complete: 'bg-green-50 text-green-800 border-green-200',
      missing_lineups: 'bg-gray-50 text-gray-700 border-gray-200',
      missing_games: 'bg-gray-50 text-gray-700 border-gray-200',
      missing_sets: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    const labels = {
      complete: 'Complete',
      missing_lineups: 'Lineups',
      missing_games: 'Games',
      missing_sets: 'Sets',
    };
    if (!c) return null;
    return (
      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full border ${styles[c] || styles.missing_lineups}`}>
        {labels[c] || c}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="League Dashboard"
        subtitle={seasonLabel ? seasonLabel : null}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          const Wrap = card.to ? Link : React.Fragment;
          const wrapProps = card.to ? { to: card.to, className: 'block' } : {};
          return (
            <Wrap key={index} {...wrapProps}>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{card.title}</p>
                    <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{card.scope}</p>
                  </div>
                  <div className={`p-3 rounded-full ${card.color}`}>
                    <Icon className="text-white" size={24} />
                  </div>
                </div>
              </Card>
            </Wrap>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Upcoming Fixtures</h3>
            <div className="text-xs text-gray-500">Current season/division</div>
          </div>
          <Link className="text-sm text-blue-600 hover:text-blue-800" to="/fixtures">View all</Link>
        </div>

        {(stats.upcomingFixtures || []).length > 0 ? (
          <div className="space-y-2">
            {(stats.upcomingFixtures || []).map((f) => (
              <Link
                key={f.id}
                to={`/fixtures/${f.id}`}
                className="block rounded border hover:bg-gray-50 px-3 py-2"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="font-medium text-gray-800">
                    {f.home_team_name} vs {f.away_team_name}
                  </div>
                  <div className="text-sm text-gray-600 whitespace-nowrap">
                    {f.match_date ? new Date(f.match_date).toLocaleString() : 'No date'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-gray-500">No upcoming fixtures scheduled.</div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Recent Fixtures</h3>
              <div className="text-xs text-gray-500">Current season/division</div>
            </div>
            <Link className="text-sm text-blue-600 hover:text-blue-800" to="/fixtures">View all</Link>
          </div>
          <div className="space-y-3">
            {stats.recentFixtures?.map((match, index) => (
              <Link
                key={index}
                to={`/fixtures/${match.id}`}
                className="flex justify-between items-center py-2 border-b hover:bg-gray-50 rounded px-2 -mx-2"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {match.home_team_name} vs {match.away_team_name}
                    {completenessBadge(match.completeness_status)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-800">
                    {match.home_games_won} - {match.away_games_won}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(match.match_date).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
            {(!stats.recentFixtures || stats.recentFixtures.length === 0) && (
              <p className="text-gray-500 text-center py-4">No completed fixtures yet</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Top Teams</h3>
              <div className="text-xs text-gray-500">Current season/division</div>
            </div>
            <Link className="text-sm text-blue-600 hover:text-blue-800" to="/team-standings">View all</Link>
          </div>
          <div className="space-y-3">
            {stats.topTeams?.map((team, index) => (
              <div key={index} className="flex justify-between items-center py-2 border-b">
                <div>
                  <p className="font-medium text-gray-800">{team.team_name}</p>
                  <p className="text-sm text-gray-600">
                    {team.wins}W / {team.losses}L
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-blue-600">{team.games_won}</p>
                  <p className="text-xs text-gray-500">Games Won</p>
                </div>
              </div>
            ))}
            {(!stats.topTeams || stats.topTeams.length === 0) && (
              <p className="text-gray-500 text-center py-4">No standings yet</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Player Rankings (Singles)</h3>
            <div className="text-xs text-gray-500">
              Current season/division: <span className="font-medium">{stats.currentSeason?.name || 'N/A'}</span>
              {stats.currentDivision?.name ? (
                <>
                  {' '}· <span className="font-medium">{stats.currentDivision.name}</span>
                </>
              ) : null}
            </div>
          </div>
          <Link className="text-sm text-blue-600 hover:text-blue-800" to="/player-rankings">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {(stats.topPlayers || []).map((p) => (
            <div key={p.player_id} className="flex justify-between items-center py-2 border-b">
              <div className="flex items-center gap-3">
                <span className="w-8 text-sm font-medium text-gray-700">#{p.rank}</span>
                <span className="font-medium text-gray-800">{p.player_name}</span>
              </div>
              <div className="text-sm text-gray-700">
                {p.singles_wins} W
              </div>
            </div>
          ))}
          {(!stats.topPlayers || stats.topPlayers.length === 0) && (
            <div className="text-gray-500 text-center py-4">No singles results yet</div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
