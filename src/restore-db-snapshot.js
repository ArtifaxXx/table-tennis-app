const fs = require('fs');
const path = require('path');

const copyRequired = (src, dest) => {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required file: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
};

const copyOptional = (src, dest) => {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
};

const main = () => {
  const name = process.argv[2] || 'prem-division';
  const yes = process.argv.includes('--yes');

  if (!yes) {
    throw new Error('Refusing to restore without --yes (this overwrites data/league.db)');
  }

  const root = path.join(__dirname, '..');
  const dataDir = path.join(root, 'data');

  const snapDir = path.join(dataDir, 'seed-snapshots', name);
  const srcDb = path.join(snapDir, 'league.db');
  const srcWal = path.join(snapDir, 'league.db-wal');
  const srcShm = path.join(snapDir, 'league.db-shm');

  const destDb = path.join(dataDir, 'league.db');
  const destWal = path.join(dataDir, 'league.db-wal');
  const destShm = path.join(dataDir, 'league.db-shm');

  copyRequired(srcDb, destDb);
  const walCopied = copyOptional(srcWal, destWal);
  const shmCopied = copyOptional(srcShm, destShm);

  // If snapshot doesn't contain wal/shm, remove any existing ones to avoid mismatch.
  if (!walCopied && fs.existsSync(destWal)) fs.rmSync(destWal);
  if (!shmCopied && fs.existsSync(destShm)) fs.rmSync(destShm);

  console.log(`Restored DB snapshot '${name}' into data/league.db`);
};

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
