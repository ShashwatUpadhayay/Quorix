"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Calendar,
  BarChart3,
  User,
  LogOut,
  X,
  Clock,
  ArrowRight,
  ShieldCheck,
  Eye,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Award,
  HelpCircle,
  Shuffle,
  FileText,
  RefreshCw,
  Loader2,
} from "lucide-react";
import UserProfileView from "@/components/UserProfileView";
import QuizResultsModal from "@/components/QuizResultsModal";
import type {
  DifficultyTier,
  InterviewConfig,
  InterviewType,
  MockSessionDoc,
  MockSessionResponse,
  SkillItem,
} from "@/lib/mongodb";
import { computeTopicCoverage } from "@/lib/adaptiveEngine";

interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
}

interface CandidateQuizItem {
  _id: string;
  expertId: string;
  expertName: string;
  title: string;
  topic: string;
  difficulty: DifficultyTier;
  description: string;
  maxAttempts: number;
  timeLimitMinutes: number;
  totalQuestions: number;
  createdAt: string;
  candidateAttemptsCount: number;
  bestScore: number | null;
  remainingAttempts: number | null;
  canAttempt: boolean;
}

interface ActiveQuizQuestion {
  id: string;
  question: string;
  options: string[];
}

interface ActiveQuizSession {
  _id: string;
  attemptId: string;
  startedAt: string;
  title: string;
  topic: string;
  difficulty: DifficultyTier;
  description: string;
  maxAttempts: number;
  timeLimitMinutes: number;
  attemptNumber: number;
  totalQuestions: number;
  questions: ActiveQuizQuestion[];
}

interface QuizSubmissionResult {
  attemptId: string;
  score: number;
  total: number;
  percentage: number;
  attemptNumber: number;
  maxAttempts: number;
  remainingAttempts: number | null;
  status: "completed" | "timed_out";
  timeSpentSeconds: number;
  breakdown: Array<{
    questionId: string;
    question: string;
    options: string[];
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation?: string;
  }>;
}

const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  experienceYears: 2,
  difficultyTier: "Intermediate",
  difficultyNumeric: 2,
  primaryTopics: ["Backend & APIs", "Databases & Storage"],
  focusAreas: ["REST APIs", "SQL", "System Design"],
  recommendedTrack: "Intermediate Backend & APIs Track",
};

const DIFFICULTY_TIERS: Array<{
  value: DifficultyTier;
  tier: string;
  desc: string;
}> = [
  { value: "Foundational", tier: "Tier 1", desc: "Core syntax & basic concepts" },
  { value: "Intermediate", tier: "Tier 2", desc: "Production trade-offs & scale" },
  { value: "Senior", tier: "Tier 3", desc: "Complex systems & failure modes" },
  { value: "Staff", tier: "Tier 4", desc: "Architecture & org-wide strategy" },
];

const INTERVIEW_TYPES: Array<{
  id: InterviewType;
  title: string;
  desc: string;
  available: boolean;
}> = [
  {
    id: "coding",
    title: "Coding & Algorithms",
    desc: "Data structures, algorithmic problem solving & live code editor",
    available: true,
  },
  {
    id: "technical",
    title: "Technical Systems",
    desc: "Framework internals, memory, concurrency & runtime mechanics",
    available: true,
  },
  {
    id: "system_design",
    title: "System Design",
    desc: "Architecture, APIs, data models, scale & reliability",
    available: true,
  },
  {
    id: "behavioral",
    title: "Behavioral & Leadership",
    desc: "STAR methodology, high-stakes incidents & trade-off decisions",
    available: false,
  },
];

const POPULAR_FRAMEWORKS_AND_LANGUAGES = [
  "React",
  "Next.js",
  "Node.js",
  "TypeScript",
  "Go",
  "Python",
  "Java",
  "Rust",
  "PostgreSQL",
  "Kubernetes",
  "Docker",
  "AWS",
  "GraphQL",
  "FastAPI",
  "Distributed Systems",
];

const DURATION_OPTIONS = [
  { minutes: 15, label: "15 Mins", questions: "2 Questions", desc: "Quick sprint" },
  { minutes: 30, label: "30 Mins", questions: "3 Questions", desc: "Standard practice" },
  { minutes: 45, label: "45 Mins", questions: "4 Questions", desc: "In-depth loop" },
  { minutes: 60, label: "60 Mins", questions: "5 Questions", desc: "Full mock board" },
];

const EASE_CURVE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function CandidateWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Active module in sidebar
  const [activeFeature, setActiveFeature] = useState<
    "mock" | "boards" | "reports" | "profile"
  >("mock");

  // Profile-backed Skills & Interview Calibration
  const [profileSkills, setProfileSkills] = useState<SkillItem[]>([]);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(
    DEFAULT_INTERVIEW_CONFIG
  );

  // Progressive Mock Interview Setup State (dropdowns shown step-by-step)
  const [selectedInterviewType, setSelectedInterviewType] =
    useState<InterviewType | "">("");
  const [selectedLevel, setSelectedLevel] =
    useState<DifficultyTier | "">("");
  const [selectedFocus, setSelectedFocus] = useState<string>("");
  const [customFocusInput, setCustomFocusInput] = useState("");
  const [isCustomFocus, setIsCustomFocus] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [isLaunchingSession, setIsLaunchingSession] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Historical Mock Interview Sessions
  const [mockSessions, setMockSessions] = useState<MockSessionDoc[]>([]);
  const [selectedTranscriptSession, setSelectedTranscriptSession] =
    useState<MockSessionDoc | null>(null);

  // Inline feedback banners
  const [boardNotice, setBoardNotice] = useState<string | null>(null);

  // Boardrooms Sub-Tab: "panel" | "quizzes"
  const [boardSubTab] = useState<"panel" | "quizzes">("quizzes");

  // Candidate Quizzes State
  const [candidateQuizzes, setCandidateQuizzes] = useState<CandidateQuizItem[]>([]);
  const [loadingCandidateQuizzes, setLoadingCandidateQuizzes] = useState(false);
  const [resultsQuiz, setResultsQuiz] = useState<CandidateQuizItem | null>(null);

  // Active Quiz Runner State
  const [activeQuizModal, setActiveQuizModal] = useState<ActiveQuizSession | null>(null);
  const [activeQuizQuestionIdx, setActiveQuizQuestionIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizSubmissionResult | null>(null);
  const [quizRunnerError, setQuizRunnerError] = useState<string | null>(null);
  const [startingQuizId, setStartingQuizId] = useState<string | null>(null);
  const [quizClockNow, setQuizClockNow] = useState<number | null>(null);
  const [leavingQuiz, setLeavingQuiz] = useState(false);
  const quizSubmissionInFlight = useRef(false);
  const timeoutSubmissionTriggered = useRef(false);

  const hydrateFromProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const loadedSkills: SkillItem[] = Array.isArray(data.profile?.skills)
        ? data.profile.skills
        : [];
      const loadedConfig: InterviewConfig =
        data.profile?.interviewConfig || DEFAULT_INTERVIEW_CONFIG;
      setProfileSkills(loadedSkills);
      setInterviewConfig(loadedConfig);
    } catch {
      // Ignored
    }
  }, []);

  const fetchPastSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/mock/session", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.sessions)) {
        setMockSessions(data.sessions);
      }
    } catch {
      // Ignored
    }
  }, []);

  const fetchCandidateQuizzes = useCallback(async () => {
    try {
      setLoadingCandidateQuizzes(true);
      const res = await fetch("/api/quizzes", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.quizzes)) {
        setCandidateQuizzes(data.quizzes);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingCandidateQuizzes(false);
    }
  }, []);

  const logWorkspaceActivity = useCallback(
    (
      action: string,
      category: "interview" | "board" | "profile",
      detail: string
    ) => {
      fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, category, detail }),
      }).catch(() => {});
    },
    []
  );

  // Authentication check + initial hydration
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
          fetchPastSessions();
          fetchCandidateQuizzes();
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, hydrateFromProfile, fetchPastSessions, fetchCandidateQuizzes]);

  const handleStartQuiz = async (quizId: string) => {
    setStartingQuizId(quizId);
    setQuizRunnerError(null);
    setQuizResult(null);
    setQuizAnswers({});
    setActiveQuizQuestionIdx(0);
    quizSubmissionInFlight.current = false;
    timeoutSubmissionTriggered.current = false;

    try {
      const res = await fetch(`/api/quizzes/${quizId}?take=true`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start quiz.");
      }
      setActiveQuizModal(data.quiz);
      setQuizClockNow(null);
      logWorkspaceActivity(
        "Started Quiz Assessment",
        "board",
        `${data.quiz.title} (Attempt ${data.quiz.attemptNumber})`
      );
    } catch (err: unknown) {
      setBoardNotice(
        err instanceof Error ? err.message : "Could not launch quiz attempt."
      );
    } finally {
      setStartingQuizId(null);
    }
  };

  const handleSelectQuizOption = (questionId: string, option: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
  };

  const handleSubmitQuiz = useCallback(
    async (requestedStatus: "completed" | "timed_out" = "completed") => {
      if (!activeQuizModal) return;
      if (quizSubmissionInFlight.current) return;
      quizSubmissionInFlight.current = true;
      setQuizSubmitting(true);
      setQuizRunnerError(null);

      try {
        const res = await fetch(`/api/quizzes/${activeQuizModal._id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId: activeQuizModal.attemptId,
            answers: quizAnswers,
            status: requestedStatus,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to submit assessment.");
        }

        setQuizResult(data);
        fetchCandidateQuizzes();
        logWorkspaceActivity(
          "Completed Quiz Assessment",
          "board",
          `${activeQuizModal.title} — Score: ${data.score}/${data.total} (${data.percentage}%)`
        );
      } catch (err: unknown) {
        setQuizRunnerError(
          err instanceof Error ? err.message : "Error submitting quiz answers."
        );
      } finally {
        setQuizSubmitting(false);
        quizSubmissionInFlight.current = false;
      }
    },
    [activeQuizModal, quizAnswers, fetchCandidateQuizzes, logWorkspaceActivity]
  );

  const handleLeaveQuiz = async () => {
    if (!activeQuizModal || leavingQuiz || quizSubmitting) return;
    setLeavingQuiz(true);
    setQuizRunnerError(null);
    try {
      const res = await fetch(`/api/quizzes/${activeQuizModal._id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: activeQuizModal.attemptId,
          answers: quizAnswers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not leave this quiz attempt.");
      }
      fetchCandidateQuizzes();
      setBoardNotice(
        `Attempt ${data.attemptNumber} was recorded as left early and counts toward the quiz limit.`
      );
      handleCloseQuizModal();
    } catch (err: unknown) {
      setQuizRunnerError(
        err instanceof Error ? err.message : "Could not leave this quiz attempt."
      );
    } finally {
      setLeavingQuiz(false);
    }
  };

  function handleCloseQuizModal() {
    setActiveQuizModal(null);
    setQuizResult(null);
    setQuizAnswers({});
    setActiveQuizQuestionIdx(0);
    setQuizRunnerError(null);
  }

  const remainingQuizSeconds = useMemo(() => {
    if (
      !activeQuizModal ||
      activeQuizModal.timeLimitMinutes <= 0 ||
      quizClockNow === null
    ) {
      return null;
    }
    const expiresAt =
      new Date(activeQuizModal.startedAt).getTime() +
      activeQuizModal.timeLimitMinutes * 60 * 1000;
    return Math.max(0, Math.ceil((expiresAt - quizClockNow) / 1000));
  }, [activeQuizModal, quizClockNow]);

  useEffect(() => {
    if (!activeQuizModal || quizResult || activeQuizModal.timeLimitMinutes <= 0) {
      return;
    }
    const interval = window.setInterval(() => setQuizClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeQuizModal, quizResult]);

  useEffect(() => {
    if (
      remainingQuizSeconds === 0 &&
      activeQuizModal &&
      !quizResult &&
      !timeoutSubmissionTriggered.current
    ) {
      timeoutSubmissionTriggered.current = true;
      handleSubmitQuiz("timed_out");
    }
  }, [remainingQuizSeconds, activeQuizModal, quizResult, handleSubmitQuiz]);

  const practicedTopics = useMemo(() => {
    return mockSessions.flatMap((s) => [s.focus, ...(s.questions?.map((q) => q.stage) || [])]);
  }, [mockSessions]);

  const topicCoverage = useMemo(
    () => computeTopicCoverage(interviewConfig, profileSkills, practicedTopics),
    [interviewConfig, profileSkills, practicedTopics]
  );

  const completedSessions = useMemo(
    () => mockSessions.filter((s) => s.status === "completed"),
    [mockSessions]
  );

  const averageScore = useMemo(() => {
    if (completedSessions.length === 0) return null;
    const sum = completedSessions.reduce(
      (acc, s) => acc + (s.overallScore || 0),
      0
    );
    return (sum / completedSessions.length).toFixed(1);
  }, [completedSessions]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch {
      // Ignored
    }
  };

  const handleResetConfiguration = () => {
    setSelectedInterviewType("");
    setSelectedLevel("");
    setSelectedFocus("");
    setCustomFocusInput("");
    setIsCustomFocus(false);
    setSelectedDuration(null);
    setLaunchError(null);
  };

  const handleApplyProfileRecommendation = () => {
    setSelectedInterviewType("technical");
    setSelectedLevel(interviewConfig.difficultyTier || "Intermediate");
    setSelectedFocus(
      profileSkills[0]?.name || interviewConfig.primaryTopics?.[0] || "Backend & APIs"
    );
    setIsCustomFocus(false);
    setCustomFocusInput("");
    setSelectedDuration(30);
    setLaunchError(null);
  };

  const handleLaunchMockInterview = async () => {
    setLaunchError(null);

    const activeFocus = isCustomFocus
      ? customFocusInput.trim()
      : (selectedFocus || customFocusInput.trim());

    if (!selectedInterviewType || !selectedLevel || !activeFocus || !selectedDuration) {
      setLaunchError("Please complete all four selection dropdowns to launch the interview.");
      return;
    }

    setIsLaunchingSession(true);

    try {
      const res = await fetch("/api/mock/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewType: selectedInterviewType,
          level: selectedLevel,
          focus: activeFocus,
          durationMinutes: selectedDuration,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize interview room.");
      }

      if (data.roomUrl) {
        router.push(data.roomUrl);
      } else {
        throw new Error("No interview room URL returned.");
      }
    } catch (err: unknown) {
      setLaunchError(
        err instanceof Error ? err.message : "Could not launch interview room."
      );
      setIsLaunchingSession(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#E5E2DA] bg-[#FFFFFF] rounded-xl p-6 space-y-4">
          <div className="h-3 w-24 bg-[#EFECE4] rounded-sm animate-pulse" />
          <div className="h-6 w-48 bg-[#EFECE4] rounded-sm animate-pulse" />
          <div className="h-20 w-full bg-[#F7F4EE] rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  const userInitials = (user?.name || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sidebarNavItems = [
    {
      id: "mock",
      label: "AI Mock Interview",
      desc: "Solo adaptive practice & room",
      icon: Play,
    },
    {
      id: "boards",
      label: "Live Boardrooms",
      desc: "Panel sessions",
      icon: Calendar,
    },
    {
      id: "reports",
      label: "Coverage & Reports",
      desc: "Audit dossiers",
      icon: BarChart3,
    },
    {
      id: "profile",
      label: "My Profile",
      desc: "Dossier, skills & resume",
      icon: User,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1918] flex flex-col md:flex-row font-sans selection:bg-[#E5E2DA]">
      {/* ============================================================ */}
      {/* SIDEBAR NAVIGATION — Tactile Warm Monochrome App Shell */}
      {/* ============================================================ */}
      <aside className="w-full md:w-[272px] border-b md:border-b-0 md:border-r border-[#E5E2DA] bg-[#F7F4EE] flex flex-col justify-between shrink-0 md:h-screen md:sticky md:top-0">
        <div>
          {/* Workspace Brand Header */}
          <div className="px-5 py-5 border-b border-[#E5E2DA] flex items-center justify-between">
            <Link href="/" className="group inline-flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[#1A1918] text-[#FAF8F5] flex items-center justify-center font-mono text-xs font-bold tracking-tight">
                Q
              </div>
              <div>
                <div className="font-mono text-sm font-bold tracking-wider text-[#1A1918] leading-none">
                  QUORIX
                </div>
                <div className="text-[11px] text-[#6E6B65] mt-1 leading-none">
                  Candidate Studio
                </div>
              </div>
            </Link>
            <span className="border border-[#D5D1C7] bg-[#FFFFFF] rounded-md px-2 py-0.5 text-[10px] font-mono text-[#1F7A55] font-medium">
              {interviewConfig.difficultyTier}
            </span>
          </div>

          {/* Feature Selection Links */}
          <nav className="p-3 space-y-1" aria-label="Workspace modules">
            <div className="px-3 pt-2 pb-1.5 text-[10px] font-mono text-[#8E8B84] uppercase tracking-wider">
              Modules
            </div>

            {sidebarNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeFeature === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveFeature(item.id);
                    if (item.id === "mock") {
                      fetchPastSessions();
                    } else if (item.id !== "profile") {
                      hydrateFromProfile();
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                    isActive
                      ? "bg-[#FFFFFF] text-[#1A1918] font-semibold border border-[#E5E2DA] shadow-[0_1px_2px_rgba(26,25,24,0.04)]"
                      : "text-[#55524C] border border-transparent hover:text-[#1A1918] hover:bg-[#EFECE4]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                        isActive
                          ? "bg-[#1A1918] text-[#FAF8F5]"
                          : "bg-[#EAE6DD] text-[#423F3A]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </div>
                    <div>
                      <div className="leading-snug">{item.label}</div>
                      <div className="text-[11px] text-[#8E8B84] font-normal">
                        {item.desc}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Calibrated Track Summary + User Footer */}
        <div className="p-3.5 space-y-3 border-t border-[#E5E2DA] bg-[#F7F4EE]">
          <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#6E6B65]">
              <span>CALIBRATED TRACK</span>
              <span className="text-[#1F7A55] tabular-nums">
                {profileSkills.length} skills
              </span>
            </div>
            <div className="text-xs font-medium text-[#1A1918] truncate">
              {interviewConfig.recommendedTrack}
            </div>
          </div>

          <div className="flex items-center justify-between px-1 pt-0.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md border border-[#D5D1C7] bg-[#FFFFFF] flex items-center justify-center font-mono text-[11px] font-bold text-[#1A1918] shrink-0">
                {userInitials}
              </div>
              <div className="truncate pr-1">
                <div className="text-xs font-semibold text-[#1A1918] truncate">
                  {user?.name}
                </div>
                <div className="text-[11px] text-[#6E6B65] truncate font-mono">
                  {user?.email}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-[#6E6B65] hover:text-[#1A1918] transition-colors border border-[#E5E2DA] bg-[#FFFFFF] hover:bg-[#EFECE4] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
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
            {/* FEATURE 1: SOLO AI MOCK INTERVIEW & SESSION CONFIG */}
            {/* ========================================================== */}
            {activeFeature === "mock" && (
              <motion.div
                key="mock"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_CURVE }}
                className="space-y-8"
              >
                {/* Header + Telemetry Strip */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-[#E5E2DA] pb-6">
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                      <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                      <span>Dedicated Real-Time AI Interview Studio</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                      AI Mock Interview
                    </h1>
                    <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                      Customize your interview format, difficulty level, language or framework, and duration. Each session launches into a private real-time room and records a complete evaluative transcript.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] px-4 py-2.5 flex items-center gap-5 text-xs">
                      <div>
                        <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                          Completed
                        </div>
                        <div className="font-mono font-semibold text-[#1A1918] tabular-nums">
                          {completedSessions.length}
                        </div>
                      </div>
                      <div className="h-6 w-px bg-[#E5E2DA]" />
                      <div>
                        <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                          Avg Score
                        </div>
                        <div className="font-mono font-semibold text-[#1F7A55] tabular-nums">
                          {averageScore ? `${averageScore}/10` : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DOUBLE-BEZEL PROGRESSIVE DROPDOWN INTERVIEW CONFIGURATION CARD */}
                <div className="rounded-2xl border border-[#E5E2DA] bg-[#F7F4EE] p-1.5">
                  <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 sm:p-8 space-y-6 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                    {/* Header with Step Tracker & Quick-Fill Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-[#E5E2DA] gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#1F7A55]" />
                          <h2 className="text-sm font-bold text-[#1A1918] tracking-tight">
                            Progressive Interview Setup
                          </h2>
                        </div>
                        <p className="text-xs text-[#55524C]">
                          Select your preferences sequentially. Each choice unlocks the next calibration field.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleApplyProfileRecommendation}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-1.5 text-[11px] font-mono text-[#1A1918] hover:bg-[#EFECE4] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                          title="Auto-fill recommended settings based on your verified profile"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#1F7A55]" />
                          <span>Profile Defaults</span>
                        </button>

                        {(selectedInterviewType || selectedLevel || selectedFocus || selectedDuration) && (
                          <button
                            type="button"
                            onClick={handleResetConfiguration}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] px-2.5 py-1.5 text-[11px] font-mono text-[#6E6B65] hover:text-[#B45332] hover:border-[#E5C9C0] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                            title="Reset all selections"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Step Progress Tracker */}
                    <div className="flex items-center gap-2 font-mono text-[11px] text-[#6E6B65] pb-1 overflow-x-auto">
                      <span className={selectedInterviewType ? "text-[#1F7A55] font-semibold" : "text-[#1A1918] font-bold"}>
                        1. Format
                      </span>
                      <span>›</span>
                      <span className={selectedLevel ? "text-[#1F7A55] font-semibold" : selectedInterviewType ? "text-[#1A1918] font-bold" : "text-[#A8A49C]"}>
                        2. Level
                      </span>
                      <span>›</span>
                      <span className={(isCustomFocus ? customFocusInput.trim() : selectedFocus) ? "text-[#1F7A55] font-semibold" : (selectedInterviewType && selectedLevel) ? "text-[#1A1918] font-bold" : "text-[#A8A49C]"}>
                        3. Topic
                      </span>
                      <span>›</span>
                      <span className={selectedDuration ? "text-[#1F7A55] font-semibold" : (selectedInterviewType && selectedLevel && (isCustomFocus ? customFocusInput.trim() : selectedFocus)) ? "text-[#1A1918] font-bold" : "text-[#A8A49C]"}>
                        4. Duration
                      </span>
                    </div>

                    {/* Progressive Dropdowns */}
                    <div className="space-y-5">
                      {/* ── STEP 1: INTERVIEW FORMAT (Always Visible) ── */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="field-type" className="text-xs font-bold text-[#1A1918] font-mono uppercase tracking-wider flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedInterviewType ? "bg-[#1F7A55] text-white" : "bg-[#1A1918] text-[#FAF8F5]"}`}>
                              {selectedInterviewType ? "✓" : "1"}
                            </span>
                            <span>Interview Format</span>
                          </label>
                          <span className="text-[11px] font-mono text-[#6E6B65]">
                            Assessment Category
                          </span>
                        </div>

                        <div className="relative">
                          <select
                            id="field-type"
                            value={selectedInterviewType}
                            onChange={(e) => {
                              setSelectedInterviewType(e.target.value as InterviewType);
                            }}
                            className={`w-full appearance-none rounded-lg border bg-[#FFFFFF] px-3.5 py-3 pr-10 text-xs font-medium text-[#1A1918] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                              selectedInterviewType
                                ? "border-[#1A1918] bg-[#FAF8F5]/60 shadow-[inset_0_0_0_1px_#1A1918]"
                                : "border-[#D5D1C7] hover:border-[#1A1918]"
                            }`}
                          >
                            <option value="" disabled>
                              Select interview format (Coding or Technical Systems)...
                            </option>
                            {INTERVIEW_TYPES.map((type) => (
                              <option
                                key={type.id}
                                value={type.id}
                                disabled={!type.available}
                              >
                                {type.title} — {type.desc}
                                {!type.available ? " (Coming soon)" : ""}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#6E6B65]">
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      {/* ── STEP 2: DIFFICULTY LEVEL (Revealed once Step 1 is chosen) ── */}
                      {Boolean(selectedInterviewType) && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2 pt-4 border-t border-[#E5E2DA]"
                        >
                          <div className="flex items-center justify-between">
                            <label htmlFor="field-level" className="text-xs font-bold text-[#1A1918] font-mono uppercase tracking-wider flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedLevel ? "bg-[#1F7A55] text-white" : "bg-[#1A1918] text-[#FAF8F5]"}`}>
                                {selectedLevel ? "✓" : "2"}
                              </span>
                              <span>Seniority &amp; Depth Tier</span>
                            </label>
                            <span className="text-[11px] font-mono text-[#6E6B65]">
                              Profile calibration: {interviewConfig.difficultyTier || "Intermediate"}
                            </span>
                          </div>

                          <div className="relative">
                            <select
                              id="field-level"
                              value={selectedLevel}
                              onChange={(e) => setSelectedLevel(e.target.value as DifficultyTier)}
                              className={`w-full appearance-none rounded-lg border bg-[#FFFFFF] px-3.5 py-3 pr-10 text-xs font-medium text-[#1A1918] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                selectedLevel
                                  ? "border-[#1A1918] bg-[#FAF8F5]/60 shadow-[inset_0_0_0_1px_#1A1918]"
                                  : "border-[#D5D1C7] hover:border-[#1A1918]"
                              }`}
                            >
                              <option value="" disabled>
                                Select seniority and difficulty tier...
                              </option>
                              {DIFFICULTY_TIERS.map((tier) => (
                                <option key={tier.value} value={tier.value}>
                                  {tier.value} ({tier.tier}) — {tier.desc}
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#6E6B65]">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* ── STEP 3: TOPIC / LANGUAGE / FRAMEWORK (Revealed once Step 2 is chosen) ── */}
                      {Boolean(selectedInterviewType && selectedLevel) && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2 pt-4 border-t border-[#E5E2DA]"
                        >
                          <div className="flex items-center justify-between">
                            <label htmlFor="field-focus" className="text-xs font-bold text-[#1A1918] font-mono uppercase tracking-wider flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${(isCustomFocus ? customFocusInput.trim() : selectedFocus) ? "bg-[#1F7A55] text-white" : "bg-[#1A1918] text-[#FAF8F5]"}`}>
                                {(isCustomFocus ? customFocusInput.trim() : selectedFocus) ? "✓" : "3"}
                              </span>
                              <span>Framework, Language, or Domain</span>
                            </label>
                            <span className="text-[11px] font-mono text-[#6E6B65]">
                              Target technology
                            </span>
                          </div>

                          <div className="relative">
                            <select
                              id="field-focus"
                              value={isCustomFocus ? "__custom__" : selectedFocus}
                              onChange={(e) => {
                                if (e.target.value === "__custom__") {
                                  setIsCustomFocus(true);
                                  setSelectedFocus("");
                                } else {
                                  setIsCustomFocus(false);
                                  setSelectedFocus(e.target.value);
                                  setCustomFocusInput("");
                                }
                              }}
                              className={`w-full appearance-none rounded-lg border bg-[#FFFFFF] px-3.5 py-3 pr-10 text-xs font-medium text-[#1A1918] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                (isCustomFocus || selectedFocus)
                                  ? "border-[#1A1918] bg-[#FAF8F5]/60 shadow-[inset_0_0_0_1px_#1A1918]"
                                  : "border-[#D5D1C7] hover:border-[#1A1918]"
                              }`}
                            >
                              <option value="" disabled>
                                Select framework, language, or technical focus...
                              </option>
                              {profileSkills.length > 0 && (
                                <optgroup label="From Your Verified Profile">
                                  {profileSkills.map((s) => (
                                    <option key={s.id} value={s.name}>
                                      ★ {s.name} ({s.level})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {interviewConfig.primaryTopics?.length > 0 && (
                                <optgroup label="Recommended Domains">
                                  {interviewConfig.primaryTopics.map((top) => (
                                    <option key={top} value={top}>
                                      {top}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label="Languages &amp; Frameworks">
                                {POPULAR_FRAMEWORKS_AND_LANGUAGES.map((lang) => (
                                  <option key={lang} value={lang}>
                                    {lang}
                                  </option>
                                ))}
                              </optgroup>
                              <option value="__custom__">+ Enter custom framework or topic...</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#6E6B65]">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>

                          {isCustomFocus && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="pt-2"
                            >
                              <input
                                type="text"
                                value={customFocusInput}
                                onChange={(e) => {
                                  setCustomFocusInput(e.target.value);
                                  setSelectedFocus(e.target.value);
                                }}
                                placeholder="Type specific framework or topic (e.g. FastAPI, Kafka, Spring Boot)..."
                                className="w-full rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] px-3.5 py-2.5 text-xs text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                                autoFocus
                              />
                            </motion.div>
                          )}
                        </motion.div>
                      )}

                      {/* ── STEP 4: DURATION (Revealed once Step 3 is chosen) ── */}
                      {Boolean(selectedInterviewType && selectedLevel && (isCustomFocus ? customFocusInput.trim() : selectedFocus)) && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2 pt-4 border-t border-[#E5E2DA]"
                        >
                          <div className="flex items-center justify-between">
                            <label htmlFor="field-duration" className="text-xs font-bold text-[#1A1918] font-mono uppercase tracking-wider flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedDuration ? "bg-[#1F7A55] text-white" : "bg-[#1A1918] text-[#FAF8F5]"}`}>
                                {selectedDuration ? "✓" : "4"}
                              </span>
                              <span>Session Duration &amp; Volume</span>
                            </label>
                            <span className="text-[11px] font-mono text-[#6E6B65]">
                              Timer &amp; Question Quota
                            </span>
                          </div>

                          <div className="relative">
                            <select
                              id="field-duration"
                              value={selectedDuration || ""}
                              onChange={(e) => setSelectedDuration(Number(e.target.value))}
                              className={`w-full appearance-none rounded-lg border bg-[#FFFFFF] px-3.5 py-3 pr-10 text-xs font-medium text-[#1A1918] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                selectedDuration
                                  ? "border-[#1A1918] bg-[#FAF8F5]/60 shadow-[inset_0_0_0_1px_#1A1918]"
                                  : "border-[#D5D1C7] hover:border-[#1A1918]"
                              }`}
                            >
                              <option value="" disabled>
                                Select session duration...
                              </option>
                              {DURATION_OPTIONS.map((opt) => (
                                <option key={opt.minutes} value={opt.minutes}>
                                  {opt.label} — {opt.questions} ({opt.desc})
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#6E6B65]">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* ERROR NOTICE IF LAUNCH FAILS */}
                    {launchError && (
                      <div className="flex items-center gap-2 rounded-lg border border-[#E5C9C0] bg-[#FFF8F5] p-3 text-xs text-[#B45332]">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{launchError}</span>
                      </div>
                    )}

                    {/* ── STEP 5: READY TO LAUNCH SUMMARY & CTA ── */}
                    {Boolean(selectedInterviewType && selectedLevel && (isCustomFocus ? customFocusInput.trim() : selectedFocus) && selectedDuration) && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="pt-5 border-t border-[#E5E2DA] space-y-4"
                      >
                        <div className="rounded-xl border border-[#D5D1C7] bg-[#FAF8F5] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B65]">
                              Configured Interview Setup
                            </div>
                            <div className="text-xs font-semibold text-[#1A1918] flex flex-wrap items-center gap-2">
                              <span className="bg-[#FFFFFF] border border-[#E5E2DA] px-2 py-0.5 rounded text-[11px] font-mono">
                                {INTERVIEW_TYPES.find((t) => t.id === selectedInterviewType)?.title}
                              </span>
                              <span className="text-[#8E8B84]">•</span>
                              <span className="bg-[#FFFFFF] border border-[#E5E2DA] px-2 py-0.5 rounded text-[11px] font-mono">
                                {selectedLevel}
                              </span>
                              <span className="text-[#8E8B84]">•</span>
                              <span className="bg-[#FFFFFF] border border-[#E5E2DA] px-2 py-0.5 rounded text-[11px] font-mono text-[#1F7A55] font-bold">
                                {isCustomFocus ? customFocusInput.trim() : selectedFocus}
                              </span>
                              <span className="text-[#8E8B84]">•</span>
                              <span className="bg-[#FFFFFF] border border-[#E5E2DA] px-2 py-0.5 rounded text-[11px] font-mono">
                                {selectedDuration} mins
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleLaunchMockInterview}
                            disabled={isLaunchingSession}
                            className="group inline-flex items-center justify-center gap-2 rounded-lg text-xs font-semibold bg-[#1A1918] text-[#FAF8F5] pl-5 pr-3 py-3 hover:bg-[#2C2A28] active:scale-[0.98] disabled:opacity-50 transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918] shrink-0"
                          >
                            <span>
                              {isLaunchingSession
                                ? "Creating Interview Room..."
                                : "Launch Mock Interview Room"}
                            </span>
                            <span className="w-6 h-6 rounded-md bg-[#FAF8F5]/12 flex items-center justify-center transition-transform group-hover:translate-x-0.5">
                              {isLaunchingSession ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowRight className="w-3.5 h-3.5" />
                              )}
                            </span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* ========================================================== */}
                {/* MOCK INTERVIEW SESSION HISTORY */}
                {/* ========================================================== */}
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xs font-mono text-[#6E6B65] uppercase tracking-wider">
                        Mock Interview Session History
                      </h2>
                      <p className="text-xs text-[#55524C] mt-0.5">
                        Click on any past session to inspect the complete question-by-question transcript and rubric scores.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-[#6E6B65] tabular-nums">
                      {mockSessions.length}{" "}
                      {mockSessions.length === 1 ? "session" : "sessions"} logged
                    </span>
                  </div>

                  {mockSessions.length === 0 ? (
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-8 text-center space-y-3">
                      <div className="w-10 h-10 rounded-full border border-[#E5E2DA] bg-[#FAF8F5] flex items-center justify-center mx-auto text-[#6E6B65]">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-semibold text-[#1A1918]">
                        No mock interviews completed yet
                      </div>
                      <p className="text-xs text-[#6E6B65] max-w-sm mx-auto leading-relaxed">
                        Configure your target topic and level above, then click &quot;Launch Mock Interview Room&quot; to practice your first session.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mockSessions.map((sessionItem) => {
                        const isSystemDesign = sessionItem.interviewType === "system_design";
                        const dateFormatted = new Date(
                          sessionItem.createdAt
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        return (
                          <div
                            key={sessionItem._id}
                            onClick={() =>
                              setSelectedTranscriptSession(sessionItem)
                            }
                            className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 hover:border-[#1A1918] cursor-pointer transition-all shadow-[0_1px_2px_rgba(26,25,24,0.02)] space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-bold text-[#1A1918] text-sm">
                                  {sessionItem.title}
                                </span>
                                {isSystemDesign ? (
                                  <span className="rounded-md border border-[#C5D0E6] bg-[#EEF2F9] px-2 py-0.5 font-mono text-[10px] text-[#2C4875] uppercase font-semibold">
                                    System Design
                                  </span>
                                ) : (
                                  <span className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 font-mono text-[10px] text-[#423F3A] uppercase">
                                    {sessionItem.interviewType}
                                  </span>
                                )}
                                <span className="rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-2 py-0.5 font-mono text-[10px] text-[#1F7A55]">
                                  {sessionItem.level}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                {sessionItem.status === "completed" && (
                                  <span className="font-mono font-bold text-[#1F7A55] rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-2.5 py-1 text-xs tabular-nums">
                                    Overall: {sessionItem.overallScore ?? "—"}/10
                                  </span>
                                )}
                                {sessionItem.status === "in_progress" && isSystemDesign && (
                                  <Link
                                    href={`/candidate/mock/system-design/${sessionItem._id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1918] text-[#FAF8F5] px-3 py-1.5 text-xs font-semibold hover:bg-[#2E2C29] transition-colors"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>Resume Studio</span>
                                  </Link>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTranscriptSession(sessionItem);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1A1918] hover:underline"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{isSystemDesign ? "View Architecture Report" : "View Transcript"}</span>
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between text-xs text-[#6E6B65] border-t border-[#E5E2DA] pt-2.5">
                              <div className="flex items-center gap-4">
                                <span className="font-mono text-[11px]">
                                  {dateFormatted}
                                </span>
                                <span>·</span>
                                <span>{sessionItem.durationMinutes} min session</span>
                                <span>·</span>
                                <span>
                                  {isSystemDesign
                                    ? `${sessionItem.systemDesignTurns?.length || 0} discussion turns · Whiteboard Studio`
                                    : `${sessionItem.responses?.length || 0} of ${sessionItem.questions?.length || 0} questions answered`}
                                </span>
                              </div>

                              <span
                                className={`text-[11px] font-mono font-semibold ${
                                  sessionItem.status === "completed"
                                    ? "text-[#1F7A55]"
                                    : "text-[#B45332]"
                                }`}
                              >
                                {sessionItem.status === "completed"
                                  ? isSystemDesign ? "Completed · 7 Dimensions Evaluated" : "Completed & Evaluated"
                                  : isSystemDesign ? `In Progress (${sessionItem.currentPhase || "Whiteboard"})` : "In Progress / Incomplete"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ========================================================== */}
            {/* FEATURE 2: LIVE BOARDROOM PANELS & EXPERT QUIZZES */}
            {/* ========================================================== */}
            {activeFeature === "boards" && (
              <motion.div
                key="boards"
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
                      <span>Live Multi-Expert &amp; Assessment Hub</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                      Live Boardroom Sessions
                    </h1>
                    <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                      Connect with scheduled multi-expert evaluation panels, or complete expert-curated assessments with dynamically jumbled question sequences.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] px-3.5 py-2 text-xs font-semibold text-[#1A1918] shrink-0">
                    <HelpCircle className="w-3.5 h-3.5 text-[#1F7A55]" />
                    <span>Expert Quizzes ({candidateQuizzes.length})</span>
                  </div>
                </div>

                {/* SUB-VIEW 1: SCHEDULED LIVE PANEL */}
                {boardSubTab === "panel" && (
                  <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                    <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-6 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-[11px] font-mono text-[#6E6B65]">
                            BOARD #BRD-9021 · PROFILE-MATCHED
                          </div>
                          <h2 className="text-lg font-bold text-[#1A1918]">
                            {interviewConfig.difficultyTier}{" "}
                            {interviewConfig.primaryTopics[0]} Board
                          </h2>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-3 py-1 text-[11px] font-mono text-[#1F7A55] font-semibold w-fit">
                          <Clock className="w-3 h-3" strokeWidth={2} />
                          <span>TODAY · 4:00 PM</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "Panel Size", value: "2 Experts" },
                          { label: "Duration", value: "45 Min" },
                          {
                            label: "Calibration",
                            value: `Tier ${interviewConfig.difficultyNumeric} (${interviewConfig.difficultyTier})`,
                          },
                          { label: "Room Status", value: "Ready To Connect" },
                        ].map((meta) => (
                          <div
                            key={meta.label}
                            className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3"
                          >
                            <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                              {meta.label}
                            </div>
                            <div className="text-xs font-semibold text-[#1A1918] mt-1">
                              {meta.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-4 border-t border-[#E5E2DA] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#55524C]">
                          <span className="mr-1">Focus areas:</span>
                          {interviewConfig.focusAreas.slice(0, 4).map((area) => (
                            <span
                              key={area}
                              className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 font-mono text-[11px] text-[#1A1918]"
                            >
                              {area}
                            </span>
                          ))}
                        </div>

                        <button
                          onClick={() => {
                            logWorkspaceActivity(
                              "Joined Live Boardroom",
                              "board",
                              `Board #BRD-9021 — ${interviewConfig.recommendedTrack}`
                            );
                            setBoardNotice(
                              "Room #BRD-9021 handshake queued. Your calibrated dossier has been shared with the panel."
                            );
                          }}
                          className="group inline-flex items-center justify-center gap-2 rounded-lg text-xs font-medium bg-[#1A1918] text-[#FAF8F5] pl-4 pr-2.5 py-2.5 hover:bg-[#2C2A28] active:scale-[0.98] transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                        >
                          <span>Connect To Boardroom</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {boardNotice && (
                        <div className="flex items-center gap-2 rounded-lg border border-[#CBE4D6] bg-[#EDF3EC] px-3.5 py-2.5 text-xs text-[#1F7A55]">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>{boardNotice}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SUB-VIEW 2: EXPERT-HOSTED QUIZZES */}
                {boardSubTab === "quizzes" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-[#1A1918]">
                          Available Assessments
                        </h2>
                        <p className="text-xs text-[#6E6B65]">
                          Test your depth across curated topic modules. Each attempt presents questions in a unique randomized sequence.
                        </p>
                      </div>

                      <button
                        onClick={fetchCandidateQuizzes}
                        disabled={loadingCandidateQuizzes}
                        className="p-2 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#F2EFE9] transition-all"
                        title="Refresh Available Quizzes"
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingCandidateQuizzes ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    {loadingCandidateQuizzes ? (
                      <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-8 text-center text-xs font-mono text-[#6E6B65]">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-[#1A1918]" />
                        Loading quizzes...
                      </div>
                    ) : candidateQuizzes.length === 0 ? (
                      <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                        <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-10 text-center space-y-3">
                          <FileText className="w-8 h-8 text-[#8E8B84] mx-auto" />
                          <h3 className="text-sm font-bold text-[#1A1918]">
                            No Quizzes Currently Active
                          </h3>
                          <p className="text-xs text-[#6E6B65] max-w-sm mx-auto">
                            Board experts have not published assessments for this track yet. Check back soon or practice in the Solo AI Mock Interview.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {candidateQuizzes.map((q) => (
                          <div
                            key={q._id}
                            className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5 transition-all hover:border-[#D5D1C7]"
                          >
                            <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-4 shadow-[0_1px_2px_rgba(26,25,24,0.03)] h-full flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 rounded-sm text-[#1A1918] uppercase">
                                      {q.topic}
                                    </span>
                                    <span className="text-[10px] font-mono bg-[#1A1918] text-[#FAF8F5] px-2 py-0.5 rounded-sm">
                                      {q.difficulty}
                                    </span>
                                  </div>

                                  {q.bestScore !== null && (
                                    <span className="text-[11px] font-mono font-bold text-[#1F7A55] rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-2.5 py-0.5">
                                      Best: {q.bestScore}%
                                    </span>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <h3 className="text-base font-bold text-[#1A1918] leading-tight">
                                    {q.title}
                                  </h3>
                                  <p className="text-xs text-[#55524C] line-clamp-2">
                                    {q.description}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-3 border-t border-[#E5E2DA] space-y-3">
                                <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono sm:grid-cols-4">
                                  <div className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] p-2">
                                    <div className="text-[10px] text-[#8E8B84] uppercase">Questions</div>
                                    <div className="font-bold text-[#1A1918] mt-0.5">{q.totalQuestions}</div>
                                  </div>

                                  <div className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] p-2">
                                    <div className="text-[10px] text-[#8E8B84] uppercase">Time Limit</div>
                                    <div className="font-bold text-[#1A1918] mt-0.5">
                                      {q.timeLimitMinutes > 0 ? `${q.timeLimitMinutes} min` : "None"}
                                    </div>
                                  </div>

                                  <div className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] p-2">
                                    <div className="text-[10px] text-[#8E8B84] uppercase">Max Attempts</div>
                                    <div className="font-bold text-[#1A1918] mt-0.5">
                                      {q.maxAttempts === 0 ? "Unlimited" : `${q.maxAttempts}×`}
                                    </div>
                                  </div>

                                  <div className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] p-2">
                                    <div className="text-[10px] text-[#8E8B84] uppercase">Used Attempts</div>
                                    <div className="font-bold text-[#1A1918] mt-0.5">
                                      {q.candidateAttemptsCount}
                                      {q.maxAttempts > 0 && `/${q.maxAttempts}`}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col items-start justify-between gap-2 pt-1 sm:flex-row sm:items-center">
                                  <div className="text-[11px] font-mono text-[#6E6B65] flex items-center gap-1">
                                    <Shuffle className="w-3 h-3 text-[#1F7A55]" />
                                    <span>Jumbled Order</span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setResultsQuiz(q)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D1C7] bg-white px-3 py-2 text-xs font-medium text-[#1A1918] hover:bg-[#FAF8F5]"
                                    >
                                      <Award className="h-3.5 w-3.5 text-[#1F7A55]" />
                                      Attempt summary
                                    </button>
                                    <button
                                      onClick={() => handleStartQuiz(q._id)}
                                      disabled={!q.canAttempt || startingQuizId === q._id}
                                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                                        q.canAttempt
                                          ? "bg-[#1A1918] text-[#FAF8F5] hover:bg-[#2C2A28] active:scale-[0.98]"
                                          : "bg-[#F2EFE9] text-[#8E8B84] border border-[#E5E2DA] cursor-not-allowed"
                                      }`}
                                    >
                                      {startingQuizId === q._id ? (
                                        <>
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          <span>Preparing...</span>
                                        </>
                                      ) : q.canAttempt ? (
                                        <>
                                          <span>{q.candidateAttemptsCount > 0 ? "Retake Quiz" : "Take Quiz"}</span>
                                          <ArrowRight className="w-3.5 h-3.5" />
                                        </>
                                      ) : (
                                        <span>Attempts Exhausted</span>
                                      )}
                                    </button>
                                  </div>
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
            {/* FEATURE 4: REPORTS & TOPIC COVERAGE */}
            {/* ========================================================== */}
            {activeFeature === "reports" && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_CURVE }}
                className="space-y-8"
              >
                <div className="border-b border-[#E5E2DA] pb-6 space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                    <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                    <span>Audit Dossiers &amp; Analytics</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                    Reports &amp; Topic Coverage
                  </h1>
                  <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                    Inspect structured post-interview dossiers with per-question rubric breakdowns and topic coverage audits benchmarked against your profile domains.
                  </p>
                </div>

                {/* Topic Coverage Metric Card */}
                <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-5 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#E5E2DA]">
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#1A1918]">
                      <ShieldCheck
                        className="w-4 h-4 text-[#1F7A55]"
                        strokeWidth={1.75}
                      />
                      <span>PROFILE TOPIC COVERAGE AUDIT</span>
                    </div>
                    <span className="text-xs font-mono text-[#1F7A55] font-medium tabular-nums">
                      {interviewConfig.difficultyTier} Tier ·{" "}
                      {topicCoverage.length} Tracked Domains
                    </span>
                  </div>

                  <div className="space-y-4 text-xs">
                    {topicCoverage.map((item) => (
                      <div key={item.topic} className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-[#1A1918]">
                            {item.topic}
                          </span>
                          <span
                            className={`font-mono text-[11px] tabular-nums ${
                              item.isGap
                                ? "text-[#B45332] font-semibold"
                                : "text-[#1F7A55] font-semibold"
                            }`}
                          >
                            {item.statusLabel} ({item.coveragePct}%)
                          </span>
                        </div>
                        <div className="w-full bg-[#EFECE4] h-2 rounded-xs overflow-hidden">
                          <div
                            className={`h-full rounded-xs transition-all duration-500 ${
                              item.isGap ? "bg-[#B45332]" : "bg-[#1A1918]"
                            }`}
                            style={{ width: `${item.coveragePct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Historical Completed Sessions */}
                <div className="space-y-3">
                  <div className="text-xs font-mono text-[#6E6B65] uppercase tracking-wider">
                    Recent Practice &amp; Evaluation Dossiers
                  </div>

                  {completedSessions.length === 0 ? (
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 text-xs text-[#6E6B65]">
                      No completed interview dossiers yet. Practice an AI mock session to generate audit reports.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {completedSessions.map((sessionItem) => (
                        <div
                          key={sessionItem._id}
                          className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#1A1918]">
                              {sessionItem.title}
                            </div>
                            <div className="text-xs text-[#6E6B65] mt-1 tabular-nums">
                              {sessionItem.interviewType === "system_design"
                                ? `${sessionItem.systemDesignTurns?.length || 0} discussion turns · ${sessionItem.durationMinutes} min whiteboard session`
                                : `${sessionItem.responses?.length || 0} questions evaluated · ${sessionItem.durationMinutes} min session`}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="font-mono text-base font-bold text-[#1A1918] tabular-nums">
                                {sessionItem.overallScore ?? "—"} / 10
                              </div>
                              <div className="text-[10px] text-[#1F7A55] font-mono">
                                Overall Score
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedTranscriptSession(sessionItem)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2 hover:bg-[#EFECE4] active:scale-[0.98] text-xs font-medium text-[#1A1918] transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{sessionItem.interviewType === "system_design" ? "View Architecture Report" : "View Transcript"}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ========================================================== */}
            {/* FEATURE 5: PROFILE, DOSSIER & DAILY ACTIVITY */}
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
                    setUser((prev) =>
                      prev ? { ...prev, name: newName } : prev
                    )
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ============================================================ */}
      {/* FULL SESSION TRANSCRIPT DRAWER / MODAL */}
      {/* ============================================================ */}
      <AnimatePresence>
        {selectedTranscriptSession && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTranscriptSession(null)}
              className="fixed inset-0 bg-[#1A1918]/30 backdrop-blur-xs"
            />

            {/* Drawer Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: EASE_CURVE }}
              className="relative w-full max-w-2xl bg-[#FAF8F5] border-l border-[#E5E2DA] h-full overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6 z-10"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 border-b border-[#E5E2DA] pb-5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md border border-[#E5E2DA] bg-[#FFFFFF] px-2 py-0.5 font-mono text-[10px] text-[#423F3A] uppercase">
                      {selectedTranscriptSession.interviewType}
                    </span>
                    <span className="rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-2 py-0.5 font-mono text-[10px] text-[#1F7A55]">
                      {selectedTranscriptSession.level}
                    </span>
                    <span className="text-[#6E6B65] text-xs font-mono">
                      {selectedTranscriptSession.durationMinutes} min
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-[#1A1918]">
                    {selectedTranscriptSession.title}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedTranscriptSession(null)}
                  className="p-1.5 rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] hover:bg-[#F2EFE9] text-[#6E6B65] hover:text-[#1A1918] transition-colors"
                  title="Close Transcript"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Content: System Design Mode vs Standard Q&A */}
              {selectedTranscriptSession.interviewType === "system_design" ? (
                <div className="space-y-6">
                  {/* Scenario Brief & Resume CTA */}
                  <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-4">
                    {selectedTranscriptSession.status === "in_progress" && (
                      <Link
                        href={`/candidate/mock/system-design/${selectedTranscriptSession._id}`}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1F7A55] text-white py-2.5 text-xs font-semibold hover:bg-[#186244] transition-all shadow-xs"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Resume Interactive Studio Room</span>
                      </Link>
                    )}

                    {selectedTranscriptSession.scenario?.brief && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-[#6E6B65] uppercase">Problem Brief</div>
                        <p className="text-xs text-[#1A1918] italic leading-relaxed bg-[#FAF8F5] p-3 rounded-lg border border-[#E5E2DA]">
                          &ldquo;{selectedTranscriptSession.scenario.brief}&rdquo;
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs font-mono text-[#6E6B65]">
                      <span>Phase: <strong className="text-[#1A1918] uppercase">{selectedTranscriptSession.currentPhase || "Completed"}</strong></span>
                      <span>Turns: <strong className="text-[#1A1918]">{selectedTranscriptSession.systemDesignTurns?.length || 0}</strong></span>
                      <span>Target: <strong className="text-[#1A1918]">{selectedTranscriptSession.durationMinutes}m</strong></span>
                    </div>
                  </div>

                  {/* 7-Dimension Rubric Evaluation (if completed) */}
                  {selectedTranscriptSession.systemDesignEvaluation && (
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-[#E5E2DA] pb-3">
                        <span className="text-xs font-bold font-mono text-[#6E6B65] uppercase">
                          System Design 7-Dimension Rubric
                        </span>
                        <span className="text-sm font-mono font-bold text-[#1F7A55] rounded border border-[#CBE4D6] bg-[#EDF3EC] px-3 py-1">
                          Score: {selectedTranscriptSession.systemDesignEvaluation.overallScore}/10
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {Object.entries(selectedTranscriptSession.systemDesignEvaluation.dimensions).map(([dimKey, dimVal]) => {
                          const labels: Record<string, string> = {
                            requirementsGathering: "1. Requirements Gathering",
                            estimation: "2. Back-of-Envelope Estimation",
                            architecture: "3. High-Level Architecture",
                            dataAndApiDesign: "4. Data & API Design",
                            depthAndTradeoffs: "5. Depth & Trade-offs",
                            reliabilityAndScale: "6. Reliability & 10x Scale",
                            communicationAndClarity: "7. Communication & Diagram",
                          };
                          return (
                            <div key={dimKey} className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[#1A1918] text-[11px]">{labels[dimKey] || dimKey}</span>
                                <span className="font-mono font-bold text-[#1F7A55]">{dimVal.score}/10</span>
                              </div>
                              <p className="text-[11px] text-[#6E6B65] leading-relaxed">{dimVal.feedback}</p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Covered & Missed Components */}
                      <div className="space-y-2 pt-2 border-t border-[#E5E2DA]">
                        <div className="text-[10px] font-mono uppercase text-[#6E6B65]">Component Coverage</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTranscriptSession.systemDesignEvaluation.coveredComponents?.map((c) => (
                            <span key={c} className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EDF3EC] text-[#1F7A55] border border-[#CBE4D6] flex items-center gap-1">
                              ✓ {c}
                            </span>
                          ))}
                          {selectedTranscriptSession.systemDesignEvaluation.missedComponents?.map((c) => (
                            <span key={c} className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FAF8F5] text-[#8E8B84] border border-[#E5E2DA] line-through">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Synthesis feedback */}
                      {selectedTranscriptSession.systemDesignEvaluation.summaryFeedback && (
                        <div className="text-xs text-[#423F3A] bg-[#FAF8F5] border border-[#E5E2DA] p-3 rounded-lg leading-relaxed">
                          <span className="font-semibold text-[#1A1918]">Synthesis: </span>
                          {selectedTranscriptSession.systemDesignEvaluation.summaryFeedback}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Turns Transcript */}
                  <div className="space-y-3">
                    <div className="text-xs font-mono uppercase text-[#6E6B65]">
                      Discussion &amp; Interviewer Probing Log ({selectedTranscriptSession.systemDesignTurns?.length || 0} turns)
                    </div>

                    {selectedTranscriptSession.systemDesignTurns?.map((turn, tIdx) => (
                      <div
                        key={turn.id || tIdx}
                        className={`rounded-xl border p-4 space-y-2 ${
                          turn.speaker === "interviewer"
                            ? "bg-[#FFFFFF] border-[#E5E2DA]"
                            : "bg-[#FAF8F5] border-[#D5D1C7]"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-bold text-[#1A1918] flex items-center gap-1.5">
                            {turn.speaker === "interviewer" ? "AI System Design Interviewer" : "Candidate Response"}
                            {turn.moveType && (
                              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-[#E5E2DA] bg-[#FAF8F5] text-[#6E6B65]">
                                {turn.moveType}
                              </span>
                            )}
                          </span>
                          <span className="text-[#8E8B84] uppercase text-[10px]">
                            Phase: {turn.phase}
                          </span>
                        </div>

                        <div className="text-xs text-[#1A1918] leading-relaxed whitespace-pre-wrap">
                          {turn.message}
                        </div>

                        {turn.revealedRequirement && (
                          <div className="text-[11px] font-mono text-[#1F7A55] bg-[#EDF3EC] border border-[#CBE4D6] px-2.5 py-1 rounded">
                            Revealed Requirement: {turn.revealedRequirement}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Overall Score & Tri-factor Rubrics */}
                  <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono text-[#6E6B65] uppercase">
                        Evaluation Performance Summary
                      </span>
                      <span className="text-sm font-mono font-bold text-[#1F7A55] rounded border border-[#CBE4D6] bg-[#EDF3EC] px-3 py-1">
                        Score: {selectedTranscriptSession.overallScore ?? "—"}/10
                      </span>
                    </div>

                    {selectedTranscriptSession.categoryScores && (
                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                        <div className="rounded border border-[#E5E2DA] bg-[#FAF8F5] p-2.5">
                          <div className="text-[10px] text-[#8E8B84]">RELEVANCE</div>
                          <div className="text-sm font-bold text-[#1A1918] mt-0.5">
                            {selectedTranscriptSession.categoryScores.relevance}/10
                          </div>
                        </div>
                        <div className="rounded border border-[#E5E2DA] bg-[#FAF8F5] p-2.5">
                          <div className="text-[10px] text-[#8E8B84]">DEPTH</div>
                          <div className="text-sm font-bold text-[#1A1918] mt-0.5">
                            {selectedTranscriptSession.categoryScores.depth}/10
                          </div>
                        </div>
                        <div className="rounded border border-[#E5E2DA] bg-[#FAF8F5] p-2.5">
                          <div className="text-[10px] text-[#8E8B84]">CLARITY</div>
                          <div className="text-sm font-bold text-[#1A1918] mt-0.5">
                            {selectedTranscriptSession.categoryScores.clarity}/10
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedTranscriptSession.summaryFeedback && (
                      <div className="text-xs text-[#423F3A] bg-[#FAF8F5] border border-[#E5E2DA] p-3 rounded-lg leading-relaxed">
                        <span className="font-semibold text-[#1A1918]">
                          AI Synthesis:{" "}
                        </span>
                        {selectedTranscriptSession.summaryFeedback}
                      </div>
                    )}
                  </div>

                  {/* Step-by-Step Questions & Responses */}
                  <div className="space-y-4">
                    <div className="text-xs font-mono uppercase text-[#6E6B65]">
                      Detailed Q&amp;A Log (
                      {selectedTranscriptSession.responses?.length || 0} responses)
                    </div>

                    {selectedTranscriptSession.responses?.map(
                      (resp: MockSessionResponse, idx: number) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-3.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between border-b border-[#E5E2DA] pb-2 text-xs">
                            <span className="font-mono font-bold text-[#1A1918]">
                              Question {idx + 1} ({resp.stage})
                            </span>
                            <span className="font-mono font-bold text-[#1F7A55]">
                              {resp.scores.overall}/10
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-[#1A1918] leading-relaxed">
                            {resp.questionPrompt}
                          </div>

                          {resp.codeSubmitted && (
                            <div className="space-y-1">
                              <div className="text-[10px] font-mono text-[#8E8B84]">
                                Candidate Code ({resp.language || "Code"}):
                              </div>
                              <pre className="rounded bg-[#1A1918] text-[#FAF8F5] p-3 text-[11px] font-mono overflow-x-auto leading-relaxed">
                                {resp.codeSubmitted}
                              </pre>
                            </div>
                          )}

                          {resp.userAnswer && (
                            <div className="space-y-1">
                              <div className="text-[10px] font-mono text-[#8E8B84]">
                                Candidate Written Rationale:
                              </div>
                              <div className="bg-[#FAF8F5] border border-[#E5E2DA] rounded p-3 text-xs text-[#33312E] font-mono leading-relaxed whitespace-pre-wrap">
                                {resp.userAnswer}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono pt-1">
                            <div className="border border-[#E5E2DA] bg-[#FAF8F5] rounded p-1.5">
                              <span className="text-[#8E8B84] text-[10px]">Rel:</span>{" "}
                              <span className="font-bold text-[#1A1918]">
                                {resp.scores.relevance}/10
                              </span>
                            </div>
                            <div className="border border-[#E5E2DA] bg-[#FAF8F5] rounded p-1.5">
                              <span className="text-[#8E8B84] text-[10px]">Depth:</span>{" "}
                              <span className="font-bold text-[#1A1918]">
                                {resp.scores.depth}/10
                              </span>
                            </div>
                            <div className="border border-[#E5E2DA] bg-[#FAF8F5] rounded p-1.5">
                              <span className="text-[#8E8B84] text-[10px]">Clarity:</span>{" "}
                              <span className="font-bold text-[#1A1918]">
                                {resp.scores.clarity}/10
                              </span>
                            </div>
                          </div>

                          <div className="text-[11px] text-[#55524C] pt-2 border-t border-[#E5E2DA] leading-relaxed">
                            <span className="font-semibold text-[#1A1918]">
                              Feedback:{" "}
                            </span>
                            {resp.feedback}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL: INTERACTIVE EXPERT QUIZ RUNNER & SCORER */}
        {/* ============================================================ */}
        {activeQuizModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1918]/45 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: EASE_CURVE }}
              className="w-full max-w-3xl my-8 rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5 shadow-2xl"
            >
              <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 sm:p-8 space-y-6 max-h-[88vh] overflow-y-auto">
                {/* ── STATE A: QUIZ RUNNER (In Progress) ── */}
                {!quizResult ? (
                  <>
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-[#E5E2DA] pb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 rounded-sm text-[#1A1918] uppercase">
                            {activeQuizModal.topic}
                          </span>
                          <span className="text-[10px] font-mono bg-[#1A1918] text-[#FAF8F5] px-2 py-0.5 rounded-sm">
                            Attempt #{activeQuizModal.attemptNumber}
                            {activeQuizModal.maxAttempts > 0 && ` of ${activeQuizModal.maxAttempts}`}
                          </span>
                          {remainingQuizSeconds !== null && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-mono ${
                                remainingQuizSeconds <= 60
                                  ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
                                  : "border-[#E5E2DA] bg-[#FAF8F5] text-[#6E6B65]"
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {Math.floor(remainingQuizSeconds / 60)}:
                              {String(remainingQuizSeconds % 60).padStart(2, "0")} left
                            </span>
                          )}
                        </div>
                        <h2 className="text-xl font-bold text-[#1A1918]">
                          {activeQuizModal.title}
                        </h2>
                      </div>

                      <button
                        onClick={handleLeaveQuiz}
                        disabled={leavingQuiz || quizSubmitting}
                        className="p-1.5 rounded-md text-[#8E8B84] hover:text-[#1A1918] hover:bg-[#FAF8F5] transition-colors"
                        title="Leave quiz (uses one attempt)"
                      >
                        {leavingQuiz ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Telemetry Strip: Jumbled notice + Progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-[#6E6B65]">
                        <span>
                          Question {activeQuizQuestionIdx + 1} of {activeQuizModal.totalQuestions}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-1.5 w-full bg-[#E5E2DA] rounded-full overflow-hidden">
                        <div
                          style={{
                            width: `${
                              ((activeQuizQuestionIdx + 1) /
                                activeQuizModal.totalQuestions) *
                              100
                            }%`,
                          }}
                          className="h-full bg-[#1A1918] transition-all duration-300"
                        />
                      </div>
                    </div>

                    {/* Question Card */}
                    {activeQuizModal.questions[activeQuizQuestionIdx] && (
                      <div className="space-y-5 py-2">
                        <div className="text-base sm:text-lg font-bold text-[#1A1918] leading-snug">
                          {activeQuizModal.questions[activeQuizQuestionIdx].question}
                        </div>

                        {/* Options List */}
                        <div className="space-y-2.5">
                          {activeQuizModal.questions[activeQuizQuestionIdx].options.map(
                            (option, optIdx) => {
                              const currentQId =
                                activeQuizModal.questions[activeQuizQuestionIdx].id;
                              const isSelected =
                                quizAnswers[currentQId] === option;
                              const letter = String.fromCharCode(65 + optIdx);

                              return (
                                <button
                                  type="button"
                                  key={optIdx}
                                  onClick={() =>
                                    handleSelectQuizOption(currentQId, option)
                                  }
                                  className={`w-full flex items-start gap-3.5 p-4 rounded-lg border text-left text-xs transition-all ${
                                    isSelected
                                      ? "border-[#1A1918] bg-[#FAF8F5] shadow-xs"
                                      : "border-[#E5E2DA] bg-[#FFFFFF] hover:border-[#D5D1C7] hover:bg-[#FAF8F5]/50"
                                  }`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono shrink-0 transition-colors ${
                                      isSelected
                                        ? "bg-[#1A1918] text-[#FAF8F5]"
                                        : "border border-[#D5D1C7] bg-[#FFFFFF] text-[#6E6B65]"
                                    }`}
                                  >
                                    {letter}
                                  </span>
                                  <span
                                    className={`leading-relaxed text-sm ${
                                      isSelected
                                        ? "font-semibold text-[#1A1918]"
                                        : "text-[#33312E]"
                                    }`}
                                  >
                                    {option}
                                  </span>
                                </button>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}

                    {/* Error Notice */}
                    {quizRunnerError && (
                      <div className="p-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] text-xs font-mono text-[#991B1B]">
                        {quizRunnerError}
                      </div>
                    )}

                    {/* Footer Nav Controls */}
                    <div className="flex items-center justify-between gap-2 pt-4 border-t border-[#E5E2DA]">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleLeaveQuiz}
                          disabled={leavingQuiz || quizSubmitting}
                          className="rounded-lg border border-[#E5E2DA] px-3 py-2 text-xs font-medium text-[#6E6B65] hover:bg-[#FAF8F5] disabled:opacity-50"
                        >
                          {leavingQuiz ? "Leaving..." : "Leave quiz · uses 1 attempt"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveQuizQuestionIdx((prev) => Math.max(0, prev - 1))
                          }
                          disabled={activeQuizQuestionIdx === 0 || quizSubmitting}
                          className="px-4 py-2 rounded-lg border border-[#E5E2DA] text-xs font-medium text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#FAF8F5] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          Previous
                        </button>
                      </div>

                      {activeQuizQuestionIdx < activeQuizModal.totalQuestions - 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveQuizQuestionIdx((prev) =>
                              Math.min(activeQuizModal.totalQuestions - 1, prev + 1)
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-semibold hover:bg-[#2C2A28] transition-all"
                        >
                          <span>Next Question</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSubmitQuiz()}
                          disabled={quizSubmitting}
                          className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-[#1F7A55] text-white text-xs font-semibold hover:bg-[#186043] disabled:opacity-50 transition-all shadow-xs"
                        >
                          {quizSubmitting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Evaluating Answers...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Submit &amp; Score Assessment</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  /* ── STATE B: EVALUATION RESULTS & BREAKDOWN ── */
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-[#E5E2DA] pb-4">
                      <div>
                        <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#1F7A55]">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {quizResult.status === "timed_out"
                              ? "Time expired · submitted"
                              : "Assessment Complete"}
                          </span>
                        </div>
                        <h2 className="text-2xl font-bold text-[#1A1918] mt-1">
                          Performance Report: {activeQuizModal.title}
                        </h2>
                      </div>

                      <button
                        onClick={handleCloseQuizModal}
                        className="p-1.5 rounded-md text-[#8E8B84] hover:text-[#1A1918] hover:bg-[#FAF8F5] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Double-Bezel Score Card */}
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                      <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 text-center space-y-2 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                        <div className="text-[11px] font-mono text-[#6E6B65] uppercase">
                          Final Accuracy Score
                        </div>
                        <div className="text-4xl font-extrabold font-mono text-[#1A1918]">
                          {quizResult.percentage}%
                        </div>
                        <div className="text-xs font-mono text-[#1F7A55] font-semibold">
                          {quizResult.score} of {quizResult.total} Questions Answered Correctly
                        </div>
                        <div className="text-[11px] text-[#6E6B65] pt-2 border-t border-[#E5E2DA]">
                          Attempt #{quizResult.attemptNumber}
                          {quizResult.maxAttempts > 0
                            ? ` • ${quizResult.remainingAttempts} of ${quizResult.maxAttempts} attempts remaining`
                            : " • Unlimited attempts allowed by expert"}
                        </div>
                      </div>
                    </div>

                    {/* Question Breakdown Review */}
                    <div className="space-y-3">
                      <div className="text-xs font-mono text-[#6E6B65] uppercase">
                        Question Review &amp; Explanations
                      </div>

                      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                        {quizResult.breakdown.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-4 rounded-lg border text-xs space-y-2 ${
                              item.isCorrect
                                ? "border-[#CBE4D6] bg-[#F0FDF4]/60"
                                : "border-[#FCA5A5] bg-[#FEF2F2]/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-[#1A1918]">
                                Q{idx + 1}. {item.question}
                              </span>
                              <span
                                className={`shrink-0 font-mono text-[10px] px-2 py-0.5 rounded-sm font-bold ${
                                  item.isCorrect
                                    ? "bg-[#CBE4D6] text-[#1F7A55]"
                                    : "bg-[#FCA5A5] text-[#991B1B]"
                                }`}
                              >
                                {item.isCorrect ? "✓ CORRECT" : "✗ INCORRECT"}
                              </span>
                            </div>

                            <div className="text-[11px] font-mono space-y-1 pt-1">
                              <div>
                                <span className="text-[#6E6B65]">Your Answer: </span>
                                <span className={item.isCorrect ? "text-[#1F7A55] font-semibold" : "text-[#991B1B] font-semibold"}>
                                  {item.selectedAnswer || "(No answer selected)"}
                                </span>
                              </div>
                              {!item.isCorrect && (
                                <div>
                                  <span className="text-[#6E6B65]">Correct Answer: </span>
                                  <span className="text-[#1F7A55] font-semibold">
                                    {item.correctAnswer}
                                  </span>
                                </div>
                              )}
                            </div>

                            {item.explanation && (
                              <div className="text-[11px] text-[#55524C] pt-2 border-t border-[#E5E2DA] leading-relaxed">
                                <span className="font-semibold text-[#1A1918]">Explanation: </span>
                                {item.explanation}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Results Footer */}
                    <div className="flex justify-end pt-4 border-t border-[#E5E2DA]">
                      <button
                        onClick={handleCloseQuizModal}
                        className="px-5 py-2.5 rounded-lg bg-[#1A1918] text-[#FAF8F5] text-xs font-semibold hover:bg-[#2C2A28] transition-all shadow-xs"
                      >
                        Return to Boardroom
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {resultsQuiz && (
        <QuizResultsModal
          quizId={resultsQuiz._id}
          quizTitle={resultsQuiz.title}
          view="candidate"
          onClose={() => setResultsQuiz(null)}
        />
      )}
    </div>
  );
}
