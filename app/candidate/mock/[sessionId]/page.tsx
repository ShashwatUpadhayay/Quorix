"use client";

import React, { useState, useEffect, useMemo, use } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Send,
  Code2,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type { MockSessionDoc, MockSessionResponse } from "@/lib/mongodb";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

const EASE_CURVE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const PROGRAMMING_LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Java",
  "Rust",
  "C++",
  "SQL",
];

export default function MockInterviewRoom({ params }: PageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const [session, setSession] = useState<MockSessionDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Answering states
  const [userAnswer, setUserAnswer] = useState("");
  const [codeSubmitted, setCodeSubmitted] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("TypeScript");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestEvaluation, setLatestEvaluation] = useState<{
    scores: {
      relevance: number;
      depth: number;
      clarity: number;
      overall: number;
    };
    feedback: string;
  } | null>(null);

  // Timer states
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const timerExpired = secondsRemaining !== null && secondsRemaining <= 0;

  // Fetch session data
  useEffect(() => {
    let active = true;
    fetch(`/api/mock/session/${sessionId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load interview session.");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setSession(data.session);

        // Prepopulate language if focus matches
        const focus = data.session?.focus?.toLowerCase() || "";
        const matchedLang = PROGRAMMING_LANGUAGES.find((lang) =>
          focus.includes(lang.toLowerCase())
        );
        if (matchedLang) {
          setSelectedLanguage(matchedLang);
        }

        // Initialize starter code if coding interview
        const currentQ =
          data.session?.questions?.[data.session.currentQuestionIndex || 0];
        if (currentQ?.codeStarter) {
          setCodeSubmitted(currentQ.codeStarter);
        }

        // Initialize countdown timer
        if (data.session?.status !== "completed") {
          const startedAt = new Date(data.session?.startedAt || Date.now()).getTime();
          const durationSeconds = (data.session?.durationMinutes || 30) * 60;
          const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
          const remaining = Math.max(0, durationSeconds - elapsedSeconds);
          setSecondsRemaining(remaining);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load session.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  // Live timer interval
  useEffect(() => {
    if (secondsRemaining === null || session?.status === "completed" || secondsRemaining <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining, session?.status]);

  const currentQuestion = useMemo(() => {
    if (!session || !session.questions) return null;
    const index = session.currentQuestionIndex || 0;
    return session.questions[index] || null;
  }, [session]);

  const formattedTimer = useMemo(() => {
    if (secondsRemaining === null) return "--:--";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, [secondsRemaining]);

  const handleResetCode = () => {
    if (currentQuestion?.codeStarter) {
      setCodeSubmitted(currentQuestion.codeStarter);
    } else {
      setCodeSubmitted("");
    }
  };

  const handleSubmitResponse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userAnswer.trim() && !codeSubmitted.trim()) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/mock/session/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: userAnswer,
          code: codeSubmitted,
          language: selectedLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit answer.");
      }

      setLatestEvaluation(data.evaluation);

      // Refresh session state
      const freshRes = await fetch(`/api/mock/session/${sessionId}`);
      const freshData = await freshRes.json();
      setSession(freshData.session);

      // Reset input fields for the next question
      setUserAnswer("");
      const nextQ =
        freshData.session?.questions?.[
          freshData.session.currentQuestionIndex || 0
        ];
      if (nextQ?.codeStarter) {
        setCodeSubmitted(nextQ.codeStarter);
      } else {
        setCodeSubmitted("");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to submit response."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishEarly = async () => {
    const confirmFinish = window.confirm(
      "End the mock interview and calculate your final score based on answers submitted so far?"
    );
    if (!confirmFinish) return;

    try {
      const res = await fetch(`/api/mock/session/${sessionId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
      }
    } catch {
      // Ignored
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#E5E2DA] bg-[#FFFFFF] rounded-xl p-8 space-y-4">
          <div className="h-3 w-28 bg-[#EFECE4] rounded-sm animate-pulse" />
          <div className="h-6 w-56 bg-[#EFECE4] rounded-sm animate-pulse" />
          <div className="h-32 w-full bg-[#F7F4EE] rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#E5C9C0] bg-[#FFFFFF] rounded-xl p-6 text-center space-y-4">
          <div className="text-sm font-semibold text-[#B45332]">{error}</div>
          <Link
            href="/candidate"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1A1918] border border-[#D5D1C7] bg-[#FAF8F5] px-4 py-2 rounded-lg hover:bg-[#EAE6DD]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Workspace</span>
          </Link>
        </div>
      </div>
    );
  }

  const isCompleted = session?.status === "completed";
  const responses = session?.responses || [];
  const currentNumber = (session?.currentQuestionIndex || 0) + 1;
  const totalQuestions = session?.questions?.length || 1;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1918] flex flex-col font-sans selection:bg-[#E5E2DA]">
      {/* ============================================================ */}
      {/* ROOM TOP NAVIGATION BAR */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-30 border-b border-[#E5E2DA] bg-[#FAF8F5]/95 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link
            href="/candidate"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#1A1918] hover:bg-[#F2EFE9] transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-[#1A1918]"
            title="Return to Workspace"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Workspace</span>
          </Link>

          <div className="h-5 w-px bg-[#E5E2DA] hidden sm:block" />

          <div className="truncate min-w-0">
            <div className="flex items-center gap-2 truncate">
              <span className="font-mono text-xs font-bold text-[#1A1918] tracking-wider truncate">
                {session?.title}
              </span>
              <span className="hidden md:inline-flex items-center rounded-md border border-[#D5D1C7] bg-[#FFFFFF] px-2 py-0.5 text-[10px] font-mono text-[#1F7A55] uppercase">
                {session?.interviewType}
              </span>
            </div>
          </div>
        </div>

        {/* Status Pills + Timer + Action */}
        <div className="flex items-center gap-3 shrink-0">
          {!isCompleted && secondsRemaining !== null && (
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono tabular-nums font-semibold transition-colors ${
                secondsRemaining <= 300
                  ? "border-[#E5C9C0] bg-[#FFF8F5] text-[#B45332]"
                  : "border-[#E5E2DA] bg-[#FFFFFF] text-[#1A1918]"
              }`}
              title="Time Remaining"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formattedTimer}</span>
            </div>
          )}

          {!isCompleted && (
            <button
              onClick={handleFinishEarly}
              className="rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#F2EFE9] transition-all"
            >
              Finish Early
            </button>
          )}

          {isCompleted && (
            <Link
              href="/candidate"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1918] text-[#FAF8F5] px-4 py-1.5 text-xs font-medium hover:bg-[#2C2A28] transition-all"
            >
              <span>View In Workspace</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </header>

      {/* Timer Expired Warning */}
      {timerExpired && !isCompleted && (
        <div className="border-b border-[#E5C9C0] bg-[#FFF8F5] px-6 py-2.5 text-xs text-[#B45332] flex items-center justify-between">
          <span>
            Scheduled interview duration has expired. You may finish your current answer or complete the session now.
          </span>
          <button
            onClick={handleFinishEarly}
            className="font-semibold underline ml-3"
          >
            Finalize Session
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* ROOM MAIN CONTENT */}
      {/* ============================================================ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {/* ========================================================== */}
          {/* VIEW A: INTERVIEW IN PROGRESS */}
          {/* ========================================================== */}
          {!isCompleted && currentQuestion && (
            <motion.div
              key="active-room"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: EASE_CURVE }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
            >
              {/* LEFT COLUMN: Interviewer Console & Question Prompt */}
              <div className="lg:col-span-5 space-y-5">
                {/* AI Interviewer Persona Header */}
                <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-4 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                  <div className="flex items-center justify-between border-b border-[#E5E2DA] pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-[#1A1918] text-[#FAF8F5] flex items-center justify-center font-mono text-xs font-bold">
                        AI
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#1A1918]">
                          Quorix AI Interviewer
                        </div>
                        <div className="text-[10px] text-[#1F7A55] font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A55] animate-pulse" />
                          <span>Observing &amp; Evaluating</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-[#6E6B65]">
                      Question{" "}
                      <span className="text-[#1A1918] font-bold">
                        {currentNumber}
                      </span>{" "}
                      of {totalQuestions}
                    </div>
                  </div>

                  {/* Stage & Question */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2.5 py-0.5 text-[10px] font-mono uppercase text-[#423F3A]">
                        {currentQuestion.stage} Stage
                      </span>
                      <span className="rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-2.5 py-0.5 text-[10px] font-mono text-[#1F7A55] font-semibold">
                        {session?.level} Level
                      </span>
                      <span className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2.5 py-0.5 text-[10px] font-mono text-[#6E6B65]">
                        {session?.focus}
                      </span>
                    </div>

                    <h2 className="text-base sm:text-lg font-bold text-[#1A1918] leading-relaxed">
                      {currentQuestion.prompt}
                    </h2>
                  </div>

                  {/* Constraints if present */}
                  {currentQuestion.constraints &&
                    currentQuestion.constraints.length > 0 && (
                      <div className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3.5 space-y-2 text-xs">
                        <div className="font-mono text-[10px] uppercase text-[#6E6B65] font-semibold">
                          Constraints &amp; Invariants:
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-[#423F3A] font-mono text-[11px]">
                          {currentQuestion.constraints.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Examples if present */}
                  {currentQuestion.examples &&
                    currentQuestion.examples.length > 0 && (
                      <div className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3.5 space-y-2 text-xs">
                        <div className="font-mono text-[10px] uppercase text-[#6E6B65] font-semibold">
                          Sample Test Cases:
                        </div>
                        {currentQuestion.examples.map((ex, idx) => (
                          <div
                            key={idx}
                            className="bg-[#FFFFFF] border border-[#E5E2DA] rounded p-2 text-[11px] font-mono space-y-0.5"
                          >
                            <div>
                              <span className="text-[#8E8B84]">Input: </span>
                              <span className="text-[#1A1918]">{ex.input}</span>
                            </div>
                            <div>
                              <span className="text-[#8E8B84]">Output: </span>
                              <span className="text-[#1F7A55] font-bold">
                                {ex.output}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {/* Rubric Criteria Hint */}
                  <div className="border-t border-[#E5E2DA] pt-3 text-[11px] text-[#6E6B65] leading-relaxed">
                    <span className="font-semibold text-[#1A1918]">
                      Rubric Focus:{" "}
                    </span>
                    {currentQuestion.rubricHint}
                  </div>
                </div>

                {/* Session Q&A Live Feed (Previous Answers in this session) */}
                {responses.length > 0 && (
                  <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-3 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                    <div className="flex items-center justify-between text-xs font-mono text-[#6E6B65] border-b border-[#E5E2DA] pb-2">
                      <span>PREVIOUS QUESTIONS IN THIS SESSION</span>
                      <span className="font-bold text-[#1A1918]">
                        {responses.length} answered
                      </span>
                    </div>

                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {responses.map((resp, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-[#6E6B65]">
                              Question {idx + 1} ({resp.stage})
                            </span>
                            <span className="font-mono font-bold text-[#1F7A55]">
                              {resp.scores.overall}/10
                            </span>
                          </div>
                          <div className="font-medium text-[#1A1918] line-clamp-2">
                            {resp.questionPrompt}
                          </div>
                          <div className="text-[11px] text-[#55524C] pt-1 border-t border-[#E5E2DA] line-clamp-2">
                            {resp.feedback}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Candidate Response Console */}
              <div className="lg:col-span-7 space-y-5">
                <form
                  onSubmit={handleSubmitResponse}
                  className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-5 shadow-[0_1px_2px_rgba(26,25,24,0.03)]"
                >
                  <div className="flex items-center justify-between border-b border-[#E5E2DA] pb-3">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-[#1A1918]" />
                      <span className="text-xs font-bold text-[#1A1918]">
                        Candidate Response Console
                      </span>
                    </div>

                    {session?.interviewType === "coding" && (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedLanguage}
                          onChange={(e) => setSelectedLanguage(e.target.value)}
                          className="rounded border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-1 text-xs font-mono text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                        >
                          {PROGRAMMING_LANGUAGES.map((lang) => (
                            <option key={lang} value={lang}>
                              {lang}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleResetCode}
                          className="p-1 rounded text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#FAF8F5]"
                          title="Reset Starter Code"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Code Editor for Coding Interviews */}
                  {session?.interviewType === "coding" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor="code-solution-input"
                          className="font-medium text-[#423F3A]"
                        >
                          Code Implementation ({selectedLanguage})
                        </label>
                        <span className="text-[10px] font-mono text-[#8E8B84]">
                          Clean indentation &amp; optimal Big-O
                        </span>
                      </div>
                      <textarea
                        id="code-solution-input"
                        rows={11}
                        value={codeSubmitted}
                        onChange={(e) => setCodeSubmitted(e.target.value)}
                        placeholder="// Write your clean, production-ready solution here..."
                        className="w-full rounded-lg border border-[#D5D1C7] bg-[#1A1918] text-[#FAF8F5] p-4 text-xs font-mono leading-relaxed focus-visible:outline-2 focus-visible:outline-[#1F7A55]"
                        spellCheck={false}
                      />
                    </div>
                  )}

                  {/* Written Explanation / Architecture / Behavioral Notes */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="user-explanation-input"
                        className="font-medium text-[#423F3A]"
                      >
                        {session?.interviewType === "coding"
                          ? "Complexity Analysis & Edge Cases:"
                          : "Your Technical Reasoning & Architecture:"}
                      </label>
                      <span className="text-[10px] font-mono text-[#8E8B84] tabular-nums">
                        {userAnswer.trim()
                          ? userAnswer.trim().split(/\s+/).length
                          : 0}{" "}
                        words
                      </span>
                    </div>
                    <textarea
                      id="user-explanation-input"
                      rows={session?.interviewType === "coding" ? 5 : 12}
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      placeholder={
                        session?.interviewType === "coding"
                          ? "Walk through your time/space complexity, constraints handled, and how your logic prevents edge cases..."
                          : session?.interviewType === "system_design"
                            ? "Structure your answer: 1. Functional & non-functional requirements, 2. High-level data flow, 3. Bottleneck mitigation (caching, sharding, replication), 4. Failure recovery..."
                            : session?.interviewType === "behavioral"
                              ? "Structure using STAR: Situation, Task, Action taken, and measurable Result / Lessons learned..."
                              : "Detail your approach, trade-offs, internal mechanics, and operational considerations..."
                      }
                      className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] p-4 text-xs text-[#1A1918] placeholder-[#8E8B84] leading-relaxed focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                    />
                  </div>

                  {/* Submit Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="text-[11px] text-[#6E6B65]">
                      Evaluates Relevance, Depth, and Clarity in real-time
                    </div>

                    <button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        (!userAnswer.trim() && !codeSubmitted.trim())
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-6 py-2.5 hover:bg-[#2C2A28] disabled:opacity-45 active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isSubmitting
                          ? "Scoring Response..."
                          : currentNumber === totalQuestions
                            ? "Submit & Finalize Interview"
                            : "Submit Answer & Next Question"}
                      </span>
                    </button>
                  </div>
                </form>

                {/* Latest Evaluation Feedback Banner */}
                {latestEvaluation && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-[#CBE4D6] bg-[#EDF3EC] p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="inline-flex items-center gap-1.5 font-bold text-[#1F7A55]">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Previous Response Scored</span>
                      </div>
                      <span className="font-mono font-bold text-[#1F7A55] rounded border border-[#CBE4D6] bg-[#FFFFFF] px-2.5 py-0.5">
                        {latestEvaluation.scores.overall} / 10
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <div className="rounded bg-[#FFFFFF] p-2 border border-[#CBE4D6]">
                        <div className="text-[10px] text-[#6E6B65]">Relevance</div>
                        <div className="font-bold text-[#1A1918] mt-0.5">
                          {latestEvaluation.scores.relevance}/10
                        </div>
                      </div>
                      <div className="rounded bg-[#FFFFFF] p-2 border border-[#CBE4D6]">
                        <div className="text-[10px] text-[#6E6B65]">Depth</div>
                        <div className="font-bold text-[#1A1918] mt-0.5">
                          {latestEvaluation.scores.depth}/10
                        </div>
                      </div>
                      <div className="rounded bg-[#FFFFFF] p-2 border border-[#CBE4D6]">
                        <div className="text-[10px] text-[#6E6B65]">Clarity</div>
                        <div className="font-bold text-[#1A1918] mt-0.5">
                          {latestEvaluation.scores.clarity}/10
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-[#1F7A55] leading-relaxed">
                      {latestEvaluation.feedback}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* ========================================================== */}
          {/* VIEW B: INTERVIEW COMPLETED — PERFORMANCE DOSSIER */}
          {/* ========================================================== */}
          {isCompleted && (
            <motion.div
              key="completed-room"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE_CURVE }}
              className="max-w-4xl mx-auto space-y-8 py-4"
            >
              {/* Completed Hero Card */}
              <div className="rounded-2xl border border-[#E5E2DA] bg-[#F7F4EE] p-2 shadow-[0_2px_8px_rgba(26,25,24,0.04)]">
                <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-8 sm:p-10 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-[#E5E2DA]">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-3 py-1 text-xs font-mono font-medium text-[#1F7A55]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mock Interview Completed</span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1918]">
                        {session?.title}
                      </h1>
                      <p className="text-xs sm:text-sm text-[#55524C] leading-relaxed max-w-2xl">
                        Comprehensive evaluation report calibrated against industry benchmarks for{" "}
                        <span className="font-semibold text-[#1A1918]">
                          {session?.focus}
                        </span>{" "}
                        at the{" "}
                        <span className="font-semibold text-[#1F7A55]">
                          {session?.level}
                        </span>{" "}
                        tier.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#E5E2DA] bg-[#FAF8F5] p-5 text-center shrink-0 min-w-[140px]">
                      <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                        Overall Score
                      </div>
                      <div className="text-3xl font-bold font-mono text-[#1A1918] mt-1 tabular-nums">
                        {session?.overallScore ?? "—"}
                        <span className="text-sm font-normal text-[#8E8B84]">
                          /10
                        </span>
                      </div>
                      <div className="text-[11px] text-[#1F7A55] font-mono mt-1 font-semibold">
                        {(session?.overallScore || 0) >= 8.0
                          ? "Senior Pass"
                          : (session?.overallScore || 0) >= 6.5
                            ? "Competitive"
                            : "Needs Growth"}
                      </div>
                    </div>
                  </div>

                  {/* Tri-Factor Rubric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      {
                        label: "Domain Relevance",
                        val: session?.categoryScores?.relevance || 0,
                        desc: "Direct alignment to problem requirements and constraints",
                      },
                      {
                        label: "Technical Depth",
                        val: session?.categoryScores?.depth || 0,
                        desc: "Mastery of internal mechanics, complexity, & trade-offs",
                      },
                      {
                        label: "Communication Clarity",
                        val: session?.categoryScores?.clarity || 0,
                        desc: "Structured delivery, rationale, and clean formatting",
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-xl border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-[#6E6B65] font-medium">
                            {metric.label}
                          </span>
                          <span className="font-bold text-[#1A1918] tabular-nums">
                            {metric.val}/10
                          </span>
                        </div>
                        <div className="w-full bg-[#E5E2DA] h-2 rounded-xs overflow-hidden">
                          <div
                            className="bg-[#1A1918] h-full rounded-xs"
                            style={{ width: `${metric.val * 10}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-[#6E6B65] leading-relaxed pt-1">
                          {metric.desc}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* AI Synthesized Feedback */}
                  {session?.summaryFeedback && (
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#FAF8F5] p-5 space-y-2 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-[#1A1918]">
                        <Sparkles className="w-4 h-4 text-[#1F7A55]" />
                        <span>Interviewer Synthesis &amp; Takeaway</span>
                      </div>
                      <p className="text-[#423F3A] leading-relaxed">
                        {session.summaryFeedback}
                      </p>
                    </div>
                  )}

                  {/* Primary CTA Back */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E5E2DA]">
                    <div className="text-xs text-[#6E6B65]">
                      This session has been permanently saved to your workspace dossier and daily activity log.
                    </div>
                    <Link
                      href="/candidate"
                      className="inline-flex items-center gap-2 rounded-lg bg-[#1A1918] text-[#FAF8F5] px-6 py-2.5 text-xs font-medium hover:bg-[#2C2A28] active:scale-[0.98] transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                    >
                      <span>Return to Candidate Workspace</span>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Transcript */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono text-[#6E6B65] uppercase tracking-wider">
                    Complete Session Transcript ({responses.length} responses)
                  </h3>
                  <span className="text-xs font-mono text-[#1F7A55]">
                    Logged to MongoDB
                  </span>
                </div>

                <div className="space-y-4">
                  {responses.map((resp: MockSessionResponse, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-[0_1px_2px_rgba(26,25,24,0.03)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E2DA] pb-3 text-xs">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="rounded bg-[#FAF8F5] border border-[#E5E2DA] px-2 py-0.5 font-bold text-[#1A1918]">
                            Q{idx + 1}
                          </span>
                          <span className="text-[#6E6B65] uppercase">
                            {resp.stage} Stage
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[#1F7A55] rounded border border-[#CBE4D6] bg-[#EDF3EC] px-2 py-0.5">
                          Score: {resp.scores.overall}/10
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-[#1A1918] leading-relaxed">
                        {resp.questionPrompt}
                      </div>

                      {resp.codeSubmitted && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-mono text-[#6E6B65]">
                            Submitted Code ({resp.language || "Code"}):
                          </div>
                          <pre className="rounded-lg bg-[#1A1918] text-[#FAF8F5] p-4 text-xs font-mono overflow-x-auto leading-relaxed">
                            {resp.codeSubmitted}
                          </pre>
                        </div>
                      )}

                      {resp.userAnswer && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-mono text-[#6E6B65]">
                            Candidate Reasoning:
                          </div>
                          <div className="rounded-lg bg-[#FAF8F5] border border-[#E5E2DA] p-3.5 text-xs text-[#33312E] font-mono leading-relaxed whitespace-pre-wrap">
                            {resp.userAnswer}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs font-mono">
                        <div className="border border-[#E5E2DA] bg-[#FAF8F5] rounded p-2">
                          <div className="text-[10px] text-[#6E6B65]">Relevance</div>
                          <div className="font-bold text-[#1A1918] mt-0.5">
                            {resp.scores.relevance}/10
                          </div>
                        </div>
                        <div className="border border-[#E5E2DA] bg-[#FAF8F5] rounded p-2">
                          <div className="text-[10px] text-[#6E6B65]">Depth</div>
                          <div className="font-bold text-[#1A1918] mt-0.5">
                            {resp.scores.depth}/10
                          </div>
                        </div>
                        <div className="border border-[#E5E2DA] bg-[#FAF8F5] rounded p-2">
                          <div className="text-[10px] text-[#6E6B65]">Clarity</div>
                          <div className="font-bold text-[#1A1918] mt-0.5">
                            {resp.scores.clarity}/10
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-[#55524C] pt-2 border-t border-[#E5E2DA] leading-relaxed">
                        <span className="font-semibold text-[#1A1918]">
                          Evaluator Feedback:{" "}
                        </span>
                        {resp.feedback}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
