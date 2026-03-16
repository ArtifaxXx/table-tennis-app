const fs = require('fs');
const path = require('path');

const resolveDbPath = () => {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '../data/league.db');
};

const pad2 = (n) => String(n).padStart(2, '0');

const timestamp = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
    '-',
    pad2(d.getHours()),
    pad2(d.getMinutes()),
    pad2(d.getSeconds()),
  ].join('');
};

const copyIfExists = (from, to) => {
  if (!fs.existsSync(from)) return false;
  fs.copyFileSync(from, to);
  return true;
};

const main = () => {
  const dbPath = resolveDbPath();
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  if (!fs.existsSync(dbPath)) {
    console.error(`DB file not found: ${dbPath}`);
    process.exit(1);
  }

  const outDir = path.join(__dirname, '../data/backups', timestamp());
  fs.mkdirSync(outDir, { recursive: true });

  const copied = [];
  if (copyIfExists(dbPath, path.join(outDir, path.basename(dbPath)))) copied.push(path.basename(dbPath));
  if (copyIfExists(walPath, path.join(outDir, path.basename(walPath)))) copied.push(path.basename(walPath));
  if (copyIfExists(shmPath, path.join(outDir, path.basename(shmPath)))) copied.push(path.basename(shmPath));

  console.log(`DB snapshot complete: ${outDir}`);
  console.log(`Copied: ${copied.join(', ')}`);
};

main();
