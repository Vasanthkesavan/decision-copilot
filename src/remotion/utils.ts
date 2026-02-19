import type { VideoInputProps, VideoAudioSegment } from "./types";
import { FPS, ROUND_TRANSITION_DURATION_FRAMES } from "./constants";

export interface TimelineEntry {
  type: "transition" | "message";
  startFrame: number;
  durationFrames: number;
  segment?: VideoAudioSegment;
  roundNumber?: number;
  exchangeNumber?: number;
}

export function msToFrames(ms: number, fps: number = FPS): number {
  return Math.ceil((ms / 1000) * fps);
}

export function buildTimeline(props: VideoInputProps): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let currentFrame = 0;
  let lastRound = -1;
  let lastExchange = -1;

  for (const segment of props.segments) {
    if (segment.round !== lastRound || segment.exchange !== lastExchange) {
      // Insert a round transition card (skip before the very first segment)
      if (lastRound !== -1) {
        entries.push({
          type: "transition",
          startFrame: currentFrame,
          durationFrames: ROUND_TRANSITION_DURATION_FRAMES,
          roundNumber: segment.round,
          exchangeNumber: segment.exchange,
        });
        currentFrame += ROUND_TRANSITION_DURATION_FRAMES;
      }
      lastRound = segment.round;
      lastExchange = segment.exchange;
    }

    const durationFrames = msToFrames(segment.durationMs, props.fps);
    entries.push({
      type: "message",
      startFrame: currentFrame,
      durationFrames,
      segment,
    });
    currentFrame += durationFrames;
  }

  return entries;
}

export function calculateTotalFrames(props: VideoInputProps): number {
  const timeline = buildTimeline(props);
  if (timeline.length === 0) return 1;
  const last = timeline[timeline.length - 1];
  return last.startFrame + last.durationFrames + props.fps; // +1 second buffer
}

export function getRoundLabel(roundNumber: number, exchangeNumber: number): string {
  if (roundNumber === 99) return "Moderator's Verdict";
  if (roundNumber === 1) return "Opening Statements";
  if (roundNumber === 3) return "Final Arguments";
  if (roundNumber === 2) {
    return exchangeNumber === 1 ? "Exchange 1" : `Exchange ${exchangeNumber}`;
  }
  return `Round ${roundNumber}`;
}
