"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Send,
  Mic,
  MicOff,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Award,
  RefreshCw,
  LogOut,
  Check,
} from "lucide-react";
import SystemDesignCanvas from "@/components/SystemDesignCanvas";
import type {
  SystemDesignSessionDoc,
  SystemDesignPhase,
  SystemDesignTurn,
  SystemDesignEvaluation,
} from "@/lib/mongodb";

const EASE_CURVE = [0.16, 1, 0.3, 1] as const;

const PHASES_LIST: Array<{
  id: SystemDesignPhase;
  label: string;
  short: string;
  step: number;
}> = [
  { id: "requirements", label: "Requirements", short: "Reqs", step: 1 },
  { id: "estimation", label: "Estimation", short: "Est", step: 2 },
  { id: "high_level_design", label: "High-Level Design", short: "Arch", step: 3 },
  { id: "deep_dive", label: "Deep Dive", short: "Deep", step: 4 },
  { id: "bottlenecks", label: "Bottlenecks & Scale", short: "Scale", step: 5 },
  { id: "wrap_up", label: "Wrap-Up", short: "Wrap", step: 6 },
];

interface SpeechResultItem {
  transcript: string;
}

interface SpeechResultList {
  [index: number]: { [index: number]: SpeechResultItem };
  length: number;
}

interface BrowserSpeechEvent {
  resultIndex: number;
  results: SpeechResultList;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function SystemDesignRoom() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SystemDesignSessionDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPhase, setCurrentPhase] = useState<SystemDesignPhase>("requirements");
  const [turns, setTurns] = useState<SystemDesignTurn[]>([]);
  const [candidateNotes, setCandidateNotes] = useState("");
  const [diagramJson, setDiagramJson] = useState<string>("");

  // Input & Turn state
  const [inputText, setInputText] = useState("");
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<SystemDesignEvaluation | null>(null);

  // Scratchpad collapsed state
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);

  // Timer state
  const [secondsRemaining, setSecondsRemaining] = useState<number>(35 * 60);
  const [lastAutosave, setLastAutosave] = useState<string>("Never");

  // Audio / Speech recognition
  const [isListening, setIsListening] = useState(false);
  const [speechWarning, setSpeechWarning] = useState<string | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Graph telemetry
  const [telemetry, setTelemetry] = useState<{
    nodesCount: number;
    edgesCount: number;
    coveragePercentage: number;
    coveredComponents: string[];
    missingComponents: string[];
  }>({
    nodesCount: 0,
    edgesCount: 0,
    coveragePercentage: 0,
    coveredComponents: [],
    missingComponents: [],
  });

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom
  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 100);
  };

  // Fetch session on load
  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const res = await fetch(`/api/mock/system-design/${sessionId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          router.push("/candidate");
          return;
        }
        const data = await res.json();
        if (!isMounted) return;

        if (data.session) {
          setSession(data.session);
          setCurrentPhase(data.session.currentPhase || "requirements");
          setTurns(data.session.turns || []);
          setCandidateNotes(data.session.candidateNotes || "");
          setDiagramJson(data.session.currentDiagramJson || "");
          if (data.session.evaluation) {
            setEvaluationResult(data.session.evaluation);
          }

          // Calculate timer remaining
          const durationSec = (data.session.durationMinutes || 35) * 60;
          const started = new Date(data.session.startedAt).getTime();
          const elapsed = Math.floor((Date.now() - started) / 1000);
          setSecondsRemaining(Math.max(0, durationSec - elapsed));
        }
      } catch {
        if (isMounted) router.push("/candidate");
      } finally {
        if (isMounted) {
          setLoading(false);
          scrollToBottom();
        }
      }
    }

    loadSession();

    return () => {
      isMounted = false;
    };
  }, [sessionId, router]);

  // Countdown timer
  useEffect(() => {
    if (evaluationResult) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [evaluationResult]);

  // Periodic autosave every 30 seconds
  useEffect(() => {
    if (!session || evaluationResult) return;
    const interval = setInterval(() => {
      if (diagramJson) {
        fetch(`/api/mock/system-design/${sessionId}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            diagramJson,
            candidateNotes,
            phase: currentPhase,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setLastAutosave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
            }
          })
          .catch(() => {});
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [session, sessionId, diagramJson, candidateNotes, currentPhase, evaluationResult]);

  // Speech-to-text initialization
  useEffect(() => {
    if (typeof window !== "undefined") {
      const windowWithSpeech = window as unknown as {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
      };
      const SpeechRecognition =
        windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: BrowserSpeechEvent) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        speechRecognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!speechRecognitionRef.current) {
      setSpeechWarning("Speech-to-text is not supported in this browser.");
      setTimeout(() => setSpeechWarning(null), 4000);
      return;
    }
    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      speechRecognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Canvas change handler
  const handleCanvasChange = (newDiagramJson: string, count: number) => {
    setDiagramJson(newDiagramJson);
    setTelemetry((prev) => ({
      ...prev,
      nodesCount: count,
    }));
  };

  // Submit turn to AI interviewer
  const handleSendTurn = useCallback(
    async (e?: React.FormEvent, phaseOverride?: SystemDesignPhase) => {
      if (e) e.preventDefault();
      const textToSend = inputText.trim();
      if (!textToSend && !phaseOverride) return;

      if (isListening && speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        setIsListening(false);
      }

      const targetPhase = phaseOverride || currentPhase;

      // Optimistically append candidate turn
      const tempCandidateTurn: SystemDesignTurn = {
        id: `temp_${Date.now()}`,
        speaker: "candidate",
        phase: targetPhase,
        message: textToSend || `Transitioning to ${targetPhase}...`,
        timestamp: new Date(),
      };

      setTurns((prev) => [...prev, tempCandidateTurn]);
      setInputText("");
      setIsSubmittingTurn(true);
      scrollToBottom();

      try {
        const res = await fetch(`/api/mock/system-design/${sessionId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: textToSend || `Let's move to ${targetPhase}.`,
            diagramJson,
            candidateNotes,
            requestedPhase: phaseOverride,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Turn processing failed");
        }

        const interviewerTurn: SystemDesignTurn = {
          id: `interviewer_${Date.now()}`,
          speaker: "interviewer",
          phase: data.phase,
          message: data.interviewerMessage,
          moveType: data.moveType,
          revealedRequirement: data.revealedRequirement,
          timestamp: new Date(),
        };

        setTurns((prev) => [...prev, interviewerTurn]);
        setCurrentPhase(data.phase);

        if (data.graphAnalysis) {
          setTelemetry({
            nodesCount: data.graphAnalysis.nodesCount,
            edgesCount: data.graphAnalysis.edgesCount,
            coveragePercentage: data.graphAnalysis.coveragePercentage,
            coveredComponents: data.graphAnalysis.coveredComponents || [],
            missingComponents: data.graphAnalysis.missingComponents || [],
          });
        }

        // Force a snapshot save on phase transition
        if (data.phase !== targetPhase || phaseOverride) {
          fetch(`/api/mock/system-design/${sessionId}/snapshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: data.phase,
              diagramJson,
              candidateNotes,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.error("Turn submission error:", err);
      } finally {
        setIsSubmittingTurn(false);
        scrollToBottom();
      }
    },
    [inputText, isListening, currentPhase, sessionId, diagramJson, candidateNotes]
  );

  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  // Conclude interview and compute evaluation
  const handleFinishInterview = () => {
    setShowFinishConfirm(true);
  };

  const executeFinishInterview = async () => {
    setShowFinishConfirm(false);
    setIsEvaluating(true);
    try {
      const res = await fetch(`/api/mock/system-design/${sessionId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagramJson,
          candidateNotes,
        }),
      });

      const data = await res.json();
      if (res.ok && data.evaluation) {
        setEvaluationResult(data.evaluation);
      }
    } catch (err: unknown) {
      console.error("[Evaluation Error]:", err);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Format timer
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-xs font-mono text-[#6E6B65]">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#1A1918]" />
          <span>Entering System Design Studio...</span>
        </div>
      </div>
    );
  }

  const currentPhaseIndex = PHASES_LIST.findIndex((p) => p.id === currentPhase);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1A1918] font-sans">
      {/* ============================================================ */}
      {/* 1. TOP HEADER: PHASE STEPPER + TIMER + CONTROLS */}
      {/* ============================================================ */}
      <header className="border-b border-[#E5E2DA] bg-[#FFFFFF] px-4 py-3 shrink-0 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Scenario Info */}
          <div className="flex items-center gap-3">
            <Link
              href="/candidate"
              className="font-mono text-sm font-bold tracking-wider text-[#1A1918] hover:opacity-75 transition-opacity"
            >
              QUORIX
            </Link>
            <span className="text-[#D5D1C7]">/</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono border border-[#CBE4D6] bg-[#EDF3EC] px-2 py-0.5 rounded-sm font-semibold text-[#1F7A55]">
                  SYSTEM DESIGN
                </span>
                <span className="text-[10px] font-mono bg-[#1A1918] text-[#FAF8F5] px-2 py-0.5 rounded-sm">
                  {session.level}
                </span>
                <span className="text-[10px] font-mono text-[#8E8B84] hidden sm:inline">
                  Autosave: {lastAutosave}
                </span>
              </div>
              <h1 className="text-sm font-bold text-[#1A1918] truncate max-w-sm sm:max-w-md">
                {session.scenarioTitle}
              </h1>
            </div>
          </div>

          {/* Phase Stepper Tracker */}
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {PHASES_LIST.map((phaseItem, idx) => {
              const isCurrent = phaseItem.id === currentPhase;
              const isPast = idx < currentPhaseIndex;
              return (
                <button
                  key={phaseItem.id}
                  onClick={() => handleSendTurn(undefined, phaseItem.id)}
                  disabled={isSubmittingTurn || Boolean(evaluationResult)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all shrink-0 ${
                    isCurrent
                      ? "bg-[#1A1918] text-[#FAF8F5] font-bold shadow-xs"
                      : isPast
                      ? "border border-[#CBE4D6] bg-[#EDF3EC] text-[#1F7A55] hover:bg-[#DDF0E6]"
                      : "border border-[#E5E2DA] bg-[#FAF8F5] text-[#8E8B84] hover:text-[#1A1918]"
                  }`}
                  title={`Jump to ${phaseItem.label}`}
                >
                  <span>{isPast ? "✓" : phaseItem.step}</span>
                  <span className="hidden lg:inline">{phaseItem.label}</span>
                  <span className="lg:hidden">{phaseItem.short}</span>
                </button>
              );
            })}
          </div>

          {/* Timer & Finish Session Action */}
          <div className="flex items-center gap-2.5 justify-end shrink-0">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold ${
                secondsRemaining < 300
                  ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B] animate-pulse"
                  : "border-[#E5E2DA] bg-[#FAF8F5] text-[#1A1918]"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{timeFormatted}</span>
            </div>

            <button
              onClick={handleFinishInterview}
              disabled={isEvaluating || Boolean(evaluationResult)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1F7A55] text-white text-xs font-semibold hover:bg-[#186043] transition-all shadow-xs disabled:opacity-50"
            >
              {isEvaluating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <Award className="w-3.5 h-3.5" />
                  <span>Finish &amp; Score</span>
                </>
              )}
            </button>

            <Link
              href="/candidate"
              className="p-1.5 rounded-md border border-[#E5E2DA] text-[#8E8B84] hover:text-[#1A1918] hover:bg-[#FAF8F5]"
              title="Exit to Candidate Workspace"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. MAIN 2-PANE WORKSPACE: CHAT (LEFT) + CANVAS (RIGHT) */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-w-7xl w-full mx-auto p-3 sm:p-4 gap-4">
        {/* ── LEFT PANE: TRANSCRIPT & INTERVIEWER CHAT (40% width) ── */}
        <section className="w-full md:w-[42%] lg:w-[38%] flex flex-col bg-[#FFFFFF] border border-[#E5E2DA] rounded-xl overflow-hidden shadow-xs shrink-0 h-[480px] md:h-[calc(100vh-140px)]">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E2DA] bg-[#FAF8F5] shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#1F7A55] animate-pulse" />
              <span className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                Architect Interviewer
              </span>
            </div>
            <span className="text-[10px] font-mono border border-[#E5E2DA] bg-[#FFFFFF] px-2 py-0.5 rounded-sm text-[#6E6B65]">
              Phase: {currentPhase.replace(/_/g, " ")}
            </span>
          </div>

          {/* Chat Turns Scroll Stream */}
          <div
            ref={chatScrollRef}
            className="flex-1 p-4 overflow-y-auto space-y-4 text-xs font-sans"
          >
            {turns.map((turn) => {
              const isInterviewer = turn.speaker === "interviewer";
              return (
                <div
                  key={turn.id}
                  className={`flex flex-col ${isInterviewer ? "items-start" : "items-end"}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8E8B84] mb-1">
                    <span>{isInterviewer ? "AI Architect" : "You (Candidate)"}</span>
                    <span>•</span>
                    <span>{turn.phase}</span>
                    {turn.moveType && (
                      <span className="border border-[#E5E2DA] bg-[#FAF8F5] px-1.5 py-0.2 rounded-xs uppercase">
                        {turn.moveType}
                      </span>
                    )}
                  </div>

                  <div
                    className={`max-w-[92%] rounded-xl p-3.5 leading-relaxed ${
                      isInterviewer
                        ? "bg-[#FAF8F5] border border-[#E5E2DA] text-[#1A1918] shadow-xs"
                        : "bg-[#1A1918] text-[#FAF8F5]"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{turn.message}</div>

                    {turn.revealedRequirement && (
                      <div className="mt-2.5 pt-2 border-t border-[#E5E2DA] text-[11px] font-mono text-[#1F7A55] flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Scope revealed: {turn.revealedRequirement}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isSubmittingTurn && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#6E6B65] p-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1A1918]" />
                <span>Interviewer is analyzing your response and diagram...</span>
              </div>
            )}
          </div>

          {/* Chat Input Form */}
          <form
            onSubmit={(e) => handleSendTurn(e)}
            className="p-3 border-t border-[#E5E2DA] bg-[#FAF8F5] space-y-2 shrink-0"
          >
            <div className="relative">
              <textarea
                rows={3}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendTurn();
                  }
                }}
                disabled={isSubmittingTurn || Boolean(evaluationResult)}
                placeholder="Ask clarifying questions, state your numbers, or explain your architecture..."
                className="w-full rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] p-2.5 text-xs text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 rounded-lg border transition-all text-xs flex items-center gap-1.5 ${
                    isListening
                      ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B] animate-pulse"
                      : "bg-[#FFFFFF] border-[#E5E2DA] text-[#6E6B65] hover:text-[#1A1918]"
                  }`}
                  title={isListening ? "Stop listening" : "Speak your response"}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-mono">Listening...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-mono hidden sm:inline">Voice</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsScratchpadOpen((prev) => !prev)}
                  className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] text-[11px] font-mono text-[#6E6B65] hover:text-[#1A1918] flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" />
                  <span>Scratchpad</span>
                  {isScratchpadOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={!inputText.trim() || isSubmittingTurn || Boolean(evaluationResult)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-semibold hover:bg-[#2C2A28] disabled:opacity-40 transition-all shadow-xs"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </section>

        {/* ── RIGHT PANE: EXCALIDRAW CANVAS + TELEMETRY (60% width) ── */}
        <section className="flex-1 flex flex-col h-[520px] md:h-[calc(100vh-140px)] relative overflow-hidden">
          <SystemDesignCanvas
            initialDiagramJson={diagramJson}
            onChange={handleCanvasChange}
            readOnly={Boolean(evaluationResult)}
          />

          {/* Diagram Graph Telemetry Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF8F5] border border-t-0 border-[#E5E2DA] rounded-b-xl text-[10px] font-mono text-[#6E6B65] shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[#1A1918]">
                Diagram Graph: {telemetry.nodesCount} Nodes • {telemetry.edgesCount} Flows
              </span>
              <span>•</span>
              <span className="text-[#1F7A55]">
                Coverage: {telemetry.coveragePercentage}% Expected
              </span>
            </div>

            {telemetry.missingComponents.length > 0 && (
              <span className="text-[#8E8B84] truncate max-w-xs hidden sm:inline">
                Suggested Next: {telemetry.missingComponents.slice(0, 2).join(", ")}
              </span>
            )}
          </div>
        </section>
      </div>

      {/* ============================================================ */}
      {/* 3. COLLAPSIBLE BOTTOM SCRATCHPAD DRAWER */}
      {/* ============================================================ */}
      <AnimatePresence>
        {isScratchpadOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CURVE }}
            className="fixed bottom-0 inset-x-0 z-30 bg-[#FFFFFF] border-t border-[#E5E2DA] p-4 shadow-xl max-w-7xl mx-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold font-mono uppercase text-[#1A1918] flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-[#1F7A55]" />
                <span>Candidate Scratchpad &amp; Calculations</span>
              </div>
              <button
                onClick={() => setIsScratchpadOpen(false)}
                className="text-xs font-mono text-[#8E8B84] hover:text-[#1A1918]"
              >
                Close ✕
              </button>
            </div>
            <textarea
              rows={3}
              value={candidateNotes}
              onChange={(e) => setCandidateNotes(e.target.value)}
              placeholder="Jot down rough calculations, formulas, or assumptions here (e.g., 50M DAU * 200 req = 10B req/day = 115k QPS)..."
              className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] p-3 text-xs font-mono text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* 4. MODAL: SYSTEM DESIGN EVALUATION REPORT */}
      {/* ============================================================ */}
      <AnimatePresence>
        {evaluationResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1918]/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: EASE_CURVE }}
              className="w-full max-w-4xl my-8 rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5 shadow-2xl"
            >
              <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 sm:p-8 space-y-6 max-h-[88vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-[#E5E2DA] pb-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#1F7A55]">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>System Design Evaluation Dossier</span>
                    </div>
                    <h2 className="text-2xl font-bold text-[#1A1918] mt-1">
                      {session.scenarioTitle}
                    </h2>
                    <p className="text-xs text-[#6E6B65]">
                      Phase-based architectural scoring evaluated across 7 dimensions.
                    </p>
                  </div>

                  <Link
                    href="/candidate"
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-semibold hover:bg-[#2C2A28] transition-all"
                  >
                    <span>Return to Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Big Score Card */}
                <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                  <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 text-center space-y-2 shadow-xs">
                    <div className="text-[11px] font-mono text-[#6E6B65] uppercase">
                      Overall Architectural Competency
                    </div>
                    <div className="text-5xl font-extrabold font-mono text-[#1A1918]">
                      {evaluationResult.overallScore} / 10
                    </div>
                    <p className="text-xs text-[#55524C] max-w-prose mx-auto pt-1 leading-relaxed">
                      {evaluationResult.summaryFeedback}
                    </p>
                  </div>
                </div>

                {/* 7-Dimension Score Grid */}
                <div className="space-y-3">
                  <div className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                    Phase-Based Dimension Rubric
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {Object.entries(evaluationResult.dimensions).map(([key, val]) => {
                      const labelMap: Record<string, string> = {
                        requirementsGathering: "1. Requirements Probing",
                        estimation: "2. Back-of-Envelope Estimation",
                        architecture: "3. Architecture & Data Flow",
                        dataAndApiDesign: "4. Data & API Contracts",
                        depthAndTradeoffs: "5. Depth & Trade-Offs",
                        reliabilityAndScale: "6. Reliability & 10x Scale",
                        communicationAndClarity: "7. Communication & Whiteboarding",
                      };
                      return (
                        <div
                          key={key}
                          className="p-3.5 rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#1A1918]">
                              {labelMap[key] || key}
                            </span>
                            <span className="font-mono font-bold text-[#1F7A55]">
                              {val.score} / 10
                            </span>
                          </div>
                          <p className="text-[11px] text-[#55524C] leading-relaxed">
                            {val.feedback}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Component Coverage Checklist */}
                <div className="p-4 rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] space-y-2.5">
                  <div className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                    Component Coverage Checklist
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    {session.scenario.expectedComponents.map((comp) => {
                      const isCovered = evaluationResult.coveredComponents.includes(comp);
                      return (
                        <span
                          key={comp}
                          className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                            isCovered
                              ? "border-[#CBE4D6] bg-[#EDF3EC] text-[#1F7A55] font-semibold"
                              : "border-[#E5E2DA] bg-[#FFFFFF] text-[#8E8B84]"
                          }`}
                        >
                          <span>{isCovered ? "✓" : "○"}</span>
                          <span>{comp}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-lg border border-[#CBE4D6] bg-[#F0FDF4]/50 space-y-2">
                    <div className="font-bold font-mono text-[#1F7A55] uppercase">
                      Observed Strengths
                    </div>
                    <ul className="space-y-1 text-[#33312E] list-disc list-inside">
                      {evaluationResult.strengths.map((str, i) => (
                        <li key={i}>{str}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] space-y-2">
                    <div className="font-bold font-mono text-[#6E6B65] uppercase">
                      Areas for Growth
                    </div>
                    <ul className="space-y-1 text-[#55524C] list-disc list-inside">
                      {evaluationResult.weaknesses.map((wk, i) => (
                        <li key={i}>{wk}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Footer Return */}
                <div className="flex justify-end pt-4 border-t border-[#E5E2DA]">
                  <Link
                    href="/candidate"
                    className="px-6 py-2.5 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-semibold hover:bg-[#2C2A28] transition-all shadow-xs"
                  >
                    Return to Candidate Workspace
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Confirmation Dialog to Finish & Evaluate */}
        {showFinishConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1918]/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-2xl"
            >
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase text-[#6E6B65]">Confirm Submission</div>
                <h3 className="text-base font-bold text-[#1A1918]">Finish &amp; Evaluate Design?</h3>
                <p className="text-xs text-[#55524C] leading-relaxed">
                  This will analyze your architectural whiteboard diagram against {session.scenario.title}&apos;s scale constraints and generate a 7-dimension evaluation report.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E2DA]">
                <button
                  type="button"
                  onClick={() => setShowFinishConfirm(false)}
                  className="px-4 py-2 rounded-lg border border-[#D5D1C7] text-xs font-medium text-[#1A1918] hover:bg-[#FAF8F5] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeFinishInterview}
                  disabled={isEvaluating}
                  className="px-5 py-2 rounded-lg bg-[#1F7A55] text-white text-xs font-semibold hover:bg-[#186244] transition-all shadow-xs"
                >
                  {isEvaluating ? "Evaluating Design..." : "Submit for Evaluation"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Speech Warning Toast */}
        {speechWarning && (
          <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] px-4 py-2.5 text-xs font-mono text-[#1A1918] shadow-lg animate-fade-in">
            {speechWarning}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
