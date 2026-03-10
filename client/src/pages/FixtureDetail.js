import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const emptySet = () => ({ home_points: 0, away_points: 0 });

const FixtureDetail = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { id } = useParams();
  const [fixture, setFixture] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [homeSelection, setHomeSelection] = useState(['', '', '']);
  const [awaySelection, setAwaySelection] = useState(['', '', '']);

  const canEdit = !!isAdmin && fixture?.season_status === 'active';

  const homeRoster = useMemo(() => {
    if (!fixture) return [];
    const team = teams.find((t) => t.id === fixture.home_team_id);
    return team?.roster || [];
  }, [teams, fixture]);

  const awayRoster = useMemo(() => {
    if (!fixture) return [];
    const team = teams.find((t) => t.id === fixture.away_team_id);
    return team?.roster || [];
  }, [teams, fixture]);

  const refresh = useCallback(async () => {
    const [f, t] = await Promise.all([
      axios.get(`/api/fixtures/${id}`),
      axios.get('/api/teams', { params: { includeInactive: 1 } }),
    ]);

    setFixture(f.data);
    setTeams(t.data);

    const homeLineup = (f.data.lineups || []).filter((l) => l.side === 'home').sort((a, b) => a.day_rank - b.day_rank);
    const awayLineup = (f.data.lineups || []).filter((l) => l.side === 'away').sort((a, b) => a.day_rank - b.day_rank);
    if (homeLineup.length === 3) setHomeSelection(homeLineup.map((x) => x.player_id));
    if (awayLineup.length === 3) setAwaySelection(awayLineup.map((x) => x.player_id));
  }, [id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        console.error(e);
        toast.error(e?.response?.data?.error || e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refresh, toast]);

  const saveLineup = async (side) => {
    if (!canEdit) return;
    const playerIds = side === 'home' ? homeSelection : awaySelection;
    try {
      await axios.put(`/api/fixtures/${id}/lineups/${side}`, { playerIds });
      await refresh();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const updateGameSets = async (gameNumber, sets) => {
    if (!canEdit) return;
    try {
      await axios.put(`/api/fixtures/${id}/games/${gameNumber}/sets`, { sets });
      await refresh();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const designationByPlayerId = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < homeSelection.length; i++) {
      const pid = homeSelection[i];
      if (pid) m.set(pid, `H${i + 1}`);
    }
    for (let i = 0; i < awaySelection.length; i++) {
      const pid = awaySelection[i];
      if (pid) m.set(pid, `A${i + 1}`);
    }
    return m;
  }, [homeSelection, awaySelection]);

  const formatPlayerWithDesignation = useCallback(
    (playerId, playerName) => {
      const d = designationByPlayerId.get(playerId);
      return d ? `${d} ${playerName}` : playerName;
    },
    [designationByPlayerId]
  );

  const renderLineupSelect = (side, roster, selection, setSelection) => {
    const rosterPlayers = roster.slice().sort((a, b) => a.slot - b.slot);
    const prefix = side === 'home' ? 'H' : 'A';

    return (
      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-800">{side === 'home' ? 'Home' : 'Away'} lineup</h3>
          {canEdit && <button className="btn btn-success" onClick={() => saveLineup(side)}>Save</button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((idx) => (
            <div key={idx}>
              <label className="block text-sm text-gray-600 mb-1">{prefix}{idx + 1}</label>
              <select
                className="input"
                value={selection[idx]}
                onChange={(e) => {
                  const next = [...selection];
                  next[idx] = e.target.value;
                  setSelection(next);
                }}
                disabled={!canEdit}
              >
                <option value="">Select player</option>
                {rosterPlayers.map((p) => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.player_name} (slot {p.slot})
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-500 mt-2">
          Lineup order should follow roster slot (mains first, subs last). Incorrect ordering will be flagged as a violation.
        </div>
      </Card>
    );
  };

  if (loading) return <div className="text-center py-8">Loading fixture...</div>;
  if (!fixture) return <div className="text-center py-8">Fixture not found</div>;

  const games = fixture.games || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixture"
        subtitle={
          <>
            <div className="text-gray-600">
              {fixture.home_team_name} vs {fixture.away_team_name}
            </div>
            <div className="text-sm text-gray-500">
              {fixture.match_date ? new Date(fixture.match_date).toLocaleString() : 'No date'}
            </div>
          </>
        }
        right={
          <div className="flex items-center gap-3">
            <div className="font-medium">
              {fixture.status !== 'scheduled' ? `${fixture.home_games_won}-${fixture.away_games_won}` : '-'}
            </div>
            <Link className="btn btn-secondary" to="/fixtures">Back</Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderLineupSelect('home', homeRoster, homeSelection, setHomeSelection)}
        {renderLineupSelect('away', awayRoster, awaySelection, setAwaySelection)}
      </div>

      <Card>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">9 games (best of 5)</h3>
        {games.length === 0 && (
          <div className="text-gray-500">
            Games will be generated once both lineups are saved.
          </div>
        )}

        <div className="space-y-4">
          {games.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              canEdit={canEdit}
              formatPlayerWithDesignation={formatPlayerWithDesignation}
              onSave={(sets) => updateGameSets(g.game_number, sets)}
            />
          ))}
        </div>
      </Card>
    </div>
  );
};

const GameCard = ({ game, canEdit, onSave, formatPlayerWithDesignation }) => {
  const [sets, setSets] = useState(() => {
    const base = Array.isArray(game.sets) && game.sets.length > 0
      ? game.sets.map((s) => ({ home_points: s.home_points, away_points: s.away_points }))
      : [];
    while (base.length < 5) base.push(emptySet());
    return base.slice(0, 5);
  });

  useEffect(() => {
    if (Array.isArray(game.sets) && game.sets.length > 0) {
      const next = game.sets.map((s) => ({ home_points: s.home_points, away_points: s.away_points }));
      while (next.length < 5) next.push(emptySet());
      setSets(next.slice(0, 5));
    }
  }, [game.id, game.sets]);

  const title = () => {
    if (game.game_type === 'singles') {
      return `${formatPlayerWithDesignation(game.home_player_a_id, game.home_player_a_name)} vs ${formatPlayerWithDesignation(game.away_player_a_id, game.away_player_a_name)}`;
    }
    return `${formatPlayerWithDesignation(game.home_player_a_id, game.home_player_a_name)} / ${formatPlayerWithDesignation(game.home_player_b_id, game.home_player_b_name)} vs ${formatPlayerWithDesignation(game.away_player_a_id, game.away_player_a_name)} / ${formatPlayerWithDesignation(game.away_player_b_id, game.away_player_b_name)}`;
  };

  const decision = useMemo(() => {
    let homeWins = 0;
    let awayWins = 0;
    let decidedAfterIndex = null;

    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      const h = Number(s?.home_points) || 0;
      const a = Number(s?.away_points) || 0;
      if (h === 0 && a === 0) continue;
      if (h === a) continue;
      if (h > a) homeWins++;
      if (a > h) awayWins++;
      if (homeWins === 3 || awayWins === 3) {
        decidedAfterIndex = i;
        break;
      }
    }

    return { homeWins, awayWins, decidedAfterIndex };
  }, [sets]);

  const isSetLocked = (idx) => {
    if (decision.decidedAfterIndex == null) return false;
    return idx > decision.decidedAfterIndex;
  };

  const setSideClasses = (homePoints, awayPoints) => {
    const h = Number(homePoints) || 0;
    const a = Number(awayPoints) || 0;
    if (h === 0 && a === 0) {
      return { home: 'bg-white', away: 'bg-white' };
    }
    if (h === a) {
      return { home: 'bg-white', away: 'bg-white' };
    }
    const homeWins = h > a;
    return {
      home: homeWins ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900',
      away: homeWins ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900',
    };
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-gray-500">Game {game.game_number} ({game.game_type})</div>
          <div className="font-medium text-gray-800">{title()}</div>
          <div className="text-sm text-gray-600">
            Sets: {game.home_sets_won}-{game.away_sets_won}
            {game.winner_side ? ` (winner: ${game.winner_side})` : ''}
          </div>
        </div>
        {canEdit && <button className="btn btn-success" onClick={() => onSave(sets)}>Save Sets</button>}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        {sets.map((s, idx) => (
          <div key={idx} className={`rounded p-2 ${isSetLocked(idx) ? 'bg-gray-100 opacity-60' : 'bg-gray-50'}`}>
            <div className="text-xs text-gray-500 mb-1">Set {idx + 1}</div>
            <div className="grid grid-rows-2 gap-2">
              <input
                className={`input border ${setSideClasses(s.home_points, s.away_points).home}`}
                type="number"
                min="0"
                value={s.home_points}
                disabled={!canEdit || isSetLocked(idx)}
                onChange={(e) => {
                  const next = [...sets];
                  next[idx] = { ...next[idx], home_points: parseInt(e.target.value || '0', 10) };
                  setSets(next);
                }}
              />
              <input
                className={`input border ${setSideClasses(s.home_points, s.away_points).away}`}
                type="number"
                min="0"
                value={s.away_points}
                disabled={!canEdit || isSetLocked(idx)}
                onChange={(e) => {
                  const next = [...sets];
                  next[idx] = { ...next[idx], away_points: parseInt(e.target.value || '0', 10) };
                  setSets(next);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FixtureDetail;
