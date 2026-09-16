const { v4: uuidv4 } = require('uuid');

class TeamManager {
  constructor(database) {
    this.db = database;
  }

  normalizeHomeDays(homeDays, legacyHomeDay) {
    const values = homeDays === undefined
      ? (legacyHomeDay == null || legacyHomeDay === '' ? [] : [legacyHomeDay])
      : homeDays;
    if (!Array.isArray(values)) throw new Error('home_days must be an array');
    const normalized = Array.from(new Set(values.map(Number))).sort((a, b) => a - b);
    if (normalized.some((day) => !Number.isInteger(day) || day < 1 || day > 5)) {
      throw new Error('home_days may only contain weekday numbers 1-5');
    }
    return normalized;
  }

  async resolveClub(clubId, teamName, legacyAddress) {
    if (clubId) {
      const club = await this.db.get('SELECT * FROM clubs WHERE id = ? AND active = 1', [clubId]);
      if (!club) throw new Error('Club not found or inactive');
      return club;
    }
    if (legacyAddress) {
      let club = await this.db.get('SELECT * FROM clubs WHERE address = ? AND active = 1', [legacyAddress]);
      if (!club) {
        const id = uuidv4();
        const baseName = String(teamName || 'Club').trim().split(/\s+/)[0];
        let name = baseName;
        let suffix = 2;
        while (await this.db.get('SELECT id FROM clubs WHERE lower(name) = lower(?)', [name])) {
          name = `${baseName} ${suffix}`;
          suffix++;
        }
        await this.db.run(
          'INSERT INTO clubs (id, name, address, simultaneous_fixtures) VALUES (?, ?, ?, 1)',
          [id, name, legacyAddress]
        );
        club = await this.db.get('SELECT * FROM clubs WHERE id = ?', [id]);
      }
      return club;
    }
    let club = await this.db.get("SELECT * FROM clubs WHERE name = 'Unassigned'");
    if (club && !club.active) {
      await this.db.run('UPDATE clubs SET active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [club.id]);
      club = await this.db.get('SELECT * FROM clubs WHERE id = ?', [club.id]);
    }
    if (!club) {
      const id = uuidv4();
      await this.db.run(
        'INSERT INTO clubs (id, name, simultaneous_fixtures) VALUES (?, ?, 1)',
        [id, 'Unassigned']
      );
      club = await this.db.get('SELECT * FROM clubs WHERE id = ?', [id]);
    }
    return club;
  }

  async setHomeDays(teamId, homeDays) {
    await this.db.run('DELETE FROM team_home_days WHERE team_id = ?', [teamId]);
    for (const weekday of homeDays) {
      await this.db.run('INSERT INTO team_home_days (team_id, weekday) VALUES (?, ?)', [teamId, weekday]);
    }
    await this.db.run('UPDATE teams SET home_day = ? WHERE id = ?', [homeDays[0] || null, teamId]);
  }

  async attachTeamDetails(team) {
    if (!team) return null;
    team.home_days = (await this.db.all(
      'SELECT weekday FROM team_home_days WHERE team_id = ? ORDER BY weekday',
      [team.id]
    )).map((row) => row.weekday);
    team.home_day = team.home_days[0] || null;
    team.roster = await this.getTeamRoster(team.id);
    return team;
  }

  async createTeam(teamData) {
    const { name, contact_name, contact_phone, club_id, club_address } = teamData;
    if (!name || !String(name).trim()) throw new Error('Team name is required');
    const trimmedName = String(name).trim();
    const homeDays = this.normalizeHomeDays(teamData.home_days, teamData.home_day);
    const id = uuidv4();
    await this.db.transaction(async () => {
      const club = await this.resolveClub(club_id, trimmedName, club_address);
      await this.db.run(
        `INSERT INTO teams (id, name, contact_name, contact_phone, club_id, club_address, home_day)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, trimmedName, contact_name || null, contact_phone || null, club.id, club.address || null, homeDays[0] || null]
      );
      await this.setHomeDays(id, homeDays);
    });
    return this.getTeamById(id);
  }

  async getAllTeams(options = {}) {
    const includeInactive = !!options.includeInactive;
    const teams = await this.db.all(
      `SELECT t.*, c.name AS club_name, c.address AS club_address,
              c.simultaneous_fixtures AS club_simultaneous_fixtures
       FROM teams t
       LEFT JOIN clubs c ON c.id = t.club_id
       ${includeInactive ? '' : 'WHERE t.active = 1'}
       ORDER BY t.name`,
      []
    );
    for (const team of teams) await this.attachTeamDetails(team);
    return teams;
  }

  async getTeamById(id) {
    const team = await this.db.get(
      `SELECT t.*, c.name AS club_name, c.address AS club_address,
              c.simultaneous_fixtures AS club_simultaneous_fixtures
       FROM teams t
       LEFT JOIN clubs c ON c.id = t.club_id
       WHERE t.id = ? AND t.active = 1`,
      [id]
    );
    return this.attachTeamDetails(team);
  }

  async updateTeam(id, teamData) {
    const existing = await this.db.get('SELECT * FROM teams WHERE id = ? AND active = 1', [id]);
    if (!existing) throw new Error('Team not found or inactive');
    const shouldUpdateDays = teamData.home_days !== undefined || teamData.home_day !== undefined;
    const homeDays = shouldUpdateDays
      ? this.normalizeHomeDays(teamData.home_days, teamData.home_day)
      : null;
    const newName = teamData.name !== undefined && teamData.name !== null ? String(teamData.name).trim() : undefined;
    if (newName !== undefined && !newName) throw new Error('Team name cannot be empty');
    const shouldUpdateClub = teamData.club_id !== undefined || teamData.club_address !== undefined;
    const club = shouldUpdateClub
      ? await this.resolveClub(teamData.club_id, newName || existing.name, teamData.club_address)
      : (existing.club_id ? await this.db.get('SELECT * FROM clubs WHERE id = ?', [existing.club_id]) : null);

    await this.db.transaction(async () => {
      await this.db.run(
        `UPDATE teams
         SET name = COALESCE(?, name), contact_name = COALESCE(?, contact_name),
             contact_phone = COALESCE(?, contact_phone), club_id = ?, club_address = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND active = 1`,
        [newName !== undefined ? newName : null, teamData.contact_name, teamData.contact_phone, club?.id || null, club ? (club.address || null) : existing.club_address, id]
      );
      if (shouldUpdateDays) await this.setHomeDays(id, homeDays);
    });
    return this.getTeamById(id);
  }

  async deleteTeam(id) {
    const result = await this.db.run(
      `UPDATE teams
       SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );

    if (result.changes === 0) {
      throw new Error('Team not found');
    }
  }

  async getTeamRoster(teamId) {
    return this.db.all(
      `SELECT tr.id, tr.team_id, tr.player_id, tr.slot, tr.active,
              p.name as player_name, p.email as player_email, p.phone as player_phone, p.skill_level
       FROM team_roster tr
       JOIN players p ON tr.player_id = p.id
       WHERE tr.team_id = ? AND tr.active = 1
       ORDER BY tr.slot ASC`,
      [teamId]
    );
  }

  async setTeamRoster(teamId, rosterData) {
    const { main = [], subs = [] } = rosterData;

    if (!Array.isArray(main) || main.length !== 3) {
      throw new Error('Main roster must contain exactly 3 player IDs');
    }

    if (!Array.isArray(subs) || subs.length > 10) {
      throw new Error('Subs roster must contain up to 10 player IDs');
    }

    const unique = new Set([...main, ...subs]);
    if (unique.size !== main.length + subs.length) {
      throw new Error('Duplicate player IDs in roster');
    }

    // Ensure team exists
    const team = await this.db.get('SELECT id FROM teams WHERE id = ? AND active = 1', [teamId]);
    if (!team) {
      throw new Error('Team not found or inactive');
    }

    // Ensure players exist and are active
    const allIds = [...main, ...subs];
    const rows = await this.db.all(
      `SELECT id FROM players WHERE id IN (${allIds.map(() => '?').join(',')}) AND active = 1`,
      allIds
    );
    if (rows.length !== allIds.length) {
      throw new Error('One or more players not found or inactive');
    }

    await this.db.transaction(async () => {
      // Replace old roster entirely.
      // Note: team_roster has UNIQUE(team_id, player_id) and UNIQUE(team_id, slot)
      // across all rows (active or not), so keeping historical inactive rows would
      // prevent re-adding the same player or using the same slot.
      await this.db.run(
        `DELETE FROM team_roster
         WHERE team_id = ?`,
        [teamId]
      );

      const nowSlots = [
        ...main.map((id, idx) => ({ playerId: id, slot: idx + 1 })),
        ...subs.map((id, idx) => ({ playerId: id, slot: idx + 4 })),
      ];

      for (const item of nowSlots) {
        await this.db.run(
          `INSERT INTO team_roster (id, team_id, player_id, slot, active)
           VALUES (?, ?, ?, ?, 1)`,
          [uuidv4(), teamId, item.playerId, item.slot]
        );
      }
    });

    return this.getTeamRoster(teamId);
  }
}

module.exports = TeamManager;
