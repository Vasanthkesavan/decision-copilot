import { cn } from "@/lib/utils";
import { resolveAgentConfig } from "@/lib/agentColors";
import type { AgentMeta } from "@/lib/agentColors";

interface CommitteeVoteTallyProps {
  votes: Record<string, string>;
  registry: AgentMeta[];
}

export default function CommitteeVoteTally({ votes, registry }: CommitteeVoteTallyProps) {
  const agentKeys = Object.keys(votes);

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Committee Votes
      </h3>
      <div className="space-y-1.5">
        {agentKeys.map((agentKey) => {
          const config = resolveAgentConfig(agentKey, registry);
          const vote = votes[agentKey];
          if (!vote) return null;
          return (
            <div key={agentKey} className="flex items-start gap-2 text-xs">
              <div className="flex items-center gap-1 shrink-0 w-24">
                <span>{config.emoji}</span>
                <span className={cn("font-medium", config.color)}>
                  {config.label}
                </span>
              </div>
              <span className="text-muted-foreground line-clamp-2">{vote}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
