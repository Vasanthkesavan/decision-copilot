import { useState, useEffect, useLayoutEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import Settings from "./components/Settings";
import "./App.css";

interface SettingsResponse {
  provider: string;
  api_key_set: boolean;
  api_key_preview: string;
  model: string;
  ollama_url: string;
  ollama_model: string;
}

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "decision-copilot-theme";

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
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeModel, setActiveModel] = useState("");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

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
      // Ollama doesn't need an API key; Anthropic does
      const configured = settings.provider === "ollama" || settings.api_key_set;
      setApiKeySet(configured);
      setActiveModel(
        settings.provider === "ollama" ? settings.ollama_model : settings.model
      );
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
  }

  function handleSelectConversation(id: string) {
    setCurrentConversationId(id);
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
          onNewChat={handleNewChat}
          onOpenSettings={() => setShowSettings(true)}
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
        <ChatView
          conversationId={currentConversationId}
          onConversationCreated={handleConversationCreated}
          onMessageSent={handleMessageSent}
          activeModel={activeModel}
        />
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
    </div>
  );
}

export default App;
