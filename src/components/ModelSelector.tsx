import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type FeaturedTier = "premium" | "recommended" | "value" | "budget" | "free";
type ModelSource = "featured" | "catalog";

export interface ModelInfo {
  id: string;
  name: string;
  input: string;
  output: string;
  context: string;
  source: ModelSource;
  tier?: FeaturedTier;
}

interface OpenRouterModelInfo {
  id: string;
  name: string;
  context_length: number | null;
  prompt_price_per_million: number | null;
  completion_price_per_million: number | null;
  is_free: boolean;
}

const FEATURED_MODELS: ModelInfo[] = [
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", input: "$3", output: "$15", context: "1M", source: "featured", tier: "premium" },
  { id: "openai/gpt-5.2-codex", name: "GPT-5.2 Codex", input: "$1.75", output: "$14", context: "400K", source: "featured", tier: "premium" },
  { id: "writer/palmyra-x5", name: "Palmyra X5", input: "$0.60", output: "$6", context: "1M", source: "featured", tier: "premium" },
  { id: "qwen/qwen3-max-thinking", name: "Qwen3 Max Thinking", input: "$1.20", output: "$6", context: "262K", source: "featured", tier: "premium" },

  { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5", input: "$3", output: "$15", context: "200K", source: "featured", tier: "recommended" },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview", input: "$0.50", output: "$3", context: "1M", source: "featured", tier: "recommended" },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", input: "$0.23", output: "$3", context: "262K", source: "featured", tier: "recommended" },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek Chat v3", input: "$0.14", output: "$0.28", context: "128K", source: "featured", tier: "recommended" },

  { id: "qwen/qwen3.5-plus-2026-02-15", name: "Qwen3.5 Plus", input: "$0.40", output: "$2.40", context: "1M", source: "featured", tier: "value" },
  { id: "qwen/qwen3.5-397b-a17b", name: "Qwen3.5 397B A17B", input: "$0.60", output: "$3.60", context: "262K", source: "featured", tier: "value" },
  { id: "minimax/minimax-m2.5", name: "MiniMax M2.5", input: "$0.30", output: "$1.20", context: "196K", source: "featured", tier: "value" },
  { id: "z-ai/glm-5", name: "GLM 5", input: "$0.30", output: "$2.55", context: "204K", source: "featured", tier: "value" },
  { id: "bytedance-seed/seed-1.6", name: "Seed 1.6", input: "$0.25", output: "$2", context: "262K", source: "featured", tier: "value" },
  { id: "z-ai/glm-4.7", name: "GLM 4.7", input: "$0.40", output: "$1.50", context: "202K", source: "featured", tier: "value" },
  { id: "minimax/minimax-m2.1", name: "MiniMax M2.1", input: "$0.27", output: "$0.95", context: "196K", source: "featured", tier: "value" },

  { id: "stepfun/step-3.5-flash", name: "Step 3.5 Flash", input: "$0.10", output: "$0.30", context: "256K", source: "featured", tier: "budget" },
  { id: "mistralai/mistral-small-creative", name: "Mistral Small Creative", input: "$0.10", output: "$0.30", context: "32K", source: "featured", tier: "budget" },
  { id: "xiaomi/mimo-v2-flash", name: "MiMo V2 Flash", input: "$0.09", output: "$0.29", context: "262K", source: "featured", tier: "budget" },
  { id: "bytedance-seed/seed-1.6-flash", name: "Seed 1.6 Flash", input: "$0.075", output: "$0.30", context: "262K", source: "featured", tier: "budget" },
  { id: "qwen/qwen3-coder-next", name: "Qwen3 Coder Next", input: "$0.07", output: "$0.30", context: "262K", source: "featured", tier: "budget" },
  { id: "z-ai/glm-4.7-flash", name: "GLM 4.7 Flash", input: "$0.06", output: "$0.40", context: "202K", source: "featured", tier: "budget" },
  { id: "allenai/olmo-3.1-32b-instruct", name: "OLMo 3.1 32B", input: "$0.20", output: "$0.60", context: "65K", source: "featured", tier: "budget" },

  { id: "openrouter/aurora-alpha", name: "Aurora Alpha", input: "Free", output: "Free", context: "128K", source: "featured", tier: "free" },
  { id: "stepfun/step-3.5-flash:free", name: "Step 3.5 Flash (free)", input: "Free", output: "Free", context: "256K", source: "featured", tier: "free" },
  { id: "arcee-ai/trinity-large-preview:free", name: "Trinity Large Preview (free)", input: "Free", output: "Free", context: "131K", source: "featured", tier: "free" },
  { id: "upstage/solar-pro-3:free", name: "Solar Pro 3 (free)", input: "Free", output: "Free", context: "128K", source: "featured", tier: "free" },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 3 Nano 30B (free)", input: "Free", output: "Free", context: "256K", source: "featured", tier: "free" },
  { id: "liquid/lfm2.5-1.2b-thinking:free", name: "LFM2.5 Thinking (free)", input: "Free", output: "Free", context: "32K", source: "featured", tier: "free" },
];

const TIER_ORDER: FeaturedTier[] = ["premium", "recommended", "value", "budget", "free"];

const TIER_LABELS: Record<FeaturedTier, string> = {
  premium: "Premium",
  recommended: "Recommended",
  value: "Value",
  budget: "Budget",
  free: "Free",
};

const TIER_COLORS: Record<FeaturedTier, string> = {
  premium: "text-amber-500",
  recommended: "text-emerald-500",
  value: "text-blue-400",
  budget: "text-violet-400",
  free: "text-muted-foreground",
};

const MAX_CATALOG_NO_QUERY = 250;

let catalogCache: ModelInfo[] | null = null;
let catalogLoadPromise: Promise<ModelInfo[]> | null = null;

function mapCatalogModel(model: OpenRouterModelInfo): ModelInfo {
  return {
    id: model.id,
    name: model.name || model.id,
    input: formatPrice(model.prompt_price_per_million, model.is_free),
    output: formatPrice(model.completion_price_per_million, model.is_free),
    context: formatContext(model.context_length),
    source: "catalog",
  };
}

async function loadCatalogModels(): Promise<ModelInfo[]> {
  if (catalogCache) {
    return catalogCache;
  }
  if (!catalogLoadPromise) {
    catalogLoadPromise = invoke<OpenRouterModelInfo[]>("get_openrouter_models")
      .then((models) => {
        const mapped = models.map(mapCatalogModel);
        catalogCache = mapped;
        return mapped;
      })
      .catch((err) => {
        catalogLoadPromise = null;
        throw err;
      });
  }
  return catalogLoadPromise;
}

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
  compact?: boolean;
}

function formatPrice(value: number | null, free: boolean): string {
  if (free || value === 0) return "Free";
  if (value == null) return "-";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 0.1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function formatContext(value: number | null): string {
  if (!value || value <= 0) return "-";
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export default function ModelSelector({
  value,
  onChange,
  placeholder = "Search models...",
  compact = false,
}: ModelSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [catalogModels, setCatalogModels] = useState<ModelInfo[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    loadCatalogModels()
      .then((models) => {
        if (cancelled) return;
        setCatalogModels(models);
        setCatalogLoaded(true);
        setCatalogError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load OpenRouter models:", err);
        setCatalogLoaded(true);
        setCatalogError("Failed to load live catalog");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allModels = useMemo(() => {
    const byId = new Map<string, ModelInfo>();
    for (const model of FEATURED_MODELS) {
      byId.set(model.id, model);
    }
    for (const model of catalogModels) {
      if (!byId.has(model.id)) {
        byId.set(model.id, model);
      }
    }
    return Array.from(byId.values());
  }, [catalogModels]);

  const selectedModel = allModels.find((m) => m.id === value);
  const displayValue = open ? query : selectedModel ? selectedModel.name : value;

  const filtered = query.trim()
    ? allModels.filter((m) => {
        const q = query.toLowerCase();
        return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
      })
    : allModels;

  const featuredFiltered = filtered.filter((m) => m.source === "featured");
  const catalogFilteredAll = filtered.filter((m) => m.source === "catalog");
  const catalogFiltered = query.trim()
    ? catalogFilteredAll
    : catalogFilteredAll.slice(0, MAX_CATALOG_NO_QUERY);

  const featuredGroups = useMemo(() => {
    const grouped = new Map<FeaturedTier, ModelInfo[]>();
    for (const model of featuredFiltered) {
      if (!model.tier) continue;
      const list = grouped.get(model.tier) || [];
      list.push(model);
      grouped.set(model.tier, list);
    }
    return grouped;
  }, [featuredFiltered]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(modelId: string) {
    onChange(modelId);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function handleFocus() {
    setOpen(true);
    setQuery("");
  }

  function handleInputChange(next: string) {
    setQuery(next);
    if (!open) setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
    if (e.key === "Enter" && query.trim()) {
      const exact = allModels.find(
        (m) => m.id === query.trim() || m.name.toLowerCase() === query.trim().toLowerCase()
      );
      handleSelect(exact ? exact.id : query.trim());
    }
  }

  const noMatches = featuredFiltered.length === 0 && catalogFilteredAll.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={compact ? "h-7 text-xs font-mono" : "font-mono text-sm"}
      />

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <ScrollArea className="max-h-[360px]">
            <div className="p-1">
              {noMatches ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-muted-foreground">No matching models</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Press Enter to use "<span className="font-mono">{query}</span>" as a custom model ID
                  </p>
                </div>
              ) : (
                <>
                  {featuredFiltered.length > 0 && (
                    <div>
                      <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Featured
                      </div>
                      {TIER_ORDER.map((tier) => {
                        const models = featuredGroups.get(tier);
                        if (!models || models.length === 0) return null;
                        return (
                          <div key={tier}>
                            <div className={`px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider ${TIER_COLORS[tier]}`}>
                              {TIER_LABELS[tier]}
                            </div>
                            {models.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleSelect(m.id)}
                                className={`w-full text-left px-2 py-1.5 rounded-sm text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
                                  value === m.id ? "bg-accent/50" : ""
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">{m.name}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">{m.context}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-0.5">
                                  <span className="font-mono text-[10px] text-muted-foreground truncate">{m.id}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {m.input === "Free" ? "Free" : `${m.input} / ${m.output}`}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {catalogFiltered.length > 0 && (
                    <div className={featuredFiltered.length > 0 ? "mt-2 border-t border-border pt-1" : ""}>
                      <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        OpenRouter Catalog
                      </div>
                      {catalogFiltered.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelect(m.id)}
                          className={`w-full text-left px-2 py-1.5 rounded-sm text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
                            value === m.id ? "bg-accent/50" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{m.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{m.context}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="font-mono text-[10px] text-muted-foreground truncate">{m.id}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {m.input === "Free" ? "Free" : `${m.input} / ${m.output}`}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              Type any model ID from openrouter.ai/models
            </p>
            {!query.trim() && catalogFilteredAll.length > MAX_CATALOG_NO_QUERY && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Showing first {MAX_CATALOG_NO_QUERY} catalog models. Type to filter all {catalogFilteredAll.length}.
              </p>
            )}
            {!catalogLoaded && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Loading full OpenRouter catalog...
              </p>
            )}
            {catalogError && (
              <p className="text-[10px] text-amber-500 mt-0.5">
                {catalogError}. Using featured list.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
