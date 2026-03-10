import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import { VIOLATION_TOOLTIP_TEXT } from '../utils/violationTooltipText';

const emptySet = () => ({ home_points: 0, away_points: 0 });
const emptySets5 = () => [emptySet(), emptySet(), emptySet(), emptySet(), emptySet()];

const winnerSideFromSets = (sets) => {
  if (!Array.isArray(sets)) return null;
  let homeWins = 0;
  let awayWins = 0;
  for (const s of sets) {
    const h = Number(s?.home_points) || 0;
    const a = Number(s?.away_points) || 0;
    if (h === 0 && a === 0) continue;
    if (h === a) continue;
    if (h > a) homeWins++;
    if (a > h) awayWins++;
    if (homeWins === 3) return 'home';
    if (awayWins === 3) return 'away';
  }
  return null;
};

const FixtureDetail = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { id } = useParams();
  const [fixture, setFixture] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [homeSelection, setHomeSelection] = useState(['', '', '']);
  const [awaySelection, setAwaySelection] = useState(['', '', '']);
  const [editedSetsByGameNumber, setEditedSetsByGameNumber] = useState({});

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

    const byNumber = {};
    for (let n = 1; n <= 9; n++) {
      byNumber[n] = emptySets5();
    }
    for (const g of f.data.games || []) {
      const base = Array.isArray(g.sets) && g.sets.length > 0
        ? g.sets.map((s) => ({ home_points: s.home_points, away_points: s.away_points }))
        : [];
      while (base.length < 5) base.push(emptySet());
      byNumber[g.game_number] = base.slice(0, 5);
    }
    setEditedSetsByGameNumber(byNumber);
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

  const saveFixture = async () => {
    if (!canEdit) return;

    const games = Array.from({ length: 9 }, (_, i) => i + 1)
      .map((gameNumber) => ({
        game_number: gameNumber,
        sets: editedSetsByGameNumber[gameNumber] || emptySets5(),
      }));

    try {
      await Promise.all([
        axios.put(`/api/fixtures/${id}/lineups/home`, { playerIds: homeSelection }),
        axios.put(`/api/fixtures/${id}/lineups/away`, { playerIds: awaySelection }),
      ]);

      // Ensure games exist before attempting to save sets.
      await refresh();

      await axios.put(`/api/fixtures/${id}/games/sets`, { games });
      await refresh();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const onChangeGameSets = useCallback((gameNumber, nextSets) => {
    setEditedSetsByGameNumber((prev) => ({
      ...prev,
      [gameNumber]: nextSets,
    }));
  }, []);

  const playerNameById = useMemo(() => {
    const m = new Map();
    for (const p of homeRoster) {
      if (p?.player_id) m.set(p.player_id, p.player_name);
    }
    for (const p of awayRoster) {
      if (p?.player_id) m.set(p.player_id, p.player_name);
    }
    return m;
  }, [homeRoster, awayRoster]);

  const slotIds = useMemo(() => {
    return {
      H1: homeSelection[0] || '',
      H2: homeSelection[1] || '',
      H3: homeSelection[2] || '',
      A1: awaySelection[0] || '',
      A2: awaySelection[1] || '',
      A3: awaySelection[2] || '',
    };
  }, [homeSelection, awaySelection]);

  const slotName = useCallback(
    (slot) => {
      const pid = slotIds[slot];
      if (!pid) return '';
      return playerNameById.get(pid) || '';
    },
    [playerNameById, slotIds]
  );

  const violationIndicesForSide = useCallback(
    (side, roster, selection) => {
      const slotByPlayerId = new Map((roster || []).map((r) => [r.player_id, Number(r.slot)]));
      const slots = (selection || []).map((pid) => slotByPlayerId.get(pid));
      const bad = new Set();

      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i];
          const b = slots[j];
          if (a == null || b == null) continue;
          if (a > b) {
            bad.add(i);
            bad.add(j);
          }
        }
      }

      return { side, bad };
    },
    []
  );

  const renderLineupSelect = (side, roster, selection, setSelection) => {
    const rosterPlayers = roster.slice().sort((a, b) => a.slot - b.slot);
    const prefix = side === 'home' ? 'H' : 'A';
    const { bad } = violationIndicesForSide(side, roster, selection);

    return (
      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-800">{side === 'home' ? 'Home' : 'Away'} lineup</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((idx) => (
            <div key={idx}>
              <label className="block text-sm text-gray-600 mb-1">{prefix}{idx + 1}</label>
              <div className="relative group">
                <select
                  className={`input ${bad.has(idx) ? 'border-red-300 bg-red-50' : ''}`}
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
                {bad.has(idx) && (
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2 whitespace-normal break-words rounded-md bg-gray-700 px-2 py-1 text-left text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {VIOLATION_TOOLTIP_TEXT}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-500 mt-2">
          Lineup order should follow roster slot (mains first, subs last). Incorrect ordering will be flagged as a Violation.
        </div>
      </Card>
    );
  };

  const gamesByNumber = useMemo(() => {
    const m = new Map();
    for (const g of fixture?.games || []) {
      m.set(g.game_number, g);
    }
    return m;
  }, [fixture?.games]);

  const displayGames = useMemo(() => {
    const typeByNumber = (n) => ([1, 2, 3, 7, 8, 9].includes(n) ? 'singles' : 'doubles');
    const out = [];
    for (let n = 1; n <= 9; n++) {
      const existing = gamesByNumber.get(n);
      out.push(
        existing || {
          id: `virtual-${n}`,
          game_number: n,
          game_type: typeByNumber(n),
          home_sets_won: 0,
          away_sets_won: 0,
          winner_side: null,
        }
      );
    }
    return out;
  }, [gamesByNumber]);

  const cupStopGameIndex = useMemo(() => {
    if ((fixture?.match_type || 'league') !== 'cup') return null;

    const byNum = new Map((fixture?.games || []).map((g) => [Number(g.game_number), g]));
    let homeWins = 0;
    let awayWins = 0;
    let stop = null;

    for (let n = 1; n <= 9; n++) {
      const g = byNum.get(n);
      const backendWinner = g?.winner_side;
      const localWinner = winnerSideFromSets(editedSetsByGameNumber?.[n]);
      const winner = backendWinner === 'home' || backendWinner === 'away' ? backendWinner : localWinner;

      if (winner === 'home') homeWins++;
      if (winner === 'away') awayWins++;

      if (homeWins >= 5 || awayWins >= 5) {
        stop = n - 1;
        break;
      }
    }

    return stop;
  }, [fixture, editedSetsByGameNumber]);

  const cupFirstUndecidedGameIndex = useMemo(() => {
    if ((fixture?.match_type || 'league') !== 'cup') return null;
    const byNum = new Map((fixture?.games || []).map((g) => [Number(g.game_number), g]));

    const isDecided = (n) => {
      const g = byNum.get(n);
      if (g?.winner_side === 'home' || g?.winner_side === 'away') return true;
      const localSets = editedSetsByGameNumber?.[n];
      const localWinner = winnerSideFromSets(localSets);
      return localWinner === 'home' || localWinner === 'away';
    };

    for (let n = 1; n <= 9; n++) {
      if (!isDecided(n)) return n - 1;
    }
    return 8;
  }, [fixture, editedSetsByGameNumber]);

  if (loading) return <div className="text-center py-8">Loading fixture...</div>;
  if (!fixture) return <div className="text-center py-8">Fixture not found</div>;

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
            <div className="font-medium whitespace-nowrap">
              Score: {fixture.status !== 'scheduled' ? `${fixture.home_games_won}-${fixture.away_games_won}` : '-'}
            </div>
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                fixture.status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : fixture.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {fixture.status === 'in_progress' ? 'In progress' : fixture.status}
            </span>
            {canEdit && <button className="btn btn-success" onClick={saveFixture}>Save</button>}
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
        <div className="space-y-4">
          {displayGames.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              canEdit={canEdit}
              slotName={slotName}
              sets={editedSetsByGameNumber[g.game_number] || emptySets5()}
              onChangeSets={(nextSets) => onChangeGameSets(g.game_number, nextSets)}
              matchType={fixture.match_type || 'league'}
              cupStopGameIndex={cupStopGameIndex}
              cupFirstUndecidedGameIndex={cupFirstUndecidedGameIndex}
            />
          ))}
        </div>
      </Card>
    </div>
  );
};

const GameCard = ({ game, canEdit, sets, onChangeSets, slotName, matchType, cupStopGameIndex, cupFirstUndecidedGameIndex }) => {
  const isGameLocked = () => {
    if (matchType !== 'cup') return false;
    if (cupFirstUndecidedGameIndex != null && (game.game_number - 1) > cupFirstUndecidedGameIndex) return true;
    if (cupStopGameIndex == null) return false;
    return (game.game_number - 1) > cupStopGameIndex;
  };
  const slotSpec = useMemo(() => {
    const n = Number(game.game_number);
    const map = {
      1: { home: ['H1'], away: ['A2'] },
      2: { home: ['H2'], away: ['A3'] },
      3: { home: ['H3'], away: ['A1'] },
      4: { home: ['H1', 'H2'], away: ['A1', 'A2'] },
      5: { home: ['H1', 'H3'], away: ['A1', 'A3'] },
      6: { home: ['H2', 'H3'], away: ['A2', 'A3'] },
      7: { home: ['H1'], away: ['A1'] },
      8: { home: ['H2'], away: ['A2'] },
      9: { home: ['H3'], away: ['A3'] },
    };
    return map[n] || { home: [], away: [] };
  }, [game.game_number]);

  const title = () => {
    const homeLabel = slotSpec.home.join(' / ');
    const awayLabel = slotSpec.away.join(' / ');

    const homeNames = slotSpec.home.map((s) => slotName(s)).filter(Boolean).join(' / ');
    const awayNames = slotSpec.away.map((s) => slotName(s)).filter(Boolean).join(' / ');

    const left = homeNames ? `${homeLabel} ${homeNames}` : homeLabel;
    const right = awayNames ? `${awayLabel} ${awayNames}` : awayLabel;

    return `${left} vs ${right}`;
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
    <div className={`border rounded-lg p-4 ${isGameLocked() ? 'bg-gray-50 opacity-60' : ''}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-gray-500">Game {game.game_number} ({game.game_type})</div>
          <div className="font-medium text-gray-800">{title()}</div>
          <div className="text-sm text-gray-600">
            Sets: {game.home_sets_won}-{game.away_sets_won}
            {game.winner_side ? ` (winner: ${game.winner_side})` : ''}
          </div>
        </div>
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
                disabled={!canEdit || isSetLocked(idx) || isGameLocked()}
                onChange={(e) => {
                  const next = [...sets];
                  next[idx] = { ...next[idx], home_points: parseInt(e.target.value || '0', 10) };
                  onChangeSets(next);
                }}
              />
              <input
                className={`input border ${setSideClasses(s.home_points, s.away_points).away}`}
                type="number"
                min="0"
                value={s.away_points}
                disabled={!canEdit || isSetLocked(idx) || isGameLocked()}
                onChange={(e) => {
                  const next = [...sets];
                  next[idx] = { ...next[idx], away_points: parseInt(e.target.value || '0', 10) };
                  onChangeSets(next);
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
