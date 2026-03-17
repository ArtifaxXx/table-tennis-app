const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const TEAM_CLUB_ADDRESSES = {
  'Arklow': "St Mogue's Rural Community Centre, Inch - Y25 RX07",
  'Arklow 1': "St Mogue's Rural Community Centre, Inch - Y25 RX07",
  'Arklow Wrens': "St Mogue's Rural Community Centre, Inch - Y25 RX07",
  'Arklow Hawks': "St Mogue's Rural Community Centre, Inch - Y25 RX07",
  'Dublin': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Dublin Raptors': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Dublin Stingrays': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Dublin Panthers': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Dublin Tigers': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Greystones Cannons': 'Greystones Lawn Tennis Club, Mill Rd - A63 RP29',
  'Greystones Magnums': 'Greystones Lawn Tennis Club, Mill Rd - A63 RP29',
  'Greystones Glocks': 'Greystones Lawn Tennis Club, Mill Rd - A63 RP29',
  'Greystones': 'Greystones Lawn Tennis Club, Mill Rd - A63 RP29',
  'Roundwood': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Roundwood 1': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Roundwood Foxes': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Roundwood Hares': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Roundwood 2': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Wayside 1': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 2': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 3': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 4': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 5': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wicklow': 'Wicklow Methodist Church, Convent Road - A67 WK11',
  'Wicklow 1': 'Wicklow Methodist Church, Convent Road - A67 WK11',
  'Wicklow 2': 'Wicklow Methodist Church, Convent Road - A67 WK11',
  'Wicklow 3': 'Wicklow Methodist Church, Convent Road - A67 WK11',
  'Newcastle': 'Newcastle Parish Centre, Church Lane, Newcastle, Co Wicklow - A63 X782',
  'Newcastle 1': 'Newcastle Parish Centre, Church Lane, Newcastle, Co Wicklow - A63 X782',
  'Newcastle 2': 'Newcastle Parish Centre, Church Lane, Newcastle, Co Wicklow - A63 X782',
};

class Database {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DB_PATH
      ? path.resolve(process.env.DB_PATH)
      : path.join(__dirname, '../data/league.db');
  }

  async ensureDefaultAdminPassword() {
    await this.run(
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      []
    );

    const row = await this.get('SELECT value FROM app_settings WHERE key = ?', ['admin_password']);
    if (!row || row.value == null) {
      const initial = process.env.ADMIN_PASSWORD || '123';
      await this.run(
        `INSERT INTO app_settings (key, value)
         VALUES (?, ?)`,
        ['admin_password', initial]
      );
    }
  }

  async ensureFixturesForfeitColumns() {
    const columns = await this.all('PRAGMA table_info(fixtures)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('forfeited')) {
      await this.run('ALTER TABLE fixtures ADD COLUMN forfeited INTEGER DEFAULT 0');
      await this.run('UPDATE fixtures SET forfeited = 0 WHERE forfeited IS NULL', []);
    }
    if (!columnNames.has('forfeit_winner_team_id')) {
      await this.run('ALTER TABLE fixtures ADD COLUMN forfeit_winner_team_id TEXT');
    }
  }

  async ensureDivisionCupMatchesDateColumn() {
    const columns = await this.all('PRAGMA table_info(division_cup_matches)');
    if (!columns || columns.length === 0) return;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('match_date')) {
      await this.run('ALTER TABLE division_cup_matches ADD COLUMN match_date DATETIME');
    }
  }

  async ensureFixturesSeasonColumn() {
    const columns = await this.all('PRAGMA table_info(fixtures)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('team_season_id')) {
      await this.run('ALTER TABLE fixtures ADD COLUMN team_season_id TEXT');
    }
  }

  async ensureFixturesDivisionColumn() {
    const columns = await this.all('PRAGMA table_info(fixtures)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('division_id')) {
      await this.run('ALTER TABLE fixtures ADD COLUMN division_id TEXT');
    }
  }

  async ensureFixturesMatchTypeColumn() {
    const columns = await this.all('PRAGMA table_info(fixtures)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('match_type')) {
      await this.run("ALTER TABLE fixtures ADD COLUMN match_type TEXT DEFAULT 'league'");
      await this.run("UPDATE fixtures SET match_type = 'league' WHERE match_type IS NULL", []);
    }
  }

  async ensureTeamSeasonConcludedStatus() {
    const columns = await this.all('PRAGMA table_info(team_seasons)');
    if (!columns || columns.length === 0) return;

    await this.run(
      "UPDATE team_seasons SET status = 'concluded' WHERE status = 'completed'",
      []
    );
  }

  async ensureTeamsHomeDayColumn() {
    const columns = await this.all('PRAGMA table_info(teams)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('home_day')) {
      await this.run('ALTER TABLE teams ADD COLUMN home_day INTEGER');
    }
  }

  async ensureTeamSeasonsScheduleWindowColumns() {
    const columns = await this.all('PRAGMA table_info(team_seasons)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('schedule_start_date')) {
      await this.run('ALTER TABLE team_seasons ADD COLUMN schedule_start_date DATETIME');
    }
    if (!columnNames.has('schedule_end_date')) {
      await this.run('ALTER TABLE team_seasons ADD COLUMN schedule_end_date DATETIME');
    }
  }

  async ensureNewsPinnedColumn() {
    const columns = await this.all('PRAGMA table_info(news)');
    if (!columns || columns.length === 0) return;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('pinned')) {
      await this.run('ALTER TABLE news ADD COLUMN pinned INTEGER DEFAULT 0');
      await this.run('UPDATE news SET pinned = 0 WHERE pinned IS NULL', []);
    }
  }

  async initialize() {
    return new Promise((resolve, reject) => {
       const dbDir = path.dirname(this.dbPath);
       if (!fs.existsSync(dbDir)) {
         fs.mkdirSync(dbDir, { recursive: true });
       }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        skill_level INTEGER DEFAULT 1,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        pinned INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        action TEXT,
        entity TEXT,
        entity_id TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS team_seasons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        start_date DATETIME,
        end_date DATETIME,
        schedule_start_date DATETIME,
        schedule_end_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS team_season_divisions (
        id TEXT PRIMARY KEY,
        team_season_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_season_id) REFERENCES team_seasons (id),
        UNIQUE (team_season_id, name)
      )`,

      `CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        contact_name TEXT,
        contact_phone TEXT,
        club_address TEXT,
        home_day INTEGER,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS team_roster (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        slot INTEGER NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams (id),
        FOREIGN KEY (player_id) REFERENCES players (id),
        UNIQUE (team_id, slot),
        UNIQUE (team_id, player_id)
      )`,

      `CREATE TABLE IF NOT EXISTS fixtures (
        id TEXT PRIMARY KEY,
        team_season_id TEXT,
        division_id TEXT,
        match_type TEXT DEFAULT 'league',
        home_team_id TEXT NOT NULL,
        away_team_id TEXT NOT NULL,
        match_date DATETIME,
        status TEXT DEFAULT 'scheduled',
        home_games_won INTEGER DEFAULT 0,
        away_games_won INTEGER DEFAULT 0,
        home_sets_won INTEGER DEFAULT 0,
        away_sets_won INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_season_id) REFERENCES team_seasons (id),
        FOREIGN KEY (division_id) REFERENCES team_season_divisions (id),
        FOREIGN KEY (home_team_id) REFERENCES teams (id),
        FOREIGN KEY (away_team_id) REFERENCES teams (id)
      )`,

      `CREATE TABLE IF NOT EXISTS division_cups (
        id TEXT PRIMARY KEY,
        team_season_id TEXT NOT NULL,
        division_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_season_id) REFERENCES team_seasons (id),
        FOREIGN KEY (division_id) REFERENCES team_season_divisions (id),
        UNIQUE (team_season_id, division_id)
      )`,

      `CREATE TABLE IF NOT EXISTS division_cup_matches (
        id TEXT PRIMARY KEY,
        cup_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        fixture_id TEXT,
        home_team_id TEXT,
        away_team_id TEXT,
        match_date DATETIME,
        next_match_id TEXT,
        winner_team_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cup_id) REFERENCES division_cups (id),
        FOREIGN KEY (fixture_id) REFERENCES fixtures (id),
        FOREIGN KEY (home_team_id) REFERENCES teams (id),
        FOREIGN KEY (away_team_id) REFERENCES teams (id),
        FOREIGN KEY (next_match_id) REFERENCES division_cup_matches (id),
        FOREIGN KEY (winner_team_id) REFERENCES teams (id),
        UNIQUE (cup_id, round_number, match_number)
      )`,

      `CREATE TABLE IF NOT EXISTS team_season_division_teams (
        id TEXT PRIMARY KEY,
        team_season_id TEXT NOT NULL,
        division_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_season_id) REFERENCES team_seasons (id),
        FOREIGN KEY (division_id) REFERENCES team_season_divisions (id),
        FOREIGN KEY (team_id) REFERENCES teams (id),
        UNIQUE (team_season_id, team_id)
      )`,

      `CREATE TABLE IF NOT EXISTS fixture_lineups (
        id TEXT PRIMARY KEY,
        fixture_id TEXT NOT NULL,
        side TEXT NOT NULL,
        day_rank INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        is_sub INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fixture_id) REFERENCES fixtures (id),
        FOREIGN KEY (player_id) REFERENCES players (id),
        UNIQUE (fixture_id, side, day_rank)
      )`,

      `CREATE TABLE IF NOT EXISTS fixture_games (
        id TEXT PRIMARY KEY,
        fixture_id TEXT NOT NULL,
        game_number INTEGER NOT NULL,
        game_type TEXT NOT NULL,
        home_player_a_id TEXT NOT NULL,
        away_player_a_id TEXT NOT NULL,
        home_player_b_id TEXT,
        away_player_b_id TEXT,
        home_sets_won INTEGER DEFAULT 0,
        away_sets_won INTEGER DEFAULT 0,
        winner_side TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fixture_id) REFERENCES fixtures (id),
        FOREIGN KEY (home_player_a_id) REFERENCES players (id),
        FOREIGN KEY (away_player_a_id) REFERENCES players (id),
        FOREIGN KEY (home_player_b_id) REFERENCES players (id),
        FOREIGN KEY (away_player_b_id) REFERENCES players (id),
        UNIQUE (fixture_id, game_number)
      )`,

      `CREATE TABLE IF NOT EXISTS fixture_game_sets (
        id TEXT PRIMARY KEY,
        fixture_game_id TEXT NOT NULL,
        set_number INTEGER NOT NULL,
        home_points INTEGER NOT NULL,
        away_points INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fixture_game_id) REFERENCES fixture_games (id),
        UNIQUE (fixture_game_id, set_number)
      )`,
      
      `CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        player1_id TEXT NOT NULL,
        player2_id TEXT NOT NULL,
        player1_score INTEGER,
        player2_score INTEGER,
        match_date DATETIME,
        status TEXT DEFAULT 'scheduled',
        winner_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player1_id) REFERENCES players (id),
        FOREIGN KEY (player2_id) REFERENCES players (id),
        FOREIGN KEY (winner_id) REFERENCES players (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS seasons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS season_participants (
        id TEXT PRIMARY KEY,
        season_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (season_id) REFERENCES seasons (id),
        FOREIGN KEY (player_id) REFERENCES players (id)
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }

    // SQLite does not support adding columns via CREATE TABLE IF NOT EXISTS when the table already exists.
    // Ensure team contact columns exist for older databases.
    await this.ensureTeamsContactColumns();

    // Ensure teams.home_day exists for older databases.
    await this.ensureTeamsHomeDayColumn();

    // Ensure teams.club_address exists and backfill known club addresses.
    await this.ensureTeamsClubAddressColumn();
    await this.ensureTeamsClubAddressBackfill();

    // Ensure fixtures.team_season_id exists for older databases.
    await this.ensureFixturesSeasonColumn();

    // Ensure fixtures.division_id exists for older databases.
    await this.ensureFixturesDivisionColumn();

    // Ensure fixtures.match_type exists for older databases.
    await this.ensureFixturesMatchTypeColumn();

    // Ensure fixtures forfeit columns exist for older databases.
    await this.ensureFixturesForfeitColumns();

    // Ensure division_cup_matches.match_date exists for older databases.
    await this.ensureDivisionCupMatchesDateColumn();

    // Migrate team season statuses.
    await this.ensureTeamSeasonConcludedStatus();

    // Ensure team season schedule window columns exist for older databases.
    await this.ensureTeamSeasonsScheduleWindowColumns();

    // Ensure news.pinned exists for older databases.
    await this.ensureNewsPinnedColumn();

    await this.ensureDefaultDivisionBackfill();

    // Ensure app settings exist and default admin password is persisted.
    await this.ensureDefaultAdminPassword();
  }

  async ensureDefaultDivisionBackfill() {
    const seasons = await this.all('SELECT id FROM team_seasons', []);
    if (!seasons || seasons.length === 0) return;

    await this.run('BEGIN TRANSACTION');
    try {
      for (const s of seasons) {
        const existing = await this.get(
          'SELECT id FROM team_season_divisions WHERE team_season_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1',
          [s.id]
        );

        let divisionId = existing?.id;
        if (!divisionId) {
          divisionId = uuidv4();
          await this.run(
            `INSERT INTO team_season_divisions (id, team_season_id, name, sort_order, active)
             VALUES (?, ?, ?, 0, 1)`,
            [divisionId, s.id, 'Main Division']
          );
        }

        await this.run(
          `UPDATE fixtures
           SET division_id = ?
           WHERE team_season_id = ? AND (division_id IS NULL OR division_id = '')`,
          [divisionId, s.id]
        );
      }

      await this.run('COMMIT');
    } catch (e) {
      try {
        await this.run('ROLLBACK');
      } catch (rollbackError) {
        // ignore
      }
      throw e;
    }
  }

  async ensureTeamsContactColumns() {
    const columns = await this.all('PRAGMA table_info(teams)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('contact_name')) {
      await this.run('ALTER TABLE teams ADD COLUMN contact_name TEXT');
    }
    if (!columnNames.has('contact_phone')) {
      await this.run('ALTER TABLE teams ADD COLUMN contact_phone TEXT');
    }
  }

  async ensureTeamsClubAddressColumn() {
    const columns = await this.all('PRAGMA table_info(teams)');
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('club_address')) {
      await this.run('ALTER TABLE teams ADD COLUMN club_address TEXT');
    }
  }

  async ensureTeamsClubAddressBackfill() {
    const entries = Object.entries(TEAM_CLUB_ADDRESSES);
    if (entries.length === 0) return;

    await this.run('BEGIN TRANSACTION');
    try {
      for (const [name, address] of entries) {
        await this.run(
          `UPDATE teams
           SET club_address = ?
           WHERE LOWER(name) = LOWER(?)
             AND (club_address IS NULL OR club_address = '')`,
          [address, name]
        );
      }
      await this.run('COMMIT');
    } catch (e) {
      try {
        await this.run('ROLLBACK');
      } catch (rollbackError) {
        // ignore
      }
      throw e;
    }
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

module.exports = Database;
