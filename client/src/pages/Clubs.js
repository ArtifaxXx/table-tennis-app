import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const Clubs = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [clubs, setClubs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClubId, setSelectedClubId] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubAddress, setClubAddress] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const didInitRef = useRef(false);

  const teamsByClub = useMemo(() => {
    const map = new Map();
    for (const team of teams) {
      if (!team.club_id) continue;
      if (!map.has(team.club_id)) map.set(team.club_id, []);
      map.get(team.club_id).push(team.name);
    }
    return map;
  }, [teams]);

  const filteredClubs = useMemo(() => {
    const term = String(searchTerm || '').trim().toLowerCase();
    if (!term) return clubs;
    return clubs.filter((c) =>
      String(c.name || '').toLowerCase().includes(term) ||
      String(c.address || '').toLowerCase().includes(term)
    );
  }, [clubs, searchTerm]);

  const fetchData = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([
        axios.get('/api/clubs'),
        axios.get('/api/teams'),
      ]);
      setClubs(c.data);
      setTeams(t.data);
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

  const resetForm = () => {
    setSelectedClubId('');
    setClubName('');
    setClubAddress('');
    setCapacity('1');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const onSelectClub = (id) => {
    setSelectedClubId(id);
    const club = clubs.find((c) => c.id === id);
    setClubName(club?.name || '');
    setClubAddress(club?.address || '');
    setCapacity(String(club?.simultaneous_fixtures ?? 1));
    setConfirmDeleteId(null);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!clubName.trim()) {
      toast.error('Club name is required');
      return;
    }

    try {
      const payload = {
        name: clubName.trim(),
        address: clubAddress.trim(),
        simultaneous_fixtures: Number(capacity),
      };
      if (selectedClubId) {
        await axios.put(`/api/clubs/${selectedClubId}`, payload);
      } else {
        await axios.post('/api/clubs', payload);
      }
      await fetchData();
      toast.success('Save successful');
      resetForm();
      setShowForm(false);
    } catch (e2) {
      console.error(e2);
      toast.error(e2?.response?.data?.error || e2.message);
    }
  };

  const onDeleteClub = async (club) => {
    if (!isAdmin || !club?.id) return;
    try {
      await axios.delete(`/api/clubs/${club.id}`);
      setConfirmDeleteId(null);
      if (selectedClubId === club.id) {
        resetForm();
        setShowForm(false);
      }
      await fetchData();
      toast.success('Delete successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  if (loading) return <div className="text-center py-8">Loading clubs...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clubs"
        right={isAdmin ? (
          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            onClick={openCreate}
          >
            <Plus size={18} />
            Add Club
          </button>
        ) : null}
      />

      {showForm && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {isAdmin ? (selectedClubId ? 'Edit Club' : 'Add New Club') : 'Club Details'}
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="input"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="Club name"
                disabled={!isAdmin}
              />
              <select
                className="input"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={!isAdmin}
              >
                <option value="1">1 fixture per day</option>
                <option value="2">2 fixtures per day</option>
                <option value="3">3 fixtures per day</option>
              </select>
              <input
                className="input md:col-span-2"
                value={clubAddress}
                onChange={(e) => setClubAddress(e.target.value)}
                placeholder="Club address"
                disabled={!isAdmin}
              />
            </div>

            {selectedClubId && (
              <div className="text-sm text-gray-600">
                <span className="font-medium text-gray-700">Teams: </span>
                {(teamsByClub.get(selectedClubId) || []).join(', ') || 'None'}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <button className="btn btn-success" type="submit">
                  {selectedClubId ? 'Save Club' : 'Create Club'}
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
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
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search clubs..."
          />
        </div>
        <div className="space-y-2">
          {filteredClubs.map((club) => {
            const clubTeams = teamsByClub.get(club.id) || [];
            return (
              <div
                key={club.id}
                className={`w-full px-4 py-2 rounded border ${selectedClubId === club.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}
              >
                <div className="flex justify-between items-center">
                  <button className="text-left flex-1" onClick={() => onSelectClub(club.id)}>
                    <div className="font-medium text-gray-800">{club.name}</div>
                    {club.address && (
                      <div className="text-xs text-gray-500 mt-1">{club.address}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      Up to {club.simultaneous_fixtures} fixture{club.simultaneous_fixtures === 1 ? '' : 's'} per day
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Teams: {clubTeams.length > 0 ? clubTeams.join(', ') : 'None'}
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="ml-3 flex items-center gap-2">
                      {confirmDeleteId === club.id ? (
                        <>
                          <span className="text-xs text-gray-600">Delete?</span>
                          <button className="btn btn-danger" onClick={() => onDeleteClub(club)}>
                            Confirm
                          </button>
                          <button className="btn btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-danger"
                          onClick={() => setConfirmDeleteId(club.id)}
                          disabled={clubTeams.length > 0}
                          title={clubTeams.length > 0 ? 'Reassign or remove teams before deleting this club' : undefined}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {filteredClubs.length === 0 && (
            <div className="text-gray-500 text-center py-6">
              {searchTerm ? 'No clubs found' : 'No clubs yet'}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Clubs;
