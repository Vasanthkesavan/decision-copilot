import React from "react";

interface SpeakerBadgeProps {
  emoji: string;
  label: string;
  colorHex: string;
}

export const SpeakerBadge: React.FC<SpeakerBadgeProps> = ({
  emoji,
  label,
  colorHex,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: colorHex,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 600,
          color: colorHex,
        }}
      >
        {label}
      </span>
    </div>
  );
};
