import { RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Backup } from "@/utils/backup";
import { Button } from "@/components/ui/button";

type BackupListProps = {
  backups: Backup[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onRestore: (index: number) => void;
};

export function BackupList({
  backups,
  selectedIndex,
  onSelect,
  onRestore,
}: BackupListProps) {
  const selectedBackup = backups[selectedIndex];
  const selectedLabel = useMemo(() => {
    if (!selectedBackup) return "No backups";

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(selectedBackup.timestamp));
  }, [selectedBackup]);

  return (
    <div className="flex min-w-[240px] flex-col gap-2 sm:flex-row sm:items-center">
      <select
        value={selectedIndex}
        onChange={(event) => {
          onSelect(Number(event.target.value));
        }}
        disabled={backups.length === 0}
        aria-label="Backup list"
        className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {backups.length === 0 ? (
          <option>No backups</option>
        ) : (
          backups.map((backup, index) => (
            <option key={`${backup.timestamp}-${index}`} value={index}>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(backup.timestamp))}
            </option>
          ))
        )}
      </select>

      <Button
        type="button"
        variant="outline"
        onClick={() => onRestore(selectedIndex)}
        disabled={!selectedBackup}
        title={selectedLabel}>
        <RotateCcw className="h-4 w-4" />
        Restore
      </Button>
    </div>
  );
}
