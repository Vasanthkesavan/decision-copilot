import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

interface ModeratorVerdictProps {
  content: string;
}

export default function ModeratorVerdict({ content }: ModeratorVerdictProps) {
  const normalizedContent =
    !content.includes("\n") && content.includes("\\n")
      ? content.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
      : content;

  return (
    <div className="mx-1 my-3 p-4 rounded-lg border-2 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{"\u{1f3af}"}</span>
        <span className="text-sm font-bold text-amber-400">
          Moderator's Verdict
        </span>
      </div>
      <div className="text-sm text-foreground/90 leading-relaxed [&_p]:my-1.5 [&_strong]:font-semibold [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground/80 [&_h2]:mt-3 [&_h2]:mb-1 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_li>p]:my-0 [&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-background [&_pre]:p-2.5 [&_pre]:overflow-x-auto [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted/50 [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code]:text-foreground/85">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {normalizedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
