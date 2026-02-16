import { AGENT_CONFIG } from "./DebateAgentMessage";
import { cn } from "@/lib/utils";

interface CommitteeVoteTallyProps {
  votes: Record<string, string>;
}

export default function CommitteeVoteTally({ votes }: CommitteeVoteTallyProps) {
  const agents = ["rationalist", "advocate", "contrarian", "visionary", "pragmatist"];

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Committee Votes
      </h3>
      <div className="space-y-1.5">
        {agents.map((agent) => {
          const config = AGENT_CONFIG[agent];
          const vote = votes[agent];
          if (!config || !vote) return null;
          return (
            <div key={agent} className="flex items-start gap-2 text-xs">
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
