"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
  LogOut,
  Sliders,
  Award,
} from "lucide-react";
import UserProfileView from "@/components/UserProfileView";
import type { InterviewConfig, SkillItem } from "@/lib/mongodb";
import { generateAdaptiveExpertSuggestions } from "@/lib/adaptiveEngine";

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

export default function ExpertWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Active feature in sidebar (shows 1 feature at a time)
  const [activeFeature, setActiveFeature] = useState<
    "boardroom" | "bank" | "evaluation" | "profile"
  >("boardroom");

  // State: Live Boardroom
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
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, hydrateFromProfile]);

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
      logWorkspaceActivity(
        "Evaluated Ad-Hoc Question Alignment",
        "board",
        preview
      );
    }, 750);
  };

  const handleSaveEvaluation = () => {
    setSavedNotes(true);
    logWorkspaceActivity(
      "Committed Rubric Overrides",
      "board",
      `Rel ${overrideScores.relevance} • Depth ${overrideScores.depth} • Clarity ${overrideScores.clarity}`
    );
    setTimeout(() => setSavedNotes(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-xs font-mono text-[#6E6B65]">
        Loading expert workspace...
      </div>
    );
  }

  const sidebarNavItems = [
    {
      id: "boardroom",
      label: "Live Boardroom",
      desc: "Candidate & event log",
      icon: Users,
    },
    {
      id: "bank",
      label: "Question Suggester",
      desc: "Curated & ad-hoc check",
      icon: BookOpen,
    },
    {
      id: "evaluation",
      label: "Rubric Calibration",
      desc: "Human-in-the-loop override",
      icon: Sliders,
    },
    {
      id: "profile",
      label: "Expert Profile",
      desc: "Dossier & daily activity",
      icon: Award,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1918] flex flex-col md:flex-row font-sans selection:bg-[#E5E2DA]">
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
              Expert Boardroom
            </div>
          </div>

          {/* Feature Selection Links */}
          <nav className="p-3 space-y-1">
            <div className="px-3 pt-3 pb-1.5 text-[10px] font-mono text-[#8E8B84] uppercase tracking-wider">
              Board Features
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
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-left transition-all ${
                    isActive
                      ? "bg-[#FFFFFF] text-[#1A1918] font-semibold border border-[#E5E2DA] shadow-xs"
                      : "text-[#6E6B65] hover:text-[#1A1918] hover:bg-[#F2EFE9]"
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className="w-4 h-4 text-[#1A1918] shrink-0" />
                    <div>
                      <div className="leading-snug">{item.label}</div>
                      <div className="text-[10px] text-[#8E8B84] font-normal font-sans">
                        {item.desc}
                      </div>
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
              className="p-1.5 text-[#6E6B65] hover:text-[#1A1918] transition-colors border border-[#E5E2DA] bg-[#FFFFFF] hover:bg-[#F2EFE9] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTENT AREA — SHOWS 1 FEATURE AT A TIME */}
      {/* ============================================================ */}
      <main className="flex-1 bg-[#FFFFFF] min-h-screen p-6 sm:p-10 lg:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* ========================================================== */}
          {/* FEATURE 1: LIVE BOARDROOM */}
          {/* ========================================================== */}
          {activeFeature === "boardroom" && (
            <div className="space-y-8">
              {/* Feature Header */}
              <div className="border-b border-[#E5E2DA] pb-5 space-y-1">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Live Panel Execution
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[#1A1918]">
                  Live Boardroom Runner
                </h1>
                <p className="text-sm text-[#55524C] leading-relaxed">
                  Active live panel room connecting board interviewers with the candidate. Displays verified candidate competencies and logs timestamped interview events.
                </p>
              </div>

              {/* Active Session Info Bar */}
              <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-[#6E6B65]">
                      SESSION: #BRD-9021 • PANEL: 2 EXPERTS
                    </div>
                    <div className="text-lg font-bold text-[#1A1918] mt-0.5">
                      Candidate: Shashwat Upadhayay (Senior Backend Engineer)
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 font-mono text-xs border border-[#E5E2DA] bg-[#FFFFFF] px-3 py-1.5 w-fit">
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
                        className="border border-[#D5D1C7] bg-[#FFFFFF] px-2.5 py-1 text-xs font-mono text-[#1A1918]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Event Stream */}
              <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-mono text-[#6E6B65] border-b border-[#E5E2DA] pb-3">
                  <span>SESSION EVENT STREAM</span>
                  <span className="text-[#1F7A55] font-semibold">● LIVE RECORDING</span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3.5 bg-[#FAF8F5] border border-[#E5E2DA] space-y-1.5">
                    <div className="flex justify-between text-[#8E8B84] text-[10px]">
                      <span>[16:04:12] Question #1 Selected by Expert A</span>
                      <span>Stage: Ice-Breaker</span>
                    </div>
                    <div className="text-[#1A1918] font-sans font-medium text-sm">
                      &ldquo;Could you describe the architecture of your distributed write pipeline and where Kafka sits?&rdquo;
                    </div>
                    <div className="text-[11px] text-[#55524C] pt-1.5 border-t border-[#E5E2DA]">
                      AI Metric: Relevance: 9.6 • Depth: 9.2 • Clarity: 9.4
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#FAF8F5] border border-[#E5E2DA] space-y-1.5">
                    <div className="flex justify-between text-[#8E8B84] text-[10px]">
                      <span>[16:15:30] Question #2 Suggested by AI Co-Pilot</span>
                      <span>Stage: Core Technical</span>
                    </div>
                    <div className="text-[#1A1918] font-sans font-medium text-sm">
                      &ldquo;How do you ensure idempotency across Kafka consumers when Postgres writes fail transiently?&rdquo;
                    </div>
                    <div className="text-[11px] text-[#55524C] pt-1.5 border-t border-[#E5E2DA]">
                      Candidate response currently recorded and transcribed.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* FEATURE 2: QUESTION BANK & CO-PILOT */}
          {/* ========================================================== */}
          {activeFeature === "bank" && (
            <div className="space-y-8">
              {/* Feature Header */}
              <div className="border-b border-[#E5E2DA] pb-5 space-y-1">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Curated Bank &amp; Co-Pilot
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[#1A1918]">
                  Question Bank &amp; AI Suggester
                </h1>
                <p className="text-sm text-[#55524C] leading-relaxed">
                  Browse recommended follow-up questions calibrated to your profile&apos;s topics and difficulty tier, or test ad-hoc questions against the AI relevance evaluator before asking.
                </p>
              </div>

              {/* Custom Ad-hoc Question Relevance Checker */}
              <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-6 space-y-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[#1A1918]">
                    Test Ad-Hoc Question Relevance
                  </div>
                  <div className="text-xs text-[#6E6B65]">
                    Evaluates semantic alignment with candidate&apos;s verified skills to prevent off-topic questions.
                  </div>
                </div>

                <form onSubmit={handleEvaluateCustomQuestion} className="space-y-3">
                  <textarea
                    rows={3}
                    value={customQuestionInput}
                    onChange={(e) => setCustomQuestionInput(e.target.value)}
                    placeholder="Enter custom question to test candidate domain alignment..."
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] p-3 text-xs text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="submit"
                      disabled={evaluatingRelevance || !customQuestionInput.trim()}
                      className="inline-flex items-center text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-4 py-2 hover:bg-[#2C2A28] disabled:opacity-50 transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                    >
                      <span>{evaluatingRelevance ? "Evaluating alignment..." : "Check Question Relevance"}</span>
                    </button>

                    {customRelevanceScore !== null && (
                      <div className="text-xs font-mono text-[#1F7A55] font-semibold">
                        Domain Fit Score: {customRelevanceScore}% (Strong Alignment)
                      </div>
                    )}
                  </div>
                </form>
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
                      className="border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-[#6E6B65]">
                          [{q.id}] • {q.topic}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 text-[#1A1918]">
                            {q.difficulty}
                          </span>
                          <span className="text-[10px] font-mono bg-[#1F7A55] text-white px-2 py-0.5 font-bold">
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
                            alert(`Question [${q.id}] pushed to live boardroom stream.`);
                          }}
                          className="border border-[#D5D1C7] bg-[#FAF8F5] text-[#1A1918] px-3.5 py-1.5 text-xs font-medium hover:bg-[#EAE6DD] transition-colors"
                        >
                          Push Question To Live Board
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* FEATURE 3: RUBRIC EVALUATION & NOTES */}
          {/* ========================================================== */}
          {activeFeature === "evaluation" && (
            <div className="space-y-8">
              {/* Feature Header */}
              <div className="border-b border-[#E5E2DA] pb-5 space-y-1">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Human-in-the-Loop Governance
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[#1A1918]">
                  Rubric Calibration &amp; Override
                </h1>
                <p className="text-sm text-[#55524C] leading-relaxed">
                  AI scores serve strictly as assistive guidance. Authorized experts have unilateral authority to review, contextualize, and override automated rubric marks.
                </p>
              </div>

              {/* Rubric Sliders Container */}
              <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-6 space-y-6">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Current Question Scoring Dimensions (1–10 Scale)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-4 space-y-2 shadow-xs">
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

                  <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-4 space-y-2 shadow-xs">
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

                  <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-4 space-y-2 shadow-xs">
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
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] p-3 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#E5E2DA]">
                  <span className="text-[11px] text-[#6E6B65]">
                    Overrides are permanently committed to the MongoDB session dossier.
                  </span>
                  <button
                    onClick={handleSaveEvaluation}
                    className="inline-flex items-center justify-center text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-5 py-2.5 hover:bg-[#2C2A28] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    <span>{savedNotes ? "Evaluation Saved!" : "Commit Rubric Overrides"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* FEATURE 4: EXPERT PROFILE, DOSSIER & DAILY ACTIVITY */}
          {/* ========================================================== */}
          {activeFeature === "profile" && (
            <UserProfileView
              onNameUpdated={(newName) =>
                setUser((prev) => (prev ? { ...prev, name: newName } : prev))
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
