const { v4: uuidv4 } = require('uuid');

class NewsManager {
  constructor(database) {
    this.db = database;
  }

  async getAllNews() {
    return this.db.all(
      `SELECT *
       FROM news
       ORDER BY pinned DESC, datetime(created_at) DESC, title ASC`,
      []
    );
  }

  async getNewsById(id) {
    return this.db.get('SELECT * FROM news WHERE id = ?', [id]);
  }

  async createNews({ title, body } = {}) {
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    const trimmedBody = typeof body === 'string' ? body.trim() : '';

    if (!trimmedTitle) {
      throw new Error('Title is required');
    }

    if (!trimmedBody) {
      throw new Error('Body is required');
    }

    const id = uuidv4();
    await this.db.run(
      `INSERT INTO news (id, title, body)
       VALUES (?, ?, ?)`,
      [id, trimmedTitle, trimmedBody]
    );

    return this.getNewsById(id);
  }

  async deleteNews(id) {
    const result = await this.db.run('DELETE FROM news WHERE id = ?', [id]);
    if (result.changes === 0) {
      throw new Error('News entry not found');
    }
  }

  async pinNews(id) {
    await this.db.run('BEGIN TRANSACTION');
    try {
      await this.db.run('UPDATE news SET pinned = 0');
      const result = await this.db.run('UPDATE news SET pinned = 1 WHERE id = ?', [id]);
      if (result.changes === 0) {
        throw new Error('News entry not found');
      }
      await this.db.run('COMMIT');
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  async unpinNews(id) {
    const result = await this.db.run('UPDATE news SET pinned = 0 WHERE id = ?', [id]);
    if (result.changes === 0) {
      throw new Error('News entry not found');
    }
  }
}

module.exports = NewsManager;
