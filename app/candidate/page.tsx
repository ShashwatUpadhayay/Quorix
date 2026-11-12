"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  FileText,
  Calendar,
  BarChart3,
  User,
  LogOut,
  Plus,
  X,
  Send,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Layers,
  ShieldCheck,
  Download,
} from "lucide-react";
import UserProfileView from "@/components/UserProfileView";
import ResumeParserPanel from "@/components/ResumeParserPanel";
import type { DifficultyTier, InterviewConfig, SkillItem } from "@/lib/mongodb";
import {
  computeTopicCoverage,
  evaluateAdaptiveAnswer,
  generateAdaptiveMockQuestions,
} from "@/lib/adaptiveEngine";

interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
}

const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  experienceYears: 2,
  difficultyTier: "Intermediate",
  difficultyNumeric: 2,
  primaryTopics: ["Backend & APIs", "Databases & Storage"],
  focusAreas: ["REST APIs", "SQL", "System Design"],
  recommendedTrack: "Intermediate Backend & APIs Track",
};

const TIER_NUMERIC_MAP: Record<DifficultyTier, number> = {
  Foundational: 1,
  Intermediate: 2,
  Senior: 3,
  Staff: 4,
};

const DIFFICULTY_TIERS: Array<{
  value: DifficultyTier;
  tier: string;
  desc: string;
}> = [
  { value: "Foundational", tier: "Tier 1", desc: "Core concepts & syntax" },
  { value: "Intermediate", tier: "Tier 2", desc: "Production trade-offs" },
  { value: "Senior", tier: "Tier 3", desc: "Scale & failure modes" },
  { value: "Staff", tier: "Tier 4", desc: "Org-wide architecture" },
];

const INTERVIEW_STAGES: Array<{
  id: "icebreaker" | "technical" | "managerial";
  step: string;
  label: string;
  subtitle: string;
}> = [
  {
    id: "icebreaker",
    step: "01",
    label: "Ice-Breaker",
    subtitle: "Context & motivation",
  },
  {
    id: "technical",
    step: "02",
    label: "Core Technical",
    subtitle: "Architecture & depth",
  },
  {
    id: "managerial",
    step: "03",
    label: "Techno-Managerial",
    subtitle: "Trade-offs & leadership",
  },
];

const FALLBACK_TOPICS = [
  "Distributed Systems",
  "Backend & APIs",
  "Databases & Storage",
  "Frontend & UI",
  "Cloud & DevOps",
  "AI & ML Systems",
];

const EASE_CURVE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function CandidateWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Active feature in sidebar (shows 1 feature at a time)
  const [activeFeature, setActiveFeature] = useState<
    "mock" | "resume" | "boards" | "reports" | "profile"
  >("mock");

  // Profile-backed Skills & Adaptive Interview Calibration
  const [profileSkills, setProfileSkills] = useState<SkillItem[]>([]);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(
    DEFAULT_INTERVIEW_CONFIG
  );
  const [newSkillInput, setNewSkillInput] = useState("");

  // State: Adaptive Mock Interview
  const [mockConfig, setMockConfig] = useState<{
    topic: string;
    difficulty: DifficultyTier;
  }>({
    topic: DEFAULT_INTERVIEW_CONFIG.primaryTopics[0],
    difficulty: DEFAULT_INTERVIEW_CONFIG.difficultyTier,
  });
  const [mockActive, setMockActive] = useState(false);
  const [mockStage, setMockStage] = useState<
    "icebreaker" | "technical" | "managerial"
  >("icebreaker");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [practicedTopics, setPracticedTopics] = useState<string[]>([]);
  const [evaluatedResponses, setEvaluatedResponses] = useState<
    Array<{
      question: string;
      answer: string;
      stage: string;
      topic: string;
      scores: {
        relevance: number;
        depth: number;
        clarity: number;
        overall: number;
      };
      feedback: string;
    }>
  >([]);

  // Inline feedback banners (replacing jarring browser alerts)
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

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
      setMockConfig({
        topic: loadedConfig.primaryTopics[0] || "Backend & APIs",
        difficulty: loadedConfig.difficultyTier || "Intermediate",
      });
    } catch {
      // Ignored
    }
  }, []);

  // Authentication check + initial profile hydration on mount
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
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, hydrateFromProfile]);

  const effectiveMockConfig = useMemo<InterviewConfig>(() => {
    const restTopics = interviewConfig.primaryTopics.filter(
      (t) => t !== mockConfig.topic
    );
    return {
      ...interviewConfig,
      difficultyTier: mockConfig.difficulty,
      difficultyNumeric: TIER_NUMERIC_MAP[mockConfig.difficulty] || 2,
      primaryTopics: [mockConfig.topic, ...restTopics],
    };
  }, [interviewConfig, mockConfig]);

  const availableTopics = useMemo(
    () =>
      Array.from(
        new Set([...interviewConfig.primaryTopics, ...FALLBACK_TOPICS])
      ),
    [interviewConfig.primaryTopics]
  );

  const adaptiveQuestions = useMemo(
    () => generateAdaptiveMockQuestions(effectiveMockConfig, profileSkills),
    [effectiveMockConfig, profileSkills]
  );

  const activeMockQuestion = useMemo(() => {
    return (
      adaptiveQuestions.find((q) => q.stage === mockStage) ||
      adaptiveQuestions[0]
    );
  }, [adaptiveQuestions, mockStage]);

  const topicCoverage = useMemo(
    () => computeTopicCoverage(interviewConfig, profileSkills, practicedTopics),
    [interviewConfig, profileSkills, practicedTopics]
  );

  const sessionAverage = useMemo(() => {
    if (evaluatedResponses.length === 0) return null;
    const sum = evaluatedResponses.reduce(
      (acc, item) => acc + item.scores.overall,
      0
    );
    return (sum / evaluatedResponses.length).toFixed(1);
  }, [evaluatedResponses]);

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

  const syncSkillsToProfile = async (
    updatedSkills: SkillItem[],
    activityLabel: string,
    activityDetail: string
  ) => {
    setProfileSkills(updatedSkills);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: updatedSkills,
          activityLabel,
          activityDetail,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile?.interviewConfig) {
          setInterviewConfig(data.profile.interviewConfig);
        }
      }
    } catch {
      // Ignored
    }
  };

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillInput.trim()) return;
    const trimmed = newSkillInput.trim();
    if (
      !profileSkills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      const nextSkills: SkillItem[] = [
        ...profileSkills,
        { id: `sk-${Date.now()}`, name: trimmed, level: "Core" },
      ];
      syncSkillsToProfile(nextSkills, "Added Competency Tag", trimmed);
    }
    setNewSkillInput("");
  };

  const handleRemoveSkill = (skillToRemove: SkillItem) => {
    const nextSkills = profileSkills.filter((s) => s.id !== skillToRemove.id);
    syncSkillsToProfile(
      nextSkills,
      "Removed Competency Tag",
      skillToRemove.name
    );
  };

  const handleSubmitMockAnswer = () => {
    if (!currentAnswer.trim() || !activeMockQuestion) return;
    setIsEvaluating(true);
    const stageLabel =
      mockStage === "icebreaker"
        ? "Ice-Breaker"
        : mockStage === "technical"
          ? "Core Technical"
          : "Techno-Managerial";

    setTimeout(() => {
      const evaluation = evaluateAdaptiveAnswer(
        activeMockQuestion,
        currentAnswer,
        effectiveMockConfig
      );
      const newEval = {
        question: activeMockQuestion.prompt,
        answer: currentAnswer,
        stage: stageLabel,
        topic: activeMockQuestion.topic,
        scores: {
          relevance: evaluation.relevance,
          depth: evaluation.depth,
          clarity: evaluation.clarity,
          overall: evaluation.overall,
        },
        feedback: evaluation.feedback,
      };

      setEvaluatedResponses([newEval, ...evaluatedResponses]);
      setPracticedTopics((prev) => [...prev, activeMockQuestion.topic]);
      setCurrentAnswer("");
      setIsEvaluating(false);
      logWorkspaceActivity(
        "Submitted Mock Interview Response",
        "interview",
        `${stageLabel} (${activeMockQuestion.topic} • ${effectiveMockConfig.difficultyTier}) — ${evaluation.overall}/10`
      );

      if (mockStage === "icebreaker") setMockStage("technical");
      else if (mockStage === "technical") setMockStage("managerial");
    }, 600);
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
      desc: "Solo adaptive practice",
      icon: Play,
    },
    {
      id: "resume",
      label: "Resume & Skills",
      desc: "Auto-build & verify",
      icon: FileText,
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
      desc: "Dossier & daily activity",
      icon: User,
    },
  ] as const;

  const activeWordCount = currentAnswer.trim()
    ? currentAnswer.trim().split(/\s+/).length
    : 0;

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
                    if (item.id !== "profile") {
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
      {/* MAIN CONTENT AREA — SHOWS 1 FEATURE AT A TIME */}
      {/* ============================================================ */}
      <main className="flex-1 bg-[#FAF8F5] min-h-screen p-5 sm:p-8 lg:p-12 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {/* ========================================================== */}
            {/* FEATURE 1: SOLO AI MOCK INTERVIEW */}
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
                {/* Header + Compact Session Status Bar */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-[#E5E2DA] pb-6">
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                      <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                      <span>Adaptive AI Practice Studio</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                      Solo AI Mock Interview
                    </h1>
                    <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                      Prompts adapt to your resume and domain tags, scoring each response across Relevance, Depth, and Clarity.
                    </p>
                  </div>

                  {/* Single-Source Session Telemetry Strip */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] px-4 py-2.5 flex items-center gap-5 text-xs">
                      <div>
                        <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                          Scored
                        </div>
                        <div className="font-mono font-semibold text-[#1A1918] tabular-nums">
                          {evaluatedResponses.length}
                        </div>
                      </div>
                      <div className="h-6 w-px bg-[#E5E2DA]" />
                      <div>
                        <div className="text-[10px] font-mono text-[#8E8B84] uppercase">
                          Avg Score
                        </div>
                        <div className="font-mono font-semibold text-[#1F7A55] tabular-nums">
                          {sessionAverage ? `${sessionAverage}/10` : "—"}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setMockActive(!mockActive)}
                      className="group inline-flex items-center gap-2.5 rounded-lg text-xs font-medium bg-[#1A1918] text-[#FAF8F5] pl-4 pr-2.5 py-2.5 hover:bg-[#2C2A28] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                    >
                      <span>
                        {mockActive ? "Pause Session" : "Start Mock Interview"}
                      </span>
                      <span className="w-6 h-6 rounded-md bg-[#FAF8F5]/12 flex items-center justify-center transition-transform group-hover:translate-x-0.5">
                        {mockActive ? (
                          <Pause className="w-3 h-3" strokeWidth={2} />
                        ) : (
                          <Play className="w-3 h-3" strokeWidth={2} />
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Double-Bezel Session Configuration Tray */}
                <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                  <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-6 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                    {/* Top Row: Calibration summary + Stage Pipeline */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E5E2DA]">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-md border border-[#E5E2DA] bg-[#FAF8F5] flex items-center justify-center shrink-0 mt-0.5">
                          <SlidersHorizontal
                            className="w-4 h-4 text-[#1A1918]"
                            strokeWidth={1.75}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#1A1918]">
                            Interview Calibration
                          </div>
                          <div className="text-xs text-[#6E6B65] mt-0.5">
                            Focused on{" "}
                            <span className="text-[#1A1918] font-medium">
                              {mockConfig.topic}
                            </span>{" "}
                            at{" "}
                            <span className="text-[#1F7A55] font-medium">
                              {mockConfig.difficulty}
                            </span>{" "}
                            depth
                          </div>
                        </div>
                      </div>

                      {/* 3-Stage Interview Pipeline */}
                      <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-[#E5E2DA] rounded-lg p-1">
                        {INTERVIEW_STAGES.map((stage) => {
                          const isCurrent = mockStage === stage.id;
                          return (
                            <button
                              key={stage.id}
                              type="button"
                              onClick={() => setMockStage(stage.id)}
                              className={`px-2.5 py-1.5 rounded-md text-left transition-all ${
                                isCurrent
                                  ? "bg-[#FFFFFF] border border-[#D5D1C7] text-[#1A1918] shadow-[0_1px_2px_rgba(26,25,24,0.04)]"
                                  : "text-[#6E6B65] border border-transparent hover:text-[#1A1918]"
                              }`}
                            >
                              <div className="text-[10px] font-mono leading-none">
                                {stage.step} · {stage.label}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive Topic Selector Chips */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-[#1A1918]">
                          Interview Domain
                        </label>
                        <span className="text-[11px] font-mono text-[#6E6B65]">
                          {interviewConfig.primaryTopics.includes(
                            mockConfig.topic
                          )
                            ? "Matched to your profile"
                            : "Custom domain"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableTopics.map((topicOption) => {
                          const selected = mockConfig.topic === topicOption;
                          const fromProfile =
                            interviewConfig.primaryTopics.includes(topicOption);
                          return (
                            <button
                              key={topicOption}
                              type="button"
                              onClick={() =>
                                setMockConfig({
                                  ...mockConfig,
                                  topic: topicOption,
                                })
                              }
                              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                selected
                                  ? "bg-[#1A1918] text-[#FAF8F5] font-medium border border-[#1A1918]"
                                  : "bg-[#FAF8F5] text-[#423F3A] border border-[#E5E2DA] hover:border-[#B5B1A7] hover:text-[#1A1918]"
                              }`}
                            >
                              <span>{topicOption}</span>
                              {fromProfile && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-xs ${
                                    selected ? "bg-[#7CC09D]" : "bg-[#1F7A55]"
                                  }`}
                                  title="From your profile"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive Segmented Difficulty Selector */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-[#1A1918]">
                          Difficulty Tier
                        </label>
                        <span className="text-[11px] font-mono text-[#6E6B65]">
                          Profile baseline: {interviewConfig.difficultyTier}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {DIFFICULTY_TIERS.map((item) => {
                          const selected = mockConfig.difficulty === item.value;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() =>
                                setMockConfig({
                                  ...mockConfig,
                                  difficulty: item.value,
                                })
                              }
                              className={`rounded-lg border p-3 text-left transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                selected
                                  ? "border-[#1A1918] bg-[#FAF8F5] shadow-[inset_0_0_0_1px_#1A1918]"
                                  : "border-[#E5E2DA] bg-[#FFFFFF] hover:border-[#C7C2B6] hover:bg-[#FAF8F5]/60"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#1A1918]">
                                  {item.value}
                                </span>
                                <span className="text-[10px] font-mono text-[#6E6B65]">
                                  {item.tier}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#6E6B65] mt-1">
                                {item.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Focus Areas Driven by Profile */}
                    {interviewConfig.focusAreas.length > 0 && (
                      <div className="pt-4 border-t border-[#E5E2DA] flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-mono text-[#6E6B65] mr-1">
                          Active signals:
                        </span>
                        {interviewConfig.focusAreas.slice(0, 6).map((area) => (
                          <span
                            key={area}
                            className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 font-mono text-[#423F3A]"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Active Practice Question Studio */}
                <AnimatePresence>
                  {mockActive && activeMockQuestion && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25, ease: EASE_CURVE }}
                      className="rounded-xl border border-[#1A1918] bg-[#FFFFFF] p-6 sm:p-7 space-y-5 shadow-[0_4px_16px_rgba(26,25,24,0.06)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E2DA] pb-4">
                        <div className="flex items-center gap-2.5 text-xs font-mono">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#EDF3EC] text-[#1F7A55] px-2.5 py-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-xs bg-[#1F7A55]" />
                            Live Prompt
                          </span>
                          <span className="text-[#423F3A]">
                            {
                              INTERVIEW_STAGES.find((s) => s.id === mockStage)
                                ?.label
                            }{" "}
                            · {activeMockQuestion.topic}
                          </span>
                        </div>
                        <span className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2.5 py-1 text-[11px] font-mono text-[#1A1918]">
                          {activeMockQuestion.difficulty}
                        </span>
                      </div>

                      <div className="text-base sm:text-lg font-semibold text-[#1A1918] leading-relaxed max-w-prose">
                        {activeMockQuestion.prompt}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <label
                            htmlFor="mock-answer-input"
                            className="font-medium text-[#423F3A]"
                          >
                            Your Technical Response
                          </label>
                          <span className="font-mono text-[11px] text-[#8E8B84] tabular-nums">
                            {activeWordCount} words
                          </span>
                        </div>
                        <textarea
                          id="mock-answer-input"
                          rows={6}
                          value={currentAnswer}
                          onChange={(e) => setCurrentAnswer(e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              (e.metaKey || e.ctrlKey) &&
                              e.key === "Enter" &&
                              currentAnswer.trim() &&
                              !isEvaluating
                            ) {
                              e.preventDefault();
                              handleSubmitMockAnswer();
                            }
                          }}
                          placeholder="Outline your architecture, trade-offs, data flow, and failure recovery strategy..."
                          className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] p-4 text-sm text-[#1A1918] placeholder-[#8E8B84] leading-relaxed focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2 text-xs text-[#6E6B65]">
                          <span>Evaluates Relevance, Depth, and Clarity</span>
                          <span className="hidden sm:inline text-[#D5D1C7]">
                            |
                          </span>
                          <kbd className="hidden sm:inline-block rounded border border-[#E5E2DA] bg-[#FAF8F5] px-1.5 py-0.5 font-mono text-[10px] text-[#55524C]">
                            Ctrl + Enter
                          </kbd>
                        </div>
                        <button
                          onClick={handleSubmitMockAnswer}
                          disabled={isEvaluating || !currentAnswer.trim()}
                          className="inline-flex items-center justify-center rounded-lg text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-5 py-2.5 hover:bg-[#2C2A28] disabled:opacity-45 active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                        >
                          <Send className="w-3.5 h-3.5 mr-2" strokeWidth={1.75} />
                          <span>
                            {isEvaluating
                              ? "Scoring Response..."
                              : "Submit Answer"}
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Evaluated Answers History OR Composed Empty State */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-mono text-[#6E6B65] uppercase tracking-wider">
                      Session Evaluation History
                    </h2>
                    <span className="text-xs font-mono text-[#6E6B65] tabular-nums">
                      {evaluatedResponses.length}{" "}
                      {evaluatedResponses.length === 1 ? "answer" : "answers"}{" "}
                      scored
                    </span>
                  </div>

                  {evaluatedResponses.length === 0 ? (
                    <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="space-y-2 max-w-lg">
                        <div className="inline-flex items-center gap-2 text-xs font-medium text-[#1A1918]">
                          <Layers
                            className="w-4 h-4 text-[#1F7A55]"
                            strokeWidth={1.75}
                          />
                          <span>Ready for your first response</span>
                        </div>
                        <p className="text-xs text-[#55524C] leading-relaxed">
                          Start the mock interview above to answer a calibrated prompt. Every submission is scored out of 10 on Relevance, Technical Depth, and Communication Clarity, and updates your topic coverage report.
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 shrink-0 text-center font-mono">
                        {["Relevance", "Depth", "Clarity"].map((axis) => (
                          <div
                            key={axis}
                            className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] px-3 py-2.5"
                          >
                            <div className="text-[10px] text-[#8E8B84] uppercase">
                              {axis}
                            </div>
                            <div className="text-xs font-semibold text-[#1A1918] mt-1 tabular-nums">
                              / 10
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {evaluatedResponses.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-[0_1px_2px_rgba(26,25,24,0.03)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 font-mono text-[#6E6B65]">
                              <span className="rounded-md bg-[#FAF8F5] border border-[#E5E2DA] px-2 py-0.5 text-[#1A1918]">
                                {item.stage}
                              </span>
                              <span>{item.topic}</span>
                            </div>
                            <span className="font-mono font-bold text-[#1F7A55] rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-2.5 py-1 tabular-nums">
                              Overall: {item.scores.overall} / 10
                            </span>
                          </div>

                          <div className="text-sm font-semibold text-[#1A1918] leading-snug">
                            {item.question}
                          </div>

                          <div className="rounded-lg bg-[#FAF8F5] border border-[#E5E2DA] p-3.5 text-xs text-[#33312E] font-mono leading-relaxed">
                            {item.answer}
                          </div>

                          {/* Tri-Factor Visual Rubric Bars */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            {[
                              { label: "Relevance", val: item.scores.relevance },
                              { label: "Depth", val: item.scores.depth },
                              { label: "Clarity", val: item.scores.clarity },
                            ].map((metric) => (
                              <div
                                key={metric.label}
                                className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between text-xs font-mono">
                                  <span className="text-[#6E6B65] text-[11px] uppercase">
                                    {metric.label}
                                  </span>
                                  <span className="font-bold text-[#1A1918] tabular-nums">
                                    {metric.val} / 10
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-[#E5E2DA] rounded-xs overflow-hidden">
                                  <div
                                    className="h-full bg-[#1A1918] rounded-xs"
                                    style={{ width: `${metric.val * 10}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="text-xs text-[#55524C] pt-3 border-t border-[#E5E2DA] leading-relaxed">
                            <span className="font-semibold text-[#1A1918]">
                              Evaluator Feedback:{" "}
                            </span>
                            {item.feedback}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ========================================================== */}
            {/* FEATURE 2: RESUME PARSER & SKILL TAGS */}
            {/* ========================================================== */}
            {activeFeature === "resume" && (
              <motion.div
                key="resume"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_CURVE }}
                className="space-y-8"
              >
                <div className="border-b border-[#E5E2DA] pb-6 space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                    <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                    <span>Resume Intelligence &amp; Competency Sync</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                    Resume Parser &amp; Domain Verification
                  </h1>
                  <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                    Upload or paste your resume to populate your dossier and calibrate interview difficulty and topic focus across the studio.
                  </p>
                </div>

                <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                  <div className="rounded-lg bg-[#FFFFFF] p-1">
                    <ResumeParserPanel
                      onProfileSynced={({ updatedName }) => {
                        hydrateFromProfile();
                        if (updatedName) {
                          setUser((prev) =>
                            prev ? { ...prev, name: updatedName } : prev
                          );
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Verified Domain Competencies */}
                <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-5 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#E5E2DA]">
                    <div>
                      <h2 className="text-sm font-semibold text-[#1A1918]">
                        Verified Domain Competencies
                      </h2>
                      <p className="text-xs text-[#6E6B65] mt-0.5">
                        These tags guide adaptive question generation and topic coverage audits.
                      </p>
                    </div>
                    <span className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2.5 py-1 text-xs font-mono text-[#1A1918] tabular-nums w-fit">
                      {profileSkills.length} active
                    </span>
                  </div>

                  {profileSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profileSkills.map((skill) => (
                        <span
                          key={skill.id}
                          className="inline-flex items-center gap-2 rounded-md border border-[#D5D1C7] bg-[#FAF8F5] px-3 py-1.5 text-xs text-[#1A1918]"
                        >
                          <span className="font-medium">{skill.name}</span>
                          <span className="text-[10px] font-mono text-[#6E6B65]">
                            {skill.level}
                          </span>
                          <button
                            onClick={() => handleRemoveSkill(skill)}
                            className="text-[#8E8B84] hover:text-[#B45332] transition-colors focus-visible:outline-1 focus-visible:outline-[#1A1918]"
                            title={`Remove ${skill.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[#D5D1C7] bg-[#FAF8F5] p-5 text-xs text-[#6E6B65]">
                      No verified competencies yet. Parse your resume above or add tags manually below.
                    </div>
                  )}

                  <form
                    onSubmit={handleAddSkill}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2"
                  >
                    <input
                      type="text"
                      value={newSkillInput}
                      onChange={(e) => setNewSkillInput(e.target.value)}
                      placeholder="Add competence tag (e.g. Kubernetes, gRPC, Redis)..."
                      className="rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2 text-xs text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918] sm:max-w-sm w-full"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-lg text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-4 py-2 hover:bg-[#2C2A28] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      <span>Add Tag</span>
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* ========================================================== */}
            {/* FEATURE 3: LIVE BOARDROOM PANELS */}
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
                <div className="border-b border-[#E5E2DA] pb-6 space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
                    <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
                    <span>Multi-Expert Live Panels</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-[#1A1918]">
                    Live Boardroom Sessions
                  </h1>
                  <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
                    Join scheduled live interviews matched to your profile&apos;s domain topics and difficulty tier with real-time AI co-pilot assistance.
                  </p>
                </div>

                {/* Double-Bezel Scheduled Boardroom Card */}
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
                        <span className="w-6 h-6 rounded-md bg-[#FAF8F5]/12 flex items-center justify-center transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
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

                  <div className="rounded-xl border border-[#E5E2DA] bg-[#F2EFE9] p-1.5">
                    <div className="rounded-lg border border-[#E5E2DA] bg-[#FFFFFF] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-[#1A1918]">
                          {interviewConfig.recommendedTrack}
                        </div>
                        <div className="text-xs text-[#6E6B65] mt-1 tabular-nums">
                          {evaluatedResponses.length} responses scored in current session ·{" "}
                          {interviewConfig.primaryTopics
                            .slice(0, 2)
                            .join(" & ")}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-mono text-base font-bold text-[#1A1918] tabular-nums">
                            {sessionAverage ? `${sessionAverage} / 10` : "Ready"}
                          </div>
                          <div className="text-[10px] text-[#1F7A55] font-mono">
                            {evaluatedResponses.length > 0
                              ? "Session Average"
                              : "No Answers Yet"}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            logWorkspaceActivity(
                              "Exported Audit Dossier",
                              "interview",
                              interviewConfig.recommendedTrack
                            );
                            setExportNotice(
                              `Audit dossier for ${interviewConfig.recommendedTrack} compiled and logged to your activity record.`
                            );
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2 hover:bg-[#EFECE4] active:scale-[0.98] text-xs font-medium text-[#1A1918] transition-all"
                        >
                          <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Export Dossier</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {exportNotice && (
                    <div className="flex items-center gap-2 rounded-lg border border-[#CBE4D6] bg-[#EDF3EC] px-3.5 py-2.5 text-xs text-[#1F7A55]">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{exportNotice}</span>
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
    </div>
  );
}
