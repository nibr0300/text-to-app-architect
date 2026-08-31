import { GeneratedFile } from "@/types/generatedProject";
import { cn } from "@/lib/utils";
import { FileCode, FileText, FileJson } from "lucide-react";

interface FileTreeViewerProps {
  files: GeneratedFile[];
  selected: string | null;
  onSelect: (path: string) => void;
}

function iconFor(path: string) {
  if (path.endsWith(".kt")) return FileCode;
  if (path.endsWith(".xml")) return FileJson;
  return FileText;
}

export function FileTreeViewer({ files, selected, onSelect }: FileTreeViewerProps) {
  return (
    <div className="space-y-0.5 max-h-[420px] overflow-auto pr-1">
      {files.map((file) => {
        const Icon = iconFor(file.path);
        const name = file.path.split("/").pop();
        const dir = file.path.split("/").slice(0, -1).join("/");
        return (
          <button
            key={file.path}
            onClick={() => onSelect(file.path)}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-md flex items-start gap-2 transition-colors",
              selected === file.path
                ? "bg-primary/10 text-primary"
                : "hover:bg-secondary text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-mono truncate">{name}</span>
              <span className="block text-[10px] font-mono opacity-60 truncate">{dir}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
