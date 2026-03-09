const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('./database');
const PlayerManager = require('./models/player');
const MatchManager = require('./models/match');
const LeagueManager = require('./models/league');
const TeamManager = require('./models/team');
const FixtureManager = require('./models/fixture');
const TeamLeagueManager = require('./models/teamLeague');
const TeamSeasonManager = require('./models/teamSeason');
const TeamSeasonDivisionManager = require('./models/teamSeasonDivision');
const { seedDatabase } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3001;
let currentAdminPassword = null;
let isSeeding = false;

// Middleware
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const originalEnd = res.end;
  res.end = function (...args) {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    try {
      if (!res.headersSent) {
        res.setHeader('X-Server-Time-Ms', ms.toFixed(2));
      }
    } catch (e) {
      // ignore
    }
    return originalEnd.apply(this, args);
  };
  next();
});

app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.use((req, res, next) => {
  if (!currentAdminPassword) {
    req.role = 'viewer';
    return next();
  }

  const password = req.get('X-Admin-Password');
  req.role = password && password === currentAdminPassword ? 'admin' : 'viewer';
  next();
});

app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize database
const db = new Database();
const playerManager = new PlayerManager(db);
const matchManager = new MatchManager(db);
const leagueManager = new LeagueManager(db);
const teamManager = new TeamManager(db);
const fixtureManager = new FixtureManager(db);
const teamLeagueManager = new TeamLeagueManager(db);
const teamSeasonManager = new TeamSeasonManager(db);
const teamSeasonDivisionManager = new TeamSeasonDivisionManager(db);

async function resolveTeamSeasonId(req) {
  if (req.query && req.query.seasonId) return req.query.seasonId;
  if (req.body && req.body.team_season_id) return req.body.team_season_id;
  const active = await teamSeasonManager.getActiveSeason();
  return active ? active.id : null;
}

async function resolveDivisionId(req, teamSeasonId) {
  if (req.query && req.query.divisionId) return req.query.divisionId;
  if (req.body && req.body.division_id) return req.body.division_id;
  if (req.body && req.body.divisionId) return req.body.divisionId;

  if (!teamSeasonId) return null;
  const d = await teamSeasonDivisionManager.getDefaultDivisionForSeason(teamSeasonId);
  return d ? d.id : null;
}

function requireAdmin(req, res, next) {
  if (req.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

function requireSeedToken(req, res, next) {
  const expected = process.env.SEED_TOKEN;
  if (!expected) return next();

  const token = req.get('X-Seed-Token');
  if (!token || token !== expected) {
    return res.status(403).json({ error: 'Invalid seed token' });
  }
  return next();
}

// API Routes
app.get('/api/auth/role', async (req, res) => {
  res.json({ role: req.role || 'viewer' });
});

app.put('/api/auth/admin-password', requireAdmin, async (req, res) => {
  try {
    const nextPassword = req.body && typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    if (!nextPassword || !nextPassword.trim()) {
      throw new Error('newPassword is required');
    }
    if (nextPassword.trim().length < 3) {
      throw new Error('Password must be at least 3 characters');
    }

    await db.run(
      `UPDATE app_settings
       SET value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE key = ?`,
      [nextPassword.trim(), 'admin_password']
    );
    currentAdminPassword = nextPassword.trim();

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/seed', requireAdmin, requireSeedToken, async (req, res) => {
  if (isSeeding) {
    return res.status(409).json({ error: 'Seed already in progress' });
  }

  isSeeding = true;
  try {
    console.log('Admin seed started');
    const seedDb = new Database();
    await seedDb.initialize();
    try {
      await seedDatabase(seedDb);
    } finally {
      await seedDb.close();
    }
    console.log('Admin seed completed');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    isSeeding = false;
  }
});

app.get('/api/players', async (req, res) => {
  try {
    const players = await playerManager.getAllPlayers();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players', requireAdmin, async (req, res) => {
  try {
    const player = await playerManager.createPlayer(req.body);
    res.status(201).json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/players/:id', async (req, res) => {
  try {
    const player = await playerManager.getPlayerById(req.params.id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/players/:id', requireAdmin, async (req, res) => {
  try {
    const player = await playerManager.updatePlayer(req.params.id, req.body);
    res.json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/players/:id', requireAdmin, async (req, res) => {
  try {
    await playerManager.deletePlayer(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Team League Routes
app.get('/api/team-seasons', async (req, res) => {
  try {
    const seasons = await teamSeasonManager.getAllSeasons();
    res.json(seasons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/team-seasons/active', async (req, res) => {
  try {
    const season = await teamSeasonManager.getActiveSeason();
    res.json(season || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/team-seasons', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.createSeason(req.body);
    res.status(201).json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:id/start', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.startSeason(req.params.id);
    res.json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:id/stop', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.stopSeason(req.params.id);
    res.json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:id/reopen', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.reopenSeason(req.params.id);
    res.json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/team-seasons/:id', requireAdmin, async (req, res) => {
  try {
    const result = await teamSeasonManager.deleteSeason(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/teams', async (req, res) => {
  try {
    const includeInactive = req.query && (req.query.includeInactive === '1' || req.query.includeInactive === 'true');
    const teams = await teamManager.getAllTeams({ includeInactive });
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/teams', requireAdmin, async (req, res) => {
  try {
    const team = await teamManager.createTeam(req.body);
    res.status(201).json(team);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const team = await teamManager.getTeamById(req.params.id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json(team);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/teams/:id', requireAdmin, async (req, res) => {
  try {
    const team = await teamManager.updateTeam(req.params.id, req.body);
    res.json(team);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/teams/:id', requireAdmin, async (req, res) => {
  try {
    await teamManager.deleteTeam(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/teams/:id/roster', requireAdmin, async (req, res) => {
  try {
    const roster = await teamManager.setTeamRoster(req.params.id, req.body);
    res.json(roster);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/team-seasons/:seasonId/divisions', async (req, res) => {
  try {
    const divisions = await teamSeasonDivisionManager.getDivisionsBySeason(req.params.seasonId);
    res.json(divisions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:seasonId/divisions', requireAdmin, async (req, res) => {
  try {
    const division = await teamSeasonDivisionManager.createDivision(req.params.seasonId, req.body);
    res.status(201).json(division);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/divisions/:divisionId', requireAdmin, async (req, res) => {
  try {
    const division = await teamSeasonDivisionManager.updateDivision(req.params.divisionId, req.body);
    res.json(division);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/divisions/:divisionId', requireAdmin, async (req, res) => {
  try {
    const result = await teamSeasonDivisionManager.deleteDivision(req.params.divisionId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/divisions/:divisionId/teams', async (req, res) => {
  try {
    const teams = await teamSeasonDivisionManager.getDivisionTeams(req.params.divisionId);
    res.json(teams);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/divisions/:divisionId/teams', requireAdmin, async (req, res) => {
  try {
    const teams = await teamSeasonDivisionManager.setDivisionTeams(req.params.divisionId, req.body.teamIds);
    res.json(teams);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/fixtures', async (req, res) => {
  try {
    const seasonId = await resolveTeamSeasonId(req);
    const divisionId = await resolveDivisionId(req, seasonId);
    const fixtures = seasonId ? await fixtureManager.getAllFixtures(seasonId, divisionId) : [];
    res.json(fixtures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fixtures/counts-by-season', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT ts.id as team_season_id,
              COUNT(f.id) as fixture_count
       FROM team_seasons ts
       LEFT JOIN fixtures f ON f.team_season_id = ts.id
       GROUP BY ts.id`,
      []
    );

    const counts = {};
    for (const r of rows) {
      counts[r.team_season_id] = r.fixture_count;
    }
    res.json(counts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fixtures', requireAdmin, async (req, res) => {
  try {
    const team_season_id = await resolveTeamSeasonId(req);
    if (!team_season_id) {
      throw new Error('No active season. Create and start a season first.');
    }

    const division_id = await resolveDivisionId(req, team_season_id);
    if (!division_id) {
      throw new Error('division_id is required');
    }

    const fixture = await fixtureManager.createFixture({
      ...req.body,
      team_season_id,
      division_id,
    });
    res.status(201).json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/fixtures/:id', async (req, res) => {
  try {
    const fixture = await fixtureManager.getFixtureById(req.params.id);
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }
    res.json(fixture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/fixtures/:id', requireAdmin, async (req, res) => {
  try {
    const { match_date } = req.body;
    if (!match_date) {
      throw new Error('match_date is required');
    }
    const updated = await fixtureManager.updateFixtureDate(req.params.id, match_date);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/fixtures/generate-schedule/preview', requireAdmin, async (req, res) => {
  try {
    const team_season_id = (req.body && req.body.team_season_id) ? req.body.team_season_id : null;
    if (!team_season_id) {
      throw new Error('team_season_id is required');
    }

    const season = await teamSeasonManager.getSeasonById(team_season_id);
    if (!season) {
      throw new Error('Season not found');
    }

    const scheduleStartDate = (req.body && req.body.schedule_start_date) ? req.body.schedule_start_date : season.schedule_start_date;
    const scheduleEndDate = (req.body && req.body.schedule_end_date) ? req.body.schedule_end_date : season.schedule_end_date;

    const warnings = [];
    if (!scheduleStartDate || !scheduleEndDate) {
      warnings.push('Season schedule window is not set (start/end dates).');
    }

    const divisions = await teamSeasonDivisionManager.getDivisionsBySeason(team_season_id);
    if (!divisions || divisions.length === 0) {
      warnings.push('No divisions configured for this season.');
    }

    const perDivision = [];
    let totalFixtures = 0;

    for (const d of (divisions || [])) {
      const teamIds = await teamSeasonDivisionManager.getTeamIdsForDivision(d.id);
      const teamCount = Array.isArray(teamIds) ? teamIds.length : 0;

      // Double round robin: each pair plays twice => n*(n-1)
      const fixtureCount = teamCount >= 2 ? (teamCount * (teamCount - 1)) : 0;
      if (teamCount < 2) {
        warnings.push(`Division "${d.name}" has fewer than 2 teams and will be skipped.`);
      }

      totalFixtures += fixtureCount;
      perDivision.push({
        division_id: d.id,
        division_name: d.name,
        team_count: teamCount,
        fixture_count: fixtureCount,
      });
    }

    if (totalFixtures === 0) {
      warnings.push('No fixtures would be generated. Ensure each division has at least 2 teams.');
    }

    res.json({
      team_season_id,
      schedule_start_date: scheduleStartDate || null,
      schedule_end_date: scheduleEndDate || null,
      divisions: perDivision,
      total_fixtures: totalFixtures,
      warnings,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/fixtures/generate-schedule', requireAdmin, async (req, res) => {
  try {
    const team_season_id = (req.body && req.body.team_season_id) ? req.body.team_season_id : null;
    if (!team_season_id) {
      throw new Error('team_season_id is required');
    }

    const season = await teamSeasonManager.getSeasonById(team_season_id);
    if (!season) {
      throw new Error('Season not found');
    }

    const scheduleStartDate = (req.body && req.body.schedule_start_date) ? req.body.schedule_start_date : season.schedule_start_date;
    const scheduleEndDate = (req.body && req.body.schedule_end_date) ? req.body.schedule_end_date : season.schedule_end_date;
    if (!scheduleStartDate || !scheduleEndDate) {
      throw new Error('Season schedule window is not set. Provide schedule_start_date and schedule_end_date.');
    }

    const divisions = await teamSeasonDivisionManager.getDivisionsBySeason(team_season_id);
    if (!divisions || divisions.length === 0) {
      throw new Error('No divisions configured for this season');
    }

    const allFixtures = [];
    for (const d of divisions) {
      const teamIds = await teamSeasonDivisionManager.getTeamIdsForDivision(d.id);
      if (!teamIds || teamIds.length < 2) {
        continue;
      }
      const fixtures = await fixtureManager.generateDoubleRoundRobinSchedule({
        ...(req.body || {}),
        team_season_id,
        division_id: d.id,
        teamIds,
        schedule_start_date: scheduleStartDate,
        schedule_end_date: scheduleEndDate,
      });
      allFixtures.push(...fixtures);
    }

    if (allFixtures.length === 0) {
      throw new Error('No fixtures generated. Ensure each division has at least 2 teams.');
    }

    await teamSeasonManager.setSeasonReady(team_season_id);
    res.json(allFixtures);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/fixtures/:id/lineups/:side', requireAdmin, async (req, res) => {
  try {
    await fixtureManager.setLineup(req.params.id, req.params.side, req.body.playerIds);
    const fixture = await fixtureManager.getFixtureById(req.params.id);
    res.json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/fixtures/:id/games/:gameNumber/sets', requireAdmin, async (req, res) => {
  try {
    const fixture = await fixtureManager.setGameSets(req.params.id, parseInt(req.params.gameNumber, 10), req.body.sets);
    res.json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/team-standings', async (req, res) => {
  try {
    const seasonId = await resolveTeamSeasonId(req);
    const divisionId = await resolveDivisionId(req, seasonId);
    const standings = await teamLeagueManager.getStandings(seasonId, divisionId);
    res.json(standings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/player-rankings', async (req, res) => {
  try {
    const seasonId = await resolveTeamSeasonId(req);
    const divisionId = await resolveDivisionId(req, seasonId);
    const rankings = await teamLeagueManager.getPlayerRankings(seasonId, divisionId);
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const explicitSeasonId = req.query && req.query.seasonId ? req.query.seasonId : null;
    const explicitDivisionId = req.query && req.query.divisionId ? req.query.divisionId : null;
    let season = null;

    if (!explicitSeasonId && explicitDivisionId) {
      const d = await teamSeasonDivisionManager.getDivisionById(explicitDivisionId);
      if (d) {
        season = await teamSeasonManager.getSeasonById(d.team_season_id);
      }
    }

    if (!season && explicitSeasonId) {
      season = await teamSeasonManager.getSeasonById(explicitSeasonId);
    } else if (!season) {
      season = await teamSeasonManager.getActiveSeason();
      if (!season) {
        season = await teamSeasonManager.getLatestReadySeason();
      }
      if (!season) {
        season = await teamSeasonManager.getLatestCompletedSeason();
      }
    }

    const divisionId = explicitDivisionId || (season ? await resolveDivisionId(req, season.id) : null);

    const stats = await teamLeagueManager.getDashboardStatistics(season?.id, divisionId);
    res.json({
      ...stats,
      currentSeason: season ? { id: season.id, name: season.name, status: season.status } : null,
      currentDivision: divisionId ? { id: divisionId } : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/matches', async (req, res) => {
  try {
    const matches = await matchManager.getAllMatches();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/matches', requireAdmin, async (req, res) => {
  try {
    const match = await matchManager.createMatch(req.body);
    res.status(201).json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/matches/:id', async (req, res) => {
  try {
    const match = await matchManager.getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json(match);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/matches/:id', requireAdmin, async (req, res) => {
  try {
    const match = await matchManager.updateMatch(req.params.id, req.body);
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/standings', async (req, res) => {
  try {
    const standings = await leagueManager.getStandings();
    res.json(standings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/statistics', async (req, res) => {
  try {
    const statistics = await leagueManager.getStatistics();
    res.json(statistics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schedule', requireAdmin, async (req, res) => {
  try {
    const schedule = await leagueManager.generateSchedule();
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from React app (production only)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Initialize database and start server
async function startServer() {
  try {
    await db.initialize();
    console.log('Database initialized successfully');

    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', ['admin_password']);
    currentAdminPassword = row && row.value ? String(row.value) : '123';
    
    app.listen(PORT, () => {
      console.log(`Table Tennis League API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
