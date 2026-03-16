const fs = require('fs');
const path = require('path');

const resolveDbPath = () => {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '../data/league.db');
};

const safeUnlink = (p) => {
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (e) {
    throw new Error(`Failed to delete ${p}: ${e.message}`);
  }
  return false;
};

const main = () => {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes');

  if (!confirmed) {
    console.error('Refusing to reset DB without confirmation. Re-run with: node src/reset-db.js --yes');
    process.exit(1);
  }

  const dbPath = resolveDbPath();
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  const deleted = [];
  if (safeUnlink(walPath)) deleted.push(path.basename(walPath));
  if (safeUnlink(shmPath)) deleted.push(path.basename(shmPath));
  if (safeUnlink(dbPath)) deleted.push(path.basename(dbPath));

  console.log(`DB reset complete. Deleted: ${deleted.length ? deleted.join(', ') : '(nothing found)'}`);
};

main();
