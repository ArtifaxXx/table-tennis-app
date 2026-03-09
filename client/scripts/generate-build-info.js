const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const outPath = path.resolve(__dirname, '../public/build-info.json');

function safeExecGit(args) {
  const candidates = ['git', 'C:\\Program Files\\Git\\cmd\\git.exe'];

  for (const exe of candidates) {
    try {
      if (exe !== 'git' && !fs.existsSync(exe)) continue;
      return execFileSync(exe, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
    } catch (e) {
    }
  }

  return '';
}

const sha = safeExecGit(['rev-parse', '--short', 'HEAD']);
const branch = safeExecGit(['rev-parse', '--abbrev-ref', 'HEAD']);
const builtAt = new Date().toISOString();

const rawLog = safeExecGit(['log', '-10', '--pretty=format:%h|%s|%ad', '--date=short']);
const changes = rawLog
  ? rawLog
      .split('\n')
      .map((line) => {
        const [hash, subject, date] = line.split('|');
        return {
          hash: (hash || '').trim(),
          subject: (subject || '').trim(),
          date: (date || '').trim(),
        };
      })
      .filter((x) => x.hash && x.subject)
  : [];

const payload = {
  sha: sha || null,
  branch: branch || null,
  builtAt,
  changes,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

process.stdout.write(`Wrote ${outPath}\n`);
