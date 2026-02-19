import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { getRoundLabel } from "../utils";
import { TEXT_COLOR } from "../constants";

interface RoundTransitionProps {
  roundNumber: number;
  exchangeNumber: number;
  startFrame: number;
  durationFrames: number;
}

export const RoundTransition: React.FC<RoundTransitionProps> = ({
  roundNumber,
  exchangeNumber,
  startFrame,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const relativeFrame = frame - startFrame;

  // Not yet time to show
  if (relativeFrame < 0) {
    return null;
  }

  // After the transition window, collapse so it doesn't take space
  if (relativeFrame >= durationFrames) {
    return <div style={{ height: 0, overflow: "hidden" }} />;
  }

  const label = getRoundLabel(roundNumber, exchangeNumber);
  const isModerator = roundNumber === 99;

  const scale = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const opacity = interpolate(
    relativeFrame,
    [0, 10, durationFrames - 10, durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        width,
        height: 160,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          width: 60,
          height: 2,
          backgroundColor: isModerator ? "#fbbf24" : "#4b5563",
          marginBottom: 16,
        }}
      />
      <div
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 32,
          fontWeight: 700,
          color: isModerator ? "#fbbf24" : TEXT_COLOR,
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: 60,
          height: 2,
          backgroundColor: isModerator ? "#fbbf24" : "#4b5563",
          marginTop: 16,
        }}
      />
    </div>
  );
};
