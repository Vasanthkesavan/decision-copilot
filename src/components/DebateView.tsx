import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import DebateAgentMessage from "./DebateAgentMessage";
import DebateRoundHeader from "./DebateRoundHeader";
import DebateProgressBar from "./DebateProgressBar";
import ModeratorVerdict from "./ModeratorVerdict";

interface DebateRoundData {
  id: string;
  decision_id: string;
  round_number: number;
  exchange_number: number;
  agent: string;
  content: string;
  created_at: string;
}

interface AgentResponseEvent {
  decision_id: string;
  round_number: number;
  exchange_number: number;
  agent: string;
  content: string;
}

interface AgentTokenEvent {
  decision_id: string;
  round_number: number;
  exchange_number: number;
  agent: string;
  token: string;
}

interface RoundCompleteEvent {
  decision_id: string;
  round_number: number;
  exchange_number: number;
}

interface DebateViewProps {
  decisionId: string;
  isDebating: boolean;
  quickMode: boolean;
  onBackToChat: () => void;
  onDebateComplete: () => void;
}

// Group rounds by (round_number, exchange_number)
interface RoundGroup {
  roundNumber: number;
  exchangeNumber: number;
  entries: DebateRoundData[];
}

function groupRounds(rounds: DebateRoundData[]): RoundGroup[] {
  const groups: RoundGroup[] = [];
  let current: RoundGroup | null = null;

  for (const r of rounds) {
    if (
      !current ||
      current.roundNumber !== r.round_number ||
      current.exchangeNumber !== r.exchange_number
    ) {
      current = {
        roundNumber: r.round_number,
        exchangeNumber: r.exchange_number,
        entries: [],
      };
      groups.push(current);
    }
    current.entries.push(r);
  }

  return groups;
}

export default function DebateView({
  decisionId,
  isDebating,
  quickMode,
  onBackToChat,
  onDebateComplete,
}: DebateViewProps) {
  const [rounds, setRounds] = useState<DebateRoundData[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [collapsedRounds, setCollapsedRounds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [debateRunning, setDebateRunning] = useState(isDebating);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  // Track streaming tokens per agent: key = "round-exchange-agent"
  const [streamingMessages, setStreamingMessages] = useState<Record<string, { round_number: number; exchange_number: number; agent: string; content: string }>>(
    {}
  );

  // Total rounds: quick mode = 2 (round 1 + moderator), full = 5 (r1, r2e1, r2e2, r3, moderator)
  const totalRounds = quickMode ? 2 : 5;

  // Load existing debate data on mount
  useEffect(() => {
    loadDebate();
  }, [decisionId]);

  // Listen for debate events
  useEffect(() => {
    // Listen for streaming tokens — progressively build agent messages
    const unlistenToken = listen<AgentTokenEvent>(
      "debate-agent-token",
      (event) => {
        if (event.payload.decision_id !== decisionId) return;
        const { round_number, exchange_number, agent, token } = event.payload;
        const key = `${round_number}-${exchange_number}-${agent}`;

        setStreamingMessages((prev) => {
          const existing = prev[key];
          return {
            ...prev,
            [key]: {
              round_number,
              exchange_number,
              agent,
              content: (existing?.content || "") + token,
            },
          };
        });

        // Track current round for progress
        if (round_number !== 99) {
          setCurrentRound(round_number);
        } else {
          setCurrentRound(99);
        }
      }
    );

    // When a complete agent response arrives, move from streaming to finalized
    const unlistenAgentResponse = listen<AgentResponseEvent>(
      "debate-agent-response",
      (event) => {
        if (event.payload.decision_id !== decisionId) return;
        const { round_number, exchange_number, agent, content } = event.payload;
        const streamKey = `${round_number}-${exchange_number}-${agent}`;

        // Remove from streaming messages
        setStreamingMessages((prev) => {
          const next = { ...prev };
          delete next[streamKey];
          return next;
        });

        // Add to finalized rounds
        setRounds((prev) => [
          ...prev,
          {
            id: `${round_number}-${exchange_number}-${agent}-${Date.now()}`,
            decision_id: decisionId,
            round_number,
            exchange_number,
            agent,
            content,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    );

    const unlistenRoundComplete = listen<RoundCompleteEvent>(
      "debate-round-complete",
      (_event) => {
        // Round complete events can be used for auto-collapse if desired
      }
    );

    const unlistenComplete = listen<{ decision_id: string }>(
      "debate-complete",
      (event) => {
        if (event.payload.decision_id !== decisionId) return;
        setDebateRunning(false);
        onDebateComplete();
      }
    );

    const unlistenError = listen<{ decision_id: string; error: string }>(
      "debate-error",
      (event) => {
        if (event.payload.decision_id !== decisionId) return;
        setDebateRunning(false);
        if (event.payload.error !== "Debate cancelled") {
          setError(event.payload.error);
        }
      }
    );

    return () => {
      unlistenToken.then((fn) => fn());
      unlistenAgentResponse.then((fn) => fn());
      unlistenRoundComplete.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [decisionId, onDebateComplete]);

  // Auto-scroll as new content arrives
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds, streamingMessages]);

  async function loadDebate() {
    try {
      const data = await invoke<DebateRoundData[]>("get_debate", {
        decisionId,
      });
      setRounds(data);

      // Determine current round from loaded data
      if (data.length > 0) {
        const maxRound = Math.max(...data.map((r) => r.round_number));
        setCurrentRound(maxRound);
        if (maxRound === 99) {
          setDebateRunning(false);
        }
      }
    } catch (err) {
      console.error("Failed to load debate:", err);
    }
  }

  async function handleCancel() {
    try {
      await invoke("cancel_debate", { decisionId });
      setDebateRunning(false);
    } catch (err) {
      console.error("Failed to cancel debate:", err);
    }
  }

  function toggleRound(key: string) {
    setCollapsedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const groups = groupRounds(rounds);

  // Merge streaming messages into display groups
  const streamingEntries = Object.entries(streamingMessages);
  const streamingByRound: Record<string, typeof streamingEntries> = {};
  for (const entry of streamingEntries) {
    const [, msg] = entry;
    const key = `${msg.round_number}-${msg.exchange_number}`;
    if (!streamingByRound[key]) streamingByRound[key] = [];
    streamingByRound[key].push(entry);
  }

  // Collect all round keys (finalized + streaming-only)
  const allRoundKeys = new Set<string>();
  for (const g of groups) allRoundKeys.add(`${g.roundNumber}-${g.exchangeNumber}`);
  for (const key of Object.keys(streamingByRound)) allRoundKeys.add(key);

  // Build merged groups: finalized rounds + streaming-only rounds
  const mergedGroups: (RoundGroup & { streamingEntries?: typeof streamingEntries })[] = groups.map((g) => ({
    ...g,
    streamingEntries: streamingByRound[`${g.roundNumber}-${g.exchangeNumber}`],
  }));

  // Add streaming-only rounds (no finalized entries yet)
  for (const key of Object.keys(streamingByRound)) {
    if (!groups.some((g) => `${g.roundNumber}-${g.exchangeNumber}` === key)) {
      const [, first] = streamingByRound[key][0];
      mergedGroups.push({
        roundNumber: first.round_number,
        exchangeNumber: first.exchange_number,
        entries: [],
        streamingEntries: streamingByRound[key],
      });
    }
  }

  // Sort merged groups
  mergedGroups.sort((a, b) => a.roundNumber - b.roundNumber || a.exchangeNumber - b.exchangeNumber);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Progress bar */}
      <DebateProgressBar
        currentRound={currentRound}
        totalRounds={totalRounds}
        isRunning={debateRunning}
        quickMode={quickMode}
      />

      {/* Debate content */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {mergedGroups.length === 0 && debateRunning && (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-sm">Preparing the committee...</p>
            </div>
          )}

          {mergedGroups.map((group) => {
            const key = `${group.roundNumber}-${group.exchangeNumber}`;
            const isCollapsed = collapsedRounds.has(key);
            const isActive =
              debateRunning && group.roundNumber === currentRound;
            const isModerator = group.roundNumber === 99;

            return (
              <div key={key}>
                <DebateRoundHeader
                  roundNumber={group.roundNumber}
                  exchangeNumber={group.exchangeNumber}
                  isActive={isActive}
                  isCollapsed={isCollapsed}
                  onToggle={() => toggleRound(key)}
                />
                {!isCollapsed && (
                  <div className="ml-1 mb-2">
                    {/* Finalized entries */}
                    {group.entries.map((entry) =>
                      isModerator ? (
                        <ModeratorVerdict
                          key={entry.id}
                          content={entry.content}
                        />
                      ) : (
                        <DebateAgentMessage
                          key={entry.id}
                          agent={entry.agent}
                          content={entry.content}
                        />
                      )
                    )}
                    {/* Streaming entries (in-progress) */}
                    {group.streamingEntries?.map(([streamKey, msg]) =>
                      msg.agent === "moderator" ? (
                        <ModeratorVerdict
                          key={`stream-${streamKey}`}
                          content={msg.content}
                        />
                      ) : (
                        <DebateAgentMessage
                          key={`stream-${streamKey}`}
                          agent={msg.agent}
                          content={msg.content}
                          isStreaming
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="px-4 py-3 rounded-lg bg-destructive/20 border border-destructive/30 text-destructive text-sm mt-4">
              {error}
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Bottom action bar */}
      <div className="border-t border-border px-4 py-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBackToChat}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to Chat
        </Button>
        {debateRunning && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="ml-auto text-destructive hover:text-destructive"
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Cancel Debate
          </Button>
        )}
      </div>
    </div>
  );
}
