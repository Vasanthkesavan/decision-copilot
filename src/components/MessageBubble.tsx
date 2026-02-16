import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: string;
  content: string;
}

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user";
  const normalizedContent =
    !content.includes("\n") && content.includes("\\n")
      ? content.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
      : content;

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
            <div className="text-sm leading-relaxed text-foreground [&_p]:my-2 [&_strong]:font-semibold [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_li>p]:my-0 [&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-background [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted/50 [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code]:text-foreground/85">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {normalizedContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
