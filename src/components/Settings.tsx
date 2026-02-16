import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Settings as SettingsIcon, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface SettingsProps {
  onClose: () => void;
  onSaved: () => void;
  mustSetKey: boolean;
}

interface SettingsResponse {
  provider: string;
  api_key_set: boolean;
  api_key_preview: string;
  model: string;
  ollama_url: string;
  ollama_model: string;
}

export default function Settings({ onClose, onSaved, mustSetKey }: SettingsProps) {
  const [provider, setProvider] = useState<"anthropic" | "ollama">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-5-20250929");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3.1:8b");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPreview, setCurrentPreview] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const settings = await invoke<SettingsResponse>("get_settings");
      setProvider(settings.provider === "ollama" ? "ollama" : "anthropic");
      setModel(settings.model);
      setCurrentPreview(settings.api_key_preview);
      setHasExistingKey(settings.api_key_set);
      setOllamaUrl(settings.ollama_url);
      setOllamaModel(settings.ollama_model);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  async function handleSave() {
    if (provider === "anthropic" && mustSetKey && !apiKey.trim() && !hasExistingKey) {
      setError("Please enter your API key to get started.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await invoke("save_settings", {
        provider,
        apiKey: apiKey.trim(),
        model,
        ollamaUrl: ollamaUrl.trim(),
        ollamaModel: ollamaModel.trim(),
      });
      onSaved();
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenFolder() {
    try {
      const path = await invoke<string>("open_profile_folder");
      await revealItemInDir(path);
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !mustSetKey) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={`sm:max-w-md ${mustSetKey ? "[&>button.absolute]:hidden" : ""}`}
        onInteractOutside={(e) => {
          if (mustSetKey) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (mustSetKey) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            {mustSetKey ? "Welcome! Configure your AI" : "Settings"}
          </DialogTitle>
          {mustSetKey && (
            <DialogDescription>
              Choose a provider to get started. Use Anthropic's API with a key, or
              run models locally with Ollama.
            </DialogDescription>
          )}
        </DialogHeader>

        <Separator />

        <div className="space-y-5">
          {/* Provider Toggle */}
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-2">
              Provider
            </label>
            <div className="flex gap-2">
              <Button
                variant={provider === "anthropic" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setProvider("anthropic")}
              >
                Anthropic API
              </Button>
              <Button
                variant={provider === "ollama" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setProvider("ollama")}
              >
                Ollama (Local)
              </Button>
            </div>
          </div>

          {/* Anthropic Settings */}
          {provider === "anthropic" && (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  API Key
                </label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={currentPreview || "sk-ant-..."}
                />
                {hasExistingKey && !apiKey && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Current key: {currentPreview}. Leave blank to keep it.
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  Model
                </label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-sonnet-4-5-20250929">
                      Claude Sonnet 4.5 (Recommended)
                    </SelectItem>
                    <SelectItem value="claude-haiku-4-5-20251001">
                      Claude Haiku 4.5 (Faster &amp; Cheaper)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Ollama Settings */}
          {provider === "ollama" && (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  Ollama URL
                </label>
                <Input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Make sure Ollama is running locally.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  Model
                </label>
                <Input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="llama3.1:8b"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Recommended: llama3.1:8b, qwen2.5, mistral. Pull with{" "}
                  <code className="text-foreground">ollama pull model-name</code>
                </p>
              </div>
            </>
          )}

          {/* Profile Files */}
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-1.5">
              Profile Files
            </label>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleOpenFolder}
            >
              <FolderOpen className="h-4 w-4" />
              Open Profile Folder
            </Button>
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>

        <Separator />

        <DialogFooter>
          {!mustSetKey && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
