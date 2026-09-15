const { v4: uuidv4 } = require('uuid');

class ClubManager {
  constructor(database) {
    this.db = database;
  }

  normalizeCapacity(value) {
    const capacity = value == null || value === '' ? 1 : Number(value);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 3) {
      throw new Error('simultaneous_fixtures must be 1, 2, or 3');
    }
    return capacity;
  }

  getAllClubs({ includeInactive = false } = {}) {
    return this.db.all(
      `SELECT c.*, COUNT(t.id) AS team_count
       FROM clubs c
       LEFT JOIN teams t ON t.club_id = c.id AND t.active = 1
       ${includeInactive ? '' : 'WHERE c.active = 1'}
       GROUP BY c.id
       ORDER BY c.name`,
      []
    );
  }

  getClubById(id) {
    return this.db.get(
      `SELECT c.*, COUNT(t.id) AS team_count
       FROM clubs c
       LEFT JOIN teams t ON t.club_id = c.id AND t.active = 1
       WHERE c.id = ? AND c.active = 1
       GROUP BY c.id`,
      [id]
    );
  }

  async createClub({ name, address, simultaneous_fixtures } = {}) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) throw new Error('Club name is required');
    const id = uuidv4();
    await this.db.run(
      `INSERT INTO clubs (id, name, address, simultaneous_fixtures)
       VALUES (?, ?, ?, ?)`,
      [id, normalizedName, String(address || '').trim() || null, this.normalizeCapacity(simultaneous_fixtures)]
    );
    return this.getClubById(id);
  }

  async updateClub(id, { name, address, simultaneous_fixtures } = {}) {
    const club = await this.getClubById(id);
    if (!club) throw new Error('Club not found');
    const normalizedName = name === undefined ? club.name : String(name).trim();
    if (!normalizedName) throw new Error('Club name is required');
    const normalizedAddress = address === undefined ? club.address : String(address || '').trim() || null;
    const capacity = simultaneous_fixtures === undefined
      ? club.simultaneous_fixtures
      : this.normalizeCapacity(simultaneous_fixtures);
    await this.db.run(
      `UPDATE clubs
       SET name = ?, address = ?, simultaneous_fixtures = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND active = 1`,
      [normalizedName, normalizedAddress, capacity, id]
    );
    return this.getClubById(id);
  }

  async deleteClub(id) {
    const club = await this.getClubById(id);
    if (!club) throw new Error('Club not found');
    const teams = await this.db.get('SELECT COUNT(*) AS count FROM teams WHERE club_id = ? AND active = 1', [id]);
    if (teams.count > 0) throw new Error('Cannot delete a club with active teams');
    await this.db.run('UPDATE clubs SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  }
}

module.exports = ClubManager;
