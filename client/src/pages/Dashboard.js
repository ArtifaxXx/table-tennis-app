import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Users, Calendar, Trophy } from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useDivisionContext } from '../context/DivisionContext';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import DivisionSelector from '../components/DivisionSelector';
import { VIOLATION_TOOLTIP_TEXT } from '../utils/violationTooltipText';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [performanceTab, setPerformanceTab] = useState('teams');
  const [adminStats, setAdminStats] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const inFlightRef = useRef(false);
  const globalInFlightRef = useRef(false);
  const { selectedSeasonId, selectedDivisionId } = useDivisionContext();
  const { isAdmin } = useAuth();

  const fetchStats = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const response = await axios.get('/api/dashboard', {
        params: {
          ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
          ...(selectedDivisionId ? { divisionId: selectedDivisionId } : {}),
        },
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [selectedDivisionId, selectedSeasonId]);

  const fetchGlobalStats = useCallback(async () => {
    if (globalInFlightRef.current) return;
    globalInFlightRef.current = true;
    try {
      const response = await axios.get('/api/dashboard', {
        params: {
          ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
          divisionId: 'all',
        },
      });
      setGlobalStats(response.data);
    } catch (error) {
      console.error('Error fetching global statistics:', error);
    } finally {
      globalInFlightRef.current = false;
    }
  }, [selectedSeasonId]);

  const fetchAdminStats = useCallback(async () => {
    if (!isAdmin) {
      setAdminStats(null);
      return;
    }

    setAdminLoading(true);
    try {
      const response = await axios.get('/api/fixtures', {
        params: {
          ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
          ...(selectedDivisionId ? { divisionId: selectedDivisionId } : {}),
        },
      });
      const fixtures = response.data || [];
      const remainingFixtures = fixtures.filter((f) => f.status !== 'completed');

      const unplayedByTeam = new Map();
      const bumpTeam = (teamId, teamName) => {
        if (!teamId) return;
        const next = unplayedByTeam.get(teamId) || { team_id: teamId, team_name: teamName, count: 0 };
        next.count += 1;
        unplayedByTeam.set(teamId, next);
      };
      remainingFixtures.forEach((fixture) => {
        bumpTeam(fixture.home_team_id, fixture.home_team_name);
        bumpTeam(fixture.away_team_id, fixture.away_team_name);
      });
      const unplayedTeams = Array.from(unplayedByTeam.values())
        .sort((a, b) => (b.count - a.count) || a.team_name.localeCompare(b.team_name))
        .slice(0, 5);

      const validationIssues = fixtures
        .filter((f) => f.status === 'completed' && f.completeness_status && f.completeness_status !== 'complete')
        .sort((a, b) => {
          const ad = new Date(a.match_date || a.updated_at || 0).getTime();
          const bd = new Date(b.match_date || b.updated_at || 0).getTime();
          return bd - ad;
        })
        .slice(0, 5);

      setAdminStats({
        unplayedTeams,
        validationIssues,
      });
    } catch (error) {
      console.error('Error fetching admin statistics:', error);
      setAdminStats({
        unplayedTeams: [],
        validationIssues: [],
      });
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin, selectedDivisionId, selectedSeasonId]);

  useEffect(() => {
    fetchStats();
    fetchGlobalStats();
    fetchAdminStats();

    const onFocus = () => {
      fetchStats();
      fetchGlobalStats();
      fetchAdminStats();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchStats, fetchGlobalStats, fetchAdminStats]);

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>;
  }

  if (!stats) {
    return <div className="text-center py-8">No dashboard data</div>;
  }

  const global = globalStats || stats;
  const globalSeasonLabel = global?.currentSeason?.name ? `Season ${global.currentSeason.name}` : 'Current season';
  const globalDivisionLabel = global?.currentDivision?.name ? `${global.currentDivision.name} division` : 'All divisions';
  const globalFixtureMeta = `${globalSeasonLabel} · ${globalDivisionLabel}`;

  const performanceSeasonLabel = stats.currentSeason?.name ? `Season ${stats.currentSeason.name}` : 'Current season';
  const performanceDivisionLabel = stats.currentDivision?.name ? `${stats.currentDivision.name} division` : 'All divisions';
  const performanceMeta = `${performanceSeasonLabel} · ${performanceDivisionLabel}`;
  const performanceLink = performanceTab === 'teams' ? '/team-standings' : '/player-rankings';

  const statCards = [
    {
      title: 'Teams',
      value: global?.totalTeams ?? 0,
      icon: Users,
      color: 'bg-blue-500',
      scope: 'League total',
      to: '/teams'
    },
    {
      title: 'Players',
      value: global?.totalPlayers ?? 0,
      icon: Users,
      color: 'bg-indigo-500',
      scope: 'League total',
      to: '/players'
    },
    {
      title: 'Completed Fixtures',
      value: global?.completedFixtures ?? 0,
      icon: Trophy,
      color: 'bg-green-500',
      scope: globalFixtureMeta,
      to: '/fixtures'
    },
    {
      title: 'Scheduled Fixtures',
      value: global?.scheduledFixtures ?? 0,
      icon: Calendar,
      color: 'bg-yellow-500',
      scope: globalFixtureMeta,
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
      violation: 'bg-red-50 text-red-800 border-red-200',
      missing_lineups: 'bg-gray-50 text-gray-700 border-gray-200',
      missing_games: 'bg-gray-50 text-gray-700 border-gray-200',
      missing_sets: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    const labels = {
      complete: 'Correct',
      violation: 'Violation',
      missing_lineups: 'Lineups',
      missing_games: 'Games',
      missing_sets: 'Sets',
    };
    if (!c) return null;

    const tooltipText = c === 'violation' ? VIOLATION_TOOLTIP_TEXT : null;

    const badge = (
      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full border ${styles[c] || styles.missing_lineups}`}>
        {labels[c] || c}
      </span>
    );

    if (!tooltipText) return badge;

    return (
      <span className="relative inline-block group">
        {badge}
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2 whitespace-normal break-words rounded-md bg-gray-700 px-2 py-1 text-left text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {tooltipText}
        </span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="League Dashboard"
        subtitle={seasonLabel ? seasonLabel : null}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          const Wrap = card.to ? Link : React.Fragment;
          const wrapProps = card.to ? { to: card.to, className: 'block' } : {};
          return (
            <Wrap key={index} {...wrapProps}>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">{card.title}</p>
                    <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{card.scope}</p>
                  </div>
                  <div className={`p-3 rounded-full ${card.color}`}>
                    <Icon className="text-white" size={22} />
                  </div>
                </div>
              </Card>
            </Wrap>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Division scope</div>
          <div className="text-sm font-semibold text-gray-800">{performanceMeta}</div>
        </div>
        <DivisionSelector />
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Current season results</h3>
            <div className="text-xs text-gray-500">Top 5 standings and rankings</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                className={`px-3 py-1 text-sm rounded-md ${performanceTab === 'teams' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setPerformanceTab('teams')}
              >
                Team standings
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-sm rounded-md ${performanceTab === 'players' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setPerformanceTab('players')}
              >
                Player rankings
              </button>
            </div>
            <Link className="text-sm text-blue-600 hover:text-blue-800" to={performanceLink}>
              View all
            </Link>
          </div>
        </div>

        <Card>
          {performanceTab === 'teams' ? (
            <div className="space-y-2">
              {(stats.topTeams || []).map((team, index) => (
                <Link
                  key={team.team_id || index}
                  to="/team-standings"
                  className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 hover:bg-gray-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-7 text-sm font-semibold text-gray-600">#{team.rank || index + 1}</span>
                      <span className="font-medium text-gray-800">{team.team_name}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {team.wins}W / {team.losses}L · Games {team.games_won}-{team.games_lost}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Games diff</div>
                    <div className="text-sm font-semibold text-gray-800">{team.games_won - team.games_lost}</div>
                  </div>
                </Link>
              ))}
              {(!stats.topTeams || stats.topTeams.length === 0) && (
                <div className="text-gray-500 text-center py-4">No standings yet</div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {(stats.topPlayers || []).map((player, index) => (
                <Link
                  key={player.player_id || index}
                  to="/player-rankings"
                  className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 text-sm font-semibold text-gray-600">#{player.rank || index + 1}</span>
                    <span className="font-medium text-gray-800">{player.player_name}</span>
                  </div>
                  <div className="text-sm text-gray-700">{player.singles_wins} W</div>
                </Link>
              ))}
              {(!stats.topPlayers || stats.topPlayers.length === 0) && (
                <div className="text-gray-500 text-center py-4">No singles results yet</div>
              )}
            </div>
          )}
        </Card>
      </div>

      {isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Admin Insights</h3>
              <div className="text-xs text-gray-500">Top 5 · {performanceMeta}</div>
            </div>
            <Link className="text-sm text-blue-600 hover:text-blue-800" to="/fixtures">
              Go to fixtures
            </Link>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Most unplayed fixtures</div>
                  <div className="text-xs text-gray-500">Teams with highest remaining load</div>
                </div>
                <Link className="text-xs text-blue-600 hover:text-blue-800" to="/fixtures">
                  View
                </Link>
              </div>
              {adminLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : (
                <div className="space-y-2">
                  {(adminStats?.unplayedTeams || []).map((team) => (
                    <Link
                      key={team.team_id}
                      to="/fixtures"
                      className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-800">{team.team_name}</span>
                      <span className="text-sm text-gray-600">{team.count}</span>
                    </Link>
                  ))}
                  {(!adminStats?.unplayedTeams || adminStats.unplayedTeams.length === 0) && (
                    <div className="text-sm text-gray-500">No remaining fixtures found.</div>
                  )}
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Validation issues</div>
                  <div className="text-xs text-gray-500">Completed fixtures needing review</div>
                </div>
                <Link className="text-xs text-blue-600 hover:text-blue-800" to="/fixtures">
                  View
                </Link>
              </div>
              {adminLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : (
                <div className="space-y-2">
                  {(adminStats?.validationIssues || []).map((fixture) => (
                    <Link
                      key={fixture.id}
                      to={`/fixtures/${fixture.id}`}
                      className="block rounded border border-gray-100 px-3 py-2 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {fixture.home_team_name} vs {fixture.away_team_name}
                        </span>
                        {completenessBadge(fixture.completeness_status)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {fixture.match_date ? new Date(fixture.match_date).toLocaleDateString() : 'No date'}
                      </div>
                    </Link>
                  ))}
                  {(!adminStats?.validationIssues || adminStats.validationIssues.length === 0) && (
                    <div className="text-sm text-gray-500">No validation issues found.</div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
