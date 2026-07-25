import path from 'path';
import fs from 'fs';
import db, { dbPath } from '../db/database';

// Online, consistent backup of the live WAL database via better-sqlite3's
// backup API. This is the correct way to snapshot a database under
// concurrent writes — it does not require stopping the server and produces
// a file that includes all committed data up to the backup point.
const BACKUP_DIR = path.join(path.dirname(dbPath), 'backups');
const KEEP_LAST = 20;

function pruneBackups(): void {
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('admin-') && f.endsWith('.sqlite'))
      .map((f) => path.join(BACKUP_DIR, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch {
    return;
  }
  files.slice(KEEP_LAST).forEach((f) => {
    try { fs.unlinkSync(f); } catch { /* best effort */ }
  });
}

export default async function backupDb(label: string): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_');
  const dest = path.join(BACKUP_DIR, `admin-${safeLabel}-${Date.now()}.sqlite`);
  await db.backup(dest);
  pruneBackups();
  return dest;
}
