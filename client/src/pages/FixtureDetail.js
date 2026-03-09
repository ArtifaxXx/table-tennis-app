import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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
    if (!isAdmin) return;
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
    if (!isAdmin) return;
    try {
      await axios.put(`/api/fixtures/${id}/games/${gameNumber}/sets`, { sets });
      await refresh();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const renderLineupSelect = (side, roster, selection, setSelection) => {
    const rosterPlayers = roster.slice().sort((a, b) => a.slot - b.slot);

    return (
      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-800">{side === 'home' ? 'Home' : 'Away'} lineup</h3>
          {isAdmin && <button className="btn btn-success" onClick={() => saveLineup(side)}>Save</button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((idx) => (
            <div key={idx}>
              <label className="block text-sm text-gray-600 mb-1">Playing (pick 3)</label>
              <select
                className="input"
                value={selection[idx]}
                onChange={(e) => {
                  const next = [...selection];
                  next[idx] = e.target.value;
                  setSelection(next);
                }}
                disabled={!isAdmin}
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
          Day order is enforced automatically by roster slot (mains first, subs last).
        </div>
      </div>
    );
  };

  if (loading) return <div className="text-center py-8">Loading fixture...</div>;
  if (!fixture) return <div className="text-center py-8">Fixture not found</div>;

  const games = fixture.games || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Fixture</h2>
          <div className="text-gray-600">
            {fixture.home_team_name} vs {fixture.away_team_name}
          </div>
          <div className="text-sm text-gray-500">
            {fixture.match_date ? new Date(fixture.match_date).toLocaleString() : 'No date'}
          </div>
        </div>
        <div className="text-right">
          <Link className="btn btn-secondary" to="/fixtures">Back</Link>
          <div className="mt-2 font-medium">
            {fixture.status !== 'scheduled' ? `${fixture.home_games_won}-${fixture.away_games_won}` : '-'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderLineupSelect('home', homeRoster, homeSelection, setHomeSelection)}
        {renderLineupSelect('away', awayRoster, awaySelection, setAwaySelection)}
      </div>

      <div className="card">
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
              onSave={(sets) => updateGameSets(g.game_number, sets)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const GameCard = ({ game, onSave }) => {
  const { isAdmin } = useAuth();
  const [sets, setSets] = useState(() => {
    if (Array.isArray(game.sets) && game.sets.length > 0) {
      return game.sets.map((s) => ({ home_points: s.home_points, away_points: s.away_points }));
    }
    return [emptySet(), emptySet(), emptySet()];
  });

  useEffect(() => {
    if (Array.isArray(game.sets) && game.sets.length > 0) {
      setSets(game.sets.map((s) => ({ home_points: s.home_points, away_points: s.away_points })));
    }
  }, [game.id, game.sets]);

  const title = () => {
    if (game.game_type === 'singles') {
      return `${game.home_player_a_name} vs ${game.away_player_a_name}`;
    }
    return `${game.home_player_a_name} / ${game.home_player_b_name} vs ${game.away_player_a_name} / ${game.away_player_b_name}`;
  };

  const addSet = () => {
    if (!isAdmin) return;
    if (sets.length >= 5) return;
    setSets([...sets, emptySet()]);
  };

  const removeSet = () => {
    if (!isAdmin) return;
    if (sets.length <= 3) return;
    setSets(sets.slice(0, sets.length - 1));
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
        {isAdmin && <button className="btn btn-success" onClick={() => onSave(sets)}>Save Sets</button>}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        {sets.map((s, idx) => (
          <div key={idx} className="bg-gray-50 rounded p-2">
            <div className="text-xs text-gray-500 mb-1">Set {idx + 1}</div>
            <div className="flex gap-2">
              <input
                className="input"
                type="number"
                min="0"
                value={s.home_points}
                disabled={!isAdmin}
                onChange={(e) => {
                  const next = [...sets];
                  next[idx] = { ...next[idx], home_points: parseInt(e.target.value || '0', 10) };
                  setSets(next);
                }}
              />
              <input
                className="input"
                type="number"
                min="0"
                value={s.away_points}
                disabled={!isAdmin}
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

      {isAdmin && (
        <div className="mt-3 flex gap-2">
          <button className="btn btn-secondary" onClick={addSet} disabled={sets.length >= 5}>+ Set</button>
          <button className="btn btn-secondary" onClick={removeSet} disabled={sets.length <= 3}>- Set</button>
        </div>
      )}
    </div>
  );
};

export default FixtureDetail;
