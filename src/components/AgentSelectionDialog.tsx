import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveAgentStyle } from "@/lib/agentColors";
import type { AgentMeta } from "@/lib/agentColors";
import { cn } from "@/lib/utils";

interface AgentSelectionDialogProps {
  agents: AgentMeta[];
  onStart: (quickMode: boolean, selectedAgents: string[]) => void;
  onClose: () => void;
}

export default function AgentSelectionDialog({
  agents,
  onStart,
  onClose,
}: AgentSelectionDialogProps) {
  const debaters = agents.filter((a) => a.role === "debater");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(debaters.map((a) => a.key))
  );

  function toggleAgent(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const canStart = selected.size >= 2;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to Committee</DialogTitle>
          <DialogDescription>
            Choose which advisors will participate in the debate. A moderator
            will synthesize their discussion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {debaters.map((agent) => {
            const isSelected = selected.has(agent.key);
            const style = resolveAgentStyle(agent.color);
            return (
              <button
                key={agent.key}
                type="button"
                onClick={() => toggleAgent(agent.key)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isSelected
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/30"
                  )}
                >
                  {isSelected && (
                    <svg
                      className="w-3 h-3 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-base">{agent.emoji}</span>
                <span className={cn("font-medium", isSelected && style.color)}>
                  {agent.label}
                </span>
              </button>
            );
          })}

          {/* Moderator always included */}
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
            <div className="w-5 h-5 rounded border-2 bg-primary/30 border-primary/50 flex items-center justify-center shrink-0">
              <svg
                className="w-3 h-3 text-primary-foreground/70"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span className="text-base">
              {agents.find((a) => a.role === "moderator")?.emoji || "\u{1f3af}"}
            </span>
            <span className="font-medium">Moderator</span>
            <span className="text-xs text-muted-foreground/60 ml-auto">
              Always included
            </span>
          </div>
        </div>

        {!canStart && (
          <p className="text-xs text-destructive">
            Select at least 2 advisors to start a debate.
          </p>
        )}

        <div className="space-y-2 pt-2">
          <button
            disabled={!canStart}
            onClick={() => onStart(false, Array.from(selected))}
            className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-medium text-sm">Full Debate</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              3 rounds of debate + synthesis. More thorough.
            </div>
          </button>
          <button
            disabled={!canStart}
            onClick={() => onStart(true, Array.from(selected))}
            className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-medium text-sm">Quick Take</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Opening positions + synthesis only. Faster.
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
