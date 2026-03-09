const { v4: uuidv4 } = require('uuid');

class FixtureManager {
  constructor(database) {
    this.db = database;
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
              at.name as away_team_name
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
              at.name as away_team_name
       FROM fixtures f
       JOIN teams ht ON f.home_team_id = ht.id
       JOIN teams at ON f.away_team_id = at.id
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
    const { startDate, team_season_id, division_id, teamIds } = options;

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

    const fixtures = [];
    let dayOffset = 0;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const a = teams[i];
        const b = teams[j];

        const d1 = startDate ? new Date(startDate) : new Date();
        d1.setDate(d1.getDate() + dayOffset);
        d1.setHours(19, 0, 0, 0);

        const d2 = startDate ? new Date(startDate) : new Date();
        d2.setDate(d2.getDate() + dayOffset + 7);
        d2.setHours(19, 0, 0, 0);

        fixtures.push(await this.createFixture({ team_season_id, division_id, home_team_id: a.id, away_team_id: b.id, match_date: d1.toISOString() }));
        fixtures.push(await this.createFixture({ team_season_id, division_id, home_team_id: b.id, away_team_id: a.id, match_date: d2.toISOString() }));

        dayOffset += 7;
      }
    }

    return fixtures;
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

    // Enforce substitution ordering rules:
    // - mains keep their relative order by roster slot (1,2,3)
    // - if a main is missing, remaining mains shift up
    // - subs (slots 4-6) always appear last
    const slotByPlayer = new Map(roster.map(r => [r.player_id, r.slot]));
    const orderedPlayerIds = [...playerIds].sort((a, b) => {
      const sa = slotByPlayer.get(a);
      const sb = slotByPlayer.get(b);
      return sa - sb;
    });

    // Clear old lineup for side
    await this.db.run('DELETE FROM fixture_lineups WHERE fixture_id = ? AND side = ?', [fixtureId, side]);

    for (let idx = 0; idx < 3; idx++) {
      const playerId = orderedPlayerIds[idx];
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
