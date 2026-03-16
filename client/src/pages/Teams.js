import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Plus, Search } from 'lucide-react';
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
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [clubAddress, setClubAddress] = useState('');
  const [homeDay, setHomeDay] = useState('');
  const [mainIds, setMainIds] = useState(['', '', '']);
  const SUB_COUNT = 10;
  const [subIds, setSubIds] = useState(Array(SUB_COUNT).fill(''));

  const didInitRef = useRef(false);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  const filteredTeams = useMemo(() => {
    const term = String(teamSearchTerm || '').trim().toLowerCase();
    if (!term) return teams;
    return teams.filter((t) => String(t.name || '').toLowerCase().includes(term));
  }, [teams, teamSearchTerm]);

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

  const resetTeamForm = () => {
    setSelectedTeamId('');
    setTeamName('');
    setContactName('');
    setContactPhone('');
    setClubAddress('');
    setHomeDay('');
    setMainIds(['', '', '']);
    setSubIds(Array(SUB_COUNT).fill(''));
  };

  const saveRoster = async (teamId) => {
    if (!teamId) return;
    if (mainIds.some((x) => !x)) {
      throw new Error('Main roster must have 3 players');
    }

    const mains = [...mainIds];
    const subs = subIds.filter((x) => x);

    await axios.put(`/api/teams/${teamId}/roster`, {
      main: mains,
      subs,
    });
  };

  const openCreateTeam = () => {
    resetTeamForm();
    setShowTeamForm(true);
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!teamName.trim()) {
      toast.error('Team name is required');
      return;
    }

    try {
      if (selectedTeamId) {
        await axios.put(`/api/teams/${selectedTeamId}`, {
          name: teamName.trim(),
          contact_name: contactName,
          contact_phone: contactPhone,
          club_address: clubAddress,
          home_day: homeDay === '' ? null : Number(homeDay),
        });
        await saveRoster(selectedTeamId);
      } else {
        await axios.post('/api/teams', {
          name: teamName.trim(),
          contact_name: contactName,
          contact_phone: contactPhone,
          club_address: clubAddress,
          home_day: homeDay === '' ? null : Number(homeDay),
        });
      }
      await fetchData();
      toast.success('Save successful');
      if (!selectedTeamId) {
        resetTeamForm();
        setShowTeamForm(false);
      }
    } catch (e2) {
      console.error(e2);
      toast.error(e2?.response?.data?.error || e2.message);
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
        resetTeamForm();
        setShowTeamForm(false);
      }
      await fetchData();
      toast.success('Delete successful');
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
    setClubAddress(team.club_address || '');
    setHomeDay(team.home_day == null ? '' : String(team.home_day));
    const mains = team.roster.filter((r) => r.slot >= 1 && r.slot <= 3).sort((a, b) => a.slot - b.slot);
    const subs = team.roster.filter((r) => r.slot >= 4 && r.slot <= 13).sort((a, b) => a.slot - b.slot);
    setMainIds([mains[0]?.player_id || '', mains[1]?.player_id || '', mains[2]?.player_id || '']);
    const nextSubs = Array(SUB_COUNT).fill('');
    for (let i = 0; i < SUB_COUNT; i++) {
      nextSubs[i] = subs[i]?.player_id || '';
    }
    setSubIds(nextSubs);
  };

  const onSelectTeam = (id) => {
    setSelectedTeamId(id);
    const team = teams.find((t) => t.id === id);
    loadRosterIntoForm(team);
    setShowTeamForm(true);
  };

  if (loading) return <div className="text-center py-8">Loading teams...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        right={isAdmin ? (
          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            onClick={openCreateTeam}
          >
            <Plus size={18} />
            Add Team
          </button>
        ) : null}
      />

      {showTeamForm && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {isAdmin ? (selectedTeamId ? 'Edit Team' : 'Add New Team') : 'Team Details'}
          </h3>
          <form onSubmit={handleSaveTeam} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="input"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team name"
                disabled={!isAdmin}
              />
              <input
                className="input md:col-span-2"
                value={clubAddress}
                onChange={(e) => setClubAddress(e.target.value)}
                placeholder="Club address"
                disabled={!isAdmin}
              />
              <input
                className="input"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
                disabled={!isAdmin}
              />
              <input
                className="input"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Contact phone"
                disabled={!isAdmin}
              />
              <select className="input" value={homeDay} onChange={(e) => setHomeDay(e.target.value)} disabled={!isAdmin}>
                <option value="">Home day</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
              </select>
            </div>

            {selectedTeamId ? (
              <div className="space-y-4">
              <div>
                <div className="font-medium text-gray-700 mb-2">Main (3 players)</div>
                <div className="text-xs text-gray-500 mb-2">
                  Only these 3 players are ranked (slots 1-3). They should be your strongest players in order.
                </div>
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
                <div className="font-medium text-gray-700 mb-2">Subs (up to 10)</div>
                <div className="text-xs text-gray-500 mb-2">
                  Subs are not ranked (slots 4-13). In fixtures, a sub selected above a main (or out of strength order) will show as a violation.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: SUB_COUNT }, (_, idx) => idx).map((idx) => (
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

              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Save the team first to manage its roster.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <button className="btn btn-success" type="submit">
                  {selectedTeamId ? 'Save Team' : 'Create Team'}
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  resetTeamForm();
                  setShowTeamForm(false);
                }}
              >
                {isAdmin ? 'Cancel' : 'Close'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Search size={18} className="text-gray-400" />
          <input
            className="input flex-1"
            value={teamSearchTerm}
            onChange={(e) => setTeamSearchTerm(e.target.value)}
            placeholder="Search teams..."
          />
        </div>
        <div className="space-y-2">
          {filteredTeams.map((t) => (
            <div
              key={t.id}
              className={`w-full px-4 py-2 rounded border ${selectedTeamId === t.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}
            >
              <div className="flex justify-between items-center">
                <button className="text-left flex-1" onClick={() => onSelectTeam(t.id)}>
                  <div className="font-medium text-gray-800">{t.name}</div>
                  {(t.contact_name || t.contact_phone) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {t.contact_name ? t.contact_name : ''}{t.contact_name && t.contact_phone ? ' · ' : ''}{t.contact_phone ? t.contact_phone : ''}
                    </div>
                  )}
                  {t.club_address && (
                    <div className="text-xs text-gray-500 mt-1">Club: {t.club_address}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">Roster: {t.roster?.length || 0}</div>
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
          {filteredTeams.length === 0 && (
            <div className="text-gray-500 text-center py-6">
              {teamSearchTerm ? 'No teams found' : 'No teams yet'}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Teams;
