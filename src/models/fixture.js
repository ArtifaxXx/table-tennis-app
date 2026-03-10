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

  async createOrResetDivisionCup(teamSeasonId, divisionId) {
    if (!teamSeasonId) throw new Error('team_season_id is required');
    if (!divisionId) throw new Error('division_id is required');

    const existing = await this.db.get(
      `SELECT * FROM division_cups WHERE team_season_id = ? AND division_id = ?`,
      [teamSeasonId, divisionId]
    );

    if (!existing) {
      const cupId = uuidv4();
      await this.db.run(
        `INSERT INTO division_cups (id, team_season_id, division_id)
         VALUES (?, ?, ?)`,
        [cupId, teamSeasonId, divisionId]
      );
      return cupId;
    }

    await this.db.run(
      `DELETE FROM division_cup_matches WHERE cup_id = ?`,
      [existing.id]
    );
    return existing.id;
  }

  buildCupBracket(teamIds) {
    const ids = [...teamIds];
    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    const n = ids.length;
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
    const rounds = Math.log2(nextPow2);
    const firstRoundMatchCount = nextPow2 / 2;

    // Distribute byes so we never generate a (null vs null) match.
    // Example: 6 teams => nextPow2=8 => 2 byes => two (team vs null) matches.
    let byes = nextPow2 - n;

    const matches = [];
    // round 1 pairings
    let idx = 0;
    for (let m = 1; m <= firstRoundMatchCount; m++) {
      if (idx >= ids.length) {
        break;
      }

      if (byes > 0) {
        const a = ids[idx++];
        matches.push({ round_number: 1, match_number: m, teamA: a, teamB: null });
        byes--;
        continue;
      }

      const a = ids[idx++];
      const b = idx < ids.length ? ids[idx++] : null;
      matches.push({ round_number: 1, match_number: m, teamA: a, teamB: b });
    }

    // later rounds empty
    for (let r = 2; r <= rounds; r++) {
      const count = nextPow2 / Math.pow(2, r);
      for (let m = 1; m <= count; m++) {
        matches.push({ round_number: r, match_number: m, teamA: null, teamB: null });
      }
    }

    return { matches, rounds };
  }

  async scheduleCupMatches({
    teamSeasonId,
    divisionId,
    cupId,
    divisionTeamIds,
    scheduleStart,
    scheduleEnd,
  }) {
    const allowedDates = buildAllowedDatesUtc({ scheduleStart, scheduleEnd });
    if (allowedDates.length === 0) {
      throw new Error('No available dates in scheduling window after exclusions');
    }

    const divisionTeamIdSet = new Set(divisionTeamIds);

    const existingFixtures = await this.db.all(
      `SELECT match_date, home_team_id, away_team_id
       FROM fixtures
       WHERE team_season_id = ? AND division_id = ? AND match_date IS NOT NULL`,
      [teamSeasonId, divisionId]
    );

    const usedTeamsByDateKey = new Map();
    for (const f of existingFixtures) {
      const dk = dateKeyUtc(new Date(f.match_date));
      if (!usedTeamsByDateKey.has(dk)) usedTeamsByDateKey.set(dk, new Set());
      usedTeamsByDateKey.get(dk).add(f.home_team_id);
      usedTeamsByDateKey.get(dk).add(f.away_team_id);
    }

    const matches = await this.db.all(
      `SELECT * FROM division_cup_matches
       WHERE cup_id = ?
       ORDER BY round_number ASC, match_number ASC`,
      [cupId]
    );

    const maxRound = matches.reduce((m, r) => Math.max(m, r.round_number), 1);
    const targetIdxByRound = frontLoadedTargetIndices(maxRound, allowedDates.length);

    const pickDate = async ({ requirePreferredDay, preferredDayIso, teamA, teamB, nearEnd }) => {
      const maxRadius = Math.max(allowedDates.length, 60);
      const baseIdx = nearEnd ? allowedDates.length - 1 : (targetIdxByRound[0] || 0);

      for (let radius = 0; radius <= maxRadius; radius++) {
        const candidates = [];
        if (baseIdx - radius >= 0) candidates.push(baseIdx - radius);
        if (radius > 0 && baseIdx + radius < allowedDates.length) candidates.push(baseIdx + radius);

        for (const idx of candidates) {
          const dt = allowedDates[idx];
          const dk = dateKeyUtc(dt);
          const used = usedTeamsByDateKey.get(dk) || new Set();
          const iso = weekdayIso1to7Utc(dt);

          if (requirePreferredDay && preferredDayIso && iso !== preferredDayIso) continue;

          if (teamA && used.has(teamA)) continue;
          if (teamB && used.has(teamB)) continue;

          // If a team is unknown, require date to be free for all division teams.
          if (!teamA || !teamB) {
            let any = false;
            for (const tid of used) {
              if (divisionTeamIdSet.has(tid)) {
                any = true;
                break;
              }
            }
            if (any) continue;
          }

          return dt;
        }
      }

      return null;
    };

    // Schedule per round.
    for (let round = 1; round <= maxRound; round++) {
      const roundMatches = matches.filter((m) => m.round_number === round);
      const nearEnd = round === maxRound;

      // Pick a base index for this round.
      const baseIdx = nearEnd ? allowedDates.length - 1 : (targetIdxByRound[round - 1] || 0);
      const baseDt = allowedDates[baseIdx] || allowedDates[0];

      for (const m of roundMatches) {
        // Determine preferred day from home team (if known) for early rounds.
        let preferredDayIso = null;
        if (!nearEnd && m.home_team_id) {
          const home = await this.db.get('SELECT home_day FROM teams WHERE id = ?', [m.home_team_id]);
          preferredDayIso = home?.home_day == null ? null : Number(home.home_day);
        }

        const dt = await pickDate({
          requirePreferredDay: !nearEnd && !!preferredDayIso,
          preferredDayIso,
          teamA: m.home_team_id || null,
          teamB: m.away_team_id || null,
          nearEnd,
          baseDt,
        });

        const best = dt || baseDt;
        const dk = dateKeyUtc(best);
        if (!usedTeamsByDateKey.has(dk)) usedTeamsByDateKey.set(dk, new Set());
        if (m.home_team_id) usedTeamsByDateKey.get(dk).add(m.home_team_id);
        if (m.away_team_id) usedTeamsByDateKey.get(dk).add(m.away_team_id);

        await this.db.run(
          `UPDATE division_cup_matches
           SET match_date = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [best.toISOString(), m.id]
        );
      }
    }
  }

  async createCupFixturesForKnownMatches(teamSeasonId, divisionId, cupId) {
    const matches = await this.db.all(
      `SELECT * FROM division_cup_matches
       WHERE cup_id = ?
       ORDER BY round_number ASC, match_number ASC`,
      [cupId]
    );

    for (const m of matches) {
      if (m.fixture_id) continue;
      if (!m.home_team_id || !m.away_team_id) continue;

      const fixture = await this.createFixture({
        team_season_id: teamSeasonId,
        division_id: divisionId,
        match_type: 'cup',
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        match_date: m.match_date || null,
      });

      await this.db.run(
        `UPDATE division_cup_matches
         SET fixture_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [fixture.id, m.id]
      );
    }
  }

  async advanceCupWinnerFromFixture(fixtureId) {
    const match = await this.db.get(
      `SELECT m.*
       FROM division_cup_matches m
       WHERE m.fixture_id = ?`,
      [fixtureId]
    );
    if (!match) return;

    const fixture = await this.db.get('SELECT * FROM fixtures WHERE id = ?', [fixtureId]);
    if (!fixture) return;
    if ((fixture.match_type || 'league') !== 'cup') return;

    // Determine winner team.
    const homeWon = (fixture.home_games_won || 0) > (fixture.away_games_won || 0);
    const awayWon = (fixture.away_games_won || 0) > (fixture.home_games_won || 0);
    const winnerTeamId = homeWon ? fixture.home_team_id : (awayWon ? fixture.away_team_id : null);
    if (!winnerTeamId) return;

    await this.db.run(
      `UPDATE division_cup_matches
       SET winner_team_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [winnerTeamId, match.id]
    );

    if (!match.next_match_id) return;
    const next = await this.db.get('SELECT * FROM division_cup_matches WHERE id = ?', [match.next_match_id]);
    if (!next) return;

    // Odd match_number feeds home slot, even feeds away slot.
    const isHomeSlot = (match.match_number % 2) === 1;
    const nextHome = isHomeSlot ? winnerTeamId : next.home_team_id;
    const nextAway = isHomeSlot ? next.away_team_id : winnerTeamId;

    await this.db.run(
      `UPDATE division_cup_matches
       SET home_team_id = ?, away_team_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextHome || null, nextAway || null, next.id]
    );

    const updatedNext = await this.db.get('SELECT * FROM division_cup_matches WHERE id = ?', [next.id]);
    if (!updatedNext) return;
    if (updatedNext.fixture_id) return;
    if (!updatedNext.home_team_id || !updatedNext.away_team_id) return;

    const cup = await this.db.get('SELECT * FROM division_cups WHERE id = ?', [updatedNext.cup_id]);
    if (!cup) return;

    const fixtureNext = await this.createFixture({
      team_season_id: cup.team_season_id,
      division_id: cup.division_id,
      match_type: 'cup',
      home_team_id: updatedNext.home_team_id,
      away_team_id: updatedNext.away_team_id,
      match_date: updatedNext.match_date || null,
    });

    await this.db.run(
      `UPDATE division_cup_matches
       SET fixture_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [fixtureNext.id, updatedNext.id]
    );
  }

  async generateDivisionCup(options = {}) {
    const {
      team_season_id,
      division_id,
      teamIds,
      schedule_start_date,
      schedule_end_date,
    } = options;

    if (!team_season_id) throw new Error('team_season_id is required');
    if (!division_id) throw new Error('division_id is required');

    const ids = Array.isArray(teamIds) ? teamIds.filter(Boolean) : [];
    if (ids.length < 2) {
      throw new Error('At least 2 teams are required to generate a cup draw for a division');
    }

    const scheduleStart = schedule_start_date ? new Date(schedule_start_date) : null;
    const scheduleEnd = schedule_end_date ? new Date(schedule_end_date) : null;
    if (!scheduleStart || Number.isNaN(scheduleStart.getTime())) {
      throw new Error('schedule_start_date is required and must be a valid date');
    }
    if (!scheduleEnd || Number.isNaN(scheduleEnd.getTime())) {
      throw new Error('schedule_end_date is required and must be a valid date');
    }

    const cupId = await this.createOrResetDivisionCup(team_season_id, division_id);
    const { matches } = this.buildCupBracket(ids);

    // Insert match rows, randomize home/away when both teams known.
    const idByKey = new Map();
    for (const m of matches) {
      const id = uuidv4();
      let home = m.teamA;
      let away = m.teamB;
      if (home && away && Math.random() < 0.5) {
        [home, away] = [away, home];
      }

      await this.db.run(
        `INSERT INTO division_cup_matches (
           id, cup_id, round_number, match_number, home_team_id, away_team_id
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, cupId, m.round_number, m.match_number, home || null, away || null]
      );
      idByKey.set(`${m.round_number}:${m.match_number}`, id);
    }

    // Link next_match_id pointers.
    for (const m of matches) {
      const key = `${m.round_number}:${m.match_number}`;
      const id = idByKey.get(key);
      if (!id) continue;
      const nextRound = m.round_number + 1;
      const nextMatchNumber = Math.ceil(m.match_number / 2);
      const nextId = idByKey.get(`${nextRound}:${nextMatchNumber}`) || null;
      if (!nextId) continue;
      await this.db.run(
        `UPDATE division_cup_matches
         SET next_match_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextId, id]
      );
    }

    // Resolve byes immediately (and propagate until stable).
    // This ensures you don't get stuck with a TBD match preventing later rounds.
    let changed = true;
    while (changed) {
      changed = false;
      const inserted = await this.db.all(
        `SELECT * FROM division_cup_matches WHERE cup_id = ? ORDER BY round_number ASC, match_number ASC`,
        [cupId]
      );

      for (const m of inserted) {
        const hasHome = !!m.home_team_id;
        const hasAway = !!m.away_team_id;
        const alreadyHasWinner = !!m.winner_team_id;

        if (!alreadyHasWinner && ((hasHome && !hasAway) || (!hasHome && hasAway))) {
          const winner = hasHome ? m.home_team_id : m.away_team_id;
          await this.db.run(
            `UPDATE division_cup_matches
             SET winner_team_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [winner, m.id]
          );
          changed = true;
        }

        const winnerTeamId = m.winner_team_id || (hasHome && !hasAway ? m.home_team_id : (!hasHome && hasAway ? m.away_team_id : null));
        if (!winnerTeamId) continue;
        if (!m.next_match_id) continue;

        const next = await this.db.get('SELECT * FROM division_cup_matches WHERE id = ?', [m.next_match_id]);
        if (!next) continue;

        const isHomeSlot = (m.match_number % 2) === 1;
        const nextHome = isHomeSlot ? winnerTeamId : next.home_team_id;
        const nextAway = isHomeSlot ? next.away_team_id : winnerTeamId;

        if ((nextHome || null) !== (next.home_team_id || null) || (nextAway || null) !== (next.away_team_id || null)) {
          await this.db.run(
            `UPDATE division_cup_matches
             SET home_team_id = ?, away_team_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [nextHome || null, nextAway || null, next.id]
          );
          changed = true;
        }
      }
    }

    await this.scheduleCupMatches({
      teamSeasonId: team_season_id,
      divisionId: division_id,
      cupId,
      divisionTeamIds: ids,
      scheduleStart,
      scheduleEnd,
    });

    await this.createCupFixturesForKnownMatches(team_season_id, division_id, cupId);
    return cupId;
  }

  async getDivisionCup(teamSeasonId, divisionId) {
    if (!teamSeasonId) throw new Error('team_season_id is required');
    if (!divisionId) throw new Error('division_id is required');

    const cup = await this.db.get(
      `SELECT * FROM division_cups WHERE team_season_id = ? AND division_id = ?`,
      [teamSeasonId, divisionId]
    );
    if (!cup) return null;

    const matches = await this.db.all(
      `SELECT m.*, 
              ht.name as home_team_name,
              at.name as away_team_name,
              wt.name as winner_team_name,
              f.match_date as fixture_match_date,
              f.status as fixture_status,
              f.home_games_won as fixture_home_games_won,
              f.away_games_won as fixture_away_games_won
       FROM division_cup_matches m
       LEFT JOIN teams ht ON m.home_team_id = ht.id
       LEFT JOIN teams at ON m.away_team_id = at.id
       LEFT JOIN teams wt ON m.winner_team_id = wt.id
       LEFT JOIN fixtures f ON m.fixture_id = f.id
       WHERE m.cup_id = ?
       ORDER BY m.round_number ASC, m.match_number ASC`,
      [cup.id]
    );

    return { cup, matches };
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
    const { team_season_id, division_id, home_team_id, away_team_id, match_date, match_type } = fixtureData;

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
      `INSERT INTO fixtures (id, team_season_id, division_id, match_type, home_team_id, away_team_id, match_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, team_season_id, division_id || null, match_type || 'league', home_team_id, away_team_id, match_date]
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
                    AND (
                      CASE
                        WHEN (f.match_type IS NULL OR f.match_type = 'league') THEN
                          (SELECT COUNT(*) FROM fixture_game_sets s WHERE s.fixture_game_id = fg.id) < 3
                        ELSE
                          (fg.winner_side IS NOT NULL AND (SELECT COUNT(*) FROM fixture_game_sets s WHERE s.fixture_game_id = fg.id) < 3)
                      END
                    )
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

    const fixture = await this.db.get('SELECT * FROM fixtures WHERE id = ?', [fixtureId]);
    if (!fixture) throw new Error('Fixture not found');

    if (!Array.isArray(playerIds) || playerIds.length !== 3) {
      throw new Error('Lineup must contain exactly 3 player IDs in day ranking order');
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
        `INSERT OR IGNORE INTO fixture_games (
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

    const fixture = await this.db.get('SELECT * FROM fixtures WHERE id = ?', [fixtureId]);
    if (!fixture) {
      throw new Error('Fixture not found');
    }

    if ((fixture.match_type || 'league') === 'cup') {
      const rows = await this.db.all(
        `SELECT game_number, winner_side
         FROM fixture_games
         WHERE fixture_id = ?
         ORDER BY game_number ASC`,
        [fixtureId]
      );
      const winnerByNum = new Map(rows.map((r) => [Number(r.game_number), r.winner_side]));
      let homeWins = 0;
      let awayWins = 0;
      for (let n = 1; n < Number(gameNumber); n++) {
        const w = winnerByNum.get(n);
        if (w !== 'home' && w !== 'away') {
          throw new Error('Cup games must be completed in order');
        }
        if (w === 'home') homeWins++;
        if (w === 'away') awayWins++;
        if (homeWins >= 5 || awayWins >= 5) {
          throw new Error('Cup fixture is already decided');
        }
      }
    }

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

    await this.advanceCupWinnerFromFixture(fixtureId);

    return this.getFixtureById(fixtureId);
  }

  async setFixtureGameSets(fixtureId, games) {
    if (!Array.isArray(games) || games.length === 0) {
      throw new Error('games must be a non-empty array');
    }

    await this.assertFixtureSeasonIsActive(fixtureId);

    const fixture = await this.db.get('SELECT * FROM fixtures WHERE id = ?', [fixtureId]);
    if (!fixture) throw new Error('Fixture not found');
    const matchType = fixture.match_type || 'league';

    const gameRows = await this.db.all(
      `SELECT id, game_number
       FROM fixture_games
       WHERE fixture_id = ?`,
      [fixtureId]
    );
    const gameIdByNumber = new Map(gameRows.map((g) => [g.game_number, g.id]));

    await this.db.run('BEGIN');
    try {
      const sortedGames = [...games].sort((a, b) => Number(a?.game_number) - Number(b?.game_number));
      let cupHomeWins = 0;
      let cupAwayWins = 0;
      let cupDecided = false;
      let cupLastDecidedGameNumber = 0;

      for (const g of sortedGames) {
        const gameNumber = Number(g?.game_number);
        const sets = g?.sets;

        if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 9) {
          throw new Error('Each game must include a valid game_number (1-9)');
        }
        if (!Array.isArray(sets) || sets.length < 3 || sets.length > 5) {
          throw new Error('Each game must include sets with 3 to 5 set score objects');
        }

        const fixtureGameId = gameIdByNumber.get(gameNumber);
        if (!fixtureGameId) {
          throw new Error(`Game not found: ${gameNumber}`);
        }

        if (matchType === 'cup') {
          if (cupDecided) {
            const hasAnyPoints = Array.isArray(sets) && sets.some((s) => (Number(s?.home_points) || 0) !== 0 || (Number(s?.away_points) || 0) !== 0);
            if (hasAnyPoints) {
              throw new Error('Cup fixture is already decided');
            }
            continue;
          }

          // Must be sequentially decided: cannot score game N unless game N-1 has a winner.
          if (gameNumber !== cupLastDecidedGameNumber + 1) {
            const hasAnyPoints = Array.isArray(sets) && sets.some((s) => (Number(s?.home_points) || 0) !== 0 || (Number(s?.away_points) || 0) !== 0);
            if (hasAnyPoints) {
              throw new Error('Cup games must be completed in order');
            }
            continue;
          }
        }

        await this.db.run('DELETE FROM fixture_game_sets WHERE fixture_game_id = ?', [fixtureGameId]);

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
            [uuidv4(), fixtureGameId, i + 1, s.home_points, s.away_points]
          );

          if (s.home_points > s.away_points) homeSetsWon++;
          if (s.away_points > s.home_points) awaySetsWon++;

          if (homeSetsWon === 3 || awaySetsWon === 3) {
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
          [homeSetsWon, awaySetsWon, winnerSide, fixtureGameId]
        );

        if (matchType === 'cup') {
          if (winnerSide !== 'home' && winnerSide !== 'away') {
            // Not decided yet, so we can't proceed to later games.
            break;
          }
          if (winnerSide === 'home') cupHomeWins++;
          if (winnerSide === 'away') cupAwayWins++;
          cupLastDecidedGameNumber = gameNumber;
          if (cupHomeWins >= 5 || cupAwayWins >= 5) {
            cupDecided = true;
          }
        }
      }

      await this.recomputeFixtureTotals(fixtureId);
      await this.db.run('COMMIT');
    } catch (e) {
      await this.db.run('ROLLBACK');
      throw e;
    }

    await this.advanceCupWinnerFromFixture(fixtureId);

    return this.getFixtureById(fixtureId);
  }

  async recomputeFixtureTotals(fixtureId) {
    const fixture = await this.db.get('SELECT match_type FROM fixtures WHERE id = ?', [fixtureId]);
    const matchType = fixture?.match_type || 'league';
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
      if (matchType === 'cup') {
        status = (homeGamesWon >= 5 || awayGamesWon >= 5) ? 'completed' : 'in_progress';
      } else {
        status = (homeGamesWon + awayGamesWon) === 9 ? 'completed' : 'in_progress';
      }
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
