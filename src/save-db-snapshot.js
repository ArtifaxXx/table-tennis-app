const fs = require('fs');
const path = require('path');

const copyIfExists = (src, dest) => {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
};

const main = () => {
  const name = process.argv[2] || 'prem-division';
  const root = path.join(__dirname, '..');
  const dataDir = path.join(root, 'data');

  const srcDb = path.join(dataDir, 'league.db');
  const srcWal = path.join(dataDir, 'league.db-wal');
  const srcShm = path.join(dataDir, 'league.db-shm');

  if (!fs.existsSync(srcDb)) {
    throw new Error(`DB not found at ${srcDb}`);
  }

  const destDir = path.join(dataDir, 'seed-snapshots', name);
  const destDb = path.join(destDir, 'league.db');
  const destWal = path.join(destDir, 'league.db-wal');
  const destShm = path.join(destDir, 'league.db-shm');

  fs.mkdirSync(destDir, { recursive: true });

  copyIfExists(srcDb, destDb);
  const walCopied = copyIfExists(srcWal, destWal);
  const shmCopied = copyIfExists(srcShm, destShm);

  console.log(`Saved DB snapshot: ${destDir}`);
  console.log(`Copied: league.db`);
  if (walCopied) console.log('Copied: league.db-wal');
  if (shmCopied) console.log('Copied: league.db-shm');
};

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
