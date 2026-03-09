const { v4: uuidv4 } = require('uuid');

class TeamManager {
  constructor(database) {
    this.db = database;
  }

  normalizeHomeDay(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 5) {
      throw new Error('home_day must be a weekday number 1-5 (Mon-Fri) or null');
    }
    return n;
  }

  async createTeam(teamData) {
    const { name, contact_name, contact_phone, home_day } = teamData;

    if (!name) {
      throw new Error('Team name is required');
    }

    const id = uuidv4();
    await this.db.run(
      'INSERT INTO teams (id, name, contact_name, contact_phone, home_day) VALUES (?, ?, ?, ?, ?)',
      [id, name, contact_name || null, contact_phone || null, this.normalizeHomeDay(home_day)]
    );

    return this.getTeamById(id);
  }

  async getAllTeams(options = {}) {
    const includeInactive = !!options.includeInactive;

    const teams = await this.db.all(
      `SELECT * FROM teams ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY name`,
      []
    );

    for (const team of teams) {
      team.roster = await this.getTeamRoster(team.id);
    }

    return teams;
  }

  async getTeamById(id) {
    const team = await this.db.get(
      'SELECT * FROM teams WHERE id = ? AND active = 1',
      [id]
    );

    if (!team) return null;

    team.roster = await this.getTeamRoster(id);
    return team;
  }

  async updateTeam(id, teamData) {
    const { name, contact_name, contact_phone, home_day } = teamData;

    const normalizedHomeDay = home_day === undefined ? undefined : this.normalizeHomeDay(home_day);

    const shouldUpdateHomeDay = normalizedHomeDay !== undefined;

    const result = await this.db.run(
      `UPDATE teams
       SET name = COALESCE(?, name),
           contact_name = COALESCE(?, contact_name),
           contact_phone = COALESCE(?, contact_phone),
           home_day = CASE WHEN ? = 1 THEN ? ELSE home_day END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND active = 1`,
      [
        name,
        contact_name,
        contact_phone,
        shouldUpdateHomeDay ? 1 : 0,
        shouldUpdateHomeDay ? normalizedHomeDay : null,
        id,
      ]
    );

    if (result.changes === 0) {
      throw new Error('Team not found or inactive');
    }

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

    if (!Array.isArray(subs) || subs.length > 3) {
      throw new Error('Subs roster must contain up to 3 player IDs');
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

    await this.db.run('BEGIN TRANSACTION');
    try {
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

      await this.db.run('COMMIT');
    } catch (e) {
      try {
        await this.db.run('ROLLBACK');
      } catch (rollbackError) {
        // ignore
      }
      throw e;
    }

    return this.getTeamRoster(teamId);
  }
}

module.exports = TeamManager;
