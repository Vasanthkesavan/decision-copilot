import { Bot } from "lucide-react";

export default function LoadingIndicator() {
  return (
    <div className="py-4 bg-muted/30">
      <div className="max-w-3xl mx-auto px-6 flex gap-4">
        <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-accent-foreground/10">
          <Bot className="h-4 w-4 text-foreground" />
        </div>
        <div className="flex-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Assistant
          </p>
          <div className="flex gap-1 items-center">
            <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]" />
            <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
            <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}
