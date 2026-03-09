import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const Teams = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingName, setCreatingName] = useState('');
  const [creatingContactName, setCreatingContactName] = useState('');
  const [creatingContactPhone, setCreatingContactPhone] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [mainIds, setMainIds] = useState(['', '', '']);
  const [subIds, setSubIds] = useState(['', '', '']);

  const didInitRef = useRef(false);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [t, p] = await Promise.all([
        axios.get('/api/teams'),
        axios.get('/api/players'),
      ]);
      setTeams(t.data);
      setPlayers(p.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onSaveContact = async () => {
    if (!isAdmin) return;
    if (!selectedTeamId) return;
    try {
      await axios.put(`/api/teams/${selectedTeamId}`, {
        contact_name: contactName,
        contact_phone: contactPhone,
      });
      await fetchData();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const onSaveTeamName = async () => {
    if (!isAdmin) return;
    if (!selectedTeamId) return;
    if (!teamName.trim()) {
      toast.error('Team name is required');
      return;
    }

    try {
      await axios.put(`/api/teams/${selectedTeamId}`, {
        name: teamName.trim(),
      });
      await fetchData();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const onDeleteTeam = async (team) => {
    if (!isAdmin) return;
    if (!team?.id) return;
    const ok = window.confirm(`Delete team "${team.name}"?`);
    if (!ok) return;

    try {
      await axios.delete(`/api/teams/${team.id}`);
      if (selectedTeamId === team.id) {
        setSelectedTeamId('');
      }
      await fetchData();
      toast.success('Delete successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const onCreateTeam = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      await axios.post('/api/teams', {
        name: creatingName,
        contact_name: creatingContactName,
        contact_phone: creatingContactPhone,
      });
      setCreatingName('');
      setCreatingContactName('');
      setCreatingContactPhone('');
      await fetchData();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const loadRosterIntoForm = (team) => {
    if (!team?.roster) return;
    setTeamName(team.name || '');
    setContactName(team.contact_name || '');
    setContactPhone(team.contact_phone || '');
    const mains = team.roster.filter((r) => r.slot >= 1 && r.slot <= 3).sort((a, b) => a.slot - b.slot);
    const subs = team.roster.filter((r) => r.slot >= 4 && r.slot <= 6).sort((a, b) => a.slot - b.slot);
    setMainIds([mains[0]?.player_id || '', mains[1]?.player_id || '', mains[2]?.player_id || '']);
    setSubIds([subs[0]?.player_id || '', subs[1]?.player_id || '', subs[2]?.player_id || '']);
  };

  const onSelectTeam = (id) => {
    setSelectedTeamId(id);
    const team = teams.find((t) => t.id === id);
    loadRosterIntoForm(team);
  };

  const onSaveRoster = async () => {
    if (!isAdmin) return;
    if (!selectedTeamId) return;
    if (mainIds.some((x) => !x)) {
      toast.error('Main roster must have 3 players');
      return;
    }

    const mains = [...mainIds];
    const subs = subIds.filter((x) => x);

    try {
      await axios.put(`/api/teams/${selectedTeamId}/roster`, {
        main: mains,
        subs,
      });
      await fetchData();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  if (loading) return <div className="text-center py-8">Loading teams...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Teams</h2>

      {isAdmin && (
        <form onSubmit={onCreateTeam} className="card space-y-4">
          <h2 className="text-xl font-bold text-gray-800">Create Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="input"
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              placeholder="Team name"
            />
            <input
              className="input"
              value={creatingContactName}
              onChange={(e) => setCreatingContactName(e.target.value)}
              placeholder="Contact name"
            />
            <input
              className="input"
              value={creatingContactPhone}
              onChange={(e) => setCreatingContactPhone(e.target.value)}
              placeholder="Contact phone"
            />
          </div>
          <button className="btn btn-success" type="submit">Create</button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">All Teams</h3>
          <div className="space-y-2">
            {teams.map((t) => (
              <div
                key={t.id}
                className={`w-full px-4 py-2 rounded border ${selectedTeamId === t.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}
              >
                <div className="flex justify-between items-center">
                  <button className="text-left flex-1" onClick={() => onSelectTeam(t.id)}>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-800">{t.name}</span>
                      <span className="text-sm text-gray-500">Roster: {t.roster?.length || 0}</span>
                    </div>
                    {(t.contact_name || t.contact_phone) && (
                      <div className="text-xs text-gray-500 mt-1">
                        {t.contact_name ? t.contact_name : ''}{t.contact_name && t.contact_phone ? ' · ' : ''}{t.contact_phone ? t.contact_phone : ''}
                      </div>
                    )}
                  </button>
                  {isAdmin && (
                    <button className="btn btn-danger ml-3" onClick={() => onDeleteTeam(t)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {teams.length === 0 && <div className="text-gray-500">No teams yet</div>}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Roster</h3>
          {!selectedTeam && <div className="text-gray-500">Select a team to edit roster.</div>}
          {selectedTeam && (
            <div className="space-y-4">
              <div>
                <div className="font-medium text-gray-700 mb-2">Team</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Team name</label>
                    <input
                      className="input"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn btn-success mt-3" onClick={onSaveTeamName}>
                    Save Team Name
                  </button>
                )}
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-2">Team Contact</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Contact name</label>
                    <input
                      className="input"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Contact phone</label>
                    <input
                      className="input"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn btn-success mt-3" onClick={onSaveContact}>
                    Save Contact
                  </button>
                )}
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-2">Main (3 players)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[0, 1, 2].map((idx) => (
                    <select
                      key={idx}
                      className="input"
                      value={mainIds[idx]}
                      disabled={!isAdmin}
                      onChange={(e) => {
                        const next = [...mainIds];
                        next[idx] = e.target.value;
                        setMainIds(next);
                      }}
                    >
                      <option value="">Select player</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-2">Subs (up to 3)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[0, 1, 2].map((idx) => (
                    <select
                      key={idx}
                      className="input"
                      value={subIds[idx]}
                      disabled={!isAdmin}
                      onChange={(e) => {
                        const next = [...subIds];
                        next[idx] = e.target.value;
                        setSubIds(next);
                      }}
                    >
                      <option value="">(none)</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <button className="btn btn-success" onClick={onSaveRoster}>
                  Save Roster
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Teams;
