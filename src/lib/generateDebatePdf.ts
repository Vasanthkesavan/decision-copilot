import jsPDF from "jspdf";
import { AGENT_COLOR_HEX, DEFAULT_COLOR } from "@/remotion/constants";
import type { AgentMeta } from "@/lib/agentColors";

// ── Types ──

interface DebateRoundData {
  id: string;
  decision_id: string;
  round_number: number;
  exchange_number: number;
  agent: string;
  content: string;
  created_at: string;
}

interface DecisionData {
  title: string;
  debate_brief: string | null;
  summary_json: string | null;
  debate_started_at: string | null;
  debate_completed_at: string | null;
}

interface AgentFileInfo {
  filename: string;
  content: string;
}

export interface GeneratePdfParams {
  decision: DecisionData;
  rounds: DebateRoundData[];
  registry: AgentMeta[];
  agentPrompts: AgentFileInfo[];
}

// ── Constants ──

const PAGE_WIDTH = 210; // A4 mm
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 25;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const BODY_SIZE = 10;
const BODY_LINE_HEIGHT = 5;

const ROUND_LABELS: Record<number, string> = {
  1: "ROUND 1: OPENING POSITIONS",
  2: "ROUND 2: DEBATE",
  3: "ROUND 3: FINAL POSITIONS",
  99: "MODERATOR'S VERDICT",
};

// ── Helpers ──

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [156, 163, 175];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function agentRgb(colorName: string): [number, number, number] {
  return hexToRgb(AGENT_COLOR_HEX[colorName] ?? DEFAULT_COLOR);
}

function stripMarkdown(md: string): string {
  return md
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[\s]*[-*+]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function roundLabel(roundNumber: number, exchangeNumber: number): string {
  let label = ROUND_LABELS[roundNumber] || `ROUND ${roundNumber}`;
  if (roundNumber === 2 && exchangeNumber > 1) {
    label = `ROUND 2: DEBATE (EXCHANGE ${exchangeNumber})`;
  }
  return label;
}

// ── Round grouping (matches DebateView logic) ──

interface RoundGroup {
  roundNumber: number;
  exchangeNumber: number;
  entries: DebateRoundData[];
}

function groupRounds(rounds: DebateRoundData[]): RoundGroup[] {
  const groups: RoundGroup[] = [];
  for (const r of rounds) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.roundNumber === r.round_number &&
      last.exchangeNumber === r.exchange_number
    ) {
      last.entries.push(r);
    } else {
      groups.push({
        roundNumber: r.round_number,
        exchangeNumber: r.exchange_number,
        entries: [r],
      });
    }
  }
  return groups;
}

// ── PDF Generation ──

export function generateDebatePdf(params: GeneratePdfParams): Uint8Array {
  const { decision, rounds, registry, agentPrompts } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN_TOP;

  // Track whether we need a page break
  function ensureSpace(needed: number) {
    if (y + needed > PAGE_HEIGHT - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  }

  function resolveAgent(key: string) {
    return registry.find((a) => a.key === key);
  }

  // ── Cover Page ──

  // Branding
  y = 55;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(120, 120, 120);
  doc.text("OPEN COUNCIL", PAGE_WIDTH / 2, y, { align: "center" });

  // Title
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  const titleLines = doc.splitTextToSize(decision.title, CONTENT_WIDTH);
  doc.text(titleLines, PAGE_WIDTH / 2, y, { align: "center" });
  y += titleLines.length * 9;

  // Date range
  if (decision.debate_started_at) {
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    let dateStr = formatDate(decision.debate_started_at);
    if (decision.debate_completed_at) {
      dateStr += "  —  " + formatDate(decision.debate_completed_at);
    }
    doc.text(dateStr, PAGE_WIDTH / 2, y, { align: "center" });
    y += 8;
  }

  // Subtitle
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text("Debate Transcript", PAGE_WIDTH / 2, y, { align: "center" });

  // Participants
  const debaters = registry.filter((a) => a.role === "debater");
  const moderator = registry.find((a) => a.role === "moderator");

  y += 25;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text("Participants", MARGIN_LEFT, y);
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN_LEFT, y, MARGIN_LEFT + 40, y);
  y += 7;

  doc.setFontSize(10);
  for (const agent of debaters) {
    const rgb = agentRgb(agent.color);
    // Colored dot
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(MARGIN_LEFT + 2, y - 1.2, 1.5, "F");
    // Agent label
    doc.setFont("helvetica", "bold");
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(agent.label, MARGIN_LEFT + 7, y);
    // Role
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 140, 140);
    doc.text(`(${agent.role})`, MARGIN_LEFT + 7 + doc.getTextWidth(agent.label) + 3, y);
    y += 7;
  }
  if (moderator) {
    const rgb = agentRgb(moderator.color);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(MARGIN_LEFT + 2, y - 1.2, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(moderator.label, MARGIN_LEFT + 7, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 140, 140);
    doc.text("(moderator)", MARGIN_LEFT + 7 + doc.getTextWidth(moderator.label) + 3, y);
  }

  // ── Content Pages ──

  doc.addPage();
  y = MARGIN_TOP;

  // Helper: render a section header
  function sectionHeader(label: string, isModerator = false) {
    ensureSpace(18);
    y += 6;
    doc.setDrawColor(isModerator ? 251 : 180, isModerator ? 191 : 180, isModerator ? 36 : 180);
    doc.line(MARGIN_LEFT, y, MARGIN_LEFT + CONTENT_WIDTH, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(isModerator ? 180 : 60, isModerator ? 140 : 60, isModerator ? 0 : 60);
    doc.text(label, MARGIN_LEFT, y);
    y += 8;
  }

  // Helper: render wrapped body text, handling page breaks line by line
  function bodyText(text: string, indent = 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(50, 50, 50);
    const maxW = CONTENT_WIDTH - indent;
    const lines: string[] = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      ensureSpace(BODY_LINE_HEIGHT);
      doc.text(line, MARGIN_LEFT + indent, y);
      y += BODY_LINE_HEIGHT;
    }
  }

  // Helper: render an agent's message
  function agentMessage(agentKey: string, content: string) {
    const agent = resolveAgent(agentKey);
    const label = agent?.label ?? agentKey;
    const rgb = agent ? agentRgb(agent.color) : hexToRgb(DEFAULT_COLOR);

    ensureSpace(12);

    // Agent name with colored dot
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(MARGIN_LEFT + 2, y - 1.2, 1.3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(label, MARGIN_LEFT + 6, y);
    y += 5;

    // Content
    const stripped = stripMarkdown(content);
    bodyText(stripped, 6);
    y += 4; // spacing between messages
  }

  // ── Debate Brief ──

  if (decision.debate_brief) {
    sectionHeader("DEBATE BRIEF");
    bodyText(stripMarkdown(decision.debate_brief));
    y += 4;
  }

  // ── Agent System Prompts ──

  if (agentPrompts.length > 0) {
    sectionHeader("AGENT SYSTEM PROMPTS");

    for (const file of agentPrompts) {
      // Match filename (e.g. "rationalist.md") to registry agent
      const agentKey = file.filename.replace(/\.md$/, "");
      const agent = resolveAgent(agentKey);
      const label = agent?.label ?? agentKey;
      const rgb = agent ? agentRgb(agent.color) : hexToRgb(DEFAULT_COLOR);

      ensureSpace(12);

      // Agent name with colored dot
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.circle(MARGIN_LEFT + 2, y - 1.2, 1.3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      doc.text(label, MARGIN_LEFT + 6, y);
      y += 5;

      // Prompt content (smaller, gray)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(90, 90, 90);
      const promptText = stripMarkdown(file.content);
      const maxW = CONTENT_WIDTH - 6;
      const lines: string[] = doc.splitTextToSize(promptText, maxW);
      for (const line of lines) {
        ensureSpace(4);
        doc.text(line, MARGIN_LEFT + 6, y);
        y += 4;
      }
      y += 5;
    }
  }

  // ── Debate Rounds ──

  const groups = groupRounds(rounds);
  let prevRoundKey = "";

  for (const group of groups) {
    const key = `${group.roundNumber}-${group.exchangeNumber}`;
    const rLabel = roundLabel(group.roundNumber, group.exchangeNumber);
    const isMod = group.roundNumber === 99;

    // Only show section header when the round+exchange changes
    if (key !== prevRoundKey) {
      sectionHeader(rLabel, isMod);
      prevRoundKey = key;
    }

    for (const entry of group.entries) {
      agentMessage(entry.agent, entry.content);
    }
  }

  // ── Summary (if available) ──

  if (decision.summary_json) {
    try {
      const summary = JSON.parse(decision.summary_json);
      // Only render if it has decision-flow summary content (not standalone_sandbox)
      const hasContent =
        summary.recommendation ||
        summary.options?.length ||
        summary.debate_summary;

      if (hasContent) {
        sectionHeader("SUMMARY");

        if (summary.recommendation) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(BODY_SIZE);
          doc.setTextColor(60, 60, 60);
          ensureSpace(8);
          doc.text("Recommendation:", MARGIN_LEFT, y);
          y += 5;
          const recText =
            typeof summary.recommendation === "string"
              ? summary.recommendation
              : summary.recommendation.reasoning ??
                summary.recommendation.choice ??
                JSON.stringify(summary.recommendation);
          bodyText(stripMarkdown(recText));
          y += 4;
        }

        if (summary.debate_summary) {
          const ds = summary.debate_summary;
          if (ds.consensus_points?.length) {
            ensureSpace(8);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(BODY_SIZE);
            doc.setTextColor(60, 60, 60);
            doc.text("Consensus Points:", MARGIN_LEFT, y);
            y += 5;
            for (const point of ds.consensus_points) {
              bodyText("- " + stripMarkdown(point), 4);
            }
            y += 3;
          }
          if (ds.key_disagreements?.length) {
            ensureSpace(8);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(BODY_SIZE);
            doc.setTextColor(60, 60, 60);
            doc.text("Key Disagreements:", MARGIN_LEFT, y);
            y += 5;
            for (const point of ds.key_disagreements) {
              bodyText("- " + stripMarkdown(point), 4);
            }
            y += 3;
          }
        }
      }
    } catch {
      // Invalid JSON — skip summary section
    }
  }

  // ── Footer on every page ──

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by Open Council", MARGIN_LEFT, PAGE_HEIGHT - 12);
    doc.text(
      `Page ${i} of ${totalPages}`,
      PAGE_WIDTH - MARGIN_RIGHT,
      PAGE_HEIGHT - 12,
      { align: "right" }
    );
  }

  // Return as Uint8Array
  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}
