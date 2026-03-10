const { v4: uuidv4 } = require('uuid');

function startOfDayUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function dateKeyUtc(date) {
  const d = startOfDayUtc(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysUtc(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function weekdayIso1to7Utc(date) {
  // JS: 0=Sun..6=Sat => ISO: 1=Mon..7=Sun
  const js = date.getUTCDay();
  return js === 0 ? 7 : js;
}

function nthWeekdayOfMonthUtc(year, monthIndex0, isoWeekday, n) {
  // monthIndex0: 0=Jan
  const first = new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0, 0));
  const firstIso = weekdayIso1to7Utc(first);
  const delta = (isoWeekday - firstIso + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  return new Date(Date.UTC(year, monthIndex0, day, 0, 0, 0, 0));
}

function lastWeekdayOfMonthUtc(year, monthIndex0, isoWeekday) {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0, 0, 0, 0, 0));
  const lastIso = weekdayIso1to7Utc(last);
  const deltaBack = (lastIso - isoWeekday + 7) % 7;
  return new Date(Date.UTC(year, monthIndex0, last.getUTCDate() - deltaBack, 0, 0, 0, 0));
}

function easterSundayUtc(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function observedIfWeekendUtc(date) {
  const iso = weekdayIso1to7Utc(date);
  if (iso === 6) return addDaysUtc(date, 2); // Sat -> Mon
  if (iso === 7) return addDaysUtc(date, 1); // Sun -> Mon
  return date;
}

function getIrishPublicHolidayKeysUtc(year) {
  const keys = new Set();

  // New Year's Day
  keys.add(dateKeyUtc(observedIfWeekendUtc(new Date(Date.UTC(year, 0, 1)))));

  // St Brigid's Day (first Monday in Feb) - modern Irish public holiday
  keys.add(dateKeyUtc(nthWeekdayOfMonthUtc(year, 1, 1, 1)));

  // St Patrick's Day (observed)
  keys.add(dateKeyUtc(observedIfWeekendUtc(new Date(Date.UTC(year, 2, 17)))));

  // Easter Monday
  const easter = easterSundayUtc(year);
  keys.add(dateKeyUtc(addDaysUtc(easter, 1)));

  // May Day - first Monday in May
  keys.add(dateKeyUtc(nthWeekdayOfMonthUtc(year, 4, 1, 1)));

  // June Holiday - first Monday in June
  keys.add(dateKeyUtc(nthWeekdayOfMonthUtc(year, 5, 1, 1)));

  // August Holiday - first Monday in August
  keys.add(dateKeyUtc(nthWeekdayOfMonthUtc(year, 7, 1, 1)));

  // October Holiday - last Monday in October
  keys.add(dateKeyUtc(lastWeekdayOfMonthUtc(year, 9, 1)));

  // Christmas Day + St Stephen's Day (observed)
  keys.add(dateKeyUtc(observedIfWeekendUtc(new Date(Date.UTC(year, 11, 25)))));
  keys.add(dateKeyUtc(observedIfWeekendUtc(new Date(Date.UTC(year, 11, 26)))));

  return keys;
}

function isChristmasBlackoutUtc(date) {
  const y = date.getUTCFullYear();
  const key = dateKeyUtc(date);
  const start = dateKeyUtc(new Date(Date.UTC(y, 11, 25, 0, 0, 0, 0)));
  const end = dateKeyUtc(new Date(Date.UTC(y + 1, 0, 10, 0, 0, 0, 0)));
  // Compare using actual dates for correctness across years
  const d = startOfDayUtc(date).getTime();
  const s = startOfDayUtc(new Date(Date.UTC(y, 11, 25))).getTime();
  const e = startOfDayUtc(new Date(Date.UTC(y + 1, 0, 10))).getTime();
  return d >= s && d <= e && (key >= start || key <= end);
}

function buildAllowedDatesUtc({ scheduleStart, scheduleEnd }) {
  const start = startOfDayUtc(scheduleStart);
  const end = startOfDayUtc(scheduleEnd);
  if (end.getTime() < start.getTime()) return [];

  const years = new Set([start.getUTCFullYear(), end.getUTCFullYear()]);
  // include adjacent year for Jan 10 blackout/holidays
  years.add(start.getUTCFullYear() + 1);
  years.add(end.getUTCFullYear() + 1);

  const holidayKeys = new Set();
  for (const y of years) {
    for (const k of getIrishPublicHolidayKeysUtc(y)) holidayKeys.add(k);
  }

  const out = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addDaysUtc(d, 1)) {
    const iso = weekdayIso1to7Utc(d);
    // "random weekdays" fallback implies weekdays only
    const isWeekday = iso >= 1 && iso <= 5;
    if (!isWeekday) continue;
    if (holidayKeys.has(dateKeyUtc(d))) continue;
    if (isChristmasBlackoutUtc(d)) continue;

    const match = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 19, 0, 0, 0));
    out.push(match);
  }
  return out;
}

function buildRoundRobinRounds(teamIds) {
  const ids = [...teamIds];
  if (ids.length < 2) return [];

  // Circle method. Add BYE if odd.
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push(null);

  const n = ids.length;
  const rounds = [];
  let arr = [...ids];

  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a != null && b != null) pairs.push([a, b]);
    }
    rounds.push(pairs);

    // rotate all but first
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }

  return rounds;
}

function frontLoadedTargetIndices(roundCount, dateCount) {
  if (roundCount <= 1) return [0];
  const max = Math.max(0, dateCount - 1);
  const p = 2.0; // >1 => front-load (more rounds earlier)
  const out = [];
  for (let r = 0; r < roundCount; r++) {
    const t = r / (roundCount - 1);
    const idx = Math.floor(Math.pow(t, p) * max);
    out.push(Math.min(max, Math.max(0, idx)));
  }
  return out;
}

class FixtureManager {
  constructor(database) {
    this.db = database;
  }

  async assertFixtureSeasonIsActive(fixtureId) {
    const row = await this.db.get(
      `SELECT ts.status as season_status
       FROM fixtures f
       LEFT JOIN team_seasons ts ON ts.id = f.team_season_id
       WHERE f.id = ?`,
      [fixtureId]
    );
    if (!row) throw new Error('Fixture not found');
    if (row.season_status !== 'active') {
      throw new Error('Fixtures can only be edited while the season is active');
    }
  }

  async createFixture(fixtureData) {
    const { team_season_id, division_id, home_team_id, away_team_id, match_date } = fixtureData;

    if (!team_season_id) {
      throw new Error('team_season_id is required');
    }

    if (!home_team_id || !away_team_id) {
      throw new Error('Both home_team_id and away_team_id are required');
    }
    if (home_team_id === away_team_id) {
      throw new Error('Home and away teams must be different');
    }

    const teams = await this.db.all(
      'SELECT id FROM teams WHERE id IN (?, ?) AND active = 1',
      [home_team_id, away_team_id]
    );
    if (teams.length !== 2) {
      throw new Error('One or both teams not found or inactive');
    }

    const id = uuidv4();
    await this.db.run(
      `INSERT INTO fixtures (id, team_season_id, division_id, home_team_id, away_team_id, match_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, team_season_id, division_id || null, home_team_id, away_team_id, match_date]
    );

    return this.getFixtureById(id);
  }

  async getAllFixtures() {
    // If a season is provided, filter to that season. Otherwise return all fixtures.
    // If a division is provided, filter within the season.
    const seasonId = arguments.length > 0 ? arguments[0] : null;
    const divisionId = arguments.length > 1 ? arguments[1] : null;

    const where = [];
    const params = [];
    if (seasonId) {
      where.push('f.team_season_id = ?');
      params.push(seasonId);
    }
    if (divisionId) {
      where.push('f.division_id = ?');
      params.push(divisionId);
    }

    return this.db.all(
      `SELECT f.*,
              ht.name as home_team_name,
              at.name as away_team_name,
              CASE
                WHEN (
                  (SELECT COUNT(DISTINCT fl.day_rank)
                   FROM fixture_lineups fl
                   JOIN team_roster tr ON tr.team_id = f.home_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                   WHERE fl.fixture_id = f.id AND fl.side = 'home' AND fl.day_rank IN (1,2,3)) < 3
                  OR
                  (SELECT COUNT(DISTINCT fl.day_rank)
                   FROM fixture_lineups fl
                   JOIN team_roster tr ON tr.team_id = f.away_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                   WHERE fl.fixture_id = f.id AND fl.side = 'away' AND fl.day_rank IN (1,2,3)) < 3
                ) THEN 'missing_lineups'
                WHEN (SELECT COUNT(*) FROM fixture_games fg WHERE fg.fixture_id = f.id) < 9 THEN 'missing_games'
                WHEN EXISTS (
                  SELECT 1
                  FROM fixture_games fg
                  WHERE fg.fixture_id = f.id
                    AND (SELECT COUNT(*) FROM fixture_game_sets s WHERE s.fixture_game_id = fg.id) < 3
                ) THEN 'missing_sets'
                WHEN (
                  (
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.home_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'home' AND fl.day_rank = 1) >
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.home_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'home' AND fl.day_rank = 2)
                  )
                  OR
                  (
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.home_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'home' AND fl.day_rank = 2) >
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.home_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'home' AND fl.day_rank = 3)
                  )
                  OR
                  (
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.away_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'away' AND fl.day_rank = 1) >
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.away_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'away' AND fl.day_rank = 2)
                  )
                  OR
                  (
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.away_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'away' AND fl.day_rank = 2) >
                    (SELECT tr.slot
                     FROM fixture_lineups fl
                     JOIN team_roster tr ON tr.team_id = f.away_team_id AND tr.player_id = fl.player_id AND tr.active = 1
                     WHERE fl.fixture_id = f.id AND fl.side = 'away' AND fl.day_rank = 3)
                  )
                ) THEN 'violation'
                ELSE 'complete'
              END as completeness_status
       FROM fixtures f
       JOIN teams ht ON f.home_team_id = ht.id
       JOIN teams at ON f.away_team_id = at.id
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY f.match_date DESC, f.created_at DESC`,
      params
    );
  }

  async getFixtureById(id) {
    const fixture = await this.db.get(
      `SELECT f.*,
              ht.name as home_team_name,
              at.name as away_team_name,
              ts.status as season_status
       FROM fixtures f
       JOIN teams ht ON f.home_team_id = ht.id
       JOIN teams at ON f.away_team_id = at.id
       LEFT JOIN team_seasons ts ON ts.id = f.team_season_id
       WHERE f.id = ?`,
      [id]
    );

    if (!fixture) return null;

    fixture.lineups = await this.getFixtureLineups(id);
    fixture.games = await this.getFixtureGamesWithSets(id);

    return fixture;
  }

  async updateFixtureDate(id, match_date) {
    const fixture = await this.db.get('SELECT * FROM fixtures WHERE id = ?', [id]);
    if (!fixture) throw new Error('Fixture not found');

    await this.assertFixtureSeasonIsActive(id);

    await this.db.run(
      `UPDATE fixtures
       SET match_date = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [match_date, id]
    );

    return this.getFixtureById(id);
  }

  async generateDoubleRoundRobinSchedule(options = {}) {
    const { team_season_id, division_id, teamIds, schedule_start_date, schedule_end_date } = options;

    if (!team_season_id) {
      throw new Error('team_season_id is required');
    }

    const ids = Array.isArray(teamIds) ? teamIds.filter(Boolean) : [];
    if (!ids || ids.length < 2) {
      throw new Error('At least 2 teams are required to generate a schedule for a division');
    }

    const teams = await this.db.all(
      `SELECT *
       FROM teams
       WHERE id IN (${ids.map(() => '?').join(',')}) AND active = 1
       ORDER BY name`,
      ids
    );
    if (teams.length < 2) {
      throw new Error('At least 2 active teams are required');
    }

    const scheduleStart = schedule_start_date ? new Date(schedule_start_date) : null;
    const scheduleEnd = schedule_end_date ? new Date(schedule_end_date) : null;
    if (!scheduleStart || Number.isNaN(scheduleStart.getTime())) {
      throw new Error('schedule_start_date is required and must be a valid date');
    }
    if (!scheduleEnd || Number.isNaN(scheduleEnd.getTime())) {
      throw new Error('schedule_end_date is required and must be a valid date');
    }

    const allowedDates = buildAllowedDatesUtc({ scheduleStart, scheduleEnd });
    if (allowedDates.length === 0) {
      throw new Error('No available dates in scheduling window after exclusions');
    }

    const teamById = new Map(teams.map((t) => [t.id, t]));
    const rounds = buildRoundRobinRounds(teams.map((t) => t.id));
    const secondLegRounds = rounds.map((pairs) => pairs.map(([a, b]) => [b, a]));
    const allRounds = [...rounds, ...secondLegRounds];

    const targetIdxByRound = frontLoadedTargetIndices(allRounds.length, allowedDates.length);
    const usedTeamsByDateKey = new Map();
    const lastMatchTimeByTeam = new Map();

    const created = [];

    for (let r = 0; r < allRounds.length; r++) {
      const pairs = allRounds[r];
      // Schedule each match in this round near the target index.
      for (const [homeId, awayId] of pairs) {
        const home = teamById.get(homeId);
        const away = teamById.get(awayId);
        if (!home || !away) continue;

        const preferredHomeDay = home.home_day == null ? null : Number(home.home_day);
        const baseIdx = targetIdxByRound[r] || 0;

        let best = null;
        let bestScore = Infinity;

        const maxRadius = Math.max(allowedDates.length, 60);
        const tryPick = (requirePreferredDay) => {
          best = null;
          bestScore = Infinity;

          for (let radius = 0; radius <= maxRadius; radius++) {
            const candidates = [];
            if (baseIdx - radius >= 0) candidates.push(baseIdx - radius);
            if (radius > 0 && baseIdx + radius < allowedDates.length) candidates.push(baseIdx + radius);

            for (const idx of candidates) {
              const dt = allowedDates[idx];
              const dk = dateKeyUtc(dt);
              const usedTeams = usedTeamsByDateKey.get(dk) || new Set();
              if (usedTeams.has(homeId) || usedTeams.has(awayId)) continue;

              const iso = weekdayIso1to7Utc(dt);
              if (requirePreferredDay && preferredHomeDay && iso !== preferredHomeDay) continue;

              const lastHome = lastMatchTimeByTeam.get(homeId);
              const lastAway = lastMatchTimeByTeam.get(awayId);
              const dayMs = 24 * 60 * 60 * 1000;
              const gapHomeDays = lastHome ? Math.abs((dt.getTime() - lastHome) / dayMs) : null;
              const gapAwayDays = lastAway ? Math.abs((dt.getTime() - lastAway) / dayMs) : null;

              // Prefer ~7 days between matches if possible.
              const gapPenalty =
                (gapHomeDays == null ? 0 : Math.abs(gapHomeDays - 7)) +
                (gapAwayDays == null ? 0 : Math.abs(gapAwayDays - 7));

              // Slightly prefer earlier dates for front-loading.
              const earlyPenalty = idx * 0.02;

              // If we are not requiring the preferred day, still heavily prefer it.
              const homeDayPenalty = preferredHomeDay && iso !== preferredHomeDay ? 1000 : 0;

              const score = homeDayPenalty + gapPenalty + earlyPenalty;
              if (score < bestScore) {
                bestScore = score;
                best = dt;
              }
            }

            if (best) break;
          }

          return best;
        };

        // Phase 1: if home team has a preferred home day, try to place ONLY on that weekday.
        if (preferredHomeDay) {
          tryPick(true);
        }
        // Phase 2: fallback to any allowed weekday (but still heavily prefers home day).
        if (!best) {
          tryPick(false);
        }

        if (!best) {
          throw new Error('Unable to schedule all fixtures within the window');
        }

        const dk = dateKeyUtc(best);
        if (!usedTeamsByDateKey.has(dk)) usedTeamsByDateKey.set(dk, new Set());
        usedTeamsByDateKey.get(dk).add(homeId);
        usedTeamsByDateKey.get(dk).add(awayId);
        lastMatchTimeByTeam.set(homeId, best.getTime());
        lastMatchTimeByTeam.set(awayId, best.getTime());

        created.push(
          await this.createFixture({
            team_season_id,
            division_id,
            home_team_id: homeId,
            away_team_id: awayId,
            match_date: best.toISOString(),
          })
        );
      }
    }

    return created;
  }

  async getFixtureLineups(fixtureId) {
    return this.db.all(
      `SELECT fl.*, p.name as player_name
       FROM fixture_lineups fl
       JOIN players p ON fl.player_id = p.id
       WHERE fl.fixture_id = ?
       ORDER BY fl.side ASC, fl.day_rank ASC`,
      [fixtureId]
    );
  }

  async setLineup(fixtureId, side, playerIds) {
    if (!['home', 'away'].includes(side)) {
      throw new Error('Side must be "home" or "away"');
    }

    await this.assertFixtureSeasonIsActive(fixtureId);

    if (!Array.isArray(playerIds) || playerIds.length !== 3) {
      throw new Error('Lineup must contain exactly 3 player IDs in day ranking order');
    }

    const fixture = await this.db.get('SELECT * FROM fixtures WHERE id = ?', [fixtureId]);
    if (!fixture) {
      throw new Error('Fixture not found');
    }

    const teamId = side === 'home' ? fixture.home_team_id : fixture.away_team_id;
    const roster = await this.db.all(
      `SELECT player_id, slot
       FROM team_roster
       WHERE team_id = ? AND active = 1`,
      [teamId]
    );

    const rosterIds = new Set(roster.map(r => r.player_id));
    for (const pid of playerIds) {
      if (!rosterIds.has(pid)) {
        throw new Error('Lineup player must belong to the team roster');
      }
    }

    const unique = new Set(playerIds);
    if (unique.size !== 3) {
      throw new Error('Duplicate player IDs in lineup');
    }

    // Clear old lineup for side
    await this.db.run('DELETE FROM fixture_lineups WHERE fixture_id = ? AND side = ?', [fixtureId, side]);

    for (let idx = 0; idx < 3; idx++) {
      const playerId = playerIds[idx];
      const rosterRow = roster.find(r => r.player_id === playerId);
      const isSub = rosterRow ? rosterRow.slot >= 4 : 0;

      await this.db.run(
        `INSERT INTO fixture_lineups (id, fixture_id, side, day_rank, player_id, is_sub)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), fixtureId, side, idx + 1, playerId, isSub ? 1 : 0]
      );
    }

    await this.ensureGamesGenerated(fixtureId);
    return this.getFixtureLineups(fixtureId);
  }

  async ensureGamesGenerated(fixtureId) {
    const lineupRows = await this.getFixtureLineups(fixtureId);
    const home = lineupRows.filter(r => r.side === 'home').sort((a, b) => a.day_rank - b.day_rank);
    const away = lineupRows.filter(r => r.side === 'away').sort((a, b) => a.day_rank - b.day_rank);

    if (home.length !== 3 || away.length !== 3) {
      return;
    }

    const existing = await this.db.all('SELECT * FROM fixture_games WHERE fixture_id = ? ORDER BY game_number', [fixtureId]);
    if (existing.length > 0) {
      return;
    }

    const H1 = home[0].player_id;
    const H2 = home[1].player_id;
    const H3 = home[2].player_id;
    const A1 = away[0].player_id;
    const A2 = away[1].player_id;
    const A3 = away[2].player_id;

    const games = [
      // 1-3 singles
      { game_number: 1, game_type: 'singles', homeA: H1, awayA: A2 },
      { game_number: 2, game_type: 'singles', homeA: H2, awayA: A3 },
      { game_number: 3, game_type: 'singles', homeA: H3, awayA: A1 },
      // 4-6 doubles
      { game_number: 4, game_type: 'doubles', homeA: H1, homeB: H2, awayA: A1, awayB: A2 },
      { game_number: 5, game_type: 'doubles', homeA: H1, homeB: H3, awayA: A1, awayB: A3 },
      { game_number: 6, game_type: 'doubles', homeA: H2, homeB: H3, awayA: A2, awayB: A3 },
      // 7-9 singles
      { game_number: 7, game_type: 'singles', homeA: H1, awayA: A1 },
      { game_number: 8, game_type: 'singles', homeA: H2, awayA: A2 },
      { game_number: 9, game_type: 'singles', homeA: H3, awayA: A3 },
    ];

    for (const g of games) {
      await this.db.run(
        `INSERT INTO fixture_games (
           id, fixture_id, game_number, game_type,
           home_player_a_id, away_player_a_id, home_player_b_id, away_player_b_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          fixtureId,
          g.game_number,
          g.game_type,
          g.homeA,
          g.awayA,
          g.homeB || null,
          g.awayB || null,
        ]
      );
    }
  }

  async getFixtureGamesWithSets(fixtureId) {
    const games = await this.db.all(
      `SELECT fg.*,
              hpA.name as home_player_a_name,
              apA.name as away_player_a_name,
              hpB.name as home_player_b_name,
              apB.name as away_player_b_name
       FROM fixture_games fg
       JOIN players hpA ON fg.home_player_a_id = hpA.id
       JOIN players apA ON fg.away_player_a_id = apA.id
       LEFT JOIN players hpB ON fg.home_player_b_id = hpB.id
       LEFT JOIN players apB ON fg.away_player_b_id = apB.id
       WHERE fg.fixture_id = ?
       ORDER BY fg.game_number ASC`,
      [fixtureId]
    );

    for (const g of games) {
      g.sets = await this.db.all(
        `SELECT *
         FROM fixture_game_sets
         WHERE fixture_game_id = ?
         ORDER BY set_number ASC`,
        [g.id]
      );
    }

    return games;
  }

  async setGameSets(fixtureId, gameNumber, sets) {
    if (!Array.isArray(sets) || sets.length < 3 || sets.length > 5) {
      throw new Error('Sets must be an array with 3 to 5 set score objects');
    }

    await this.assertFixtureSeasonIsActive(fixtureId);

    const game = await this.db.get(
      `SELECT * FROM fixture_games WHERE fixture_id = ? AND game_number = ?`,
      [fixtureId, gameNumber]
    );

    if (!game) {
      throw new Error('Game not found');
    }

    // Replace sets
    await this.db.run('DELETE FROM fixture_game_sets WHERE fixture_game_id = ?', [game.id]);

    let homeSetsWon = 0;
    let awaySetsWon = 0;

    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      if (typeof s.home_points !== 'number' || typeof s.away_points !== 'number') {
        throw new Error('Each set must include numeric home_points and away_points');
      }

      await this.db.run(
        `INSERT INTO fixture_game_sets (id, fixture_game_id, set_number, home_points, away_points)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), game.id, i + 1, s.home_points, s.away_points]
      );

      if (s.home_points > s.away_points) homeSetsWon++;
      if (s.away_points > s.home_points) awaySetsWon++;

      // best-of-5: stop counting once winner is decided
      if (homeSetsWon === 3 || awaySetsWon === 3) {
        // ignore any trailing set entries beyond decision for winner computation,
        // but we already persisted what user sent
        break;
      }
    }

    let winnerSide = null;
    if (homeSetsWon > awaySetsWon) winnerSide = 'home';
    if (awaySetsWon > homeSetsWon) winnerSide = 'away';

    await this.db.run(
      `UPDATE fixture_games
       SET home_sets_won = ?,
           away_sets_won = ?,
           winner_side = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [homeSetsWon, awaySetsWon, winnerSide, game.id]
    );

    await this.recomputeFixtureTotals(fixtureId);

    return this.getFixtureById(fixtureId);
  }

  async recomputeFixtureTotals(fixtureId) {
    const games = await this.db.all(
      `SELECT home_sets_won, away_sets_won, winner_side
       FROM fixture_games
       WHERE fixture_id = ?`,
      [fixtureId]
    );

    const homeGamesWon = games.filter(g => g.winner_side === 'home').length;
    const awayGamesWon = games.filter(g => g.winner_side === 'away').length;

    const homeSetsWon = games.reduce((sum, g) => sum + (g.home_sets_won || 0), 0);
    const awaySetsWon = games.reduce((sum, g) => sum + (g.away_sets_won || 0), 0);

    let status = 'scheduled';
    if (games.length > 0 && games.some(g => g.winner_side)) {
      status = (homeGamesWon + awayGamesWon) === 9 ? 'completed' : 'in_progress';
    }

    await this.db.run(
      `UPDATE fixtures
       SET home_games_won = ?,
           away_games_won = ?,
           home_sets_won = ?,
           away_sets_won = ?,
           status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [homeGamesWon, awayGamesWon, homeSetsWon, awaySetsWon, status, fixtureId]
    );
  }
}

module.exports = FixtureManager;
