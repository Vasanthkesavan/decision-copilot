import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";
import { resolveAgentConfig } from "@/lib/agentColors";
import type { AgentMeta } from "@/lib/agentColors";

interface DebateAgentMessageProps {
  agent: string;
  content: string;
  isStreaming?: boolean;
  registry?: AgentMeta[];
}

export default function DebateAgentMessage({
  agent,
  content,
  isStreaming,
  registry,
}: DebateAgentMessageProps) {
  const normalizedContent =
    !content.includes("\n") && content.includes("\\n")
      ? content.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
      : content;

  const config = resolveAgentConfig(agent, registry || []);

  return (
    <div className={cn("pl-3 border-l-2 mb-3", config.bgColor)}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{config.emoji}</span>
        <span className={cn("text-xs font-semibold", config.color)}>
          {config.label}
        </span>
      </div>
      <div className="text-sm text-foreground/90 leading-relaxed [&_p]:my-1.5 [&_strong]:font-semibold [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_li>p]:my-0 [&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-background [&_pre]:p-2.5 [&_pre]:overflow-x-auto [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted/50 [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code]:text-foreground/85">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {normalizedContent}
        </ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-1.5 h-3.5 bg-current opacity-70 animate-pulse ml-0.5 -mb-0.5" />
        )}
      </div>
    </div>
  );
}
