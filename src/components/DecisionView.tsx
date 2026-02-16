import { useState, useEffect, useRef, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Bot, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import LoadingIndicator from "./LoadingIndicator";
import DecisionSummaryPanel, { DecisionSummary } from "./DecisionSummaryPanel";
import DecisionChoiceModal from "./DecisionChoiceModal";
import OutcomeModal from "./OutcomeModal";

function buildReflectionMessage(opts: {
  title: string;
  summary: DecisionSummary | null;
  userChoice: string | null;
  userChoiceReasoning: string | null;
  outcomeText: string;
}): string {
  const rec = opts.summary?.recommendation;
  return `[DECISION OUTCOME LOGGED]

Decision: ${opts.title}

Your recommendation: ${rec?.choice ?? "N/A"} (${rec?.confidence ?? "N/A"} confidence)
Your reasoning: ${rec?.reasoning ?? "N/A"}

What I chose: ${opts.userChoice ?? "N/A"}
Why I chose it: ${opts.userChoiceReasoning ?? "N/A"}

What actually happened:
${opts.outcomeText}

Please reflect on this outcome and update my profile with any new insights.`;
}

interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface SendMessageResponse {
  conversation_id: string;
  response: string;
}

interface StreamEvent {
  type: "token" | "tool_use";
  token?: string;
  tool?: string;
}

interface Decision {
  id: string;
  conversation_id: string;
  title: string;
  status: string;
  summary_json: string | null;
  user_choice: string | null;
  user_choice_reasoning: string | null;
  outcome: string | null;
  outcome_date: string | null;
}

interface DecisionViewProps {
  conversationId: string;
  decisionId: string;
  onMessageSent: () => void;
  activeModel: string;
}

export default function DecisionView({
  conversationId,
  decisionId,
  onMessageSent,
  activeModel,
}: DecisionViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DecisionSummary | null>(null);
  const [status, setStatus] = useState("exploring");
  const [title, setTitle] = useState("");
  const [userChoice, setUserChoice] = useState<string | null>(null);
  const [userChoiceReasoning, setUserChoiceReasoning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [outcomeDate, setOutcomeDate] = useState<string | null>(null);
  const [showSummaryPanel, setShowSummaryPanel] = useState(true);
  const [mobileTab, setMobileTab] = useState<"chat" | "summary">("chat");
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true
  );
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingContentRef = useRef("");

  // Load decision data
  useEffect(() => {
    setMobileTab("chat");
    loadDecision();
    loadMessages();
  }, [decisionId, conversationId]);

  // Listen for summary updates from backend
  useEffect(() => {
    const unlisten = listen<{ decision_id: string; summary: string; status?: string }>(
      "decision-summary-updated",
      (event) => {
        if (event.payload.decision_id === decisionId) {
          try {
            const parsed = JSON.parse(event.payload.summary);
            setSummary(parsed);
          } catch {
            // summary might already be an object
          }
          if (event.payload.status) {
            setStatus(event.payload.status);
          }
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [decisionId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, isStreaming]);

  // Track responsive layout mode
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };
    setIsDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  async function loadDecision() {
    try {
      const dec = await invoke<Decision>("get_decision", { decisionId });
      setTitle(dec.title);
      setStatus(dec.status);
      setUserChoice(dec.user_choice);
      setUserChoiceReasoning(dec.user_choice_reasoning);
      setOutcome(dec.outcome);
      setOutcomeDate(dec.outcome_date);
      if (dec.summary_json) {
        try {
          setSummary(JSON.parse(dec.summary_json));
        } catch {
          setSummary(null);
        }
      } else {
        setSummary(null);
      }
    } catch (err) {
      console.error("Failed to load decision:", err);
    }
  }

  async function loadMessages() {
    try {
      const msgs = await invoke<Message[]>("get_messages", { conversationId });
      setMessages(msgs);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }

  async function handleSend(text: string) {
    setError(null);
    setIsLoading(true);
    setIsStreaming(false);
    streamingContentRef.current = "";

    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      conversation_id: conversationId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    const channel = new Channel<StreamEvent>();
    channel.onmessage = (event: StreamEvent) => {
      if (event.type === "token" && event.token) {
        if (!streamingContentRef.current) {
          setIsLoading(false);
          setIsStreaming(true);
        }
        streamingContentRef.current += event.token;
        const content = streamingContentRef.current;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.id === "streaming") {
            return [...prev.slice(0, -1), { ...last, content }];
          }
          return [
            ...prev,
            {
              id: "streaming",
              conversation_id: conversationId,
              role: "assistant",
              content,
              created_at: new Date().toISOString(),
            },
          ];
        });
      }
    };

    try {
      await invoke<SendMessageResponse>("send_message", {
        conversationId,
        message: text,
        onEvent: channel,
      });

      await loadMessages();
      await loadDecision(); // Refresh summary/status after AI responds
      onMessageSent();
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : "Failed to send message. Please try again."
      );
      if (!streamingContentRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      streamingContentRef.current = "";
    }
  }

  const handleAcceptRecommendation = useCallback(async () => {
    if (!summary?.recommendation?.choice) return;
    try {
      await invoke("update_decision_status", {
        decisionId,
        status: "decided",
        userChoice: summary.recommendation.choice,
        userChoiceReasoning: "Accepted the AI recommendation",
      });
      await loadDecision();
      onMessageSent();
    } catch (err) {
      console.error("Failed to update decision:", err);
    }
  }, [decisionId, summary, onMessageSent]);

  const handleChoseDifferently = useCallback(() => {
    setShowChoiceModal(true);
  }, []);

  const handleSaveChoice = useCallback(
    async (choice: string, reasoning: string) => {
      try {
        await invoke("update_decision_status", {
          decisionId,
          status: "decided",
          userChoice: choice,
          userChoiceReasoning: reasoning || null,
        });
        await loadDecision();
        setShowChoiceModal(false);
        onMessageSent();
      } catch (err) {
        console.error("Failed to save choice:", err);
      }
    },
    [decisionId, onMessageSent]
  );

  const handleReopenDecision = useCallback(async () => {
    try {
      await invoke("update_decision_status", {
        decisionId,
        status: "exploring",
      });
      await loadDecision();
      onMessageSent();
    } catch (err) {
      console.error("Failed to reopen decision:", err);
    }
  }, [decisionId, onMessageSent]);

  const handleLogOutcome = useCallback(() => {
    setShowOutcomeModal(true);
  }, []);

  async function handleSaveOutcome(outcomeText: string) {
    try {
      await invoke("update_decision_status", {
        decisionId,
        status: "reviewed",
        outcome: outcomeText,
      });
      await loadDecision();
      setShowOutcomeModal(false);
      onMessageSent();

      // Trigger AI reflection on the outcome
      const reflectionMessage = buildReflectionMessage({
        title,
        summary,
        userChoice,
        userChoiceReasoning,
        outcomeText,
      });
      await handleSend(reflectionMessage);
    } catch (err) {
      console.error("Failed to save outcome:", err);
    }
  }

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    exploring: { label: "Exploring", color: "text-muted-foreground" },
    analyzing: { label: "Analyzing", color: "text-blue-500" },
    recommended: { label: "Recommended", color: "text-amber-500" },
    decided: { label: "Decided", color: "text-green-500" },
    reviewed: { label: "Reviewed", color: "text-purple-500" },
  };

  const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.exploring;

  const renderChatPane = () => (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <ScrollArea className="flex-1">
        {messages.length === 0 && !isLoading && !error ? (
          <div className="h-full flex items-center justify-center min-h-[calc(100vh-200px)]">
            <div className="text-center max-w-md px-4">
              <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-accent-foreground/10 flex items-center justify-center">
                <Bot className="h-6 w-6 text-foreground/70" />
              </div>
              <h2 className="text-xl font-semibold text-foreground/80 mb-2">
                {title}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Describe your decision and the context around it. I&apos;ll help
                you think through all the variables and find the best path
                forward.
              </p>
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
              />
            ))}
            {isLoading && <LoadingIndicator />}
            {error && (
              <div className="max-w-3xl mx-auto px-6 py-3">
                <div className="px-4 py-3 rounded-lg bg-destructive/20 border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>
      <div className="flex justify-center py-1">
        <span className="text-xs text-muted-foreground/50">
          {activeModel}
        </span>
      </div>
      <ChatInput onSend={handleSend} disabled={isLoading || isStreaming} />
    </div>
  );

  const renderSummaryPane = () => (
    <DecisionSummaryPanel
      summary={summary}
      status={status}
      userChoice={userChoice}
      userChoiceReasoning={userChoiceReasoning}
      outcome={outcome}
      outcomeDate={outcomeDate}
      onAcceptRecommendation={handleAcceptRecommendation}
      onChoseDifferently={handleChoseDifferently}
      onNeedMoreTime={handleReopenDecision}
      onLogOutcome={handleLogOutcome}
      onReopen={handleReopenDecision}
    />
  );

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold truncate">{title}</h2>
          <span className={`text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSummaryPanel(!showSummaryPanel)}
          className="h-8 w-8 shrink-0 hidden lg:inline-flex"
          title={showSummaryPanel ? "Hide summary" : "Show summary"}
        >
          {showSummaryPanel ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Mobile tabs */}
      <div className="lg:hidden px-3 py-2 border-b border-border">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mobileTab === "chat" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMobileTab("chat")}
          >
            Chat
          </Button>
          <Button
            variant={mobileTab === "summary" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMobileTab("summary")}
          >
            Summary
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {isDesktop ? (
          <div className="h-full min-h-0 flex">
            {renderChatPane()}
            {showSummaryPanel && (
              <div className="w-[340px] border-l border-border shrink-0 bg-muted/10 min-h-0">
                {renderSummaryPane()}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full min-h-0 flex">
            <div
              className={cn(
                "flex-1 min-h-0",
                mobileTab === "chat" ? "flex" : "hidden"
              )}
            >
              {renderChatPane()}
            </div>
            <div
              className={cn(
                "flex-1 min-h-0 bg-muted/10",
                mobileTab === "summary" ? "block" : "hidden"
              )}
            >
              {renderSummaryPane()}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showChoiceModal && (
        <DecisionChoiceModal
          onSave={handleSaveChoice}
          onClose={() => setShowChoiceModal(false)}
        />
      )}
      {showOutcomeModal && (
        <OutcomeModal
          onSave={handleSaveOutcome}
          onClose={() => setShowOutcomeModal(false)}
        />
      )}
    </div>
  );
}
