import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useSortableData, sortIndicator } from '../hooks/useSortableData';
import { useDivisionContext } from '../context/DivisionContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import DivisionSelector from '../components/DivisionSelector';
import { VIOLATION_TOOLTIP_TEXT } from '../utils/violationTooltipText';

const Fixtures = () => {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [editedDatesByFixtureId, setEditedDatesByFixtureId] = useState({});
  const [teamFilter, setTeamFilter] = useState('');
  const didInitRef = useRef(false);
  const calendarInitRef = useRef(false);
  const { seasons, selectedSeasonId, selectedDivisionId, setSelectedSeasonId } = useDivisionContext();

  const toDateTimeLocalValue = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fetchFixtures = useCallback(async (seasonId, divisionId) => {
    try {
      const res = await axios.get('/api/fixtures', { params: { seasonId, divisionId } });
      setFixtures(res.data);
      const nextEdited = {};
      for (const f of res.data || []) {
        nextEdited[f.id] = toDateTimeLocalValue(f.match_date);
      }
      setEditedDatesByFixtureId(nextEdited);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (selectedSeasonId) {
      fetchFixtures(selectedSeasonId, selectedDivisionId);
    }
  }, [fetchFixtures, selectedSeasonId, selectedDivisionId]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    fetchFixtures(selectedSeasonId, selectedDivisionId);
  }, [fetchFixtures, selectedSeasonId, selectedDivisionId]);

  useEffect(() => {
    if (calendarInitRef.current) return;
    if (!fixtures.length) return;

    const firstWithDate = fixtures.find((f) => f.match_date);
    const baseDate = firstWithDate?.match_date ? new Date(firstWithDate.match_date) : new Date();
    if (!Number.isNaN(baseDate.getTime())) {
      setCalendarMonth(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    }
    calendarInitRef.current = true;
  }, [fixtures]);

  const pad2 = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const toTimeLabel = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const normalizeTeamName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const teamOptions = React.useMemo(() => {
    const set = new Set();
    for (const fixture of fixtures) {
      if (fixture.home_team_name) set.add(fixture.home_team_name);
      if (fixture.away_team_name) set.add(fixture.away_team_name);
    }
    return Array.from(set).sort((a, b) =>
      normalizeTeamName(a).localeCompare(normalizeTeamName(b), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [fixtures]);

  useEffect(() => {
    if (!teamFilter) return;
    const needle = normalizeTeamName(teamFilter);
    const exists = teamOptions.some((team) => normalizeTeamName(team) === needle);
    if (!exists) setTeamFilter('');
  }, [teamFilter, teamOptions]);

  const filteredFixtures = React.useMemo(() => {
    if (!teamFilter) return fixtures;
    const needle = normalizeTeamName(teamFilter);
    return fixtures.filter((f) =>
      normalizeTeamName(f.home_team_name) === needle
      || normalizeTeamName(f.away_team_name) === needle
    );
  }, [fixtures, teamFilter]);

  const fixturesByDate = React.useMemo(() => {
    const map = new Map();
    for (const fixture of filteredFixtures) {
      if (!fixture.match_date) continue;
      const d = new Date(fixture.match_date);
      if (Number.isNaN(d.getTime())) continue;
      const key = dateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(fixture);
    }

    for (const entries of map.values()) {
      entries.sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
    }
    return map;
  }, [fixtures]);

  const unscheduledFixtures = React.useMemo(
    () => filteredFixtures.filter((f) => !f.match_date),
    [filteredFixtures]
  );

  const { items: sortedFixtures, requestSort, sortConfig } = useSortableData(filteredFixtures, {
    key: 'match_date',
    direction: 'asc',
  });

  const updateFixtureDate = async (fixtureId, dateTimeLocal) => {
    const asIso = dateTimeLocal ? new Date(dateTimeLocal).toISOString() : null;
    try {
      const res = await axios.put(`/api/fixtures/${fixtureId}`, { match_date: asIso });
      setFixtures((prev) => prev.map((f) => (f.id === fixtureId ? res.data : f)));
      setEditedDatesByFixtureId((prev) => ({ ...prev, [fixtureId]: toDateTimeLocalValue(res.data.match_date) }));
      toast.success('Save successful');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const statusBadge = (s) => {
    const styles = {
      scheduled: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
    };
    return <span className={`px-2 py-1 text-xs rounded-full ${styles[s] || styles.scheduled}`}>{s}</span>;
  };

  const statusDot = (s) => {
    const styles = {
      scheduled: 'bg-yellow-400',
      in_progress: 'bg-blue-500',
      completed: 'bg-green-500',
    };
    return <span className={`h-2 w-2 rounded-full ${styles[s] || styles.scheduled}`} />;
  };

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
      <span className={`px-2 py-1 text-xs rounded-full border ${styles[c] || styles.missing_lineups}`}>
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

  const calendarDays = React.useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < offset; i++) days.push(null);
    for (let day = 1; day <= totalDays; day++) {
      days.push(new Date(year, month, day));
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [calendarMonth]);

  const MAX_EVENTS_PER_DAY = 4;

  if (loading) return <div className="text-center py-8">Loading fixtures...</div>;

  const selectedSeasonName = seasons.find((s) => s.id === selectedSeasonId)?.name || 'Season';
  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId) || null;
  const canEdit = !!isAdmin && selectedSeason?.status === 'active';
  const monthLabel = calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const todayKey = dateKey(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Season Fixtures"
        subtitle={
          <>
            Viewing: <span className="font-medium">{selectedSeasonName}</span>
          </>
        }
        right={
          <div className="flex flex-wrap items-center gap-3">
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
            <DivisionSelector />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Team</span>
              <select className="input" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                <option value="">All teams</option>
                {teamOptions.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                className={`px-3 py-1 text-sm rounded-md ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-sm rounded-md ${viewMode === 'calendar' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setViewMode('calendar')}
              >
                Calendar
              </button>
            </div>
          </div>
        }
      />

      {viewMode === 'list' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="cursor-pointer" onClick={() => requestSort('match_date')}>Date{sortIndicator(sortConfig, 'match_date')}</th>
                  <th className="cursor-pointer" onClick={() => requestSort('match_type')}>Type{sortIndicator(sortConfig, 'match_type')}</th>
                  <th className="cursor-pointer" onClick={() => requestSort('home_team_name', (f) => normalizeTeamName(f.home_team_name))}>Home{sortIndicator(sortConfig, 'home_team_name')}</th>
                  <th className="cursor-pointer" onClick={() => requestSort('away_team_name', (f) => normalizeTeamName(f.away_team_name))}>Away{sortIndicator(sortConfig, 'away_team_name')}</th>
                  <th className="cursor-pointer" onClick={() => requestSort('status')}>Status{sortIndicator(sortConfig, 'status')}</th>
                  <th className="cursor-pointer" onClick={() => requestSort('completeness_status')}>VALIDATION{sortIndicator(sortConfig, 'completeness_status')}</th>
                  <th className="cursor-pointer" onClick={() => requestSort('home_games_won', (f) => (f.home_games_won || 0) - (f.away_games_won || 0))}>Result{sortIndicator(sortConfig, 'home_games_won')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedFixtures.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <input
                          className="input"
                          type="datetime-local"
                          value={editedDatesByFixtureId[f.id] ?? toDateTimeLocalValue(f.match_date)}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditedDatesByFixtureId((prev) => ({ ...prev, [f.id]: v }));
                          }}
                          disabled={!canEdit}
                        />
                        {canEdit && (editedDatesByFixtureId[f.id] ?? toDateTimeLocalValue(f.match_date)) !== toDateTimeLocalValue(f.match_date) && (
                          <button
                            className="btn btn-success"
                            type="button"
                            onClick={() => updateFixtureDate(f.id, editedDatesByFixtureId[f.id] ?? '')}
                          >
                            Save
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-sm text-gray-700">
                      {(f.match_type || 'league') === 'cup' ? 'Cup' : 'League'}
                    </td>
                    <td className="font-medium">{f.home_team_name}</td>
                    <td className="font-medium">{f.away_team_name}</td>
                    <td>{statusBadge(f.status)}</td>
                    <td>{completenessBadge(f.completeness_status)}</td>
                    <td>
                      {f.status === 'completed' || f.status === 'in_progress'
                        ? `${f.home_games_won}-${f.away_games_won}`
                        : '-'}
                    </td>
                    <td>
                      <Link className="btn btn-secondary" to={`/fixtures/${f.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredFixtures.length === 0 && (
              <div className="text-center py-8 text-gray-500">No fixtures for this season yet.</div>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-semibold text-gray-800">{monthLabel}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-2 text-xs font-semibold text-gray-500">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="text-center">{day}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarDays.map((day, idx) => {
                const key = day ? dateKey(day) : `empty-${idx}`;
                const dayFixtures = day ? fixturesByDate.get(key) || [] : [];
                const isToday = day && key === todayKey;
                const isInMonth = !!day;
                return (
                  <div
                    key={key}
                    className={`min-h-[120px] rounded-lg border p-2 ${isInMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'} ${isToday ? 'ring-2 ring-blue-400 border-blue-200' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{day ? day.getDate() : ''}</span>
                      {dayFixtures.length > 0 && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">{dayFixtures.length} {dayFixtures.length === 1 ? 'match' : 'matches'}</span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayFixtures.slice(0, MAX_EVENTS_PER_DAY).map((fixture) => (
                        <Link
                          key={fixture.id}
                          to={`/fixtures/${fixture.id}`}
                          className="group block rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-700 hover:border-blue-200 hover:bg-blue-50"
                        >
                          <div className="flex items-center gap-2 text-[10px] uppercase text-gray-500">
                            {statusDot(fixture.status)}
                            <span className="font-semibold text-gray-700 normal-case">{toTimeLabel(fixture.match_date) || 'TBD'}</span>
                            <span>{(fixture.match_type || 'league') === 'cup' ? 'Cup' : 'League'}</span>
                          </div>
                          <div className="truncate">{fixture.home_team_name} vs {fixture.away_team_name}</div>
                        </Link>
                      ))}
                      {dayFixtures.length > MAX_EVENTS_PER_DAY && (
                        <div className="text-[11px] text-gray-400">+{dayFixtures.length - MAX_EVENTS_PER_DAY} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {unscheduledFixtures.length > 0 && (
            <Card>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-800">Unscheduled fixtures</div>
                <div className="text-xs text-gray-500">{unscheduledFixtures.length} total</div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {unscheduledFixtures.map((fixture) => (
                  <Link
                    key={fixture.id}
                    to={`/fixtures/${fixture.id}`}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:border-blue-200 hover:bg-blue-50"
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase text-gray-500">
                      {statusDot(fixture.status)}
                      <span>{(fixture.match_type || 'league') === 'cup' ? 'Cup' : 'League'}</span>
                    </div>
                    <div className="mt-1 font-medium">{fixture.home_team_name} vs {fixture.away_team_name}</div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {filteredFixtures.length === 0 && (
            <div className="text-center py-8 text-gray-500">No fixtures for this season yet.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Fixtures;
