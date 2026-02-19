export interface VideoAgentMeta {
  key: string;
  label: string;
  emoji: string;
  color: string;
  role: string;
}

export interface VideoAudioSegment {
  index: number;
  agent: string;
  round: number;
  exchange: number;
  text: string;
  audioFilePath: string;
  durationMs: number;
  startMs: number;
}

export interface VideoInputProps {
  title: string;
  segments: VideoAudioSegment[];
  agents: VideoAgentMeta[];
  totalDurationMs: number;
  format: "portrait" | "landscape";
  fps: number;
}
