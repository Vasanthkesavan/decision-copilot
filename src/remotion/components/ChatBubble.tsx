import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SpeakerBadge } from "./SpeakerBadge";
import {
  AGENT_COLOR_HEX,
  AGENT_BG_HEX,
  DEFAULT_COLOR,
  DEFAULT_BG,
  TEXT_COLOR,
  MESSAGE_FADE_IN_FRAMES,
} from "../constants";
import type { VideoAgentMeta } from "../types";

interface ChatBubbleProps {
  agent: VideoAgentMeta;
  text: string;
  startFrame: number;
  durationFrames: number;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  agent,
  text,
  startFrame,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startFrame;

  // Not yet time to show this bubble
  if (relativeFrame < 0) {
    return null;
  }

  const colorHex = AGENT_COLOR_HEX[agent.color] ?? DEFAULT_COLOR;
  const bgHex = AGENT_BG_HEX[agent.color] ?? DEFAULT_BG;
  const isModerator = agent.key === "moderator";

  // Fade in the bubble
  const opacity = interpolate(
    relativeFrame,
    [0, MESSAGE_FADE_IN_FRAMES],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  // Character reveal synced to audio duration
  const textFrames = Math.max(1, durationFrames - MESSAGE_FADE_IN_FRAMES);
  const revealProgress = interpolate(
    relativeFrame - MESSAGE_FADE_IN_FRAMES,
    [0, textFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const revealedChars = Math.floor(revealProgress * text.length);
  const visibleText = text.substring(0, revealedChars);
  // Only show cursor while text is still revealing
  const showCursor = revealedChars < text.length && revealedChars > 0;

  return (
    <div style={{ opacity, padding: "0 40px", marginBottom: 20 }}>
      <SpeakerBadge emoji={agent.emoji} label={agent.label} colorHex={colorHex} />
      <div
        style={{
          backgroundColor: bgHex,
          borderRadius: 16,
          borderLeft: `3px solid ${isModerator ? "#fbbf24" : colorHex}`,
          padding: "20px 24px",
        }}
      >
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 26,
            lineHeight: 1.55,
            color: TEXT_COLOR,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {visibleText}
          {showCursor && (
            <span style={{ opacity: 0.6, color: colorHex }}>&#9646;</span>
          )}
        </div>
      </div>
    </div>
  );
};
