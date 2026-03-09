import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useDivisionContext } from '../context/DivisionContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const Seasons = () => {
  const { isAdmin } = useAuth();
  const { refreshSeasons, setSelectedSeasonId: selectSeason } = useDivisionContext();
  const toast = useToast();

  const dateInputToUtcIso = (value, options = {}) => {
    if (!value) return null;
    const { endOfDay = false } = options;
    const [y, m, d] = String(value).split('-').map((x) => Number(x));
    if (!y || !m || !d) return null;
    if (endOfDay) {
      return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).toISOString();
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
  };

  const [seasons, setSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingName, setCreatingName] = useState('');
  const [creatingScheduleStart, setCreatingScheduleStart] = useState('');
  const [creatingScheduleEnd, setCreatingScheduleEnd] = useState('');
  const [copyFromSeasonId, setCopyFromSeasonId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [fixtureCounts, setFixtureCounts] = useState({});
  const didInitRef = useRef(false);

  const [managingSeasonId, setManagingSeasonId] = useState('');
  const [divisionCreatingName, setDivisionCreatingName] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [divisionTeamSelections, setDivisionTeamSelections] = useState({});
  const [divisionsLoading, setDivisionsLoading] = useState(false);
  const [divisionSaving, setDivisionSaving] = useState(false);
  const [divisionDirty, setDivisionDirty] = useState(false);
  const [fixtureInfoSeasonId, setFixtureInfoSeasonId] = useState('');

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [all, active] = await Promise.all([
        axios.get('/api/team-seasons'),
        axios.get('/api/team-seasons/active'),
      ]);
      setSeasons(all.data);
      setActiveSeason(active.data);

      const countsRes = await axios.get('/api/fixtures/counts-by-season');
      setFixtureCounts(countsRes.data || {});
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const openDivisions = async (seasonId) => {
    setManagingSeasonId(seasonId);
    setDivisionsLoading(true);
    try {
      const [divRes, teamRes] = await Promise.all([
        axios.get(`/api/team-seasons/${seasonId}/divisions`),
        axios.get('/api/teams'),
      ]);

      setDivisions(divRes.data || []);
      setTeams(teamRes.data || []);

      const activeTeamIds = new Set((teamRes.data || []).map((x) => x.id));

      const divs = divRes.data || [];
      const entries = await Promise.all(
        divs.map(async (d) => {
          const t = await axios.get(`/api/divisions/${d.id}/teams`);
          return [d.id, new Set((t.data || []).map((x) => x.id).filter((id) => activeTeamIds.has(id)))];
        })
      );
      setDivisionTeamSelections(Object.fromEntries(entries));
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setDivisionsLoading(false);
    }
  };

  const closeDivisions = () => {
    setManagingSeasonId('');
    setDivisionCreatingName('');
    setDivisions([]);
    setTeams([]);
    setDivisionTeamSelections({});
    setDivisionSaving(false);
    setDivisionDirty(false);
  };

  const createDivision = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!managingSeasonId) return;
    try {
      await axios.post(`/api/team-seasons/${managingSeasonId}/divisions`, { name: divisionCreatingName });
      setDivisionCreatingName('');
      await openDivisions(managingSeasonId);
    } catch (e2) {
      console.error(e2);
      toast.error(e2?.response?.data?.error || e2.message);
    }
  };

  const toggleTeamInDivision = (divisionId, teamId) => {
    setDivisionTeamSelections((prev) => {
      const next = { ...prev };
      const current = next[divisionId] ? new Set(Array.from(next[divisionId])) : new Set();
      if (current.has(teamId)) current.delete(teamId);
      else current.add(teamId);
      next[divisionId] = current;
      return next;
    });
    setDivisionDirty(true);
  };

  const saveAllDivisionTeams = async () => {
    if (!isAdmin) return;
    if (!managingSeasonId) return;
    if (isManagingLocked) return;
    setDivisionSaving(true);
    try {
      for (const d of divisions) {
        const ids = Array.from(divisionTeamSelections[d.id] || []);
        await axios.put(`/api/divisions/${d.id}/teams`, { teamIds: ids });
      }
      toast.success('Save successful');
      await openDivisions(managingSeasonId);
      setDivisionDirty(false);
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setDivisionSaving(false);
    }
  };

  const deleteDivision = async (division) => {
    if (!isAdmin) return;
    if (!division?.id) return;
    if (managingSeason?.status !== 'draft') return;
    if (!window.confirm(`Remove division "${division.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/divisions/${division.id}`);
      toast.success('Division removed');
      await openDivisions(managingSeasonId);
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const createSeason = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      if (!creatingScheduleStart || !creatingScheduleEnd) {
        toast.error('Start and end dates are required');
        return;
      }

      const startIso = dateInputToUtcIso(creatingScheduleStart);
      const endIso = dateInputToUtcIso(creatingScheduleEnd, { endOfDay: true });
      if (!startIso || !endIso) {
        toast.error('Invalid start or end date');
        return;
      }

      const created = await axios.post('/api/team-seasons', {
        name: creatingName,
        copyFromSeasonId: copyFromSeasonId || undefined,
        schedule_start_date: startIso,
        schedule_end_date: endIso,
      });
      setCreatingName('');
      setCreatingScheduleStart('');
      setCreatingScheduleEnd('');
      setCopyFromSeasonId('');
      await fetchData();
      await refreshSeasons();
      if (created?.data?.id) {
        await selectSeason(created.data.id);
      }
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const startSeason = async (id) => {
    if (!isAdmin) return;
    try {
      await axios.post(`/api/team-seasons/${id}/start`, {});
      await fetchData();
      await refreshSeasons();
      await selectSeason(id);
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const reopenSeason = async (id) => {
    if (!isAdmin) return;
    try {
      await axios.post(`/api/team-seasons/${id}/reopen`, {});
      await fetchData();
      await refreshSeasons();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const finishSeason = async (id) => {
    if (!isAdmin) return;
    try {
      await axios.post(`/api/team-seasons/${id}/stop`, {});
      await fetchData();
      await refreshSeasons();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const deleteSeason = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm('Delete this season? This cannot be undone.')) return;
    try {
      await axios.delete(`/api/team-seasons/${id}`);
      await fetchData();
      await refreshSeasons();
      toast.success('Delete successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const generateFixtures = async (seasonId) => {
    if (!seasonId) return;
    if (!isAdmin) return;
    if (!window.confirm('Generate fixtures now? This will create the season schedule.')) return;
    setGenerating(true);
    try {
      await axios.post('/api/fixtures/generate-schedule', { team_season_id: seasonId });
      toast.success('Fixtures generated');
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };

  const badge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      ready: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      concluded: 'bg-blue-100 text-blue-800',
    };
    return <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.draft}`}>{status}</span>;
  };

  const { items: sortedSeasons, requestSort, sortConfig } = useSortableData(seasons, {
    key: 'name',
    direction: 'asc',
  });

  if (loading) return <div className="text-center py-8">Loading seasons...</div>;

  const managingSeason = managingSeasonId ? seasons.find((x) => x.id === managingSeasonId) : null;
  const isManagingLocked = managingSeason ? !['draft', 'ready'].includes(managingSeason.status) : false;
  const isManagingDraft = managingSeason ? managingSeason.status === 'draft' : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seasons"
        right={
          <div className="text-sm text-gray-600">
            Active: <span className="font-medium">{activeSeason?.name || 'None'}</span>
          </div>
        }
      />

      {isAdmin && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Create Season</h3>
          <form onSubmit={createSeason} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              className="input"
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              placeholder="Season name"
            />
            <input
              className="input"
              type="date"
              value={creatingScheduleStart}
              onChange={(e) => setCreatingScheduleStart(e.target.value)}
            />
            <input
              className="input"
              type="date"
              value={creatingScheduleEnd}
              onChange={(e) => setCreatingScheduleEnd(e.target.value)}
            />
            <select className="input" value={copyFromSeasonId} onChange={(e) => setCopyFromSeasonId(e.target.value)}>
              <option value="">(Optional) Copy divisions + teams from season</option>
              {seasons
                .filter((s) => s.id !== activeSeason?.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <button className="btn btn-success" type="submit">Create</button>
          </form>
        </Card>
      )}

      <Card>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Manage Seasons</h3>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="cursor-pointer" onClick={() => requestSort('name')}>Name{sortIndicator(sortConfig, 'name')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('status')}>Status{sortIndicator(sortConfig, 'status')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('schedule_start_date')}>Start{sortIndicator(sortConfig, 'schedule_start_date')}</th>
                <th className="cursor-pointer" onClick={() => requestSort('schedule_end_date')}>End{sortIndicator(sortConfig, 'schedule_end_date')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSeasons.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td>{badge(s.status)}</td>
                  <td>{s.schedule_start_date ? new Date(s.schedule_start_date).toLocaleDateString() : '-'}</td>
                  <td>{s.schedule_end_date ? new Date(s.schedule_end_date).toLocaleDateString() : '-'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary" onClick={() => openDivisions(s.id)}>
                        Divisions
                      </button>
                      {isAdmin && s.status === 'draft' && (fixtureCounts[s.id] || 0) === 0 && (
                        <button className="btn btn-warning" onClick={() => generateFixtures(s.id)} disabled={generating}>
                          <span className="flex items-center gap-2">
                            <span>{generating ? 'Generating...' : 'Generate Fixtures'}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-yellow-300 bg-white text-yellow-800 hover:bg-yellow-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFixtureInfoSeasonId(s.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setFixtureInfoSeasonId(s.id);
                                }
                              }}
                              title="How fixtures are created"
                              aria-label="How fixtures are created"
                            >
                              i
                            </span>
                          </span>
                        </button>
                      )}
                      {isAdmin && s.status === 'ready' && (
                        <button className="btn btn-success" onClick={() => startSeason(s.id)}>
                          Start
                        </button>
                      )}
                      {isAdmin && s.status === 'active' && (
                        <button className="btn btn-warning" onClick={() => finishSeason(s.id)}>
                          Close
                        </button>
                      )}

                      {isAdmin && s.status === 'concluded' && (() => {
                        const blocked = activeSeason && activeSeason.id !== s.id;
                        const reason = blocked ? 'Cannot reopen while another season is in progress' : 'Reopen this season';
                        return (
                          <button
                            className="btn btn-secondary"
                            onClick={() => reopenSeason(s.id)}
                            disabled={!!blocked}
                            title={reason}
                          >
                            Reopen
                          </button>
                        );
                      })()}

                      {isAdmin && s.status !== 'active' && (
                        <button className="btn btn-danger" onClick={() => deleteSeason(s.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {seasons.length === 0 && <div className="text-gray-500 text-center py-6">No seasons yet</div>}
        </div>
      </Card>

      {managingSeasonId && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Divisions: <span className="font-medium">{managingSeason?.name || ''}</span>
            </h3>
            <div className="flex gap-2">
              {isAdmin && !isManagingLocked && (
                <button
                  className="btn btn-success"
                  onClick={saveAllDivisionTeams}
                  disabled={divisionsLoading || divisionSaving || !divisionDirty}
                >
                  {divisionSaving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
              <button className="btn btn-secondary" onClick={closeDivisions}>Close</button>
            </div>
          </div>

          {isAdmin && (
            <form onSubmit={createDivision} className="flex gap-3 mb-4">
            <input
              className="input flex-1"
              value={divisionCreatingName}
              onChange={(e) => setDivisionCreatingName(e.target.value)}
              placeholder="New division name (e.g. Premier, Division 1A)"
              disabled={isManagingLocked}
            />
            <button className="btn btn-success" type="submit" disabled={isManagingLocked || divisionsLoading || !divisionCreatingName.trim()}>
              Create Division
            </button>
            </form>
          )}

          {divisionsLoading ? (
            <div className="text-center py-6 text-gray-600">Loading divisions...</div>
          ) : (
            <div className="space-y-6">
              {divisions.map((d) => (
                <div key={d.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="font-medium text-gray-800">{d.name}</div>
                    {isAdmin && isManagingDraft && (
                      <button className="btn btn-danger" type="button" onClick={() => deleteDivision(d)}>
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {teams.map((t) => {
                      const checked = !!divisionTeamSelections[d.id]?.has(t.id);
                      const takenElsewhere = Object.entries(divisionTeamSelections).some(
                        ([otherDivisionId, set]) => otherDivisionId !== d.id && set?.has(t.id)
                      );
                      const disabled = isManagingLocked || (!checked && takenElsewhere);
                      return (
                        <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!isAdmin || disabled}
                            onChange={() => toggleTeamInDivision(d.id, t.id)}
                          />
                          <span>{t.name}</span>
                        </label>
                      );
                    })}
                  </div>

                  {teams.length === 0 && (
                    <div className="text-sm text-gray-500">No teams available.</div>
                  )}
                </div>
              ))}

              {divisions.length === 0 && (
                <div className="text-gray-500 text-center py-6">No divisions yet</div>
              )}
            </div>
          )}

          <div className="text-sm text-gray-500 mt-4">
            {isManagingLocked
              ? 'This season is active or concluded. Divisions and team composition are read-only.'
              : 'Each team should be in only one division per season.'}
          </div>
        </Card>
      )}

      {fixtureInfoSeasonId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-lg border p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-lg font-semibold text-gray-800">How fixtures are created</div>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setFixtureInfoSeasonId('')}>
                Close
              </button>
            </div>

            <div className="space-y-3 text-sm text-gray-700">
              <div>
                It creates a full home-and-away schedule for each division (every team plays every other team twice).
              </div>
              <div>
                Matches are placed inside the season scheduling window (Start/End dates) and it tries to:
              </div>
              <div className="space-y-1 pl-4">
                <div>- Put home matches on each team’s preferred Home Day (if set).</div>
                <div>- If a Home Day slot isn’t possible, pick another weekday instead.</div>
                <div>- Avoid Irish public holidays.</div>
                <div>- Avoid scheduling matches between Christmas Day and 10th January.</div>
                <div>- Spread matches out fairly evenly, with a slight bias to schedule more in the first half (to leave room for reschedules).</div>
              </div>
              <div>
                After fixtures are generated, the season moves from <span className="font-medium">draft</span> to <span className="font-medium">ready</span>.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Seasons;
