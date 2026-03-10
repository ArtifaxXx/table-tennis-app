import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useDivisionContext } from '../context/DivisionContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const Cup = () => {
  const { seasons, selectedSeasonId, selectedDivisionId, setSelectedSeasonId } = useDivisionContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('bracket');
  const didInitRef = useRef(false);

  const fetchCup = useCallback(async () => {
    try {
      const res = await axios.get('/api/cups/division', {
        params: {
          seasonId: selectedSeasonId || undefined,
          divisionId: selectedDivisionId || undefined,
        },
      });
      setData(res.data || null);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSeasonId, selectedDivisionId]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchCup();
  }, [fetchCup]);

  useEffect(() => {
    if (!selectedSeasonId || !selectedDivisionId) return;
    fetchCup();
  }, [fetchCup, selectedSeasonId, selectedDivisionId]);

  const rounds = useMemo(() => {
    const matches = data?.matches || [];
    const by = new Map();
    for (const m of matches) {
      const r = Number(m.round_number) || 1;
      if (!by.has(r)) by.set(r, []);
      by.get(r).push(m);
    }
    for (const [r, arr] of by.entries()) {
      arr.sort((a, b) => (a.match_number || 0) - (b.match_number || 0));
      by.set(r, arr);
    }
    return Array.from(by.entries()).sort((a, b) => a[0] - b[0]);
  }, [data]);

  const maxRound = useMemo(() => {
    return rounds.length > 0 ? Math.max(...rounds.map(([r]) => r)) : 1;
  }, [rounds]);

  const roundLabel = (r, max) => {
    if (r === max) return 'Final';
    if (r === max - 1) return 'Semi-final';
    if (r === max - 2) return 'Quarter-final';
    return `Round ${r}`;
  };

  const NODE_HEIGHT_PX = 112; // matches h-28
  const NODE_GAP_PX = 16;
  const baseStepPx = useMemo(() => NODE_HEIGHT_PX + NODE_GAP_PX, [NODE_HEIGHT_PX, NODE_GAP_PX]);

  const roundLayouts = useMemo(() => {
    // Compute top positions so that each match in later rounds is centered
    // between its two feeder matches from the previous round.
    // Assumes match_number is 1-based and pairings are (1,2)->1, (3,4)->2, ...
    const out = new Map();
    if (!rounds || rounds.length === 0) return out;

    const r1 = rounds.find(([r]) => Number(r) === 1);
    if (!r1) return out;

    const round1Matches = r1[1] || [];
    const pos1 = [];
    for (let i = 0; i < round1Matches.length; i++) {
      pos1[i] = i * baseStepPx;
    }
    out.set(1, { positions: pos1, height: (pos1[pos1.length - 1] || 0) + NODE_HEIGHT_PX });

    for (let r = 2; r <= maxRound; r++) {
      const prev = out.get(r - 1);
      const roundEntry = rounds.find(([rr]) => Number(rr) === r);
      const matches = roundEntry ? (roundEntry[1] || []) : [];
      const positions = new Array(matches.length).fill(0);

      for (const m of matches) {
        const idx = (Number(m.match_number) || 1) - 1;
        const feederA = (idx * 2);
        const feederB = (idx * 2) + 1;
        const a = prev?.positions?.[feederA];
        const b = prev?.positions?.[feederB];
        if (typeof a === 'number' && typeof b === 'number') {
          positions[idx] = (a + b) / 2;
        } else if (typeof a === 'number') {
          positions[idx] = a;
        } else if (typeof b === 'number') {
          positions[idx] = b;
        } else {
          positions[idx] = idx * baseStepPx;
        }
      }

      const height = (out.get(1)?.height || 0);
      out.set(r, { positions, height });
    }

    return out;
  }, [rounds, maxRound, baseStepPx]);

  const renderMatchNode = (m) => {
    const home = m.home_team_name || 'TBD';
    const away = m.away_team_name || 'TBD';
    const winner = m.winner_team_name || '';
    const dateIso = m.fixture_match_date || m.match_date || null;
    const isBye = !m.fixture_id && winner && (home === 'TBD' || away === 'TBD');

    const content = (
      <div className="relative">
        <div className="rounded border bg-white px-3 py-2 shadow-sm h-28 flex flex-col justify-between">
          <div>
            <div className="text-sm font-medium text-gray-800">
              {home}
              <span className="text-gray-400"> vs </span>
              {away}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">Match {m.match_number}</div>
              <div className="text-xs text-gray-500 whitespace-nowrap">
                {dateIso ? new Date(dateIso).toLocaleDateString() : 'No date'}
              </div>
            </div>
          </div>

          <div>
            <div className={`text-xs font-semibold text-green-700 ${winner ? '' : 'opacity-0'}`}>
              Winner: {winner || '—'}
            </div>

            <div className="text-xs text-gray-500">
              {m.fixture_id
                ? `Score: ${(m.fixture_home_games_won || 0)}-${(m.fixture_away_games_won || 0)}`
                : (isBye ? 'Bye (auto-advanced)' : 'Awaiting teams')}
            </div>
          </div>
        </div>

      </div>
    );

    return m.fixture_id ? (
      <Link key={m.id} to={`/fixtures/${m.fixture_id}`} className="block">
        {content}
      </Link>
    ) : (
      <div key={m.id}>{content}</div>
    );
  };

  if (loading) return <div className="text-center py-8">Loading cup...</div>;

  const selectedSeasonName = seasons.find((s) => s.id === selectedSeasonId)?.name || 'Season';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Division Cup"
        subtitle={
          <>
            Viewing: <span className="font-medium">{selectedSeasonName}</span>
          </>
        }
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Season</span>
              <select
                className="input"
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.status === 'active' ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className={`btn ${viewMode === 'bracket' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('bracket')}
            >
              Bracket
            </button>
            <button
              type="button"
              className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
        }
      />

      {!data && (
        <Card>
          <div className="text-gray-500">No cup draw found for this division/season yet. Generate fixtures to create a cup draw.</div>
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          {rounds.length === 0 && (
            <Card>
              <div className="text-gray-500">No cup matches found.</div>
            </Card>
          )}

          {rounds.length > 0 && viewMode === 'bracket' && (
            <Card>
              <div className="overflow-x-auto">
                <div className="min-w-max flex gap-8">
                  {rounds.map(([r, matches]) => (
                    <div key={r} className="w-80">
                      <div className="text-sm font-semibold text-gray-800 mb-3">
                        {roundLabel(r, maxRound)}
                      </div>
                      <div className="relative" style={{ height: `${roundLayouts.get(Number(r))?.height || 0}px` }}>
                        {Number(r) > 1 ? (
                          <div className="pointer-events-none absolute inset-0">
                            {(() => {
                              const prev = roundLayouts.get(Number(r) - 1);
                              const cur = roundLayouts.get(Number(r));
                              const prevPos = prev?.positions || [];
                              const curPos = cur?.positions || [];

                              return matches.map((m) => {
                                const idx = (Number(m.match_number) || 1) - 1;
                                const feederA = idx * 2;
                                const feederB = idx * 2 + 1;
                                const aTop = prevPos[feederA];
                                const bTop = prevPos[feederB];
                                const cTop = curPos[idx];

                                const aCenter = typeof aTop === 'number' ? aTop + (NODE_HEIGHT_PX / 2) : null;
                                const bCenter = typeof bTop === 'number' ? bTop + (NODE_HEIGHT_PX / 2) : null;
                                const cCenter = typeof cTop === 'number' ? cTop + (NODE_HEIGHT_PX / 2) : null;

                                if (cCenter == null) return null;

                                const x = -16; // draw into the left gutter of the column

                                // If both feeders exist, draw vertical line between them and a horizontal line to the node.
                                if (aCenter != null && bCenter != null) {
                                  const y1 = Math.min(aCenter, bCenter);
                                  const y2 = Math.max(aCenter, bCenter);
                                  return (
                                    <div key={`conn-${m.id}`}>
                                      <div
                                        className="absolute bg-gray-300"
                                        style={{ left: `${x}px`, top: `${y1}px`, width: '1px', height: `${Math.max(1, y2 - y1)}px` }}
                                      />
                                      <div
                                        className="absolute bg-gray-300"
                                        style={{ left: `${x}px`, top: `${cCenter}px`, width: '16px', height: '1px' }}
                                      />
                                    </div>
                                  );
                                }

                                // If only one feeder exists (bye propagation), draw just a horizontal line.
                                if (aCenter != null || bCenter != null) {
                                  return (
                                    <div
                                      key={`conn-${m.id}`}
                                      className="absolute bg-gray-300"
                                      style={{ left: `${x}px`, top: `${cCenter}px`, width: '16px', height: '1px' }}
                                    />
                                  );
                                }

                                return null;
                              });
                            })()}
                          </div>
                        ) : null}

                        {matches.map((m) => {
                          const idx = (Number(m.match_number) || 1) - 1;
                          const top = roundLayouts.get(Number(r))?.positions?.[idx] || 0;
                          return (
                            <div key={m.id} className="absolute left-0 right-0" style={{ top: `${top}px` }}>
                              {renderMatchNode(m)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {rounds.length > 0 && viewMode === 'list' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {rounds.map(([r, matches]) => {
                return (
                  <Card key={r}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-lg font-semibold text-gray-800">{roundLabel(r, maxRound)}</div>
                      <div className="text-xs text-gray-500">{matches.length} match{matches.length === 1 ? '' : 'es'}</div>
                    </div>

                    <div className="space-y-2">
                      {matches.map((m) => {
                        const home = m.home_team_name || 'TBD';
                        const away = m.away_team_name || 'TBD';
                        const winner = m.winner_team_name || '';
                        const dateIso = m.fixture_match_date || m.match_date || null;
                        const isBye = !m.fixture_id && winner && (home === 'TBD' || away === 'TBD');

                        const content = (
                          <div className="rounded border px-3 py-2 hover:bg-gray-50">
                            <div className="flex justify-between items-start gap-4">
                              <div className="font-medium text-gray-800">
                                {home} vs {away}
                              </div>
                              <div className="text-sm text-gray-600 whitespace-nowrap">
                                {dateIso ? new Date(dateIso).toLocaleString() : 'No date'}
                              </div>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <div className="text-xs text-gray-500">Match {m.match_number}</div>
                              {winner ? (
                                <div className="text-xs font-semibold text-green-700">Winner: {winner}</div>
                              ) : null}
                            </div>
                            {m.fixture_id ? (
                              <div className="text-xs text-gray-500 mt-1">
                                {m.fixture_status ? `Status: ${m.fixture_status}` : ''}
                                {m.fixture_status ? ' · ' : ''}
                                {`Score: ${(m.fixture_home_games_won || 0)}-${(m.fixture_away_games_won || 0)}`}
                              </div>
                            ) : isBye ? (
                              <div className="text-xs text-gray-500 mt-1">Bye (auto-advanced)</div>
                            ) : (
                              <div className="text-xs text-gray-500 mt-1">Fixture not created yet</div>
                            )}
                          </div>
                        );

                        return m.fixture_id ? (
                          <Link key={m.id} to={`/fixtures/${m.fixture_id}`} className="block">
                            {content}
                          </Link>
                        ) : (
                          <div key={m.id}>{content}</div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Cup;
