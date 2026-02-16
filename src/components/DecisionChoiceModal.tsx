import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DecisionChoiceModalProps {
  onSave: (choice: string, reasoning: string) => void;
  onClose: () => void;
}

export default function DecisionChoiceModal({
  onSave,
  onClose,
}: DecisionChoiceModalProps) {
  const [choice, setChoice] = useState("");
  const [reasoning, setReasoning] = useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What did you decide?</DialogTitle>
          <DialogDescription>
            Capture your choice so this decision can move to the decided state.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="decision-choice"
              className="text-sm font-medium text-foreground block mb-1.5"
            >
              Your choice
            </label>
            <Input
              id="decision-choice"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              placeholder="e.g., Start job search now"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="decision-choice-reasoning"
              className="text-sm font-medium text-foreground block mb-1.5"
            >
              Why? <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="decision-choice-reasoning"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="What led you to this choice?"
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(choice.trim(), reasoning.trim())}
            disabled={!choice.trim()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
