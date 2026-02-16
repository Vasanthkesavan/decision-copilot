import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OutcomeModalProps {
  onSave: (outcome: string) => void;
  onClose: () => void;
}

export default function OutcomeModal({ onSave, onClose }: OutcomeModalProps) {
  const [outcome, setOutcome] = useState("");
  const [hindsight, setHindsight] = useState("");

  function handleSave() {
    const text = hindsight
      ? `${outcome.trim()}\n\nLooking back: ${hindsight}`
      : outcome.trim();
    onSave(text);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How did it turn out?</DialogTitle>
          <DialogDescription>
            Log the real-world result so future recommendations can improve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="decision-outcome"
              className="text-sm font-medium text-foreground block mb-1.5"
            >
              What happened?
            </label>
            <Textarea
              id="decision-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="Describe the outcome..."
              rows={5}
              className="resize-none"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="decision-hindsight"
              className="text-sm font-medium text-foreground block mb-1.5"
            >
              Looking back, was this the right call?
            </label>
            <Select value={hindsight} onValueChange={setHindsight}>
              <SelectTrigger id="decision-hindsight">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="Partially">Partially</SelectItem>
                <SelectItem value="No">No</SelectItem>
                <SelectItem value="Too early to tell">Too early to tell</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!outcome.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
