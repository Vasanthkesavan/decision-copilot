import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProfileFileList from "./ProfileFileList";
import ProfileFileContent from "./ProfileFileContent";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface ProfileFileInfo {
  filename: string;
  content: string;
  modified_at: string;
  size_bytes: number;
}

interface ProfileViewProps {
  onNavigateToChat: () => void;
}

export default function ProfileView({ onNavigateToChat }: ProfileViewProps) {
  const [files, setFiles] = useState<ProfileFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
  }, []);

  async function loadFiles() {
    try {
      const result = await invoke<ProfileFileInfo[]>("get_profile_files_detailed");
      setFiles(result);
    } catch (err) {
      console.error("Failed to load profile files:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(filename: string, content: string) {
    await invoke<ProfileFileInfo>("update_profile_file", { filename, content });
    await loadFiles();
  }

  function handleDeleteRequest(filename: string) {
    setDeleteTarget(filename);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await invoke<void>("remove_profile_file", { filename: deleteTarget });
      const updatedFiles = files.filter((f) => f.filename !== deleteTarget);

      if (selectedFile === deleteTarget) {
        // Select next available file or null
        const deletedIndex = files.findIndex((f) => f.filename === deleteTarget);
        const nextFile =
          updatedFiles[deletedIndex] ?? updatedFiles[deletedIndex - 1] ?? null;
        setSelectedFile(nextFile?.filename ?? null);
      }

      setDeleteTarget(null);
      await loadFiles();
    } catch (err) {
      console.error("Failed to delete profile file:", err);
    }
  }

  function handleDeleteCancel() {
    setDeleteTarget(null);
  }

  async function handleOpenFolder() {
    try {
      const path = await invoke<string>("open_profile_folder");
      await revealItemInDir(path);
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  }

  const selectedFileData = files.find((f) => f.filename === selectedFile) ?? null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold">My Profile</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpenFolder}
          className="h-8 w-8"
          title="Open profile folder"
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      {files.length === 0 ? (
        /* Empty state */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-accent-foreground/10 flex items-center justify-center">
              <User className="h-6 w-6 text-foreground/70" />
            </div>
            <h2 className="text-xl font-semibold text-foreground/80 mb-2">
              Your Profile is Empty
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Start a conversation and the AI will begin learning about you. What it
              learns will appear here as readable files you can view and edit anytime.
            </p>
            <Button onClick={onNavigateToChat}>Start a Conversation</Button>
          </div>
        </div>
      ) : (
        /* Split panel */
        <div className="flex-1 flex min-h-0">
          {/* Left panel - file list */}
          <div className="w-[250px] border-r border-border shrink-0 bg-muted/10">
            <ScrollArea className="h-full">
              <ProfileFileList
                files={files}
                selectedFile={selectedFile}
                onSelect={setSelectedFile}
              />
            </ScrollArea>
          </div>

          {/* Right panel - file content */}
          <div className="flex-1 min-w-0 min-h-0">
            {selectedFileData ? (
              <ProfileFileContent
                key={selectedFileData.filename}
                file={selectedFileData}
                onSave={handleSave}
                onDelete={handleDeleteRequest}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Select a file to view</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        filename={deleteTarget ?? ""}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
