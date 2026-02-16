import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: string;
  content: string;
}

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("group py-4", !isUser && "bg-muted/30")}>
      <div className="max-w-3xl mx-auto px-6 flex gap-4">
        <div
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
            isUser ? "bg-primary" : "bg-accent-foreground/10"
          )}
        >
          {isUser ? (
            <User className="h-4 w-4 text-primary-foreground" />
          ) : (
            <Bot className="h-4 w-4 text-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {isUser ? "You" : "Assistant"}
          </p>
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {content}
            </p>
          ) : (
            <div className="text-sm leading-relaxed prose prose-neutral dark:prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:bg-background prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-code:text-foreground/80 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-strong:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
