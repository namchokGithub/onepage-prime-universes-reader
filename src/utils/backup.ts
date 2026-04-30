const BACKUP_KEY = "markdown-editor-backups";
const MAX_BACKUPS = 10;

export type Backup = {
  content: string;
  timestamp: number;
};

export function getBackups(): Backup[] {
  try {
    const rawBackups = localStorage.getItem(BACKUP_KEY);
    if (!rawBackups) return [];

    const parsedBackups = JSON.parse(rawBackups) as Backup[];
    return Array.isArray(parsedBackups) ? parsedBackups : [];
  } catch {
    return [];
  }
}

export function saveBackup(content: string): Backup[] {
  const currentBackups = getBackups();

  if (currentBackups[0]?.content === content) {
    return currentBackups;
  }

  const nextBackups = [
    {
      content,
      timestamp: Date.now(),
    },
    ...currentBackups,
  ].slice(0, MAX_BACKUPS);

  localStorage.setItem(BACKUP_KEY, JSON.stringify(nextBackups));
  return nextBackups;
}

export function restoreBackup(index: number): string | null {
  return getBackups()[index]?.content ?? null;
}
