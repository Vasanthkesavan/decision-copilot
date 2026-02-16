import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Option {
  label: string;
  description?: string;
}

interface Variable {
  label: string;
  value: string;
  impact?: "high" | "medium" | "low";
}

interface ProsCons {
  option: string;
  pros?: string[];
  cons?: string[];
  alignment_score?: number;
  alignment_reasoning?: string;
}

interface Recommendation {
  choice: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  tradeoffs?: string;
  next_steps?: string[];
}

export interface DecisionSummary {
  options?: Option[];
  variables?: Variable[];
  pros_cons?: ProsCons[];
  recommendation?: Recommendation;
}

interface DecisionSummaryPanelProps {
  summary: DecisionSummary | null;
  status: string;
  userChoice?: string | null;
  userChoiceReasoning?: string | null;
  outcome?: string | null;
  outcomeDate?: string | null;
  onAcceptRecommendation?: () => void;
  onChoseDifferently?: () => void;
  onNeedMoreTime?: () => void;
  onLogOutcome?: () => void;
  onReopen?: () => void;
}

const IMPACT_COLORS: Record<string, string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500/20 text-green-400",
  medium: "bg-amber-500/20 text-amber-400",
  low: "bg-red-500/20 text-red-400",
};

function AlignmentBar({ score }: { score: number }) {
  const color =
    score >= 7 ? "bg-green-500" : score >= 4 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${(score / 10) * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground font-medium w-6 text-right">
        {score}/10
      </span>
    </div>
  );
}

export default function DecisionSummaryPanel({
  summary,
  status,
  userChoice,
  userChoiceReasoning,
  outcome,
  outcomeDate,
  onAcceptRecommendation,
  onChoseDifferently,
  onNeedMoreTime,
  onLogOutcome,
  onReopen,
}: DecisionSummaryPanelProps) {
  const shouldShowActions =
    status === "recommended" || status === "decided" || status === "reviewed";

  const formattedOutcomeDate = outcomeDate
    ? new Date(outcomeDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!summary && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center text-muted-foreground">
              <Lightbulb className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                The decision summary will appear here as the conversation progresses.
              </p>
            </div>
          </div>
        )}
        {summary && (
          <>
            {/* Options */}
            {summary.options && summary.options.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Options
                </h3>
                <div className="space-y-2">
                  {summary.options.map((opt, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="font-medium text-sm">{opt.label}</div>
                      {opt.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {opt.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Key Variables */}
            {summary.variables && summary.variables.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Key Variables
                </h3>
                <div className="space-y-1.5">
                  {summary.variables.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{v.label}:</span>{" "}
                        <span className="text-muted-foreground">{v.value}</span>
                      </div>
                      {v.impact && (
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border shrink-0",
                            IMPACT_COLORS[v.impact] || IMPACT_COLORS.low
                          )}
                        >
                          {v.impact}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Analysis / Pros & Cons */}
            {summary.pros_cons && summary.pros_cons.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Analysis
                </h3>
                <div className="space-y-3">
                  {summary.pros_cons.map((pc, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border border-border bg-muted/20"
                    >
                      <div className="font-medium text-sm mb-2">{pc.option}</div>

                      {pc.alignment_score !== undefined && (
                        <div className="mb-2">
                          <AlignmentBar score={pc.alignment_score} />
                        </div>
                      )}

                      {pc.pros && pc.pros.length > 0 && (
                        <div className="mb-1.5">
                          <div className="text-xs text-green-400 font-medium mb-0.5 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Pros
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                            {pc.pros.map((p, j) => (
                              <li key={j} className="list-disc">
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {pc.cons && pc.cons.length > 0 && (
                        <div className="mb-1.5">
                          <div className="text-xs text-red-400 font-medium mb-0.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Cons
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                            {pc.cons.map((c, j) => (
                              <li key={j} className="list-disc">
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {pc.alignment_reasoning && (
                        <div className="text-xs text-muted-foreground/70 italic mt-1">
                          {pc.alignment_reasoning}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recommendation */}
            {summary.recommendation && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Recommendation
                </h3>
                <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="font-semibold text-sm flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{summary.recommendation.choice}</span>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase px-2 py-0.5 rounded shrink-0",
                        CONFIDENCE_COLORS[summary.recommendation.confidence] ||
                          CONFIDENCE_COLORS.medium
                      )}
                    >
                      {summary.recommendation.confidence} confidence
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                    {summary.recommendation.reasoning}
                  </p>

                  {summary.recommendation.tradeoffs && (
                    <div className="text-xs mt-2">
                      <span className="font-medium text-amber-400">Tradeoffs: </span>
                      <span className="text-muted-foreground">
                        {summary.recommendation.tradeoffs}
                      </span>
                    </div>
                  )}

                  {summary.recommendation.next_steps &&
                    summary.recommendation.next_steps.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium mb-1">Next Steps:</div>
                        <ul className="text-xs text-muted-foreground space-y-1.5">
                          {summary.recommendation.next_steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="mt-0.5 h-3.5 w-3.5 rounded-sm border border-border bg-background/70 shrink-0" />
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </section>
            )}
          </>
        )}

        {status === "decided" && userChoice && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Your Decision
            </h3>
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/10">
              <p className="text-sm font-medium text-foreground">{userChoice}</p>
              {userChoiceReasoning && (
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                  {userChoiceReasoning}
                </p>
              )}
            </div>
          </section>
        )}

        {status === "reviewed" && outcome && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Outcome
            </h3>
            <div className="p-3 rounded-lg border border-border bg-muted/20">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {outcome}
              </p>
              {formattedOutcomeDate && (
                <p className="text-[11px] text-muted-foreground/80 mt-2">
                  Logged on {formattedOutcomeDate}
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      {shouldShowActions && (
        <div className="border-t border-border p-4 space-y-2 bg-background/95 backdrop-blur-sm">
          {status === "recommended" && (
            <>
              <Button onClick={onAcceptRecommendation} className="w-full">
                I'll go with this
              </Button>
              <Button
                onClick={onChoseDifferently}
                variant="outline"
                className="w-full"
              >
                I chose differently
              </Button>
              <Button onClick={onNeedMoreTime} variant="ghost" className="w-full">
                I need more time
              </Button>
            </>
          )}

          {status === "decided" && (
            <>
              <Button onClick={onLogOutcome} variant="outline" className="w-full">
                Log Outcome
              </Button>
              <Button onClick={onReopen} variant="ghost" className="w-full">
                Reopen
              </Button>
            </>
          )}

          {status === "reviewed" && (
            <Button onClick={onReopen} variant="ghost" className="w-full">
              Reopen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
