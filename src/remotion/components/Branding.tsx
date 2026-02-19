import React from "react";
import { AbsoluteFill } from "remotion";

export const Branding: React.FC = () => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 32,
          opacity: 0.3,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 20,
          fontWeight: 600,
          color: "#ffffff",
          letterSpacing: "0.02em",
        }}
      >
        Open Council
      </div>
    </AbsoluteFill>
  );
};
