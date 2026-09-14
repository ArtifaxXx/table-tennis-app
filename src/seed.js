const Database = require('./database');
const TeamManager = require('./models/team');
const TeamSeasonManager = require('./models/teamSeason');
const FixtureManager = require('./models/fixture');
const { v4: uuidv4 } = require('uuid');

async function seedDatabase(db) {
  await db.run('PRAGMA synchronous = OFF');
  await db.run('PRAGMA temp_store = MEMORY');
  await db.run('PRAGMA cache_size = -20000');

  const teamManager = new TeamManager(db);
  const teamSeasonManager = new TeamSeasonManager(db);
  const fixtureManager = new FixtureManager(db);

  const hashInt = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  };

  const makeGames = (winnerSide, variantSeed) => {
    // Best-of-5, return 3 to 5 games. Keep it simple but varied.
    // Always ends when one side reaches 3 games.
    const games = [];
    let homeGames = 0;
    let awayGames = 0;

    const pickLoserPoints = (k) => {
      // include a few close/deuce-ish scores to vary results
      const options = [3, 4, 5, 6, 7, 8, 9, 10];
      return options[(variantSeed + k) % options.length];
    };

    const pickWinnerPoints = (k) => {
      // sometimes go beyond 11 to simulate deuce games
      const options = [11, 11, 11, 12, 13];
      return options[(variantSeed + k) % options.length];
    };

    let gameIndex = 0;
    while (homeGames < 3 && awayGames < 3 && gameIndex < 5) {
      const winnerThisGame = ((variantSeed + gameIndex) % 4 === 0)
        ? (winnerSide === 'home' ? 'away' : 'home')
        : winnerSide;
      const loserPoints = pickLoserPoints(gameIndex);
      const winnerPoints = pickWinnerPoints(gameIndex);

      if (winnerThisGame === 'home') {
        games.push({ home_points: winnerPoints, away_points: loserPoints });
        homeGames++;
      } else {
        games.push({ home_points: loserPoints, away_points: winnerPoints });
        awayGames++;
      }

      gameIndex++;
    }

    // ensure match winner matches requested winnerSide
    if (winnerSide === 'home' && homeGames < 3) {
      while (homeGames < 3 && games.length < 5) {
        games.push({ home_points: pickWinnerPoints(games.length), away_points: pickLoserPoints(games.length) });
        homeGames++;
      }
    }
    if (winnerSide === 'away' && awayGames < 3) {
      while (awayGames < 3 && games.length < 5) {
        games.push({ home_points: pickLoserPoints(games.length), away_points: pickWinnerPoints(games.length) });
        awayGames++;
      }
    }

    return games;
  };

  const makeFixedGames = (winnerSide, loserGames, variantSeed) => {
    const totalGames = 3 + loserGames;
    const games = [];
    const pickLoserPoints = (k) => {
      const options = [3, 4, 5, 6, 7, 8, 9, 10];
      return options[(variantSeed + k) % options.length];
    };
    const pickWinnerPoints = (k) => {
      const options = [11, 11, 11, 12, 13];
      return options[(variantSeed + k) % options.length];
    };

    const sequence = [];
    sequence.push(winnerSide);
    sequence.push(winnerSide);
    for (let i = 0; i < loserGames; i++) sequence.push(winnerSide === 'home' ? 'away' : 'home');
    sequence.push(winnerSide);

    for (let i = 0; i < totalGames; i++) {
      const win = sequence[i];
      const loserPts = pickLoserPoints(i);
      const winnerPts = pickWinnerPoints(i);
      if (win === 'home') {
        games.push({ home_points: winnerPts, away_points: loserPts });
      } else {
        games.push({ home_points: loserPts, away_points: winnerPts });
      }
    }

    return games;
  };

  const getMainRoster = async (teamId) => {
    const rows = await db.all(
      `SELECT player_id, slot
       FROM team_roster
       WHERE team_id = ? AND active = 1
       ORDER BY slot ASC`,
      [teamId]
    );
    const main = rows.filter((r) => r.slot <= 3).map((r) => r.player_id);
    if (main.length !== 3) {
      throw new Error('Seed requires each team to have 3 main roster players');
    }
    return main;
  };

  const completeFixture = async (fixtureId) => {
    // Fast completion: write fixture_matches rows directly (no per-game rows), and update fixture totals.
    const fixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [fixtureId]);
    if (!fixture) throw new Error('Fixture not found');

    if ((fixture.match_type || 'league') === 'cup') {
      return completeCupFixture(fixtureId);
    }

    const homeMain = await getMainRoster(fixture.home_team_id);
    const awayMain = await getMainRoster(fixture.away_team_id);

    const H1 = homeMain[0];
    const H2 = homeMain[1];
    const H3 = homeMain[2];
    const A1 = awayMain[0];
    const A2 = awayMain[1];
    const A3 = awayMain[2];

    await db.run('DELETE FROM fixture_lineups WHERE fixture_id = ?', [fixtureId]);
    await db.run(
      `INSERT INTO fixture_lineups (id, fixture_id, side, day_rank, player_id, is_sub)
       VALUES
         (?, ?, 'home', 1, ?, 0),
         (?, ?, 'home', 2, ?, 0),
         (?, ?, 'home', 3, ?, 0),
         (?, ?, 'away', 1, ?, 0),
         (?, ?, 'away', 2, ?, 0),
         (?, ?, 'away', 3, ?, 0)`,
      [
        uuidv4(), fixtureId, H1,
        uuidv4(), fixtureId, H2,
        uuidv4(), fixtureId, H3,
        uuidv4(), fixtureId, A1,
        uuidv4(), fixtureId, A2,
        uuidv4(), fixtureId, A3,
      ]
    );

    const hBase = hashInt(`${fixtureId}:match`);
    const matchWinner = (hBase % 2 === 0) ? 'home' : 'away';
    const marginOptions = [0, 1, 2, 3, 4];
    const margin = marginOptions[(hBase >>> 3) % marginOptions.length];
    const winnerMatches = 9 - margin;
    const homeTarget = matchWinner === 'home' ? winnerMatches : (9 - winnerMatches);

    const winners = [];
    for (let i = 0; i < 9; i++) {
      winners.push(i < homeTarget ? 'home' : 'away');
    }
    // deterministic shuffle
    for (let i = winners.length - 1; i > 0; i--) {
      const j = hashInt(`${fixtureId}:shuffle:${i}`) % (i + 1);
      const tmp = winners[i];
      winners[i] = winners[j];
      winners[j] = tmp;
    }

    await db.run('DELETE FROM fixture_match_games WHERE fixture_match_id IN (SELECT id FROM fixture_matches WHERE fixture_id = ?)', [fixtureId]);
    await db.run('DELETE FROM fixture_matches WHERE fixture_id = ?', [fixtureId]);

    const matches = [
      // 1-3 singles
      { match_number: 1, match_type: 'singles', homeA: H1, awayA: A2 },
      { match_number: 2, match_type: 'singles', homeA: H2, awayA: A3 },
      { match_number: 3, match_type: 'singles', homeA: H3, awayA: A1 },
      // 4-6 doubles
      { match_number: 4, match_type: 'doubles', homeA: H1, homeB: H2, awayA: A1, awayB: A2 },
      { match_number: 5, match_type: 'doubles', homeA: H1, homeB: H3, awayA: A1, awayB: A3 },
      { match_number: 6, match_type: 'doubles', homeA: H2, homeB: H3, awayA: A2, awayB: A3 },
      // 7-9 singles
      { match_number: 7, match_type: 'singles', homeA: H1, awayA: A1 },
      { match_number: 8, match_type: 'singles', homeA: H2, awayA: A2 },
      { match_number: 9, match_type: 'singles', homeA: H3, awayA: A3 },
    ];

    let homeMatchesWon = 0;
    let awayMatchesWon = 0;
    let homeGamesWon = 0;
    let awayGamesWon = 0;

    for (const g of matches) {
      const h = hashInt(`${fixtureId}:${g.match_number}`);
      const winnerSide = winners[g.match_number - 1];
      const loserGamesOptions = [0, 1, 2];
      const loserGames = loserGamesOptions[h % loserGamesOptions.length];
      const winnerGames = 3;
      const homeWin = winnerSide === 'home';

      const games = makeFixedGames(winnerSide, loserGames, h);

      const row = {
        id: uuidv4(),
        fixture_id: fixtureId,
        match_number: g.match_number,
        match_type: g.match_type,
        home_player_a_id: g.homeA,
        away_player_a_id: g.awayA,
        home_player_b_id: g.homeB || null,
        away_player_b_id: g.awayB || null,
        home_games_won: homeWin ? winnerGames : loserGames,
        away_games_won: homeWin ? loserGames : winnerGames,
        winner_side: winnerSide,
      };

      if (winnerSide === 'home') homeMatchesWon++;
      if (winnerSide === 'away') awayMatchesWon++;
      homeGamesWon += row.home_games_won;
      awayGamesWon += row.away_games_won;

      await db.run(
        `INSERT INTO fixture_matches (
           id, fixture_id, match_number, match_type,
           home_player_a_id, away_player_a_id, home_player_b_id, away_player_b_id,
           home_games_won, away_games_won, winner_side
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.fixture_id,
          row.match_number,
          row.match_type,
          row.home_player_a_id,
          row.away_player_a_id,
          row.home_player_b_id,
          row.away_player_b_id,
          row.home_games_won,
          row.away_games_won,
          row.winner_side,
        ]
      );

      for (let i = 0; i < games.length; i++) {
        const s = games[i];
        await db.run(
          `INSERT INTO fixture_match_games (id, fixture_match_id, game_number, home_points, away_points)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), row.id, i + 1, s.home_points, s.away_points]
        );
      }
    }

    await db.run(
      `UPDATE fixtures
       SET home_matches_won = ?,
           away_matches_won = ?,
           home_games_won = ?,
           away_games_won = ?,
           status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [homeMatchesWon, awayMatchesWon, homeGamesWon, awayGamesWon, fixtureId]
    );
  };

  const completeCupFixture = async (fixtureId) => {
    const fixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [fixtureId]);
    if (!fixture) throw new Error('Fixture not found');

    const homeMain = await getMainRoster(fixture.home_team_id);
    const awayMain = await getMainRoster(fixture.away_team_id);

    const H1 = homeMain[0];
    const H2 = homeMain[1];
    const H3 = homeMain[2];
    const A1 = awayMain[0];
    const A2 = awayMain[1];
    const A3 = awayMain[2];

    await db.run('DELETE FROM fixture_lineups WHERE fixture_id = ?', [fixtureId]);
    await db.run(
      `INSERT INTO fixture_lineups (id, fixture_id, side, day_rank, player_id, is_sub)
       VALUES
         (?, ?, 'home', 1, ?, 0),
         (?, ?, 'home', 2, ?, 0),
         (?, ?, 'home', 3, ?, 0),
         (?, ?, 'away', 1, ?, 0),
         (?, ?, 'away', 2, ?, 0),
         (?, ?, 'away', 3, ?, 0)`,
      [
        uuidv4(), fixtureId, H1,
        uuidv4(), fixtureId, H2,
        uuidv4(), fixtureId, H3,
        uuidv4(), fixtureId, A1,
        uuidv4(), fixtureId, A2,
        uuidv4(), fixtureId, A3,
      ]
    );

    const hBase = hashInt(`${fixtureId}:cup`);
    const matchWinner = (hBase % 2 === 0) ? 'home' : 'away';
    const loserWinsOptions = [0, 1, 2, 3, 4];
    const loserWins = loserWinsOptions[(hBase >>> 3) % loserWinsOptions.length];
    const playedMatchCount = 5 + loserWins;

    const winners = [];
    const winnerWinsNeeded = 5;
    let homeWins = 0;
    let awayWins = 0;
    for (let i = 0; i < playedMatchCount; i++) {
      const preferWinner = ((hBase + i) % 3) !== 0;
      const nextWinner = preferWinner ? matchWinner : (matchWinner === 'home' ? 'away' : 'home');
      if (nextWinner === 'home') {
        if (homeWins < (matchWinner === 'home' ? winnerWinsNeeded : loserWins)) {
          winners.push('home');
          homeWins++;
        } else {
          winners.push('away');
          awayWins++;
        }
      } else {
        if (awayWins < (matchWinner === 'away' ? winnerWinsNeeded : loserWins)) {
          winners.push('away');
          awayWins++;
        } else {
          winners.push('home');
          homeWins++;
        }
      }
    }

    // Force exact counts: 5 wins for winner, loserWins for loser.
    const targetHome = matchWinner === 'home' ? 5 : loserWins;
    const targetAway = matchWinner === 'away' ? 5 : loserWins;
    const fixCounts = () => {
      let h = winners.filter((w) => w === 'home').length;
      let a = winners.length - h;
      for (let i = 0; i < winners.length && (h !== targetHome || a !== targetAway); i++) {
        if (h > targetHome && winners[i] === 'home') {
          winners[i] = 'away';
          h--; a++;
        } else if (a > targetAway && winners[i] === 'away') {
          winners[i] = 'home';
          a--; h++;
        }
      }
    };
    fixCounts();

    await db.run('DELETE FROM fixture_match_games WHERE fixture_match_id IN (SELECT id FROM fixture_matches WHERE fixture_id = ?)', [fixtureId]);
    await db.run('DELETE FROM fixture_matches WHERE fixture_id = ?', [fixtureId]);

    const matches = [
      { match_number: 1, match_type: 'singles', homeA: H1, awayA: A2 },
      { match_number: 2, match_type: 'singles', homeA: H2, awayA: A3 },
      { match_number: 3, match_type: 'singles', homeA: H3, awayA: A1 },
      { match_number: 4, match_type: 'doubles', homeA: H1, homeB: H2, awayA: A1, awayB: A2 },
      { match_number: 5, match_type: 'doubles', homeA: H1, homeB: H3, awayA: A1, awayB: A3 },
      { match_number: 6, match_type: 'doubles', homeA: H2, homeB: H3, awayA: A2, awayB: A3 },
      { match_number: 7, match_type: 'singles', homeA: H1, awayA: A1 },
      { match_number: 8, match_type: 'singles', homeA: H2, awayA: A2 },
      { match_number: 9, match_type: 'singles', homeA: H3, awayA: A3 },
    ];

    let homeMatchesWon = 0;
    let awayMatchesWon = 0;
    let homeGamesWon = 0;
    let awayGamesWon = 0;

    for (const g of matches) {
      const h = hashInt(`${fixtureId}:${g.match_number}:cup`);
      const played = g.match_number <= playedMatchCount;
      const winnerSide = played ? winners[g.match_number - 1] : null;
      const loserGamesOptions = [0, 1, 2];
      const loserGames = loserGamesOptions[h % loserGamesOptions.length];
      const winnerGames = 3;
      const homeWin = winnerSide === 'home';

      const row = {
        id: uuidv4(),
        fixture_id: fixtureId,
        match_number: g.match_number,
        match_type: g.match_type,
        home_player_a_id: g.homeA,
        away_player_a_id: g.awayA,
        home_player_b_id: g.homeB || null,
        away_player_b_id: g.awayB || null,
        home_games_won: played ? (homeWin ? winnerGames : loserGames) : 0,
        away_games_won: played ? (homeWin ? loserGames : winnerGames) : 0,
        winner_side: winnerSide,
      };

      if (winnerSide === 'home') homeMatchesWon++;
      if (winnerSide === 'away') awayMatchesWon++;
      homeGamesWon += row.home_games_won;
      awayGamesWon += row.away_games_won;

      await db.run(
        `INSERT INTO fixture_matches (
           id, fixture_id, match_number, match_type,
           home_player_a_id, away_player_a_id, home_player_b_id, away_player_b_id,
           home_games_won, away_games_won, winner_side
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.fixture_id,
          row.match_number,
          row.match_type,
          row.home_player_a_id,
          row.away_player_a_id,
          row.home_player_b_id,
          row.away_player_b_id,
          row.home_games_won,
          row.away_games_won,
          row.winner_side,
        ]
      );

      if (played) {
        const games = makeFixedGames(winnerSide, loserGames, h);
        for (let i = 0; i < games.length; i++) {
          const s = games[i];
          await db.run(
            `INSERT INTO fixture_match_games (id, fixture_match_id, game_number, home_points, away_points)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), row.id, i + 1, s.home_points, s.away_points]
          );
        }
      }
    }

    await db.run(
      `UPDATE fixtures
       SET home_matches_won = ?,
           away_matches_won = ?,
           home_games_won = ?,
           away_games_won = ?,
           status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [homeMatchesWon, awayMatchesWon, homeGamesWon, awayGamesWon, fixtureId]
    );

    await fixtureManager.advanceCupWinnerFromFixture(fixtureId);
  };

  const divisionTemplates = [
    { name: 'Premier', teamCount: 6 },
    { name: 'Division 1A', teamCount: 6 },
    { name: 'Division 1B', teamCount: 6 },
    { name: 'Division 2', teamCount: 6 },
  ];

  const teams = [];
  let teamNum = 1;
  for (const d of divisionTemplates) {
    for (let i = 0; i < d.teamCount; i++) {
      teams.push({
        name: `${d.name} Team ${i + 1}`,
        playerCount: 5,
        contact_name: `Contact ${teamNum}`,
        contact_phone: `555-${String(1000 + teamNum).padStart(4, '0')}`,
        divisionName: d.name,
      });
      teamNum++;
    }
  }

  let playerIndex = 1;

  const createdTeamsByDivisionName = new Map();

  // Clean existing data (team league + legacy individual matches)
  // Order matters due to foreign keys.
  await db.run('DELETE FROM division_cup_matches');
  await db.run('DELETE FROM division_cups');
  await db.run('DELETE FROM fixture_match_games');
  await db.run('DELETE FROM fixture_matches');
  await db.run('DELETE FROM fixture_lineups');
  await db.run('DELETE FROM fixtures');
  await db.run('DELETE FROM team_season_division_teams');
  await db.run('DELETE FROM team_season_divisions');
  await db.run('DELETE FROM team_roster');
  await db.run('DELETE FROM teams');
  await db.run('DELETE FROM team_seasons');
  await db.run('DELETE FROM matches');
  await db.run('DELETE FROM season_participants');
  await db.run('DELETE FROM seasons');
  await db.run('DELETE FROM players');

  let teamSeedIndex = 0;
  for (const t of teams) {
    // Assign most teams a preferred home day (Mon-Fri), leaving some teams without one.
    // Deterministic distribution to keep seed stable.
    const homeDay = (teamSeedIndex % 8 === 0) ? null : ((teamSeedIndex % 5) + 1);
    const team = await teamManager.createTeam({
      name: t.name,
      contact_name: t.contact_name,
      contact_phone: t.contact_phone,
      home_day: homeDay,
    });

    teamSeedIndex++;

    if (!createdTeamsByDivisionName.has(t.divisionName)) {
      createdTeamsByDivisionName.set(t.divisionName, []);
    }
    createdTeamsByDivisionName.get(t.divisionName).push(team.id);

    const createdPlayers = [];
    for (let i = 0; i < t.playerCount; i++) {
      const name = `${t.name} Player ${i + 1}`;
      const email = `p${playerIndex}@example.com`;
      const phone = `555-010${String(playerIndex).padStart(2, '0')}`;
      const skillLevel = 1 + ((playerIndex - 1) % 5);

      const id = `seed-player-${playerIndex}`;
      await db.run(
        `INSERT INTO players (id, name, email, phone, skill_level, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [id, name, email, phone, skillLevel]
      );
      createdPlayers.push(id);
      playerIndex++;
    }

    const main = createdPlayers.slice(0, 3);
    const subs = createdPlayers.slice(3);

    await teamManager.setTeamRoster(team.id, { main, subs });
  }

  const createDivision = async (teamSeasonId, name, sortOrder) => {
    const id = uuidv4();
    await db.run(
      `INSERT INTO team_season_divisions (id, team_season_id, name, sort_order, active)
       VALUES (?, ?, ?, ?, 1)`,
      [id, teamSeasonId, name, sortOrder]
    );
    return id;
  };

  const setDivisionTeams = async (teamSeasonId, divisionId, teamIds) => {
    for (const teamId of teamIds) {
      await db.run(
        `INSERT INTO team_season_division_teams (id, team_season_id, division_id, team_id)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), teamSeasonId, divisionId, teamId]
      );
    }
  };

  // Seed seasons with divisions + fixtures + results
  const years = [2024, 2025, 2026];

  for (const year of years) {
    const scheduleStart = new Date(Date.UTC(year, 0, 10, 0, 0, 0, 0)).toISOString();
    const scheduleEnd = new Date(Date.UTC(year, 11, 15, 23, 59, 59, 999)).toISOString();
    const season = await teamSeasonManager.createSeason({
      name: String(year),
      schedule_start_date: scheduleStart,
      schedule_end_date: scheduleEnd,
    });

    // createSeason() ensures at least one default division exists.
    // For deterministic seeding, remove any auto-created divisions and re-create our templates.
    await db.run('DELETE FROM team_season_division_teams WHERE team_season_id = ?', [season.id]);
    await db.run('DELETE FROM team_season_divisions WHERE team_season_id = ?', [season.id]);

    const divisionIds = [];
    for (let i = 0; i < divisionTemplates.length; i++) {
      const d = divisionTemplates[i];
      const divisionId = await createDivision(season.id, d.name, i);
      divisionIds.push({ id: divisionId, name: d.name });

      const teamIds = createdTeamsByDivisionName.get(d.name) || [];
      await setDivisionTeams(season.id, divisionId, teamIds);
    }

    const allFixtures = [];
    for (const d of divisionIds) {
      const teamIds = createdTeamsByDivisionName.get(d.name) || [];
      const fixtures = await fixtureManager.generateDoubleRoundRobinSchedule({
        team_season_id: season.id,
        division_id: d.id,
        teamIds,
        schedule_start_date: scheduleStart,
        schedule_end_date: scheduleEnd,
      });
      allFixtures.push(...fixtures);

      await fixtureManager.generateDivisionCup({
        team_season_id: season.id,
        division_id: d.id,
        teamIds,
        schedule_start_date: scheduleStart,
        schedule_end_date: scheduleEnd,
      });
    }

    await teamSeasonManager.setSeasonReady(season.id);
    await teamSeasonManager.startSeason(season.id);

    if (year === 2026) {
      // In progress: complete half of fixtures in EACH division.
      const byDivision = new Map();
      for (const f of allFixtures) {
        if (!byDivision.has(f.division_id)) byDivision.set(f.division_id, []);
        byDivision.get(f.division_id).push(f);
      }

      for (const [divisionId, fixtures] of byDivision.entries()) {
        const toCompleteCount = Math.floor(fixtures.length / 2);
        const toComplete = fixtures.slice(0, toCompleteCount);
        for (const f of toComplete) {
          await completeFixture(f.id);
        }

        // Mark remaining as scheduled explicitly
        const remaining = fixtures.slice(toCompleteCount);
        for (const f of remaining) {
          await db.run(
            `UPDATE fixtures
             SET status = 'scheduled',
                 home_matches_won = 0,
                 away_matches_won = 0,
                 home_games_won = 0,
                 away_games_won = 0,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [f.id]
          );
        }
      }

      // Also partially play cups: complete all round 1 fixtures, and then complete about half of
      // the remaining created cup fixtures.
      const cupFixtures = await db.all(
        `SELECT id
         FROM fixtures
         WHERE team_season_id = ? AND (match_type = 'cup')
         ORDER BY match_date ASC, created_at ASC`,
        [season.id]
      );
      const toCompleteCup = cupFixtures.slice(0, Math.ceil(cupFixtures.length / 2));
      for (const f of toCompleteCup) {
        await completeFixture(f.id);
      }
    } else {
      // Completed seasons: complete all fixtures
      for (const f of allFixtures) {
        await completeFixture(f.id);
      }

      // Complete all cup fixtures, including those created later as winners advance.
      // Loop until there are no non-completed cup fixtures remaining.
      let safety = 0;
      while (safety < 50) {
        safety++;
        const pendingCup = await db.all(
          `SELECT id
           FROM fixtures
           WHERE team_season_id = ?
             AND (match_type = 'cup')
             AND (status IS NULL OR status != 'completed')
           ORDER BY match_date ASC, created_at ASC`,
          [season.id]
        );
        if (!pendingCup || pendingCup.length === 0) break;
        for (const f of pendingCup) {
          await completeFixture(f.id);
        }
      }

      await teamSeasonManager.stopSeason(season.id);
    }
  }

  const allTeams = await db.all('SELECT id, name FROM teams ORDER BY name');
  const homeDayCounts = await db.all(
    `SELECT COALESCE(home_day, -1) as home_day, COUNT(*) as count
     FROM teams
     WHERE active = 1
     GROUP BY COALESCE(home_day, -1)
     ORDER BY home_day`,
    []
  );
  const allPlayers = await db.get('SELECT COUNT(*) as count FROM players');
  const allTeamSeasons = await db.all('SELECT name, status FROM team_seasons ORDER BY name');
  const fixtureCounts = await db.all(
    `SELECT ts.name as season_name, ts.status as season_status, COUNT(f.id) as fixture_count
     FROM team_seasons ts
     LEFT JOIN fixtures f ON f.team_season_id = ts.id
     GROUP BY ts.id
     ORDER BY ts.name`,
    []
  );

  const divisionCounts = await db.all(
    `SELECT ts.name as season_name,
            d.name as division_name,
            COUNT(f.id) as fixture_count
     FROM team_seasons ts
     JOIN team_season_divisions d ON d.team_season_id = ts.id
     LEFT JOIN fixtures f ON f.team_season_id = ts.id AND f.division_id = d.id
     GROUP BY ts.id, d.id
     ORDER BY ts.name, d.sort_order`,
    []
  );

  console.log('Seed completed successfully');
  console.log(`Created ${allTeams.length} teams and ${allPlayers.count} players`);
  console.log('Team home day distribution (home_day: count, -1 = none):', homeDayCounts);
  console.log('Seasons:', allTeamSeasons);
  console.log('Fixtures:', fixtureCounts);
  allTeamSeasons.forEach((s) => console.log(`- ${s.name} (${s.status})`));
  console.log('Fixtures per season:');
  fixtureCounts.forEach((r) => console.log(`- ${r.season_name} (${r.season_status}): ${r.fixture_count}`));
  console.log('Fixtures per division:');
  divisionCounts.forEach((r) => console.log(`- ${r.season_name} / ${r.division_name}: ${r.fixture_count}`));
  allTeams.forEach((t) => console.log(`- ${t.name}`));

  try {
    await db.run('PRAGMA synchronous = NORMAL');
  } catch (ignore) {
  }
}

async function seed() {
  const db = new Database();
  await db.initialize();
  try {
    await seedDatabase(db);
  } finally {
    await db.close();
  }
}

module.exports = { seed, seedDatabase };

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
