const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

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
    // All statements share a single sqlite3 connection. A FIFO write lock plus
    // an async-local transaction marker serializes writers so a concurrent
    // request can neither open a second transaction nor land a stray write
    // inside another request's transaction (which would silently roll back
    // with it).
    this.writeTail = Promise.resolve();
    this.txnStorage = new AsyncLocalStorage();
    this.savepointSeq = 0;
  }

  acquireWriteLock() {
    const previous = this.writeTail;
    let release;
    this.writeTail = new Promise((resolve) => {
      release = resolve;
    });
    return previous.then(() => release);
  }

  runDirect(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Runs fn inside BEGIN/COMMIT on this connection. Nested calls inside an
  // active transaction use a SAVEPOINT so a failure rolls back only the inner
  // block. Concurrent transactions and standalone writes queue on writeTail.
  async transaction(fn, { immediate = true } = {}) {
    if (this.txnStorage.getStore()) {
      const name = `devin_sp_${++this.savepointSeq}`;
      await this.runDirect(`SAVEPOINT ${name}`);
      try {
        const result = await fn();
        await this.runDirect(`RELEASE ${name}`);
        return result;
      } catch (error) {
        try {
          await this.runDirect(`ROLLBACK TO ${name}`);
          await this.runDirect(`RELEASE ${name}`);
        } catch (rollbackError) {
          // ignore
        }
        throw error;
      }
    }

    const release = await this.acquireWriteLock();
    try {
      return await this.txnStorage.run(true, async () => {
        await this.runDirect(immediate ? 'BEGIN IMMEDIATE TRANSACTION' : 'BEGIN TRANSACTION');
        try {
          const result = await fn();
          await this.runDirect('COMMIT');
          return result;
        } catch (error) {
          try {
            await this.runDirect('ROLLBACK');
          } catch (rollbackError) {
            // ignore
          }
          throw error;
        }
      });
    } finally {
      release();
    }
  }

  async ensureDefaultAdminPassword() {
    // app_settings is kept for future settings, but the admin password is never
    // persisted in plaintext: it is sourced from ADMIN_PASSWORD (or the legacy
    // stored value, once) and only ever stored as a scrypt hash in admin_users.
    await this.run(
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      []
    );
  }

  async ensureInitialAdminUser() {
    const row = await this.get('SELECT COUNT(*) AS c FROM admin_users');
    if (row && row.c > 0) {
      // Accounts exist: drop any legacy plaintext password left in app_settings.
      await this.run("DELETE FROM app_settings WHERE key = 'admin_password'");
      return;
    }

    const setting = await this.get('SELECT value FROM app_settings WHERE key = ?', ['admin_password']);
    const password = (setting && setting.value) || process.env.ADMIN_PASSWORD || 'bndttadmin';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
    await this.run(
      'INSERT INTO admin_users (id, name, password_hash, role) VALUES (?, ?, ?, ?)',
      [uuidv4(), 'admin', hash, 'admin']
    );
    await this.run("DELETE FROM app_settings WHERE key = 'admin_password'");
  }

  async ensureAdminUserRoles() {
    const columns = await this.all('PRAGMA table_info(admin_users)');
    const hadRole = columns.some((column) => column.name === 'role');
    if (!hadRole) {
      await this.run("ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'steward'");
      const password = process.env.ADMIN_PASSWORD || 'bndttadmin';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
      await this.run(
        "UPDATE admin_users SET role = 'admin', password_hash = ? WHERE lower(name) = 'admin'",
        [hash]
      );
      const removed = await this.run("DELETE FROM admin_users WHERE lower(name) <> 'admin'");
      if (removed.changes > 0) {
        console.warn(`Removed ${removed.changes} legacy admin account(s) during role migration`);
      }
    } else {
      await this.run("UPDATE admin_users SET role = 'admin' WHERE lower(name) = 'admin'");
    }

    const admin = await this.get("SELECT id FROM admin_users WHERE lower(name) = 'admin'");
    if (!admin) {
      const password = process.env.ADMIN_PASSWORD || 'bndttadmin';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
      await this.run(
        'INSERT INTO admin_users (id, name, password_hash, role) VALUES (?, ?, ?, ?)',
        [uuidv4(), 'admin', hash, 'admin']
      );
    }
  }

  async ensureFixtureUniquenessIndex() {
    const duplicate = await this.get(
      `SELECT 1 FROM fixtures
       WHERE team_season_id IS NOT NULL AND division_id IS NOT NULL
       GROUP BY team_season_id, division_id, match_type, home_team_id, away_team_id
       HAVING COUNT(*) > 1
       LIMIT 1`
    );
    if (!duplicate) {
      await this.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_fixtures_unique_pairing
         ON fixtures (team_season_id, division_id, match_type, home_team_id, away_team_id)`
      );
    } else {
      console.warn(
        'Skipping idx_fixtures_unique_pairing: duplicate fixtures exist in this database. ' +
          'Application-level duplicate checks still apply.'
      );
    }
  }

  async ensureIndexes() {
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_cup_matches_fixture ON division_cup_matches (fixture_id)'
    );
    await this.run('CREATE INDEX IF NOT EXISTS idx_fixtures_home_team ON fixtures (home_team_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_fixtures_away_team ON fixtures (away_team_id)');
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_division_teams_team ON team_season_division_teams (team_id)'
    );
    await this.run('CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs (created_at)');
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
    }
    await this.run("UPDATE fixtures SET match_type = 'league' WHERE match_type IS NULL", []);
  }

  async ensureTeamSeasonConcludedStatus() {
    const columns = await this.all('PRAGMA table_info(team_seasons)');
    if (!columns || columns.length === 0) return;

    await this.run(
      "UPDATE team_seasons SET status = 'concluded' WHERE status = 'completed'",
      []
    );
  }

  async ensureTeamsClubColumn() {
    const columns = await this.all('PRAGMA table_info(teams)');
    if (!columns.some((column) => column.name === 'club_id')) {
      await this.run('ALTER TABLE teams ADD COLUMN club_id TEXT REFERENCES clubs(id)');
    }
  }

  async ensureClubsBackfill() {
    const groups = await this.all(
      `SELECT club_address AS address, MIN(name) AS team_name
       FROM teams
       WHERE club_id IS NULL AND club_address IS NOT NULL AND TRIM(club_address) <> ''
       GROUP BY club_address`
    );
    for (const group of groups) {
      let club = await this.get('SELECT id FROM clubs WHERE address = ?', [group.address]);
      if (!club) {
        const baseName = String(group.team_name || 'Club').trim().split(/\s+/)[0];
        let name = baseName;
        let suffix = 2;
        while (await this.get('SELECT id FROM clubs WHERE lower(name) = lower(?)', [name])) {
          name = `${baseName} ${suffix}`;
          suffix++;
        }
        const id = uuidv4();
        await this.run(
          'INSERT INTO clubs (id, name, address, simultaneous_fixtures) VALUES (?, ?, ?, 1)',
          [id, name, group.address]
        );
        club = { id };
      }
      await this.run('UPDATE teams SET club_id = ? WHERE club_id IS NULL AND club_address = ?', [club.id, group.address]);
    }
  }

  async ensureTeamHomeDaysBackfill() {
    await this.run(
      `INSERT OR IGNORE INTO team_home_days (team_id, weekday)
       SELECT id, home_day FROM teams WHERE home_day BETWEEN 1 AND 5`
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

  async ensureActivityLogActorColumn() {
    const columns = await this.all('PRAGMA table_info(activity_logs)');
    if (!columns || columns.length === 0) return;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('actor')) {
      await this.run('ALTER TABLE activity_logs ADD COLUMN actor TEXT');
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
          this.db.serialize(() => {
            this.db.run('PRAGMA foreign_keys = ON', (pragmaError) => {
              if (pragmaError) {
                reject(pragmaError);
                return;
              }
              this.db.run('PRAGMA busy_timeout = 5000', (timeoutError) => {
                if (timeoutError) console.warn('Unable to set busy_timeout:', timeoutError.message);
                this.db.run('PRAGMA journal_mode = WAL', (walError) => {
                  if (walError) console.warn('Unable to enable WAL journal mode:', walError.message);
                  this.createTables().then(resolve).catch(reject);
                });
              });
            });
          });
        }
      });
    });
  }

  async createTables() {
    // Rename game/set terminology to match/game for older databases before
    // CREATE TABLE IF NOT EXISTS runs (otherwise the rename target exists).
    await this.migrateGameSetNaming();

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

      `CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'steward' CHECK(role IN ('admin', 'steward')),
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        action TEXT,
        actor TEXT,
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

      `CREATE TABLE IF NOT EXISTS clubs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        address TEXT,
        simultaneous_fixtures INTEGER NOT NULL DEFAULT 1 CHECK(simultaneous_fixtures BETWEEN 1 AND 3),
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        contact_name TEXT,
        contact_phone TEXT,
        club_id TEXT,
        club_address TEXT,
        home_day INTEGER,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (club_id) REFERENCES clubs (id)
      )`,

      `CREATE TABLE IF NOT EXISTS team_home_days (
        team_id TEXT NOT NULL,
        weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 5),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (team_id, weekday),
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
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
        home_matches_won INTEGER DEFAULT 0,
        away_matches_won INTEGER DEFAULT 0,
        home_games_won INTEGER DEFAULT 0,
        away_games_won INTEGER DEFAULT 0,
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

      `CREATE TABLE IF NOT EXISTS fixture_matches (
        id TEXT PRIMARY KEY,
        fixture_id TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_type TEXT NOT NULL,
        home_player_a_id TEXT NOT NULL,
        away_player_a_id TEXT NOT NULL,
        home_player_b_id TEXT,
        away_player_b_id TEXT,
        home_games_won INTEGER DEFAULT 0,
        away_games_won INTEGER DEFAULT 0,
        winner_side TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fixture_id) REFERENCES fixtures (id),
        FOREIGN KEY (home_player_a_id) REFERENCES players (id),
        FOREIGN KEY (away_player_a_id) REFERENCES players (id),
        FOREIGN KEY (home_player_b_id) REFERENCES players (id),
        FOREIGN KEY (away_player_b_id) REFERENCES players (id),
        UNIQUE (fixture_id, match_number)
      )`,

      `CREATE TABLE IF NOT EXISTS fixture_match_games (
        id TEXT PRIMARY KEY,
        fixture_match_id TEXT NOT NULL,
        game_number INTEGER NOT NULL,
        home_points INTEGER NOT NULL,
        away_points INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fixture_match_id) REFERENCES fixture_matches (id),
        UNIQUE (fixture_match_id, game_number)
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
    await this.ensureTeamsClubColumn();
    await this.ensureClubsBackfill();
    await this.ensureTeamHomeDaysBackfill();

    // Ensure fixtures.team_season_id exists for older databases.
    await this.ensureFixturesSeasonColumn();

    // Ensure fixtures.division_id exists for older databases.
    await this.ensureFixturesDivisionColumn();

    // Ensure fixtures.match_type exists for older databases.
    await this.ensureFixturesMatchTypeColumn();

    await this.ensureFixtureUniquenessIndex();

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

    // Ensure activity_logs.actor exists for older databases.
    await this.ensureActivityLogActorColumn();

    await this.ensureDefaultDivisionBackfill();
    await this.ensureIndexes();

    // Ensure app settings exist and default admin password is persisted.
    await this.ensureDefaultAdminPassword();

    // Seed the first admin account from the legacy shared password when the table is empty.
    await this.ensureAdminUserRoles();
    await this.ensureInitialAdminUser();
  }

  async migrateGameSetNaming() {
    const tables = await this.all("SELECT name FROM sqlite_master WHERE type = 'table'", []);
    const tableNames = new Set(tables.map((t) => t.name));

    const renameColumn = async (table, from, to) => {
      const cols = await this.all(`PRAGMA table_info(${table})`);
      if (!cols || cols.length === 0) return;
      const colNames = new Set(cols.map((c) => c.name));
      if (colNames.has(from) && !colNames.has(to)) {
        await this.run(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
      }
    };

    if (tableNames.has('fixture_games')) {
      if (tableNames.has('fixture_matches')) {
        // Both exist (e.g. partial migration): merge then drop the old table.
        await this.run(
          `INSERT OR IGNORE INTO fixture_matches
             (id, fixture_id, match_number, match_type, home_player_a_id, away_player_a_id,
              home_player_b_id, away_player_b_id, home_games_won, away_games_won,
              winner_side, created_at, updated_at)
           SELECT id, fixture_id, game_number, game_type, home_player_a_id, away_player_a_id,
                  home_player_b_id, away_player_b_id, home_sets_won, away_sets_won,
                  winner_side, created_at, updated_at
           FROM fixture_games`,
          []
        );
        await this.run('DROP TABLE fixture_games', []);
      } else {
        await this.run('ALTER TABLE fixture_games RENAME TO fixture_matches', []);
      }
    }

    if (tableNames.has('fixture_game_sets')) {
      if (tableNames.has('fixture_match_games')) {
        await this.run(
          `INSERT OR IGNORE INTO fixture_match_games
             (id, fixture_match_id, game_number, home_points, away_points, created_at, updated_at)
           SELECT id, fixture_game_id, set_number, home_points, away_points, created_at, updated_at
           FROM fixture_game_sets`,
          []
        );
        await this.run('DROP TABLE fixture_game_sets', []);
      } else {
        await this.run('ALTER TABLE fixture_game_sets RENAME TO fixture_match_games', []);
      }
    }

    // Order matters on fixtures: free up the *_games_won names first.
    await renameColumn('fixtures', 'home_games_won', 'home_matches_won');
    await renameColumn('fixtures', 'away_games_won', 'away_matches_won');
    await renameColumn('fixtures', 'home_sets_won', 'home_games_won');
    await renameColumn('fixtures', 'away_sets_won', 'away_games_won');

    await renameColumn('fixture_matches', 'game_number', 'match_number');
    await renameColumn('fixture_matches', 'game_type', 'match_type');
    await renameColumn('fixture_matches', 'home_sets_won', 'home_games_won');
    await renameColumn('fixture_matches', 'away_sets_won', 'away_games_won');

    await renameColumn('fixture_match_games', 'fixture_game_id', 'fixture_match_id');
    await renameColumn('fixture_match_games', 'set_number', 'game_number');
  }

  async ensureDefaultDivisionBackfill() {
    const seasons = await this.all('SELECT id FROM team_seasons', []);
    if (!seasons || seasons.length === 0) return;

    await this.transaction(async () => {
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
    });
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

    await this.transaction(async () => {
      for (const [name, address] of entries) {
        await this.run(
          `UPDATE teams
           SET club_address = ?
           WHERE LOWER(name) = LOWER(?)
             AND (club_address IS NULL OR club_address = '')`,
          [address, name]
        );
      }
    });
  }

  run(sql, params = []) {
    // Inside a transaction the caller already holds the write lock; run
    // directly so the statement joins the open transaction. Otherwise queue
    // behind it so the write cannot be absorbed into someone else's txn.
    if (this.txnStorage.getStore()) {
      return this.runDirect(sql, params);
    }
    return this.acquireWriteLock().then((release) =>
      this.runDirect(sql, params).finally(release)
    );
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

  backup(destination) {
    return new Promise((resolve, reject) => {
      const backup = this.db.backup(destination, (initializeError) => {
        if (initializeError) {
          try {
            backup.finish();
          } catch (finishError) {
            // ignore
          }
          reject(initializeError);
          return;
        }
        backup.step(-1, (stepError) => {
          // finish() is required to finalize the destination file and release
          // the backup handle.
          try {
            backup.finish();
          } catch (finishError) {
            // ignore
          }
          if (stepError) {
            reject(stepError);
          } else {
            resolve();
          }
        });
      });
    });
  }

  validateBackup(sourcePath, adminName) {
    return new Promise((resolve, reject) => {
      const source = new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY, (openError) => {
        if (openError) {
          reject(openError);
          return;
        }

        const finish = (error, result) => {
          source.close((closeError) => {
            if (error || closeError) {
              reject(error || closeError);
            } else {
              resolve(result);
            }
          });
        };

        source.get('PRAGMA integrity_check', [], (integrityError, integrity) => {
          if (integrityError) {
            finish(integrityError);
            return;
          }
          if (!integrity || integrity.integrity_check !== 'ok') {
            finish(new Error('Database integrity check failed'));
            return;
          }

          source.get(
            `SELECT COUNT(*) AS count
             FROM sqlite_master
             WHERE type = 'table'
               AND name IN ('players', 'teams', 'fixtures', 'admin_users')`,
            [],
            (schemaError, schema) => {
              if (schemaError) {
                finish(schemaError);
                return;
              }
              // Only the core tables are required; newer tables may be absent
              // from backups taken by older app versions.
              if (!schema || schema.count !== 4) {
                finish(new Error('File is not a compatible league database backup'));
                return;
              }

              source.get(
                'SELECT name, password_hash FROM admin_users WHERE active = 1 AND lower(name) = lower(?)',
                [adminName],
                (adminError, admin) => finish(adminError, { admin })
              );
            }
          );
        });
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
