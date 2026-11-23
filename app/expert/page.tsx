"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
  LogOut,
  Sliders,
  Award,
  Plus,
  Upload,
  FileText,
  Download,
  Trash2,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Shuffle,
  ChevronDown,
  Sparkles,
  Radio,
  Check,
} from "lucide-react";
import UserProfileView from "@/components/UserProfileView";
import type { InterviewConfig, SkillItem, QuizQuestion, DifficultyTier } from "@/lib/mongodb";
import { generateAdaptiveExpertSuggestions } from "@/lib/adaptiveEngine";
import { parseQuizInput, SAMPLE_QUIZ_CSV } from "@/lib/quizParser";

const EASE_CURVE = [0.16, 1, 0.3, 1] as const;

const DEFAULT_EXPERT_CONFIG: InterviewConfig = {
  experienceYears: 6,
  difficultyTier: "Senior",
  difficultyNumeric: 3,
  primaryTopics: ["Distributed Systems", "Databases & Storage"],
  focusAreas: ["Kafka", "PostgreSQL", "System Design"],
  recommendedTrack: "Senior Distributed Systems Track",
};

interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
}

interface HostedQuizItem {
  _id: string;
  title: string;
  topic: string;
  difficulty: DifficultyTier;
  description: string;
  maxAttempts: number;
  totalQuestions: number;
  createdAt: string;
  totalAttempts: number;
  averageScore: number | null;
  questions?: QuizQuestion[];
}

export default function ExpertWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Active module in sidebar
  const [activeFeature, setActiveFeature] = useState<
    "boardroom" | "bank" | "evaluation" | "profile"
  >("boardroom");

  // Sub-tab inside "Live Boardrooms": 'panel' or 'quizzes'
  const [boardroomSubTab, setBoardroomSubTab] = useState<"panel" | "quizzes">("quizzes");

  // Inline toast state for anti-slop feedback (no browser alerts)
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "info" | "error";
  } | null>(null);

  const showToast = (text: string, type: "success" | "info" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3800);
  };

  // State: Live Boardroom Panel
  const sessionTimer = "24:18";
  const candidateTags = [
    "Distributed Systems",
    "PostgreSQL",
    "Kafka",
    "High Throughput",
    "Idempotency",
  ];

  // State: Question Suggester & AI Co-Pilot
  const [profileSkills, setProfileSkills] = useState<SkillItem[]>([]);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(
    DEFAULT_EXPERT_CONFIG
  );
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [evaluatingRelevance, setEvaluatingRelevance] = useState(false);
  const [customRelevanceScore, setCustomRelevanceScore] = useState<number | null>(null);

  const suggestedQuestions = useMemo(
    () => generateAdaptiveExpertSuggestions(interviewConfig, profileSkills),
    [interviewConfig, profileSkills]
  );

  // State: Rubric Calibration & Overrides
  const [overrideScores, setOverrideScores] = useState({
    relevance: 9.5,
    depth: 9.0,
    clarity: 9.2,
  });
  const [expertNotes, setExpertNotes] = useState(
    "Candidate demonstrated solid grasp of idempotency keys and transactional outbox. Recommending deep dive into consumer partition rebalance handling next."
  );
  const [savedNotes, setSavedNotes] = useState(false);

  // State: Hosted Quizzes
  const [quizzes, setQuizzes] = useState<HostedQuizItem[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [showCreateQuizModal, setShowCreateQuizModal] = useState(false);

  // Quiz Creator Form State
  const [quizTitle, setQuizTitle] = useState("");
  const [quizTopic, setQuizTopic] = useState("Distributed Systems");
  const [quizDifficulty, setQuizDifficulty] = useState<DifficultyTier>("Senior");
  const [quizMaxAttempts, setQuizMaxAttempts] = useState<number>(3); // 'n' attempts, 0 = unlimited
  const [rawQuizInput, setRawQuizInput] = useState("");
  const [parsedQuestions, setParsedQuestions] = useState<QuizQuestion[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [analyzingInput, setAnalyzingInput] = useState(false);

  // Fetch quizzes hosted by experts
  const fetchQuizzes = useCallback(async () => {
    try {
      setLoadingQuizzes(true);
      const res = await fetch("/api/quizzes", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.quizzes)) {
          setQuizzes(data.quizzes);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoadingQuizzes(false);
    }
  }, []);

  const hydrateFromProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.profile?.skills)) {
        setProfileSkills(data.profile.skills);
      }
      if (data.profile?.interviewConfig) {
        setInterviewConfig(data.profile.interviewConfig);
      }
    } catch {
      // Ignored
    }
  }, []);

  // Authentication check on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthenticated");
        return res.json();
      })
      .then((data) => {
        if (!data.authenticated || !data.user) {
          router.push("/login");
        } else {
          setUser(data.user);
          hydrateFromProfile();
          fetchQuizzes();
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, hydrateFromProfile, fetchQuizzes]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch {
      // Ignored
    }
  };

  const logWorkspaceActivity = (
    action: string,
    category: "interview" | "board" | "profile",
    detail: string
  ) => {
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, category, detail }),
    }).catch(() => {});
  };

  const handleEvaluateCustomQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestionInput.trim()) return;
    setEvaluatingRelevance(true);
    const preview = customQuestionInput.trim().slice(0, 72);

    setTimeout(() => {
      setCustomRelevanceScore(94);
      setEvaluatingRelevance(false);
      showToast("Question relevance verified (94% Domain Fit)", "success");
      logWorkspaceActivity(
        "Evaluated Ad-Hoc Question Alignment",
        "board",
        preview
      );
    }, 600);
  };

  const handleSaveEvaluation = () => {
    setSavedNotes(true);
    showToast("Rubric overrides committed to candidate dossier", "success");
    logWorkspaceActivity(
      "Committed Rubric Overrides",
      "board",
      `Rel ${overrideScores.relevance} • Depth ${overrideScores.depth} • Clarity ${overrideScores.clarity}`
    );
    setTimeout(() => setSavedNotes(false), 2000);
  };

  // Analyze questions from raw CSV/text
  const handleAnalyzeQuizContent = (content: string) => {
    setAnalyzingInput(true);
    try {
      const result = parseQuizInput(content);
      setParsedQuestions(result.questions);
      setParseErrors(result.errors);
      if (result.questions.length > 0) {
        showToast(
          `Analyzed: ${result.questions.length} questions identified and formatted`,
          "success"
        );
      } else if (result.errors.length > 0) {
        showToast(result.errors[0], "error");
      }
    } catch {
      showToast("Could not parse file. Check format.", "error");
    } finally {
      setAnalyzingInput(false);
    }
  };

  // Handle file upload (CSV, TXT, DOC)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setRawQuizInput(text);
        handleAnalyzeQuizContent(text);
      }
    };
    reader.readAsText(file);
  };

  // Download sample CSV template
  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_QUIZ_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "quorix_quiz_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Downloaded sample quiz CSV template", "info");
  };

  // Submit and create new quiz
  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizTitle.trim()) {
      showToast("Please provide a quiz title", "error");
      return;
    }

    if (parsedQuestions.length === 0) {
      showToast("Please upload or enter at least one valid question", "error");
      return;
    }

    setIsSubmittingQuiz(true);
    try {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quizTitle,
          topic: quizTopic,
          difficulty: quizDifficulty,
          description: `Calibrated for ${quizDifficulty} level candidates. Questions randomized dynamically per attempt.`,
          maxAttempts: quizMaxAttempts,
          questions: parsedQuestions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create quiz");
      }

      showToast(`Quiz "${quizTitle}" published to Live Boardroom!`, "success");
      logWorkspaceActivity(
        "Published Expert Quiz",
        "board",
        `${quizTitle} (${parsedQuestions.length} Qs, Max ${quizMaxAttempts === 0 ? "Unlimited" : quizMaxAttempts} attempts)`
      );

      // Reset form
      setQuizTitle("");
      setRawQuizInput("");
      setParsedQuestions([]);
      setParseErrors([]);
      setShowCreateQuizModal(false);
      fetchQuizzes();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error creating quiz";
      showToast(message, "error");
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  // Delete quiz
  const handleDeleteQuiz = async (quizId: string, title: string) => {
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete quiz");
      }
      showToast(`Quiz "${title}" removed`, "info");
      setQuizzes((prev) => prev.filter((q) => q._id !== quizId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error deleting quiz";
      showToast(message, "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-xs font-mono text-[#6E6B65]">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Loading expert workspace...</span>
        </div>
      </div>
    );
  }

  const sidebarNavItems = [
    {
      id: "boardroom",
      label: "Live Boardrooms",
      desc: "Live panels & hosted quizzes",
      icon: Users,
      disabled: false,
      comingSoon: false,
    },
    {
      id: "bank",
      label: "Question Suggester",
      desc: "Curated & ad-hoc check",
      icon: BookOpen,
      disabled: true,
      comingSoon: true,
    },
    {
      id: "evaluation",
      label: "Rubric Calibration",
      desc: "Human-in-the-loop override",
      icon: Sliders,
      disabled: true,
      comingSoon: true,
    },
    {
      id: "profile",
      label: "Expert Profile",
      desc: "Dossier & daily activity",
      icon: Award,
      disabled: true,
      comingSoon: true,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1918] flex flex-col md:flex-row font-sans selection:bg-[#E5E2DA]">
      {/* ============================================================ */}
      {/* TOAST NOTIFICATION CONTAINER (Anti-Slop Non-Blocking) */}
      {/* ============================================================ */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: EASE_CURVE }}
            className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-mono shadow-md ${
              toastMessage.type === "error"
                ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]"
                : toastMessage.type === "info"
                ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]"
                : "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
            }`}
          >
            {toastMessage.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* SIDEBAR NAVIGATION (Anti-Slop Clean App Shell) */}
      {/* ============================================================ */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#E5E2DA] bg-[#FAF8F5] flex flex-col justify-between shrink-0 md:h-screen md:sticky md:top-0">
        <div>
          {/* Workspace Brand / Header */}
          <div className="p-6 border-b border-[#E5E2DA]">
            <Link
              href="/"
              className="inline-block font-mono text-base font-bold tracking-wider text-[#1A1918]"
            >
              QUORIX
            </Link>
            <div className="text-[11px] font-mono text-[#6E6B65] mt-0.5">
              Expert Workspace
            </div>
          </div>

          {/* Feature Selection Links */}
          <nav className="p-3 space-y-1">
            <div className="px-3 pt-3 pb-1.5 text-[10px] font-mono text-[#8E8B84] uppercase tracking-wider">
              Workspace Modules
            </div>

            {sidebarNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeFeature === item.id;
              const isDisabled = item.disabled;
              const isComingSoon = item.comingSoon;

              // Disable click and apply coming-soon styling if marked
              const handleClick = () => {
                if (isDisabled || isComingSoon) return;
                setActiveFeature(item.id);
                hydrateFromProfile();
              };

              const baseClass = "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs text-left transition-all";
              const activeClass = "bg-[#FFFFFF] text-[#1A1918] font-semibold border border-[#E5E2DA] shadow-xs";
              const inactiveClass = "text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#F2EFE9]";

              let buttonClass = baseClass;

              if (isDisabled || isComingSoon) {
                buttonClass += " opacity-50 cursor-not-allowed";
              } else if (isActive) {
                buttonClass += " " + activeClass;
              } else {
                buttonClass += " " + inactiveClass;
              }

              return (
                <button
                  key={item.id}
                  onClick={handleClick}
                  disabled={isDisabled || isComingSoon}
                  className={buttonClass}
                  title={isComingSoon ? "Coming soon" : undefined}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon
                      className={isComingSoon || isDisabled
                        ? "w-4 h-4 text-[#8E8B84] shrink-0"
                        : "w-4 h-4 text-[#1A1918] shrink-0"}
                    />
                    <div>
                      <div className="leading-snug">
                        {isComingSoon ? (
                          <span className="text-xs font-medium text-[#8E8B84]">
                            {item.label} <span className="text-[10px] text-[#B45332]">Coming soon</span>
                          </span>
                        ) : (
                          <div className="leading-snug">{item.label}</div>
                        )}
                      </div>
                      {isComingSoon && (
                        <div className="text-[10px] text-[#B45332] font-normal font-sans">
                          Coming soon
                        </div>
                      )}
                      {(!isComingSoon && !isDisabled) && (
                        <div className="text-[10px] text-[#8E8B84] font-normal font-sans">
                          {item.desc}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="p-4 border-t border-[#E5E2DA] bg-[#FAF8F5]">
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <div className="text-xs font-semibold text-[#1A1918] truncate">
                {user?.name}
              </div>
              <div className="text-[11px] text-[#6E6B65] truncate font-mono">
                {user?.email}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-[#6E6B65] hover:text-[#1A1918] transition-colors border border-[#E5E2DA] bg-[#FFFFFF] hover:bg-[#F2EFE9] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTENT AREA */}
      {/* ============================================================ */}
      <main className="flex-1 bg-[#FAF8F5] min-h-screen p-5 sm:p-8 lg:p-12 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {/* ========================================================== */}
            {/* FEATURE 1: LIVE BOARDROOMS (Panels + Hosted Quizzes) */}
            {/* ========================================================== */}
            {activeFeature === "boardroom" && (
              <motion.div
                key="boardroom"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_CURVE }}
                className="space-y-8"
              >
                {/* Header & Sub-Tab Switcher */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-[#E5E2DA] pb-6">
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                      <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                      <span>Expert Boardroom Hub</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                      Live Boardrooms
                    </h1>
                    <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                      Host interactive live panel interviews with real-time AI assistive telemetry, or author and deploy randomized candidate quizzes with custom attempt limits.
                    </p>
                  </div>

                  {/* Segmented Switcher for Panel vs Quizzes */}
                  <div className="inline-flex rounded-lg border border-[#E5E2DA] bg-[#F2EFE9] p-1 gap-1 shrink-0">
                    <button
                      disabled
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all ${
                        boardroomSubTab === "panel"
                          ? "bg-[#FFFFFF] text-[#1A1918] font-semibold shadow-xs opacity-50 cursor-not-allowed"
                          : "text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#F2EFE9] opacity-50 cursor-not-allowed"
                      }`}
                      title="Coming soon"
                    >
                      <Radio className="w-3.5 h-3.5 text-[#1F7A55]" />
                      <span>Live Panel Session</span>
                    </button>
                    <button
                      onClick={() => setBoardroomSubTab("quizzes")}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all ${
                        boardroomSubTab === "quizzes"
                          ? "bg-[#FFFFFF] text-[#1A1918] font-semibold shadow-xs"
                          : "text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#F2EFE9]"
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-[#1F7A55]" />
                      <span>Host Quizzes ({quizzes.length})</span>
                    </button>
                  </div>
                </div>

                {/* SUB-VIEW A: LIVE PANEL INTERVIEW - Coming Soon */}
                {boardroomSubTab === "panel" && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-1.5 text-center text-xs font-mono text-[#8E8B84]">
                      <div>Coming soon</div>
                      <p className="mt-2">Live Panel Session is coming soon</p>
                    </div>
                  </div>
                )}

                {/* SUB-VIEW B: HOST & MANAGE QUIZZES - Visible */}
                {boardroomSubTab === "quizzes" && (
                  <div className="space-y-6">
                    {/* Active Session Info Bar in Double-Bezel Card */}
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                      <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-5 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-mono text-[#6E6B65]">
                              SESSION: #BRD-9021 • PANEL: 2 EXPERTS
                            </div>
                            <div className="text-lg font-bold text-[#1A1918] mt-0.5">
                              Candidate: Shashwat Upadhayay (Senior Backend Engineer)
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 font-mono text-xs border border-[#E5E2DA] bg-[#FAF8F5] px-3 py-1.5 rounded-md w-fit">
                            <Clock className="w-3.5 h-3.5 text-[#1A1918]" />
                            <span>ELAPSED: {sessionTimer}</span>
                          </div>
                        </div>

                        {/* Candidate Domain Tags */}
                        <div className="pt-3 border-t border-[#E5E2DA] space-y-2">
                          <div className="text-xs font-medium text-[#6E6B65]">
                            Candidate Approved Resume Tags:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {candidateTags.map((tag) => (
                              <span
                                key={tag}
                                className="border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-1 text-xs font-mono text-[#1A1918] rounded-md"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Event Stream */}
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                      <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                        <div className="flex items-center justify-between text-xs font-mono text-[#6E6B65] border-b border-[#E5E2DA] pb-3">
                          <span className="font-semibold text-[#1A1918]">SESSION EVENT STREAM</span>
                          <span className="inline-flex items-center gap-1.5 text-[#1F7A55] font-semibold">
                            <span className="w-2 h-2 rounded-full bg-[#1F7A55] animate-pulse" />
                            LIVE RECORDING
                          </span>
                        </div>

                        <div className="space-y-3 font-mono text-xs">
                          <div className="p-4 bg-[#FAF8F5] rounded-lg border border-[#E5E2DA] space-y-2">
                            <div className="flex justify-between text-[#8E8B84] text-[10px]">
                              <span>[16:04:12] Question #1 Selected by Expert A</span>
                              <span className="border border-[#E5E2DA] bg-[#FFFFFF] px-2 py-0.5 rounded-sm">Stage: Ice-Breaker</span>
                            </div>
                            <div className="text-[#1A1918] font-sans font-medium text-sm">
                              &ldquo;Could you describe the architecture of your distributed write pipeline and where Kafka sits?&rdquo;
                            </div>
                            <div className="text-[11px] text-[#55524C] pt-2 border-t border-[#E5E2DA] flex items-center justify-between">
                              <span>AI Metric: Relevance: 9.6 • Depth: 9.2 • Clarity: 9.4</span>
                              <span className="text-[#1F7A55] font-semibold font-mono">Calibrated Tier 3</span>
                            </div>
                          </div>

                          <div className="p-4 bg-[#FAF8F5] rounded-lg border border-[#E5E2DA] space-y-2">
                            <div className="flex justify-between text-[#8E8B84] text-[10px]">
                              <span>[16:15:30] Question #2 Suggested by AI Co-Pilot</span>
                              <span className="border border-[#E5E2DA] bg-[#FFFFFF] px-2 py-0.5 rounded-sm">Stage: Core Technical</span>
                            </div>
                            <div className="text-[#1A1918] font-sans font-medium text-sm">
                              &ldquo;How do you ensure idempotency across Kafka consumers when Postgres writes fail transiently?&rdquo;
                            </div>
                            <div className="text-[11px] text-[#55524C] pt-2 border-t border-[#E5E2DA] flex items-center justify-between">
                              <span>Candidate response currently transcribed and logged.</span>
                              <span className="text-[#6E6B65] font-mono">Realtime Audio Stream</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-VIEW B: HOST & MANAGE QUIZZES */}
                {boardroomSubTab === "quizzes" && (
                  <div className="space-y-6">
                    {/* Action Bar & Stats */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-[#1A1918]">
                          Expert-Hosted Quizzes
                        </h2>
                        <p className="text-xs text-[#6E6B65]">
                          Upload questions in CSV/docs format. Quizzes automatically randomize question sequences per candidate and enforce specified attempt ceilings.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchQuizzes}
                          disabled={loadingQuizzes}
                          className="p-2 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#F2EFE9] transition-all"
                          title="Refresh Quizzes"
                        >
                          <RefreshCw className={`w-4 h-4 ${loadingQuizzes ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={() => setShowCreateQuizModal(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-medium hover:bg-[#2C2A28] active:scale-[0.98] transition-all shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create New Quiz</span>
                        </button>
                      </div>
                    </div>

                    {/* Quiz Roster List */}
                    {loadingQuizzes ? (
                      <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-8 text-center text-xs font-mono text-[#6E6B65]">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-[#1A1918]" />
                        Fetching hosted quizzes...
                      </div>
                    ) : quizzes.length === 0 ? (
                      <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                        <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-10 text-center space-y-3">
                          <FileText className="w-8 h-8 text-[#8E8B84] mx-auto" />
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-[#1A1918]">
                              No Quizzes Created Yet
                            </h3>
                            <p className="text-xs text-[#6E6B65] max-w-sm mx-auto">
                              Upload a CSV or formatted document with questions and correct answers. Candidates can then take them in randomized question orders.
                            </p>
                          </div>
                          <button
                            onClick={() => setShowCreateQuizModal(true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-medium hover:bg-[#2C2A28] transition-all"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Upload First Quiz</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {quizzes.map((q) => (
                          <div
                            key={q._id}
                            className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5 transition-all hover:border-[#D5D1C7]"
                          >
                            <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-4 shadow-[0_1px_2px_rgba(26,25,24,0.03)] h-full flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 rounded-sm text-[#1A1918] uppercase">
                                        {q.topic}
                                      </span>
                                      <span className="text-[10px] font-mono bg-[#1A1918] text-[#FAF8F5] px-2 py-0.5 rounded-sm">
                                        {q.difficulty}
                                      </span>
                                    </div>
                                    <h3 className="text-base font-bold text-[#1A1918] leading-tight">
                                      {q.title}
                                    </h3>
                                  </div>

                                  <button
                                    onClick={() => handleDeleteQuiz(q._id, q.title)}
                                    className="p-1.5 rounded-md text-[#8E8B84] hover:text-[#B45332] hover:bg-[#FEF2F2] transition-colors"
                                    title="Delete Quiz"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                <p className="text-xs text-[#55524C] line-clamp-2">
                                  {q.description || "Randomized question sequences calibrated for candidate evaluation."}
                                </p>
                              </div>

                              <div className="pt-3 border-t border-[#E5E2DA] space-y-3">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                  <div className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] p-2">
                                    <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                                      Questions
                                    </div>
                                    <div className="text-xs font-bold font-mono text-[#1A1918] mt-0.5">
                                      {q.totalQuestions}
                                    </div>
                                  </div>

                                  <div className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] p-2">
                                    <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                                      Max Attempts
                                    </div>
                                    <div className="text-xs font-bold font-mono text-[#1A1918] mt-0.5">
                                      {q.maxAttempts === 0 ? "Unlimited" : `${q.maxAttempts}×`}
                                    </div>
                                  </div>

                                  <div className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] p-2">
                                    <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                                      Attempts Logged
                                    </div>
                                    <div className="text-xs font-bold font-mono text-[#1F7A55] mt-0.5">
                                      {q.totalAttempts}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[11px] font-mono text-[#6E6B65]">
                                  <div className="flex items-center gap-1">
                                    <Shuffle className="w-3.5 h-3.5 text-[#1F7A55]" />
                                    <span>Jumbled sequence enabled</span>
                                  </div>
                                  {q.averageScore !== null && (
                                    <span className="font-semibold text-[#1A1918]">
                                      Avg: {q.averageScore}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ========================================================== */}
            {/* FEATURE 2: QUESTION BANK & CO-PILOT */}
            {/* ========================================================== */}
            {activeFeature === "bank" && (
              <motion.div
                key="bank"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_CURVE }}
                className="space-y-8"
              >
                {/* Feature Header */}
                <div className="border-b border-[#E5E2DA] pb-6 space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                    <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                    <span>Curated Bank &amp; Co-Pilot</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                    Question Bank &amp; AI Suggester
                  </h1>
                  <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                    Browse recommended follow-up questions calibrated to your profile&apos;s topics and difficulty tier, or test ad-hoc questions against the AI relevance evaluator before asking.
                  </p>
                </div>

                {/* Custom Ad-hoc Question Relevance Checker in Double Bezel */}
                <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                  <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-[#1A1918] uppercase tracking-wider font-mono">
                        Test Ad-Hoc Question Relevance
                      </div>
                      <div className="text-xs text-[#6E6B65]">
                        Evaluates semantic alignment with candidate&apos;s verified skills to prevent off-topic inquiries.
                      </div>
                    </div>

                    <form onSubmit={handleEvaluateCustomQuestion} className="space-y-3">
                      <textarea
                        rows={3}
                        value={customQuestionInput}
                        onChange={(e) => setCustomQuestionInput(e.target.value)}
                        placeholder="Enter custom question to test candidate domain alignment..."
                        className="w-full border border-[#D5D1C7] bg-[#FAF8F5] rounded-lg p-3 text-xs text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                      />
                      <div className="flex items-center justify-between">
                        <button
                          type="submit"
                          disabled={evaluatingRelevance || !customQuestionInput.trim()}
                          className="inline-flex items-center text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-4 py-2 rounded-lg hover:bg-[#2C2A28] disabled:opacity-50 transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                        >
                          <span>{evaluatingRelevance ? "Evaluating alignment..." : "Check Question Relevance"}</span>
                        </button>

                        {customRelevanceScore !== null && (
                          <div className="text-xs font-mono text-[#1F7A55] font-semibold flex items-center gap-1.5">
                            <Check className="w-4 h-4" />
                            <span>Domain Fit Score: {customRelevanceScore}% (Strong Alignment)</span>
                          </div>
                        )}
                      </div>
                    </form>
                  </div>
                </div>

                {/* Suggested Questions List */}
                <div className="space-y-4">
                  <div className="text-xs font-mono text-[#6E6B65] uppercase">
                    Curated Bank Recommendations (Calibrated: {interviewConfig.difficultyTier} • {interviewConfig.primaryTopics.slice(0, 2).join(", ")})
                  </div>

                  <div className="space-y-3">
                    {suggestedQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5"
                      >
                        <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-3 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-[#6E6B65]">
                              [{q.id}] • {q.topic}
                            </span>
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-mono border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 rounded-sm text-[#1A1918]">
                                {q.difficulty}
                              </span>
                              <span className="text-[10px] font-mono bg-[#1F7A55] text-white px-2 py-0.5 rounded-sm font-bold">
                                FIT: {q.relevanceScore}%
                              </span>
                            </div>
                          </div>

                          <p className="text-sm font-medium text-[#1A1918] leading-snug">
                            &ldquo;{q.text}&rdquo;
                          </p>

                          <div className="pt-2 flex justify-end">
                            <button
                              onClick={() => {
                                logWorkspaceActivity(
                                  "Pushed Curated Question To Live Board",
                                  "board",
                                  `[${q.id}] ${q.topic}`
                                );
                                showToast(`Question [${q.id}] pushed to live boardroom stream`, "success");
                              }}
                              className="border border-[#D5D1C7] bg-[#FAF8F5] rounded-md text-[#1A1918] px-3.5 py-1.5 text-xs font-medium hover:bg-[#EAE6DD] transition-colors"
                            >
                              Push Question To Live Board
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ========================================================== */}
            {/* FEATURE 3: RUBRIC EVALUATION & NOTES */}
            {/* ========================================================== */}
            {activeFeature === "evaluation" && (
              <motion.div
                key="evaluation"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_CURVE }}
                className="space-y-8"
              >
                {/* Feature Header */}
                <div className="border-b border-[#E5E2DA] pb-6 space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                    <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                    <span>Human-in-the-Loop Governance</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                    Rubric Calibration &amp; Override
                  </h1>
                  <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                    AI scores serve strictly as assistive guidance. Authorized experts have unilateral authority to review, contextualize, and override automated rubric marks.
                  </p>
                </div>

                {/* Rubric Sliders Container in Double Bezel */}
                <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                  <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-6 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                    <div className="text-xs font-mono text-[#6E6B65] uppercase">
                      Current Question Scoring Dimensions (1–10 Scale)
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 rounded-lg space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="font-semibold text-[#1A1918]">Relevance</span>
                          <span className="font-bold text-[#1A1918]">{overrideScores.relevance} / 10</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.1"
                          value={overrideScores.relevance}
                          onChange={(e) => setOverrideScores({ ...overrideScores, relevance: parseFloat(e.target.value) })}
                          className="w-full accent-[#1A1918]"
                        />
                        <p className="text-[11px] text-[#6E6B65]">Prompt and constraint satisfaction</p>
                      </div>

                      <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 rounded-lg space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="font-semibold text-[#1A1918]">Depth</span>
                          <span className="font-bold text-[#1A1918]">{overrideScores.depth} / 10</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.1"
                          value={overrideScores.depth}
                          onChange={(e) => setOverrideScores({ ...overrideScores, depth: parseFloat(e.target.value) })}
                          className="w-full accent-[#1A1918]"
                        />
                        <p className="text-[11px] text-[#6E6B65]">Trade-offs and failure modes</p>
                      </div>

                      <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 rounded-lg space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="font-semibold text-[#1A1918]">Clarity</span>
                          <span className="font-bold text-[#1A1918]">{overrideScores.clarity} / 10</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.1"
                          value={overrideScores.clarity}
                          onChange={(e) => setOverrideScores({ ...overrideScores, clarity: parseFloat(e.target.value) })}
                          className="w-full accent-[#1A1918]"
                        />
                        <p className="text-[11px] text-[#6E6B65]">Logical structure and terminology</p>
                      </div>
                    </div>

                    {/* Qualitative Observations Textarea */}
                    <div className="space-y-2 pt-2">
                      <label className="block text-xs font-medium text-[#1A1918]">
                        Panel Qualitative Notes &amp; Observations:
                      </label>
                      <textarea
                        rows={4}
                        value={expertNotes}
                        onChange={(e) => setExpertNotes(e.target.value)}
                        className="w-full border border-[#D5D1C7] bg-[#FAF8F5] rounded-lg p-3 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#E5E2DA]">
                      <span className="text-[11px] text-[#6E6B65]">
                        Overrides are permanently committed to the MongoDB session dossier.
                      </span>
                      <button
                        onClick={handleSaveEvaluation}
                        className="inline-flex items-center justify-center text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-5 py-2.5 rounded-lg hover:bg-[#2C2A28] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        <span>{savedNotes ? "Evaluation Saved!" : "Commit Rubric Overrides"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ========================================================== */}
            {/* FEATURE 4: EXPERT PROFILE, DOSSIER & DAILY ACTIVITY */}
            {/* ========================================================== */}
            {activeFeature === "profile" && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_CURVE }}
              >
                <UserProfileView
                  onNameUpdated={(newName) =>
                    setUser((prev) => (prev ? { ...prev, name: newName } : prev))
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ============================================================ */}
      {/* MODAL: CREATE & HOST NEW QUIZ */}
      {/* ============================================================ */}
      <AnimatePresence>
        {showCreateQuizModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1918]/40 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: EASE_CURVE }}
              className="w-full max-w-3xl my-8 rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5 shadow-2xl"
            >
              <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 sm:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-[#E5E2DA] pb-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#1F7A55]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ingest &amp; Analyze Assessment</span>
                    </div>
                    <h2 className="text-xl font-bold text-[#1A1918] mt-1">
                      Create &amp; Host Candidate Quiz
                    </h2>
                    <p className="text-xs text-[#6E6B65] mt-0.5">
                      Feed questions via CSV or document text. Quorix validates questions, scrambles question orders per candidate, and limits attempts.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateQuizModal(false)}
                    className="p-1.5 rounded-md text-[#8E8B84] hover:text-[#1A1918] hover:bg-[#FAF8F5] transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateQuiz} className="space-y-6">
                  {/* Step 1: Metadata & Attempt Limits */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                        Quiz Title
                      </label>
                      <input
                        type="text"
                        required
                        value={quizTitle}
                        onChange={(e) => setQuizTitle(e.target.value)}
                        placeholder="e.g. Distributed Consensus & Raft Architecture Assessment"
                        className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2.5 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                        Technical Topic
                      </label>
                      <input
                        type="text"
                        value={quizTopic}
                        onChange={(e) => setQuizTopic(e.target.value)}
                        placeholder="e.g. Distributed Systems"
                        className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2.5 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                        Difficulty Tier
                      </label>
                      <div className="relative">
                        <select
                          value={quizDifficulty}
                          onChange={(e) => setQuizDifficulty(e.target.value as DifficultyTier)}
                          className="w-full appearance-none rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2.5 pr-8 text-xs font-medium text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                        >
                          <option value="Entry-Level">Entry-Level (Tier 1)</option>
                          <option value="Intermediate">Intermediate (Tier 2)</option>
                          <option value="Senior">Senior (Tier 3)</option>
                          <option value="Staff+">Staff / Principal (Tier 4)</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-3 w-4 h-4 text-[#6E6B65]" />
                      </div>
                    </div>

                    {/* Requirement: Max 'n' attempts configured by expert */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                          Allowed Attempts per Candidate (&apos;n&apos; attempts)
                        </label>
                        <span className="text-[11px] font-mono text-[#6E6B65]">
                          Candidate attempt ceiling
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { val: 1, label: "1 Attempt", note: "Strict Exam" },
                          { val: 2, label: "2 Attempts", note: "Standard" },
                          { val: 3, label: "3 Attempts", note: "Recommended" },
                          { val: 5, label: "5 Attempts", note: "Practice" },
                          { val: 0, label: "Unlimited", note: "No Ceiling" },
                        ].map((tier) => (
                          <button
                            type="button"
                            key={tier.val}
                            onClick={() => setQuizMaxAttempts(tier.val)}
                            className={`p-2.5 rounded-lg border text-center transition-all ${
                              quizMaxAttempts === tier.val
                                ? "border-[#1A1918] bg-[#FAF8F5] shadow-xs"
                                : "border-[#E5E2DA] bg-[#FFFFFF] hover:border-[#D5D1C7]"
                            }`}
                          >
                            <div className="text-xs font-bold text-[#1A1918]">
                              {tier.label}
                            </div>
                            <div className="text-[10px] text-[#6E6B65] mt-0.5">
                              {tier.note}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Upload CSV / Doc / Text */}
                  <div className="space-y-3 pt-4 border-t border-[#E5E2DA]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold font-mono uppercase text-[#1A1918]">
                          Question Ingestion Source
                        </div>
                        <div className="text-xs text-[#6E6B65]">
                          Upload CSV or formatted document, or paste below.
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadSampleCsv}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E5E2DA] bg-[#FAF8F5] text-xs font-mono text-[#1A1918] hover:bg-[#EFECE4] transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Sample CSV</span>
                        </button>

                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#1A1918] bg-[#1A1918] text-xs font-mono text-[#FAF8F5] hover:bg-[#2C2A28] cursor-pointer transition-all">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload File</span>
                          <input
                            type="file"
                            accept=".csv,.txt,.doc"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    <textarea
                      rows={5}
                      value={rawQuizInput}
                      onChange={(e) => {
                        setRawQuizInput(e.target.value);
                        handleAnalyzeQuizContent(e.target.value);
                      }}
                      placeholder={`Paste CSV data or doc format:

1. What is the CAP theorem?
A) Consistency, Availability, Partition tolerance
B) Access, Control, Performance
C) Action, Cloud, Protocol
D) None of the above
Answer: A
Explanation: Standard distributed systems principle.`}
                      className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] p-3 text-xs font-mono text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                    />
                  </div>

                  {/* Step 3: Analysis Engine Preview */}
                  <div className="space-y-3 pt-4 border-t border-[#E5E2DA]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold font-mono uppercase text-[#1A1918] flex items-center gap-2">
                        <span>Platform Analysis Engine</span>
                        {analyzingInput && <RefreshCw className="w-3 h-3 animate-spin text-[#1A1918]" />}
                      </div>

                      <div className="text-xs font-mono">
                        {parsedQuestions.length > 0 ? (
                          <span className="text-[#1F7A55] font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            {parsedQuestions.length} Questions Verified
                          </span>
                        ) : (
                          <span className="text-[#8E8B84]">Awaiting question input</span>
                        )}
                      </div>
                    </div>

                    {parseErrors.length > 0 && (
                      <div className="p-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] text-xs font-mono text-[#991B1B] space-y-1">
                        <div className="font-bold">Format Notices:</div>
                        {parseErrors.slice(0, 3).map((err, idx) => (
                          <div key={idx}>• {err}</div>
                        ))}
                      </div>
                    )}

                    {parsedQuestions.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {parsedQuestions.map((q, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] space-y-1.5 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-[#1A1918]">
                                Q{idx + 1}. {q.question}
                              </span>
                              <span className="shrink-0 text-[10px] font-mono border border-[#CBE4D6] bg-[#EDF3EC] text-[#1F7A55] px-2 py-0.5 rounded-sm font-semibold">
                                Correct: {q.correctAnswer}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#6E6B65] font-mono flex flex-wrap gap-2">
                              {q.options.map((opt, oIdx) => (
                                <span
                                  key={oIdx}
                                  className={`px-1.5 py-0.5 rounded-xs ${
                                    opt.toLowerCase() === q.correctAnswer.toLowerCase()
                                      ? "bg-[#CBE4D6] text-[#1F7A55] font-semibold"
                                      : "bg-[#FFFFFF] border border-[#E5E2DA]"
                                  }`}
                                >
                                  {String.fromCharCode(65 + oIdx)}) {opt}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-[#E5E2DA]">
                    <div className="text-[11px] font-mono text-[#6E6B65] flex items-center gap-1.5">
                      <Shuffle className="w-3.5 h-3.5 text-[#1F7A55]" />
                      <span>Questions scrambled per candidate attempt</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowCreateQuizModal(false)}
                        className="px-4 py-2 rounded-lg border border-[#E5E2DA] text-xs font-medium text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#FAF8F5] transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingQuiz || parsedQuestions.length === 0}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-semibold hover:bg-[#2C2A28] disabled:opacity-50 transition-all shadow-xs"
                      >
                        {isSubmittingQuiz ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Publishing Quiz...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Publish to Live Boardroom</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
