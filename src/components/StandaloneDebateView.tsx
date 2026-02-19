import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import DebateView from "./DebateView";
import type { StandaloneDebateConfig } from "./DebateModelSelectionDialog";

interface Decision {
  id: string;
  conversation_id: string;
  title: string;
  status: string;
  summary_json: string | null;
  debate_brief: string | null;
  debate_started_at: string | null;
  debate_completed_at: string | null;
}

interface StandaloneSummaryConfig {
  standalone_sandbox?: {
    debate_config?: {
      mode?: string;
      exchange_count?: number;
      max_exchanges?: number;
      exchangeCount?: number;
      maxExchanges?: number;
    };
  };
}

interface StandaloneDebateViewProps {
  decisionId: string;
  quickMode: boolean;
  debateConfig?: StandaloneDebateConfig;
  onBack: () => void;
}

export default function StandaloneDebateView({
  decisionId,
  quickMode,
  debateConfig,
  onBack,
}: StandaloneDebateViewProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isDebating, setIsDebating] = useState(false);
  const [activeConfig, setActiveConfig] = useState<StandaloneDebateConfig | undefined>(debateConfig);

  useEffect(() => {
    setTitle("");
    setPrompt("");
    setIsDebating(false);
    setActiveConfig(debateConfig);
    loadDecision();
  }, [decisionId, debateConfig]);

  useEffect(() => {
    const unlistenStarted = listen<{ decision_id: string }>(
      "debate-started",
      (event) => {
        if (event.payload.decision_id === decisionId) {
          setIsDebating(true);
        }
      }
    );
    const unlistenComplete = listen<{ decision_id: string }>(
      "debate-complete",
      (event) => {
        if (event.payload.decision_id === decisionId) {
          setIsDebating(false);
        }
      }
    );
    const unlistenError = listen<{ decision_id: string; error: string }>(
      "debate-error",
      (event) => {
        if (event.payload.decision_id === decisionId) {
          setIsDebating(false);
        }
      }
    );
    return () => {
      unlistenStarted.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [decisionId]);

  async function loadDecision() {
    try {
      const dec = await invoke<Decision>("get_decision", { decisionId });
      setTitle(dec.title);
      setPrompt(dec.debate_brief || "");
      setIsDebating(dec.status === "debating");
      if (dec.summary_json) {
        const parsed: StandaloneSummaryConfig = JSON.parse(dec.summary_json);
        const cfg = parsed.standalone_sandbox?.debate_config;
        if (cfg?.mode === "moderator_auto") {
          setActiveConfig({
            mode: "moderator_auto",
            maxExchanges: cfg.max_exchanges ?? cfg.maxExchanges,
          });
        } else if (cfg?.mode === "fixed") {
          setActiveConfig({
            mode: "fixed",
            exchangeCount: cfg.exchange_count ?? cfg.exchangeCount,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load debate:", err);
    }
  }

  const resolvedQuickMode =
    activeConfig?.mode === "fixed" && (activeConfig.exchangeCount || 0) === 0
      ? true
      : quickMode;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <h2 className="text-sm font-semibold truncate">{title}</h2>
        {prompt && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {prompt}
          </p>
        )}
      </div>

      {/* DebateView handles all debate display, streaming, and audio */}
      <DebateView
        decisionId={decisionId}
        isDebating={isDebating}
        quickMode={resolvedQuickMode}
        debateConfig={activeConfig}
        onBackToChat={onBack}
        onDebateComplete={() => setIsDebating(false)}
        backButtonLabel="Back"
        title={title}
      />
    </div>
  );
}
