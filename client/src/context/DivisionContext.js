import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const DivisionContext = createContext(null);

const STORAGE_KEY = 'tt-league:divisionContext:v1';

export const DivisionProvider = ({ children }) => {
  const [seasons, setSeasons] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [loading, setLoading] = useState(true);

  const initRef = useRef(false);

  const persist = (next) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      // ignore
    }
  };

  const restore = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  const fetchSeasons = async () => {
    const res = await axios.get('/api/team-seasons');
    return res.data || [];
  };

  const refreshSeasons = async () => {
    const next = await fetchSeasons();
    setSeasons(next);

    // If current selection no longer exists, fall back to active/first season.
    if (selectedSeasonId && !next.some((s) => s.id === selectedSeasonId)) {
      await applySeasonAndDivision({ seasonId: '', divisionId: '' });
    }

    return next;
  };

  const fetchActiveSeason = async () => {
    try {
      const res = await axios.get('/api/team-seasons/active');
      return res.data || null;
    } catch (e) {
      return null;
    }
  };

  const fetchDivisions = async (seasonId) => {
    if (!seasonId) return [];
    try {
      const res = await axios.get(`/api/team-seasons/${seasonId}/divisions`);
      return res.data || [];
    } catch (e) {
      return [];
    }
  };

  const applySeasonAndDivision = async ({ seasonId, divisionId }) => {
    const nextSeasons = seasons && seasons.length > 0 ? seasons : await fetchSeasons();
    if (!seasons || seasons.length === 0) setSeasons(nextSeasons);

    let resolvedSeasonId = seasonId || '';

    // If the stored/requested season no longer exists (e.g. after reseed), fall back.
    if (resolvedSeasonId && !nextSeasons.some((s) => s.id === resolvedSeasonId)) {
      resolvedSeasonId = '';
    }

    if (!resolvedSeasonId) {
      const active = await fetchActiveSeason();
      resolvedSeasonId = active?.id || '';
    }
    if (!resolvedSeasonId) {
      resolvedSeasonId = nextSeasons[0]?.id || '';
    }

    // Clear current division selection immediately so consumers don't fetch using a stale
    // divisionId from a different season.
    setDivisions([]);
    setSelectedDivisionId('');
    setSelectedSeasonId(resolvedSeasonId);

    const nextDivisions = await fetchDivisions(resolvedSeasonId);
    setDivisions(nextDivisions);

    const exists = divisionId && nextDivisions.some((d) => d.id === divisionId);
    const resolvedDivisionId = exists ? divisionId : (nextDivisions[0]?.id || '');
    setSelectedDivisionId(resolvedDivisionId);

    persist({ seasonId: resolvedSeasonId, divisionId: resolvedDivisionId });
  };

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const saved = restore();
        await applySeasonAndDivision({
          seasonId: saved?.seasonId || '',
          divisionId: saved?.divisionId || '',
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const changeSeason = async (seasonId) => {
    setLoading(true);
    try {
      await applySeasonAndDivision({ seasonId, divisionId: '' });
    } finally {
      setLoading(false);
    }
  };

  const changeDivision = (divisionId) => {
    setSelectedDivisionId(divisionId);
    persist({ seasonId: selectedSeasonId, divisionId });
  };

  const value = useMemo(
    () => ({
      seasons,
      divisions,
      selectedSeasonId,
      selectedDivisionId,
      loading,
      refreshSeasons,
      setSelectedSeasonId: changeSeason,
      setSelectedDivisionId: changeDivision,
    }),
    [seasons, divisions, selectedSeasonId, selectedDivisionId, loading]
  );

  return <DivisionContext.Provider value={value}>{children}</DivisionContext.Provider>;
};

export const useDivisionContext = () => {
  const ctx = useContext(DivisionContext);
  if (!ctx) throw new Error('useDivisionContext must be used within a DivisionProvider');
  return ctx;
};
