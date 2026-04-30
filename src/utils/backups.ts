const BACKUP_KEY = "onepage-editor-backups";
const MAX_BACKUPS = 10;

export type BackupEntry = {
  id: string;
  content: string;
  createdAt: string;
};

export function getBackups(): BackupEntry[] {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? (JSON.parse(raw) as BackupEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveBackup(content: string) {
  const trimmedContent = content.trimEnd();

  if (!trimmedContent) {
    return getBackups();
  }

  const nextBackup: BackupEntry = {
    id: crypto.randomUUID(),
    content,
    createdAt: new Date().toISOString(),
  };

  const nextBackups = [nextBackup, ...getBackups()].slice(0, MAX_BACKUPS);
  localStorage.setItem(BACKUP_KEY, JSON.stringify(nextBackups));
  return nextBackups;
}
