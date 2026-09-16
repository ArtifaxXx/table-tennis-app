const { v4: uuidv4 } = require('uuid');

class MatchManager {
  constructor(database) {
    this.db = database;
  }

  async createMatch(matchData) {
    const { player1_id, player2_id, match_date, player1_score, player2_score } = matchData;
    
    if (!player1_id || !player2_id) {
      throw new Error('Both player IDs are required');
    }
    
    if (player1_id === player2_id) {
      throw new Error('Players must be different');
    }

    // Verify players exist and are active
    const players = await this.db.all(
      'SELECT id FROM players WHERE id IN (?, ?) AND active = 1',
      [player1_id, player2_id]
    );
    
    if (players.length !== 2) {
      throw new Error('One or both players not found or inactive');
    }

    const id = uuidv4();
    let status = 'scheduled';
    let winner_id = null;

    // If scores are provided, determine winner and status
    if (player1_score !== undefined && player2_score !== undefined) {
      status = 'completed';
      if (player1_score > player2_score) {
        winner_id = player1_id;
      } else if (player2_score > player1_score) {
        winner_id = player2_id;
      }
    }

    const sql = `
      INSERT INTO matches (id, player1_id, player2_id, player1_score, player2_score, match_date, status, winner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.run(sql, [id, player1_id, player2_id, player1_score, player2_score, match_date, status, winner_id]);
    return await this.getMatchById(id);
  }

  async getAllMatches() {
    const sql = `
      SELECT m.*, 
             p1.name as player1_name,
             p2.name as player2_name,
             w.name as winner_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN players w ON m.winner_id = w.id
      ORDER BY m.match_date DESC, m.created_at DESC
    `;
    
    return await this.db.all(sql);
  }

  async getMatchById(id) {
    const sql = `
      SELECT m.*, 
             p1.name as player1_name,
             p2.name as player2_name,
             w.name as winner_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN players w ON m.winner_id = w.id
      WHERE m.id = ?
    `;
    
    return await this.db.get(sql, [id]);
  }

  async updateMatch(id, matchData) {
    const { player1_score, player2_score, match_date, status } = matchData;

    const existing = await this.db.get('SELECT player1_id, player2_id FROM matches WHERE id = ?', [id]);
    if (!existing) throw new Error('Match not found');

    const scoresProvided = player1_score !== undefined && player2_score !== undefined;
    let winner_id = null;

    if (scoresProvided) {
      const s1 = Number(player1_score);
      const s2 = Number(player2_score);
      if (!Number.isFinite(s1) || !Number.isFinite(s2)) {
        throw new Error('Scores must be numbers');
      }
      if (s1 > s2) {
        winner_id = existing.player1_id;
      } else if (s2 > s1) {
        winner_id = existing.player2_id;
      }
      // A draw (or unscored) update must clear any previously stored winner.
    }

    const sql = `
      UPDATE matches
      SET player1_score = COALESCE(?, player1_score),
          player2_score = COALESCE(?, player2_score),
          match_date = COALESCE(?, match_date),
          status = COALESCE(?, status),
          winner_id = CASE WHEN ? = 1 THEN ? ELSE winner_id END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const result = await this.db.run(sql, [player1_score, player2_score, match_date, status, scoresProvided ? 1 : 0, winner_id, id]);

    if (result.changes === 0) {
      throw new Error('Match not found');
    }

    return await this.getMatchById(id);
  }

  async deleteMatch(id) {
    const result = await this.db.run('DELETE FROM matches WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      throw new Error('Match not found');
    }
  }

  async getPlayerMatches(playerId) {
    const sql = `
      SELECT m.*, 
             p1.name as player1_name,
             p2.name as player2_name,
             w.name as winner_name,
             CASE 
               WHEN m.player1_id = ? AND m.winner_id = ? THEN 'win'
               WHEN m.player2_id = ? AND m.winner_id = ? THEN 'win'
               WHEN m.status = 'completed' THEN 'loss'
               ELSE 'pending'
             end as result
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN players w ON m.winner_id = w.id
      WHERE (m.player1_id = ? OR m.player2_id = ?)
      ORDER BY m.match_date DESC, m.created_at DESC
    `;
    
    return await this.db.all(sql, [playerId, playerId, playerId, playerId, playerId, playerId]);
  }

  async getUpcomingMatches() {
    const sql = `
      SELECT m.*, 
             p1.name as player1_name,
             p2.name as player2_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      WHERE m.status = 'scheduled' AND (m.match_date IS NULL OR m.match_date > datetime('now'))
      ORDER BY m.match_date ASC
    `;
    
    return await this.db.all(sql);
  }

  async getRecentMatches(limit = 10) {
    const sql = `
      SELECT m.*, 
             p1.name as player1_name,
             p2.name as player2_name,
             w.name as winner_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN players w ON m.winner_id = w.id
      WHERE m.status = 'completed'
      ORDER BY m.match_date DESC, m.created_at DESC
      LIMIT ?
    `;
    
    return await this.db.all(sql, [limit]);
  }

  async getMatchesByDateRange(startDate, endDate) {
    const sql = `
      SELECT m.*, 
             p1.name as player1_name,
             p2.name as player2_name,
             w.name as winner_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN players w ON m.winner_id = w.id
      WHERE m.match_date BETWEEN ? AND ?
      ORDER BY m.match_date ASC
    `;
    
    return await this.db.all(sql, [startDate, endDate]);
  }

  async completeMatch(id, scores) {
    const { player1_score, player2_score } = scores;

    if (player1_score === undefined || player2_score === undefined) {
      throw new Error('Both scores are required');
    }
    const s1 = Number(player1_score);
    const s2 = Number(player2_score);
    if (!Number.isFinite(s1) || !Number.isFinite(s2)) {
      throw new Error('Scores must be numbers');
    }

    const existing = await this.db.get('SELECT player1_id, player2_id FROM matches WHERE id = ?', [id]);
    if (!existing) throw new Error('Match not found');

    let winner_id = null;
    if (s1 > s2) {
      winner_id = existing.player1_id;
    } else if (s2 > s1) {
      winner_id = existing.player2_id;
    }
    
    const sql = `
      UPDATE matches 
      SET player1_score = ?, 
          player2_score = ?, 
          status = 'completed', 
          winner_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await this.db.run(sql, [player1_score, player2_score, winner_id, id]);
    return await this.getMatchById(id);
  }
}

module.exports = MatchManager;
