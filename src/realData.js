const { v4: uuidv4 } = require('uuid');

const normalizeNameKey = (name) => {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

const REAL_DIVISIONS = [
  { name: 'Premier', sort_order: 0 },
  { name: 'Division 1A', sort_order: 1 },
  { name: 'Division 1B', sort_order: 2 },
  { name: 'Division 2', sort_order: 3 },
];

const TEAM_CONTACTS = {
  'Arklow 1': { contact_name: 'Oleks Dranko', contact_phone: '086 817 4720' },
  'Arklow Wrens': { contact_name: 'Therese Nazari', contact_phone: '087 135 9957' },
  'Arklow Hawks': { contact_name: 'Linda Kincaid', contact_phone: '089 438 8877' },

  'Dublin Raptors': { contact_name: 'Alexey Reutov', contact_phone: '083 403 1694' },
  'Dublin Stingrays': { contact_name: 'Manel De Riquer', contact_phone: '087 435 8968' },
  'Dublin Panthers': { contact_name: 'Niall Downey / Aris Tsoumis', contact_phone: '086 068 8103 / 086 723 1429' },
  'Dublin Tigers': { contact_name: 'Ege Oguzman', contact_phone: '083 089 8053' },

  'Greystones Cannons': { contact_name: 'Andrew Sims', contact_phone: '083 003 1882' },
  'Greystones Magnums': { contact_name: 'Mark O Reilly', contact_phone: '087 253 4648' },
  'Greystones Glocks': { contact_name: 'Sean Hodkinson', contact_phone: '087 232 9853' },

  'Roundwood 1': { contact_name: 'Robert Pattison', contact_phone: '087 290 4637' },
  'Roundwood Foxes': { contact_name: 'Brian Higgins', contact_phone: '085 118 5635' },
  'Roundwood Hares': { contact_name: 'James Court', contact_phone: '086 388 8999' },
  'Roundwood 2': { contact_name: 'Steve Foot', contact_phone: '085 230 1928' },

  'Wayside 1': { contact_name: 'Paul Ivory', contact_phone: '087 136 8185' },
  'Wayside 2': { contact_name: 'Sean Murphy', contact_phone: '086 388 3833' },
  'Wayside 3': { contact_name: 'Carol Bryan', contact_phone: '087 942 8441' },
  'Wayside 4': { contact_name: 'Bart Kane', contact_phone: '087 824 9818' },
  'Wayside 5': { contact_name: 'Fiona Grey Majors', contact_phone: '086 819 9792' },

  'Wicklow 1': { contact_name: 'Tim Kavanagh', contact_phone: '086 345 5882' },
  'Wicklow 2': { contact_name: 'Jan-Ove Kristiansen', contact_phone: '086 833 9471' },
  'Wicklow 3': { contact_name: 'Anne Hanton', contact_phone: '087 426 6662' },

  'Newcastle 1': { contact_name: 'Basil Mulligan', contact_phone: '087 956 7498' },
  'Newcastle 2': { contact_name: 'Raffaele Cicchianni', contact_phone: '087 286 9665' },
};

const TEAM_CLUB_ADDRESSES = {
  'Arklow 1': "St Mogue's Rural Community Centre, Inch - Y25 RX07",
  'Arklow Wrens': "St Mogue's Rural Community Centre, Inch - Y25 RX07",
  'Arklow Hawks': "St Mogue's Rural Community Centre, Inch - Y25 RX07",
  'Dublin Raptors': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Dublin Stingrays': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Dublin Panthers': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Dublin Tigers': 'Wesley College (Indoors Sports Center), Balinteer Road, Sandyford - D16 NX73',
  'Greystones Cannons': 'Greystones Lawn Tennis Club, Mill Rd - A63 RP29',
  'Greystones Magnums': 'Greystones Lawn Tennis Club, Mill Rd - A63 RP29',
  'Greystones Glocks': 'Greystones Lawn Tennis Club, Mill Rd - A63 RP29',
  'Roundwood 1': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Roundwood Foxes': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Roundwood Hares': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Roundwood 2': 'Roundwood Parish Hall, Main Street - A98 K7K6',
  'Wayside 1': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 2': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 3': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 4': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wayside 5': 'Wayside Celtic Football Club, 31 Glenamuck Rd, Glenamuck South, Dublin - D18 RC03',
  'Wicklow 1': 'Wicklow Methodist Church, Convent Road - A67 WK11',
  'Wicklow 2': 'Wicklow Methodist Church, Convent Road - A67 WK11',
  'Wicklow 3': 'Wicklow Methodist Church, Convent Road - A67 WK11',
  'Newcastle 1': 'Newcastle Parish Centre, Church Lane, Newcastle, Co Wicklow - A63 X782',
  'Newcastle 2': 'Newcastle Parish Centre, Church Lane, Newcastle, Co Wicklow - A63 X782',
};

const REAL_TEAMS = [
  {
    division: 'Premier',
    teams: {
      'Arklow 1': ['John Conway', 'Ihor Shovhur', 'Oleks Dranko', 'Zuzanna', 'Will Langrel'],
      'Dublin Raptors': ['Nikita Yarmak', 'Alexey Reutov', 'Zhenya (Yevgen) Dolzhikov', 'Albert Radkin', 'Roman Sorici', 'Eddy Zeile'],
      'Roundwood 1': ['Pierre Bouhey', 'Roekrat (Kai) Panomkwan', 'Robert Pattison'],
      'Wayside 1': ['Paul Ivory', 'Paul Halpenny', 'Alexy', 'Kola', 'Brian Gallagher', 'Anne-Marie Nugent', 'Geraldine Greene'],
      'Wayside 2': ['Sean Murphy', 'Sean Woods', 'Erwin De Zwarte', 'David Jacobson', 'Brian Gallagher', 'Anne-Marie Nugent', 'Geraldine Greene'],
    },
  },
  {
    division: 'Division 1A',
    teams: {
      'Dublin Stingrays': ['Manel De Riquer', 'Aaron Keogh', 'Pau De Riquer', 'Matvey Lopalo', "Oisin O'Hagain", 'Jonathan Lin', 'Marco Juarez', 'Aarav Bhaskar', 'Abhinav Bhaskar'],
      'Greystones Cannons': [],
      'Newcastle 1': ['Basil Mulligan', "Feargal O'Dwyer", 'Billy Byrne', "Tommy O'Gorman", 'Niall Condron', 'Tommy Condron', 'Andy Johnston'],
      'Roundwood Foxes': ['Donal Smith', 'Ciaran Redden', 'Brian Higgins'],
      'Wayside 3': ['Paul Maguire', 'Tom Mitchell', "Kevin O'Reilly", 'Carol Bryant', 'Tony Dunne', 'Renata'],
      'Wicklow 1': ['Tim Kavanagh', 'Manish Ahuja', 'Harshe Chospade', 'Peter Loughlin'],
    },
  },
  {
    division: 'Division 1B',
    teams: {
      'Arklow Hawks': ["Gavin O' Se", 'Ilona Siuda', 'Linda Kincaid', 'Will Davidson'],
      'Arklow Wrens': ['Michelle Austin', 'Therese Nazari', 'Emily Barker', 'Stephanie Vautrin', 'Bartek Gaika'],
      'Dublin Panthers': ['Niall Downey', 'Marharyta (Rita) Kuznietsova', 'Aris Tsoumis', 'Miranda Parra', 'Preston Walton'],
      'Greystones Glocks': [],
      'Greystones Magnums': [],
      'Roundwood Hares': ['James Court', 'Peter Evans', 'Michael Gadya', 'Ian McCauley'],
      'Wicklow 2': ['Peter Loughlin', 'Jan-Ove Kristiansen', 'Misato Smyth-Yamada', 'Anne Hanton'],
    },
  },
  {
    division: 'Division 2',
    teams: {
      'Dublin Tigers': ['Ege Oguzman', 'Charlie Craig', 'Alby Crawley', 'Alex Healy'],
      'Newcastle 2': ['Raffaele Cicchianni', 'Ciaran Roche', 'Vasilij', 'Jeremy Evans', 'Sasha Tudor', 'Paul Agnibesh', 'Aditiya Popli', 'Chris Woods', 'Dishant Issar', 'Varsh Shetty', "Marty O'Gara", 'Alan Thornton', 'Mark Stringer'],
      'Roundwood 2': ['George Antia', 'Steve Foot', 'Sam Smith', 'Neasa Olohan', 'Oliver Donelon'],
      'Wayside 4': ['Bart Kane', 'John Gallagher', "Paddy O'Flaherty", 'Mary Reilly', 'Maureen Murphy', 'Morteza'],
      'Wayside 5': ['Fiona Grey Majors', 'Mary Bradley', 'Marion McCarthy', "Marcus O'Brien", 'Philip Baugh', 'Pete Reilly'],
      'Wicklow 3': ['Anne Hanton', 'Ahmed Elsttafei', 'Daniel Daly', 'Emad Ziada'],
    },
  },
];

async function populateRealData(db, { seasonName = null } = {}) {
  const playersCount = await db.get('SELECT COUNT(*) as count FROM players', []);
  const teamsCount = await db.get('SELECT COUNT(*) as count FROM teams', []);
  const seasonsCount = await db.get('SELECT COUNT(*) as count FROM team_seasons', []);
  if ((playersCount?.count || 0) > 0 || (teamsCount?.count || 0) > 0 || (seasonsCount?.count || 0) > 0) {
    throw new Error('Refusing to populate real data because the database is not empty');
  }

  const year = new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString();

  const seasonId = uuidv4();
  const season = {
    id: seasonId,
    name: seasonName || '2025/2026',
    status: 'draft',
    schedule_start_date: start,
    schedule_end_date: end,
  };

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run(
      `INSERT INTO team_seasons (id, name, status, schedule_start_date, schedule_end_date)
       VALUES (?, ?, ?, ?, ?)`,
      [season.id, season.name, season.status, season.schedule_start_date, season.schedule_end_date]
    );

    const divisionIdByName = new Map();
    for (const d of REAL_DIVISIONS) {
      const divisionId = uuidv4();
      divisionIdByName.set(d.name, divisionId);
      await db.run(
        `INSERT INTO team_season_divisions (id, team_season_id, name, sort_order, active)
         VALUES (?, ?, ?, ?, 1)`,
        [divisionId, season.id, d.name, d.sort_order]
      );
    }

    const playerIdByKey = new Map();
    const ensurePlayer = async (name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return null;
      const key = normalizeNameKey(trimmed);
      if (playerIdByKey.has(key)) return playerIdByKey.get(key);

      const existing = await db.get('SELECT id FROM players WHERE LOWER(name) = LOWER(?) AND active = 1', [trimmed]);
      if (existing?.id) {
        playerIdByKey.set(key, existing.id);
        return existing.id;
      }

      const id = uuidv4();
      await db.run(
        `INSERT INTO players (id, name, email, phone, skill_level, active)
         VALUES (?, ?, NULL, NULL, 1, 1)`,
        [id, trimmed]
      );
      playerIdByKey.set(key, id);
      return id;
    };

    const teamIdByName = new Map();

    for (const div of REAL_TEAMS) {
      const divisionId = divisionIdByName.get(div.division);
      if (!divisionId) throw new Error(`Unknown division: ${div.division}`);

      for (const [teamName, rosterNames] of Object.entries(div.teams)) {
        const trimmedTeam = String(teamName || '').trim();
        if (!trimmedTeam) continue;

        const contact = TEAM_CONTACTS[trimmedTeam] || { contact_name: null, contact_phone: null };
        const clubAddress = TEAM_CLUB_ADDRESSES[trimmedTeam] || null;
        const teamId = uuidv4();
        await db.run(
          `INSERT INTO teams (id, name, contact_name, contact_phone, club_address, home_day, active)
           VALUES (?, ?, ?, ?, ?, NULL, 1)`,
          [teamId, trimmedTeam, contact.contact_name, contact.contact_phone, clubAddress]
        );
        teamIdByName.set(trimmedTeam, teamId);

        await db.run(
          `INSERT INTO team_season_division_teams (id, team_season_id, division_id, team_id)
           VALUES (?, ?, ?, ?)`,
          [uuidv4(), season.id, divisionId, teamId]
        );

        // Write roster directly so we can support more than 3 subs.
        await db.run('DELETE FROM team_roster WHERE team_id = ?', [teamId]);

        const playerIds = [];
        for (const pn of rosterNames || []) {
          const pid = await ensurePlayer(pn);
          if (pid) playerIds.push(pid);
        }

        for (let i = 0; i < playerIds.length; i++) {
          await db.run(
            `INSERT INTO team_roster (id, team_id, player_id, slot, active)
             VALUES (?, ?, ?, ?, 1)`,
            [uuidv4(), teamId, playerIds[i], i + 1]
          );
        }
      }
    }

    await db.run('COMMIT');
  } catch (e) {
    try {
      await db.run('ROLLBACK');
    } catch (ignore) {
      // ignore
    }
    throw e;
  }

  const totals = {
    players: (await db.get('SELECT COUNT(*) as count FROM players', [])).count,
    teams: (await db.get('SELECT COUNT(*) as count FROM teams', [])).count,
    divisions: (await db.get('SELECT COUNT(*) as count FROM team_season_divisions', [])).count,
  };

  return { ok: true, season, totals };
}

module.exports = {
  populateRealData,
};
