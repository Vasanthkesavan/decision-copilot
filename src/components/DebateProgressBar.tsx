import { Loader2 } from "lucide-react";

interface DebateProgressBarProps {
  currentRound: number;
  totalRounds: number;
  isRunning: boolean;
  quickMode: boolean;
}

const ROUND_NAMES: Record<number, string> = {
  1: "Opening Positions",
  2: "Debate",
  3: "Final Positions",
  99: "Moderator Synthesis",
};

export default function DebateProgressBar({
  currentRound,
  totalRounds,
  isRunning,
  quickMode,
}: DebateProgressBarProps) {
  const progress = isRunning
    ? Math.max(5, ((currentRound - 1) / totalRounds) * 100)
    : 100;
  const roundName = ROUND_NAMES[currentRound] || `Round ${currentRound}`;

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
          {quickMode ? "Quick Take" : "Full Debate"}
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
