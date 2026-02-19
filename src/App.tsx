import { useState, useEffect, useLayoutEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import DecisionView from "./components/DecisionView";
import ProfileView from "./components/ProfileView";
import CommitteeView from "./components/CommitteeView";
import StandaloneDebateView from "./components/StandaloneDebateView";
import DebateModelSelectionDialog, {
  type StandaloneDebateConfig,
} from "./components/DebateModelSelectionDialog";
import Settings from "./components/Settings";
import "./App.css";

interface SettingsResponse {
  api_key_set: boolean;
  api_key_preview: string;
  model: string;
}

interface CreateDecisionResponse {
  conversation_id: string;
  decision_id: string;
}

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "open-council-theme";

type ViewMode = "chat" | "decision" | "profile" | "committee" | "standalone-debate";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function App() {
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentDecisionId, setCurrentDecisionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [showSettings, setShowSettings] = useState(false);
  const [showNewDecisionInput, setShowNewDecisionInput] = useState(false);
  const [newDecisionTitle, setNewDecisionTitle] = useState("");
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeModel, setActiveModel] = useState("");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  // Standalone debate state
  const [currentDebateDecisionId, setCurrentDebateDecisionId] = useState<string | null>(null);
  const [debateQuickMode, setDebateQuickMode] = useState(false);
  const [currentDebateConfig, setCurrentDebateConfig] = useState<StandaloneDebateConfig | null>(null);
  const [showNewDebateInput, setShowNewDebateInput] = useState(false);
  const [newDebateTitle, setNewDebateTitle] = useState("");
  const [newDebatePrompt, setNewDebatePrompt] = useState("");
  const [pendingDebate, setPendingDebate] = useState<{ title: string; prompt: string } | null>(null);
  const [showDebateModelSelection, setShowDebateModelSelection] = useState(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  async function checkApiKey() {
    try {
      const settings = await invoke<SettingsResponse>("get_settings");
      const configured = settings.api_key_set;
      setApiKeySet(configured);
      setActiveModel(settings.model);
      if (!configured) {
        setShowSettings(true);
      }
    } catch {
      setApiKeySet(false);
      setShowSettings(true);
    }
  }

  function handleNewChat() {
    setCurrentConversationId(null);
    setCurrentDecisionId(null);
    setCurrentDebateDecisionId(null);
    setCurrentDebateConfig(null);
    setViewMode("chat");
  }

  function handleSelectConversation(id: string) {
    setCurrentConversationId(id);
    setCurrentDecisionId(null);
    setCurrentDebateDecisionId(null);
    setCurrentDebateConfig(null);
    setViewMode("chat");
  }

  function handleSelectDecision(conversationId: string, decisionId: string) {
    setCurrentConversationId(conversationId);
    setCurrentDecisionId(decisionId);
    setCurrentDebateDecisionId(null);
    setCurrentDebateConfig(null);
    setViewMode("decision");
  }

  function handleNewDecision() {
    setShowNewDecisionInput(true);
    setNewDecisionTitle("");
  }

  function handleOpenProfile() {
    setViewMode("profile");
  }

  function handleOpenCommittee() {
    setViewMode("committee");
  }

  async function handleCreateDecision() {
    const title = newDecisionTitle.trim();
    if (!title) return;

    try {
      const result = await invoke<CreateDecisionResponse>("create_decision", { title });
      setCurrentConversationId(result.conversation_id);
      setCurrentDecisionId(result.decision_id);
      setViewMode("decision");
      setShowNewDecisionInput(false);
      setNewDecisionTitle("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to create decision:", err);
    }
  }

  // ── Standalone Debate Handlers ──

  function handleNewDebate() {
    setShowNewDebateInput(true);
    setNewDebateTitle("");
    setNewDebatePrompt("");
  }

  async function handleCreateDebateStep1() {
    const title = newDebateTitle.trim();
    const prompt = newDebatePrompt.trim();
    if (!title || !prompt) return;

    setShowNewDebateInput(false);
    setPendingDebate({ title, prompt });
    setShowDebateModelSelection(true);
  }

  async function handleStartStandaloneDebate(
    selectedModels: string[],
    debateConfig: StandaloneDebateConfig
  ) {
    setShowDebateModelSelection(false);
    if (!pendingDebate) return;
    const debateRequest = pendingDebate;

    try {
      const result = await invoke<CreateDecisionResponse>("create_standalone_debate", {
        title: debateRequest.title,
        prompt: debateRequest.prompt,
      });

      setCurrentConversationId(result.conversation_id);
      setCurrentDecisionId(null);
      setCurrentDebateDecisionId(result.decision_id);
      setCurrentDebateConfig(debateConfig);
      const quickMode =
        debateConfig.mode === "fixed" && (debateConfig.exchangeCount || 0) === 0;
      setDebateQuickMode(quickMode);
      setViewMode("standalone-debate");
      setRefreshKey((k) => k + 1);

      await invoke("start_standalone_debate", {
        decisionId: result.decision_id,
        quickMode,
        selectedModels,
        prompt: debateRequest.prompt,
        debateConfig,
      });
      setPendingDebate(null);
    } catch (err) {
      console.error("Failed to start standalone debate:", err);
    }
  }

  function handleSelectStandaloneDebate(conversationId: string, decisionId: string) {
    setCurrentConversationId(conversationId);
    setCurrentDecisionId(null);
    setCurrentDebateDecisionId(decisionId);
    setCurrentDebateConfig(null);
    setDebateQuickMode(false);
    setViewMode("standalone-debate");
  }

  function handleSettingsSaved() {
    setApiKeySet(true);
    setShowSettings(false);
    checkApiKey();
  }

  function handleConversationCreated(id: string) {
    setCurrentConversationId(id);
    setRefreshKey((k) => k + 1);
  }

  function handleMessageSent() {
    setRefreshKey((k) => k + 1);
  }

  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  if (apiKeySet === null) {
    return (
      <div className="h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden transition-colors">
      {sidebarOpen && (
        <Sidebar
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onSelectDecision={handleSelectDecision}
          onNewChat={handleNewChat}
          onNewDecision={handleNewDecision}
          onNewDebate={handleNewDebate}
          onSelectStandaloneDebate={handleSelectStandaloneDebate}
          onOpenSettings={() => setShowSettings(true)}
          onOpenProfile={handleOpenProfile}
          onOpenCommittee={handleOpenCommittee}
          onToggleTheme={handleToggleTheme}
          onClose={() => setSidebarOpen(false)}
          theme={theme}
          refreshKey={refreshKey}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 left-3 z-10"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        {viewMode === "profile" ? (
          <ProfileView onNavigateToChat={handleNewChat} />
        ) : viewMode === "committee" ? (
          <CommitteeView onNavigateToChat={handleNewChat} />
        ) : viewMode === "standalone-debate" && currentDebateDecisionId ? (
          <StandaloneDebateView
            decisionId={currentDebateDecisionId}
            quickMode={debateQuickMode}
            debateConfig={currentDebateConfig || undefined}
            onBack={handleNewChat}
          />
        ) : viewMode === "decision" && currentConversationId && currentDecisionId ? (
          <DecisionView
            conversationId={currentConversationId}
            decisionId={currentDecisionId}
            onMessageSent={handleMessageSent}
            activeModel={activeModel}
          />
        ) : (
          <ChatView
            conversationId={currentConversationId}
            onConversationCreated={handleConversationCreated}
            onMessageSent={handleMessageSent}
            activeModel={activeModel}
          />
        )}
      </div>
      {showSettings && (
        <Settings
          onClose={() => {
            if (apiKeySet) setShowSettings(false);
          }}
          onSaved={handleSettingsSaved}
          mustSetKey={!apiKeySet}
        />
      )}

      {/* New Decision Modal */}
      {showNewDecisionInput && (
        <Dialog open onOpenChange={(open) => !open && setShowNewDecisionInput(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Decision</DialogTitle>
              <DialogDescription>
                What decision are you working through?
              </DialogDescription>
            </DialogHeader>
            <Input
              value={newDecisionTitle}
              onChange={(e) => setNewDecisionTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateDecision();
              }}
              placeholder="e.g., Should I leave my job?"
              autoFocus
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowNewDecisionInput(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDecision}
                disabled={!newDecisionTitle.trim()}
              >
                Start
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* New Debate Modal - Step 1: Topic & Prompt */}
      {showNewDebateInput && (
        <Dialog open onOpenChange={(open) => !open && setShowNewDebateInput(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New Debate</DialogTitle>
              <DialogDescription>
                Set the topic and context for your debate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={newDebateTitle}
                onChange={(e) => setNewDebateTitle(e.target.value)}
                placeholder="Debate title, e.g., Is AI consciousness possible?"
                autoFocus
              />
              <Textarea
                value={newDebatePrompt}
                onChange={(e) => setNewDebatePrompt(e.target.value)}
                placeholder="Describe what should be debated. Provide context, specific questions, or positions you want explored..."
                rows={4}
                className="resize-none"
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowNewDebateInput(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDebateStep1}
                disabled={!newDebateTitle.trim() || !newDebatePrompt.trim()}
              >
                Choose Models
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* New Debate Modal - Step 2: Model Selection */}
      {showDebateModelSelection && (
        <DebateModelSelectionDialog
          defaultModel={activeModel}
          onStart={handleStartStandaloneDebate}
          onClose={() => {
            setShowDebateModelSelection(false);
            setPendingDebate(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
