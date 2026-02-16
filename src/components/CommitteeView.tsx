import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ModelSelector from "@/components/ModelSelector";
import ProfileFileContent from "./ProfileFileContent";
import CreateAgentDialog from "./CreateAgentDialog";
import type { AgentMeta } from "@/lib/agentColors";
import { resolveAgentStyle } from "@/lib/agentColors";
import { cn } from "@/lib/utils";

interface AgentFileInfo {
  filename: string;
  content: string;
  modified_at: string;
  size_bytes: number;
}

interface SettingsResponse {
  api_key_set: boolean;
  api_key_preview: string;
  model: string;
  agent_models: Record<string, string>;
}

interface CommitteeViewProps {
  onNavigateToChat: () => void;
}

export default function CommitteeView({ onNavigateToChat }: CommitteeViewProps) {
  const [files, setFiles] = useState<AgentFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultModel, setDefaultModel] = useState("");
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});
  const [registry, setRegistry] = useState<AgentMeta[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteAgent, setDeleteAgent] = useState<AgentMeta | null>(null);

  useEffect(() => {
    loadFiles();
    loadSettings();
    loadRegistry();
  }, []);

  async function loadRegistry() {
    try {
      const agents = await invoke<AgentMeta[]>("get_agent_registry");
      setRegistry(agents);
    } catch (err) {
      console.error("Failed to load agent registry:", err);
    }
  }

  async function loadSettings() {
    try {
      const settings = await invoke<SettingsResponse>("get_settings");
      setDefaultModel(settings.model);
      setAgentModels(settings.agent_models || {});
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  async function loadFiles() {
    try {
      const result = await invoke<AgentFileInfo[]>("get_agent_files");
      setFiles(result);
      if (!selectedFile && result.length > 0) {
        setSelectedFile(result[0].filename);
      }
    } catch (err) {
      console.error("Failed to load agent files:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(filename: string, content: string) {
    await invoke<AgentFileInfo>("update_agent_file", { filename, content });
    await loadFiles();
  }

  async function handleOpenFolder() {
    try {
      const path = await invoke<string>("open_agents_folder");
      await revealItemInDir(path);
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  }

  async function handleDeleteAgent(agentKey: string) {
    try {
      await invoke("delete_custom_agent", { agentKey });
      setDeleteAgent(null);
      if (selectedFile === `${agentKey}.md`) {
        setSelectedFile(null);
      }
      await loadFiles();
      await loadRegistry();
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  }

  async function handleAgentCreated(agent: AgentMeta) {
    await loadFiles();
    await loadRegistry();
    setShowCreateDialog(false);
    // Select the newly created agent's prompt file
    setSelectedFile(`${agent.key}.md`);
  }

  async function handleSaveAgentModel(agentKey: string, model: string) {
    try {
      await invoke("save_agent_model", { agentKey, model: model.trim() });
      setAgentModels((prev) => {
        const next = { ...prev };
        if (model.trim()) {
          next[agentKey] = model.trim();
        } else {
          delete next[agentKey];
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to save agent model:", err);
    }
  }

  const selectedFileData = files.find((f) => f.filename === selectedFile) ?? null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading committee...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold">Committee Members</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowCreateDialog(true)}
            className="h-8 w-8"
            title="Add custom agent"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenFolder}
            className="h-8 w-8"
            title="Open agents folder"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      {files.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-accent-foreground/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-foreground/70" />
            </div>
            <h2 className="text-xl font-semibold text-foreground/80 mb-2">
              No Committee Members
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Committee member prompts will be created when you start your first debate.
            </p>
            <Button onClick={onNavigateToChat}>Start a Decision</Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Left panel - agent list with model overrides */}
          <div className="w-[280px] border-r border-border shrink-0 bg-muted/10">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1">
                {files.map((file) => {
                  const key = file.filename.replace(".md", "");
                  const meta = registry.find((a) => a.key === key);
                  const style = meta ? resolveAgentStyle(meta.color) : null;
                  const isSelected = selectedFile === file.filename;
                  const agentModel = agentModels[key] || "";

                  return (
                    <div key={file.filename}>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(file.filename)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center",
                          isSelected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <span className="mr-2">{meta?.emoji || ""}</span>
                        <span className={cn("flex-1", isSelected && style?.color)}>
                          {meta?.label || key}
                        </span>
                        {meta && !meta.builtin && isSelected && (
                          <Trash2
                            className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive shrink-0 ml-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteAgent(meta);
                            }}
                          />
                        )}
                      </button>
                      {isSelected && (
                        <div className="px-3 pb-2 pt-1">
                          <label className="text-[11px] text-muted-foreground block mb-1">
                            Model override
                          </label>
                          <ModelSelector
                            value={agentModel}
                            onChange={(val) => handleSaveAgentModel(key, val)}
                            placeholder={defaultModel || "Default model"}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Right panel - prompt content */}
          <div className="flex-1 min-w-0 min-h-0">
            {selectedFileData ? (
              <ProfileFileContent
                key={selectedFileData.filename}
                file={selectedFileData}
                onSave={handleSave}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Select a member to view their prompt</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Agent Dialog */}
      {showCreateDialog && (
        <CreateAgentDialog
          onCreated={handleAgentCreated}
          onClose={() => setShowCreateDialog(false)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteAgent && (
        <Dialog open onOpenChange={(open) => !open && setDeleteAgent(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete {deleteAgent.label}?</DialogTitle>
              <DialogDescription>
                This will permanently remove this agent and its prompt file.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteAgent(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteAgent(deleteAgent.key)}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

