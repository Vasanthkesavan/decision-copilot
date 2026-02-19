import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { buildTimeline } from "./utils";
import { ChatBubble } from "./components/ChatBubble";
import { RoundTransition } from "./components/RoundTransition";
import { ScrollingChat } from "./components/ScrollingChat";
import { Branding } from "./components/Branding";
import { BACKGROUND_COLOR, TEXT_COLOR } from "./constants";
import type { VideoInputProps, VideoAgentMeta } from "./types";

export const DebateVideo: React.FC<VideoInputProps> = (props) => {
  const { width } = useVideoConfig();
  const timeline = buildTimeline(props);

  const agentMap = new Map<string, VideoAgentMeta>();
  for (const a of props.agents) {
    agentMap.set(a.key, a);
  }

  const fallbackAgent: VideoAgentMeta = {
    key: "unknown",
    label: "Unknown",
    emoji: "?",
    color: "gray",
    role: "unknown",
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUND_COLOR,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid #1f2937",
          zIndex: 10,
          backgroundColor: BACKGROUND_COLOR,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: TEXT_COLOR,
            textAlign: "center",
            maxWidth: width - 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {props.title}
        </div>
      </div>

      {/* Chat messages with auto-scroll — rendered WITHOUT Sequence so they persist */}
      <ScrollingChat timeline={timeline}>
        {timeline.map((entry, i) => {
          if (entry.type === "transition") {
            return (
              <RoundTransition
                key={`t-${i}`}
                roundNumber={entry.roundNumber!}
                exchangeNumber={entry.exchangeNumber!}
                startFrame={entry.startFrame}
                durationFrames={entry.durationFrames}
              />
            );
          }

          const seg = entry.segment!;
          const agent = agentMap.get(seg.agent) ?? fallbackAgent;

          return (
            <ChatBubble
              key={`m-${i}`}
              agent={agent}
              text={seg.text}
              startFrame={entry.startFrame}
              durationFrames={entry.durationFrames}
            />
          );
        })}
      </ScrollingChat>

      {/* Audio tracks — these DO use Sequence to play only during their segment */}
      {timeline
        .filter((e) => e.type === "message" && e.segment?.audioFilePath)
        .map((entry, i) => {
          const path = entry.segment!.audioFilePath;
          // If it's a full URL (Tauri asset protocol for preview), use as-is.
          // If it's a bare filename (CLI render), resolve via staticFile().
          const src = path.includes("://") ? path : staticFile(path);
          return (
            <Sequence
              key={`audio-${i}`}
              from={entry.startFrame}
              durationInFrames={entry.durationFrames}
            >
              <Audio src={src} />
            </Sequence>
          );
        })}

      {/* Branding watermark */}
      <Branding />
    </AbsoluteFill>
  );
};
