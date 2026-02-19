import { Loader2 } from "lucide-react";

interface DebateProgressBarProps {
  currentRound: number;
  currentExchange?: number;
  totalRounds: number;
  isRunning: boolean;
  quickMode: boolean;
  modeLabel?: string;
  moderatorDirected?: boolean;
  fixedExchangeCount?: number | null;
}

const ROUND_NAMES: Record<number, string> = {
  1: "Opening Positions",
  2: "Debate",
  3: "Final Positions",
  99: "Moderator Synthesis",
};

export default function DebateProgressBar({
  currentRound,
  currentExchange = 1,
  totalRounds,
  isRunning,
  quickMode,
  modeLabel,
  moderatorDirected = false,
  fixedExchangeCount = null,
}: DebateProgressBarProps) {
  const resolvedTotal = Math.max(2, totalRounds);
  const currentStep = (() => {
    if (currentRound === 1) return 1;
    if (currentRound === 2) {
      return 1 + Math.max(1, currentExchange);
    }
    if (currentRound === 3) {
      if (fixedExchangeCount !== null) {
        return 1 + fixedExchangeCount + 1;
      }
      return 4;
    }
    if (currentRound === 99) {
      return resolvedTotal;
    }
    return Math.min(resolvedTotal, Math.max(1, currentRound));
  })();

  const progress = !isRunning
    ? 100
    : moderatorDirected
    ? Math.max(6, Math.min(95, ((currentStep - 1) / (currentStep + 2)) * 100))
    : Math.max(5, ((currentStep - 1) / resolvedTotal) * 100);

  const roundName =
    currentRound === 2 && currentExchange > 1
      ? `Debate (Exchange ${currentExchange})`
      : ROUND_NAMES[currentRound] || `Round ${currentRound}`;

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/20">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {isRunning && (
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
          )}
          <span className="text-xs font-medium text-foreground/80">
            {isRunning
              ? `${roundName} \u2014 Agents are ${currentRound === 99 ? "synthesizing" : "debating"}...`
              : "Debate Complete"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {modeLabel || (quickMode ? "Quick Take" : "Full Debate")}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
