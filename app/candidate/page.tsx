"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  FileText,
  Calendar,
  BarChart3,
  User,
  LogOut,
  Plus,
  X,
  Code2,
  Terminal,
  Cpu,
  Users,
  Clock,
  ArrowRight,
  ShieldCheck,
  Eye,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import UserProfileView from "@/components/UserProfileView";
import ResumeParserPanel from "@/components/ResumeParserPanel";
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
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "coding",
    title: "Coding & Algorithms",
    desc: "Data structures, algorithmic problem solving & live code editor",
    icon: Code2,
  },
  {
    id: "technical",
    title: "Technical Systems",
    desc: "Framework internals, memory, concurrency & runtime mechanics",
    icon: Terminal,
  },
  {
    id: "system_design",
    title: "System Design",
    desc: "Distributed scalability, storage, caching & high availability",
    icon: Cpu,
  },
  {
    id: "behavioral",
    title: "Behavioral & Leadership",
    desc: "STAR methodology, high-stakes incidents & trade-off decisions",
    icon: Users,
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
    "mock" | "resume" | "boards" | "reports" | "profile"
  >("mock");

  // Profile-backed Skills & Interview Calibration
  const [profileSkills, setProfileSkills] = useState<SkillItem[]>([]);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(
    DEFAULT_INTERVIEW_CONFIG
  );
  const [newSkillInput, setNewSkillInput] = useState("");

  // New Mock Interview Setup State
  const [selectedInterviewType, setSelectedInterviewType] =
    useState<InterviewType>("technical");
  const [selectedLevel, setSelectedLevel] =
    useState<DifficultyTier>("Intermediate");
  const [selectedFocus, setSelectedFocus] = useState<string>("Backend & APIs");
  const [customFocusInput, setCustomFocusInput] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [isLaunchingSession, setIsLaunchingSession] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Historical Mock Interview Sessions
  const [mockSessions, setMockSessions] = useState<MockSessionDoc[]>([]);
  const [selectedTranscriptSession, setSelectedTranscriptSession] =
    useState<MockSessionDoc | null>(null);

  // Inline feedback banners
  const [boardNotice, setBoardNotice] = useState<string | null>(null);

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
      setSelectedLevel(loadedConfig.difficultyTier || "Intermediate");
      if (loadedConfig.primaryTopics?.[0]) {
        setSelectedFocus(loadedConfig.primaryTopics[0]);
      }
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
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, hydrateFromProfile, fetchPastSessions]);

  const availableFocusTags = useMemo(() => {
    const fromProfile = profileSkills.map((s) => s.name);
    return Array.from(
      new Set([
        ...interviewConfig.primaryTopics,
        ...fromProfile,
        ...POPULAR_FRAMEWORKS_AND_LANGUAGES,
      ])
    );
  }, [profileSkills, interviewConfig.primaryTopics]);

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

  const handleLaunchMockInterview = async () => {
    setIsLaunchingSession(true);
    setLaunchError(null);

    const activeFocus = customFocusInput.trim() || selectedFocus;

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
      }
    } catch (err: unknown) {
      setLaunchError(
        err instanceof Error ? err.message : "Could not launch interview room."
      );
      setIsLaunchingSession(false);
    }
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

                {/* DOUBLE-BEZEL INTERVIEW CONFIGURATION CARD */}
                <div className="rounded-2xl border border-[#E5E2DA] bg-[#F7F4EE] p-1.5">
                  <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-6 sm:p-8 space-y-7 shadow-[0_1px_2px_rgba(26,25,24,0.03)]">
                    {/* SECTION 1: INTERVIEW TYPE */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1A1918] uppercase tracking-wider font-mono">
                          1. Select Interview Type
                        </label>
                        <span className="text-[11px] font-mono text-[#6E6B65]">
                          Choose your assessment format
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {INTERVIEW_TYPES.map((type) => {
                          const Icon = type.icon;
                          const isSelected = selectedInterviewType === type.id;
                          return (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => setSelectedInterviewType(type.id)}
                              className={`rounded-xl border p-4 text-left transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                isSelected
                                  ? "border-[#1A1918] bg-[#FAF8F5] shadow-[inset_0_0_0_1px_#1A1918]"
                                  : "border-[#E5E2DA] bg-[#FFFFFF] hover:border-[#D5D1C7] hover:bg-[#FAF8F5]/60"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div
                                  className={`w-7 h-7 rounded-md flex items-center justify-center ${
                                    isSelected
                                      ? "bg-[#1A1918] text-[#FAF8F5]"
                                      : "bg-[#EFECE4] text-[#423F3A]"
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </div>
                                {isSelected && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A55]" />
                                )}
                              </div>
                              <div className="text-xs font-bold text-[#1A1918] mt-3">
                                {type.title}
                              </div>
                              <div className="text-[11px] text-[#6E6B65] mt-1 leading-snug">
                                {type.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* SECTION 2: SENIORITY / DIFFICULTY LEVEL */}
                    <div className="space-y-3 pt-2 border-t border-[#E5E2DA]">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1A1918] uppercase tracking-wider font-mono">
                          2. Experience Level &amp; Depth
                        </label>
                        <span className="text-[11px] font-mono text-[#6E6B65]">
                          Calibrated to resume: {interviewConfig.difficultyTier}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {DIFFICULTY_TIERS.map((tier) => {
                          const isSelected = selectedLevel === tier.value;
                          return (
                            <button
                              key={tier.value}
                              type="button"
                              onClick={() => setSelectedLevel(tier.value)}
                              className={`rounded-lg border p-3.5 text-left transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                isSelected
                                  ? "border-[#1A1918] bg-[#FAF8F5] shadow-[inset_0_0_0_1px_#1A1918]"
                                  : "border-[#E5E2DA] bg-[#FFFFFF] hover:border-[#D5D1C7] hover:bg-[#FAF8F5]/60"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#1A1918]">
                                  {tier.value}
                                </span>
                                <span className="text-[10px] font-mono text-[#6E6B65]">
                                  {tier.tier}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#6E6B65] mt-1">
                                {tier.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* SECTION 3: FRAMEWORK, LANGUAGE OR SPECIALIZED TOPIC */}
                    <div className="space-y-3 pt-2 border-t border-[#E5E2DA]">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1A1918] uppercase tracking-wider font-mono">
                          3. Framework, Language, or Domain Focus
                        </label>
                        <span className="text-[11px] font-mono text-[#6E6B65]">
                          Select or enter custom topic
                        </span>
                      </div>

                      {/* Chips */}
                      <div className="flex flex-wrap gap-2">
                        {availableFocusTags.slice(0, 14).map((tag) => {
                          const isSelected =
                            selectedFocus === tag && !customFocusInput.trim();
                          const isFromProfile = profileSkills.some(
                            (s) => s.name.toLowerCase() === tag.toLowerCase()
                          );
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setSelectedFocus(tag);
                                setCustomFocusInput("");
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                isSelected
                                  ? "bg-[#1A1918] text-[#FAF8F5] font-medium border border-[#1A1918]"
                                  : "bg-[#FAF8F5] text-[#423F3A] border border-[#E5E2DA] hover:border-[#B5B1A7] hover:text-[#1A1918]"
                              }`}
                            >
                              <span>{tag}</span>
                              {isFromProfile && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isSelected ? "bg-[#7CC09D]" : "bg-[#1F7A55]"
                                  }`}
                                  title="From verified resume profile"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Input */}
                      <div className="pt-2 flex items-center gap-2 max-w-md">
                        <input
                          type="text"
                          value={customFocusInput}
                          onChange={(e) => setCustomFocusInput(e.target.value)}
                          placeholder="Or type custom framework/topic (e.g. FastAPI, Kafka, Spring Boot)..."
                          className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2 text-xs text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                        />
                      </div>
                    </div>

                    {/* SECTION 4: DURATION */}
                    <div className="space-y-3 pt-2 border-t border-[#E5E2DA]">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1A1918] uppercase tracking-wider font-mono">
                          4. Session Duration
                        </label>
                        <span className="text-[11px] font-mono text-[#6E6B65]">
                          Controls timer &amp; question volume
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {DURATION_OPTIONS.map((opt) => {
                          const isSelected = selectedDuration === opt.minutes;
                          return (
                            <button
                              key={opt.minutes}
                              type="button"
                              onClick={() => setSelectedDuration(opt.minutes)}
                              className={`rounded-lg border p-3 text-left transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                                isSelected
                                  ? "border-[#1A1918] bg-[#FAF8F5] shadow-[inset_0_0_0_1px_#1A1918]"
                                  : "border-[#E5E2DA] bg-[#FFFFFF] hover:border-[#D5D1C7] hover:bg-[#FAF8F5]/60"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#1A1918]">
                                  {opt.label}
                                </span>
                                <span className="text-[10px] font-mono text-[#6E6B65]">
                                  {opt.questions}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#6E6B65] mt-0.5">
                                {opt.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* ERROR NOTICE IF LAUNCH FAILS */}
                    {launchError && (
                      <div className="flex items-center gap-2 rounded-lg border border-[#E5C9C0] bg-[#FFF8F5] p-3 text-xs text-[#B45332]">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{launchError}</span>
                      </div>
                    )}

                    {/* LAUNCH CTA */}
                    <div className="pt-4 border-t border-[#E5E2DA] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="text-xs text-[#6E6B65] leading-relaxed">
                        Launching opens a dedicated mock room with real-time AI prompts and audio/code evaluation.
                      </div>

                      <button
                        type="button"
                        onClick={handleLaunchMockInterview}
                        disabled={isLaunchingSession}
                        className="group inline-flex items-center justify-center gap-2 rounded-lg text-xs font-semibold bg-[#1A1918] text-[#FAF8F5] pl-5 pr-3 py-3 hover:bg-[#2C2A28] active:scale-[0.98] disabled:opacity-50 transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                      >
                        <span>
                          {isLaunchingSession
                            ? "Creating Interview Room..."
                            : "Launch Mock Interview Room"}
                        </span>
                        <span className="w-6 h-6 rounded-md bg-[#FAF8F5]/12 flex items-center justify-center transition-transform group-hover:translate-x-0.5">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    </div>
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
                                <span className="rounded-md border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 font-mono text-[10px] text-[#423F3A] uppercase">
                                  {sessionItem.interviewType}
                                </span>
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
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTranscriptSession(sessionItem);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1A1918] hover:underline"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Transcript</span>
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
                                  {sessionItem.responses?.length || 0} of{" "}
                                  {sessionItem.questions?.length || 0} questions
                                  answered
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
                                  ? "Completed & Evaluated"
                                  : "In Progress / Incomplete"}
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
                              {sessionItem.responses?.length || 0} questions evaluated · {sessionItem.durationMinutes} min session
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
                              <span>View Transcript</span>
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
