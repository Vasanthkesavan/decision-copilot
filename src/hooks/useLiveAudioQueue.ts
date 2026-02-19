import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";

interface SegmentAudioReadyEvent {
  decision_id: string;
  segment_index: number;
  agent: string;
  round_number: number;
  exchange_number: number;
  text?: string;
  audio_file: string;
  duration_ms: number;
  audio_dir: string;
}

interface SegmentAudioErrorEvent {
  decision_id: string;
  segment_index: number;
}

export interface LiveAudioSegment {
  index: number;
  agent: string;
  roundNumber: number;
  exchangeNumber: number;
  durationMs: number;
  text: string;
}

export interface LiveAudioState {
  isPlaying: boolean;
  currentSegmentIndex: number;
  currentAgent: string | null;
  currentSegment: LiveAudioSegment | null;
  segmentsReady: number;
  nextSegmentIndex: number;
  maxReadySegmentIndex: number;
  togglePause: () => void;
  stop: () => void;
}

export function useLiveAudioQueue(
  decisionId: string,
  isDebating: boolean
): LiveAudioState {
  const readySegments = useRef<Map<number, SegmentAudioReadyEvent>>(new Map());
  const failedSegments = useRef<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextToPlay = useRef(0);
  const isPlayingRef = useRef(false);
  const userPaused = useRef(false);

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [currentSegment, setCurrentSegment] = useState<LiveAudioSegment | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [segmentsReady, setSegmentsReady] = useState(0);
  const [nextSegmentIndex, setNextSegmentIndex] = useState(0);
  const [maxReadySegmentIndex, setMaxReadySegmentIndex] = useState(-1);

  const setPlaybackIdle = useCallback((clearCurrent = false) => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (clearCurrent) {
      setCurrentAgent(null);
      setCurrentSegment(null);
    }
  }, []);

  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const tryPlayNext = useCallback(() => {
    if (userPaused.current) return;

    while (failedSegments.current.has(nextToPlay.current)) {
      nextToPlay.current += 1;
      setNextSegmentIndex(nextToPlay.current);
    }

    const idx = nextToPlay.current;
    const segment = readySegments.current.get(idx);
    if (!segment) {
      setPlaybackIdle(!isDebating);
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      setPlaybackIdle(!isDebating);
      return;
    }

    const filePath = `${segment.audio_dir}/${segment.audio_file}`.replace(/\\/g, "/");
    const url = convertFileSrc(filePath);

    audio.src = url;
    audio.load();
    audio.play().catch((err) => {
      console.error(err);
      setPlaybackIdle(false);
    });

    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentSegmentIndex(idx);
    setCurrentAgent(segment.agent);
    setCurrentSegment({
      index: idx,
      agent: segment.agent,
      roundNumber: segment.round_number,
      exchangeNumber: segment.exchange_number,
      durationMs: segment.duration_ms,
      text: segment.text || "",
    });
  }, [isDebating, setPlaybackIdle]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      setPlaybackIdle(isDebating ? false : true);
      nextToPlay.current += 1;
      setNextSegmentIndex(nextToPlay.current);
      setTimeout(() => tryPlayNext(), 500);
    };

    const handleError = () => {
      setPlaybackIdle(isDebating ? false : true);
      nextToPlay.current += 1;
      setNextSegmentIndex(nextToPlay.current);
      setTimeout(() => tryPlayNext(), 300);
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [isDebating, setPlaybackIdle, tryPlayNext]);

  useEffect(() => {
    const unlistenReady = listen<SegmentAudioReadyEvent>(
      "debate-segment-audio-ready",
      (event) => {
        if (event.payload.decision_id !== decisionId) return;

        readySegments.current.set(event.payload.segment_index, event.payload);
        setSegmentsReady(readySegments.current.size);
        setMaxReadySegmentIndex((prev) =>
          Math.max(prev, event.payload.segment_index)
        );

        if (event.payload.segment_index === nextToPlay.current) {
          tryPlayNext();
        }
      }
    );

    const unlistenError = listen<SegmentAudioErrorEvent>(
      "debate-segment-audio-error",
      (event) => {
        if (event.payload.decision_id !== decisionId) return;

        failedSegments.current.add(event.payload.segment_index);
        if (event.payload.segment_index === nextToPlay.current) {
          nextToPlay.current += 1;
          setNextSegmentIndex(nextToPlay.current);
          tryPlayNext();
        }
      }
    );

    return () => {
      unlistenReady.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [decisionId, tryPlayNext]);

  useEffect(() => {
    if (isDebating) {
      readySegments.current.clear();
      failedSegments.current.clear();
      nextToPlay.current = 0;
      userPaused.current = false;
      setPlaybackIdle(true);
      setCurrentSegmentIndex(-1);
      setSegmentsReady(0);
      setNextSegmentIndex(0);
      setMaxReadySegmentIndex(-1);
    }
  }, [isDebating, setPlaybackIdle]);

  const togglePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlayingRef.current) {
      audio.pause();
      userPaused.current = true;
      setPlaybackIdle(false);
    } else {
      userPaused.current = false;
      if (audio.src) {
        audio.play().catch(console.error);
        isPlayingRef.current = true;
        setIsPlaying(true);
      } else {
        tryPlayNext();
      }
    }
  }, [tryPlayNext]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    userPaused.current = true;
    setPlaybackIdle(true);
  }, [setPlaybackIdle]);

  return {
    isPlaying,
    currentSegmentIndex,
    currentAgent,
    currentSegment,
    segmentsReady,
    nextSegmentIndex,
    maxReadySegmentIndex,
    togglePause,
    stop,
  };
}
