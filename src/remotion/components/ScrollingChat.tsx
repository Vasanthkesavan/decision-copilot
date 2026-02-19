import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { TimelineEntry } from "../utils";

interface ScrollingChatProps {
  timeline: TimelineEntry[];
  children: React.ReactNode;
}

// Estimate pixel height for a visible entry at a given frame
function estimateEntryHeight(
  entry: TimelineEntry,
  containerWidth: number,
  frame: number
): number {
  // Not yet visible
  if (frame < entry.startFrame) return 0;

  // Transitions collapse after their duration
  if (entry.type === "transition") {
    if (frame >= entry.startFrame + entry.durationFrames) return 0;
    return 160;
  }

  // Messages: estimate based on the amount of text revealed so far
  const text = entry.segment?.text ?? "";
  const relativeFrame = frame - entry.startFrame;
  const revealProgress = Math.min(1, Math.max(0, relativeFrame / entry.durationFrames));
  const revealedLength = Math.floor(revealProgress * text.length);

  if (revealedLength === 0) return 0;

  const textAreaWidth = containerWidth - 80 - 48 - 6;
  const charsPerLine = Math.max(1, Math.floor(textAreaWidth / 15.5));
  const lineCount = Math.max(1, Math.ceil(revealedLength / charsPerLine));
  const textHeight = lineCount * 40;
  const badgeHeight = 38;
  const padding = 40 + 20;

  return badgeHeight + textHeight + padding;
}

export const ScrollingChat: React.FC<ScrollingChatProps> = ({
  timeline,
  children,
}) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const containerHeight = height - 140;

  // Calculate total visible content height at current frame
  let totalHeight = 0;
  for (const entry of timeline) {
    totalHeight += estimateEntryHeight(entry, width, frame);
  }

  // Scroll so the bottom of content stays in view
  const overflow = totalHeight - containerHeight;
  const scrollY = overflow > 0 ? -overflow - 40 : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 0,
        right: 0,
        bottom: 60,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          transform: `translateY(${scrollY}px)`,
          paddingTop: 20,
        }}
      >
        {children}
      </div>
    </div>
  );
};
