import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ModelSelector from "@/components/ModelSelector";

const MIN_MODELS = 2;
const MAX_MODELS = 5;

export interface StandaloneDebateConfig {
  mode: "fixed" | "moderator_auto";
  exchangeCount?: number;
  maxExchanges?: number;
}

interface DebateModelSelectionDialogProps {
  defaultModel?: string;
  onStart: (selectedModels: string[], debateConfig: StandaloneDebateConfig) => void;
  onClose: () => void;
}

export default function DebateModelSelectionDialog({
  defaultModel,
  onStart,
  onClose,
}: DebateModelSelectionDialogProps) {
  const [modelSlots, setModelSlots] = useState<string[]>([
    defaultModel || "",
    "",
  ]);
  const [mode, setMode] = useState<"fixed" | "moderator_auto">("fixed");
  const [exchangeCount, setExchangeCount] = useState(2);
  const [maxExchanges, setMaxExchanges] = useState(12);

  const selectedModels = useMemo(
    () => modelSlots.map((m) => m.trim()).filter((m) => m.length > 0),
    [modelSlots]
  );
  const hasDuplicates = useMemo(
    () => new Set(selectedModels).size !== selectedModels.length,
    [selectedModels]
  );
  const canStart = selectedModels.length >= MIN_MODELS && !hasDuplicates;
  const fixedExchanges = Math.min(12, Math.max(0, Number.isFinite(exchangeCount) ? exchangeCount : 2));
  const autoCap = Math.min(20, Math.max(2, Number.isFinite(maxExchanges) ? maxExchanges : 12));

  function updateSlot(index: number, model: string) {
    setModelSlots((prev) => prev.map((value, i) => (i === index ? model : value)));
  }

  function removeSlot(index: number) {
    setModelSlots((prev) => {
      if (prev.length <= MIN_MODELS) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function addSlot() {
    setModelSlots((prev) => {
      if (prev.length >= MAX_MODELS) return prev;
      return [...prev, ""];
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Debate Models</DialogTitle>
          <DialogDescription>
            Choose 2 to 5 models that will debate this topic in sandbox mode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {modelSlots.map((model, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Model {index + 1}
                </label>
                {modelSlots.length > MIN_MODELS && (
                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`Remove model ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <ModelSelector
                value={model}
                onChange={(next) => updateSlot(index, next)}
                placeholder="Search OpenRouter models..."
              />
            </div>
          ))}

          {modelSlots.length < MAX_MODELS && (
            <Button type="button" variant="outline" size="sm" onClick={addSlot} className="w-full">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Another Model
            </Button>
          )}

          {selectedModels.length < MIN_MODELS && (
            <p className="text-xs text-destructive">
              Select at least {MIN_MODELS} models to start the debate.
            </p>
          )}
          {hasDuplicates && (
            <p className="text-xs text-destructive">
              Each debater must use a different model.
            </p>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <div className="text-xs font-medium text-muted-foreground">Debate Flow</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("fixed")}
              className={`text-left p-3 rounded-lg border transition-colors ${
                mode === "fixed"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-medium text-sm">Fixed Exchanges</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                You choose exactly how many exchanges run.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("moderator_auto")}
              className={`text-left p-3 rounded-lg border transition-colors ${
                mode === "moderator_auto"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-medium text-sm">Moderator Directed</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Continues until moderator calls conclusion.
              </div>
            </button>
          </div>

          {mode === "fixed" ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Number of exchanges (0-12)
              </label>
              <input
                type="number"
                min={0}
                max={12}
                value={fixedExchanges}
                onChange={(e) => setExchangeCount(Number(e.target.value))}
                className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                0 means opening statements then moderator synthesis.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Safety cap for exchanges (2-20)
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={autoCap}
                onChange={(e) => setMaxExchanges(Number(e.target.value))}
                className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Moderator can conclude earlier; cap prevents runaway loops.
              </p>
            </div>
          )}

          <Button
            disabled={!canStart}
            onClick={() =>
              onStart(selectedModels, {
                mode,
                exchangeCount: mode === "fixed" ? fixedExchanges : undefined,
                maxExchanges: mode === "moderator_auto" ? autoCap : undefined,
              })
            }
            className="w-full"
          >
            Start Debate
          </Button>
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
