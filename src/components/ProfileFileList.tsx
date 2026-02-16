import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileFileInfo {
  filename: string;
  content: string;
  modified_at: string;
  size_bytes: number;
}

interface ProfileFileListProps {
  files: ProfileFileInfo[];
  selectedFile: string | null;
  onSelect: (filename: string) => void;
}

export default function ProfileFileList({
  files,
  selectedFile,
  onSelect,
}: ProfileFileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-2 py-2">
        {files.map((file) => {
          const displayName = file.filename.replace(/\.md$/, "");
          return (
            <div
              key={file.filename}
              onClick={() => onSelect(file.filename)}
              className={cn(
                "px-3 py-2 rounded-lg cursor-pointer mb-0.5 flex items-center gap-2 transition-colors",
                selectedFile === file.filename
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/60 hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="text-sm truncate">{displayName}</span>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-2 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>
    </div>
  );
}
