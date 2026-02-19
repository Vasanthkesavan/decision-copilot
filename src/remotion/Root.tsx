import React from "react";
import { Composition } from "remotion";
import { DebateVideo } from "./DebateVideo";
import { calculateTotalFrames } from "./utils";
import { PORTRAIT, LANDSCAPE, FPS } from "./constants";
import type { VideoInputProps } from "./types";

const defaultProps: Record<string, unknown> & VideoInputProps = {
  title: "Sample Debate",
  format: "portrait",
  fps: FPS,
  totalDurationMs: 10000,
  agents: [
    { key: "rationalist", label: "Rationalist", emoji: "\u{1F9E0}", color: "blue", role: "rationalist" },
    { key: "advocate", label: "Advocate", emoji: "\u{1F4A1}", color: "purple", role: "advocate" },
    { key: "moderator", label: "Moderator", emoji: "\u2696\uFE0F", color: "amber", role: "moderator" },
  ],
  segments: [
    {
      index: 0,
      agent: "rationalist",
      round: 1,
      exchange: 1,
      text: "When we examine this decision through a purely analytical lens, the data strongly suggests we should prioritize the option with the highest expected value.",
      audioFilePath: "",
      durationMs: 5000,
      startMs: 0,
    },
    {
      index: 1,
      agent: "advocate",
      round: 1,
      exchange: 1,
      text: "While the numbers matter, we cannot ignore the human element. The people affected by this decision deserve our consideration.",
      audioFilePath: "",
      durationMs: 5000,
      startMs: 5000,
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DebateVideo"
        component={DebateVideo as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={PORTRAIT.width}
        height={PORTRAIT.height}
        durationInFrames={300}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => {
          const p = props as unknown as VideoInputProps;
          const dims = p.format === "landscape" ? LANDSCAPE : PORTRAIT;
          const totalFrames = calculateTotalFrames(p);
          return {
            width: dims.width,
            height: dims.height,
            durationInFrames: totalFrames,
            fps: p.fps || FPS,
          };
        }}
      />
    </>
  );
};
