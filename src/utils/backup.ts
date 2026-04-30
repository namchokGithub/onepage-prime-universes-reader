const BACKUP_KEY = "markdown-editor-backups";
const MAX_BACKUPS = 10;

export type Backup = {
  content: string;
  timestamp: number;
};

type BackupStore = Record<string, Backup[]>;

function getBackupStore(): BackupStore {
  try {
    const rawBackups = localStorage.getItem(BACKUP_KEY);
    if (!rawBackups) return {};

    const parsedBackups = JSON.parse(rawBackups) as Backup[] | BackupStore;

    if (Array.isArray(parsedBackups)) {
      return { legacy: parsedBackups };
    }

    return parsedBackups && typeof parsedBackups === "object"
      ? parsedBackups
      : {};
  } catch {
    return {};
  }
}

function saveBackupStore(store: BackupStore) {
  localStorage.setItem(BACKUP_KEY, JSON.stringify(store));
}

export function getBackups(fileKey?: string): Backup[] {
  if (!fileKey) return [];

  try {
    const backups = getBackupStore()[fileKey];

    return Array.isArray(backups) ? backups : [];
  } catch {
    return [];
  }
}

export function saveBackup(fileKey: string | undefined, content: string): Backup[] {
  if (!fileKey) return [];

  const store = getBackupStore();
  const currentBackups = getBackups(fileKey);

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

  store[fileKey] = nextBackups;
  saveBackupStore(store);
  return nextBackups;
}

export function restoreBackup(fileKey: string | undefined, index: number): string | null {
  if (!fileKey) return null;

  return getBackups(fileKey)[index]?.content ?? null;
}
