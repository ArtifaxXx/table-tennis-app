import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  disabled,
}) => {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label || '',
    [options, value]
  );
  const [query, setQuery] = useState(selectedLabel);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target)) {
        setOpen(false);
        setQuery(selectedLabel);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [selectedLabel]);

  const normalizedQuery = String(query || '').trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((o) => String(o.label).toLowerCase().includes(normalizedQuery))
    : options;

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        className="input"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          if (disabled) return;
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery(selectedLabel);
            inputRef.current?.blur();
          }
        }}
      />

      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-600"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setQuery('');
              setOpen(false);
            }}
          >
            (none)
          </button>
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${o.value === value ? 'bg-gray-50' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.value);
                setQuery(o.label);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
          )}
        </div>
      )}
    </div>
  );
};

const Teams = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingName, setCreatingName] = useState('');
  const [creatingContactName, setCreatingContactName] = useState('');
  const [creatingContactPhone, setCreatingContactPhone] = useState('');
  const [creatingHomeDay, setCreatingHomeDay] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [homeDay, setHomeDay] = useState('');
  const [mainIds, setMainIds] = useState(['', '', '']);
  const [subIds, setSubIds] = useState(['', '', '']);

  const didInitRef = useRef(false);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  const playerOptions = useMemo(
    () => players.map((p) => ({ value: p.id, label: p.name })),
    [players]
  );

  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchData();

    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  const onSaveContact = async () => {
    if (!isAdmin) return;
    if (!selectedTeamId) return;
    try {
      await axios.put(`/api/teams/${selectedTeamId}`, {
        contact_name: contactName,
        contact_phone: contactPhone,
        home_day: homeDay === '' ? null : Number(homeDay),
      });
      await fetchData();
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const homeDayLabel = (value) => {
    const v = value == null ? '' : String(value);
    const map = {
      '1': 'Mon',
      '2': 'Tue',
      '3': 'Wed',
      '4': 'Thu',
      '5': 'Fri',
    };
    return map[v] || '-';
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
        home_day: homeDay === '' ? null : Number(homeDay),
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
        home_day: creatingHomeDay === '' ? null : Number(creatingHomeDay),
      });
      setCreatingName('');
      setCreatingContactName('');
      setCreatingContactPhone('');
      setCreatingHomeDay('');
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
    setHomeDay(team.home_day == null ? '' : String(team.home_day));
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
      <PageHeader title="Teams" />

      {isAdmin && (
        <Card>
          <form onSubmit={onCreateTeam} className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800">Create Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
            <select className="input" value={creatingHomeDay} onChange={(e) => setCreatingHomeDay(e.target.value)}>
              <option value="">Home day (optional)</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
            </select>
          </div>
          <button className="btn btn-success" type="submit">Create</button>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
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
                    <div className="text-xs text-gray-500 mt-1">Home day: {homeDayLabel(t.home_day)}</div>
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
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Roster</h3>
          {!selectedTeam && <div className="text-gray-500">Select a team to edit roster.</div>}
          {selectedTeam && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-800">{selectedTeam.name}</div>
                <button className="btn btn-danger" onClick={() => onDeleteTeam(selectedTeam)}>
                  Delete Team
                </button>
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-2">Team Name</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    className="input"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                {isAdmin && (
                  <button className="btn btn-success mt-3" onClick={onSaveTeamName}>
                    Save Team Name
                  </button>
                )}
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-2">Team Contact</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Home day (optional)</label>
                    <select className="input" value={homeDay} onChange={(e) => setHomeDay(e.target.value)} disabled={!isAdmin}>
                      <option value="">None</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                    </select>
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn btn-success mt-3" onClick={onSaveContact}>
                    Save Contact / Home Day
                  </button>
                )}
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-2">Main (3 players)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[0, 1, 2].map((idx) => (
                    <SearchableSelect
                      key={idx}
                      options={playerOptions}
                      value={mainIds[idx]}
                      disabled={!isAdmin}
                      placeholder="Select player"
                      onChange={(nextValue) => {
                        const next = [...mainIds];
                        next[idx] = nextValue;
                        setMainIds(next);
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-2">Subs (up to 3)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[0, 1, 2].map((idx) => (
                    <SearchableSelect
                      key={idx}
                      options={playerOptions}
                      value={subIds[idx]}
                      disabled={!isAdmin}
                      placeholder="(none)"
                      onChange={(nextValue) => {
                        const next = [...subIds];
                        next[idx] = nextValue;
                        setSubIds(next);
                      }}
                    />
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
        </Card>
      </div>
    </div>
  );
};

export default Teams;
