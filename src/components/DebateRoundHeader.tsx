import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ROUND_LABELS: Record<number, string> = {
  1: "Round 1: Opening Positions",
  2: "Round 2: Debate",
  3: "Round 3: Final Positions",
  99: "Moderator's Verdict",
};

interface DebateRoundHeaderProps {
  roundNumber: number;
  exchangeNumber?: number;
  isActive: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function DebateRoundHeader({
  roundNumber,
  exchangeNumber,
  isActive,
  isCollapsed,
  onToggle,
}: DebateRoundHeaderProps) {
  let label = ROUND_LABELS[roundNumber] || `Round ${roundNumber}`;
  if (roundNumber === 2 && exchangeNumber && exchangeNumber > 1) {
    label = `Round 2: Debate (Exchange ${exchangeNumber})`;
  }

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 py-2 px-1 text-left transition-colors rounded-sm",
        "hover:bg-muted/50",
        roundNumber === 99 && "mt-2"
      )}
    >
      {isCollapsed ? (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span
        className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          roundNumber === 99
            ? "text-amber-400"
            : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      {isActive && (
        <Loader2 className="h-3 w-3 text-primary animate-spin ml-auto shrink-0" />
      )}
    </button>
  );
}
