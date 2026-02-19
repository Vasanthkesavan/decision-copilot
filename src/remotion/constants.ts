// Hex color mappings — mirrors src/lib/agentColors.ts Tailwind classes
export const AGENT_COLOR_HEX: Record<string, string> = {
  blue: "#60a5fa",
  purple: "#c084fc",
  red: "#f87171",
  teal: "#2dd4bf",
  orange: "#fb923c",
  amber: "#fbbf24",
  green: "#4ade80",
  pink: "#f472b6",
  cyan: "#22d3ee",
  indigo: "#818cf8",
};

export const AGENT_BG_HEX: Record<string, string> = {
  blue: "#1e3a5f",
  purple: "#3b1f5e",
  red: "#5f1e1e",
  teal: "#1e4a4a",
  orange: "#5f3a1e",
  amber: "#5f4a1e",
  green: "#1e4a2a",
  pink: "#5f1e3a",
  cyan: "#1e3a4a",
  indigo: "#2a2a5f",
};

export const DEFAULT_COLOR = "#9ca3af";
export const DEFAULT_BG = "#374151";

export const PORTRAIT = { width: 1080, height: 1920 };
export const LANDSCAPE = { width: 1920, height: 1080 };

export const FPS = 30;
export const ROUND_TRANSITION_DURATION_FRAMES = 60; // 2 seconds
export const MESSAGE_FADE_IN_FRAMES = 10; // ~0.33 seconds
export const BACKGROUND_COLOR = "#0f0f0f";
export const TEXT_COLOR = "#e2e8f0";
export const MUTED_COLOR = "#94a3b8";
