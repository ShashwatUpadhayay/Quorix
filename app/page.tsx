"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  User,
  LogOut,
} from "lucide-react";

export default function LandingPage() {
  const [selectedProblemIndex, setSelectedProblemIndex] = useState<number>(0);
  const [authUser, setAuthUser] = useState<{
    id?: string;
    name: string;
    email: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setAuthUser(data.user);
        }
      })
      .catch(() => {
        // Unauthenticated or network issue
      });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuthUser(null);
    } catch {
      // Ignored
    }
  };

  const problemsAndSolutions = [
    {
      id: "01",
      title: "Inconsistent questioning & resume disconnect",
      category: "Question Calibration",
      problemSummary:
        "Interviewers frequently ask arbitrary algorithm riddles or framework trivia that bears no relation to the candidate's actual experience or declared domain.",
      problemDetails:
        "Candidates invest years mastering distributed systems, cloud infrastructure, or ML pipelines, only to be evaluated on memorized puzzles. This generates high false-negative rates, wastes valuable engineering hours, and fails to predict on-the-job competency.",
      solutionSummary:
        "Automated resume parsing with candidate-verified domain tagging and topic-mapped question bank filtering.",
      solutionDetails:
        "Quorix extracts technical proficiencies, frameworks, and architecture experience from uploaded CVs (FR-C04). Candidates verify and correct these tags prior to the interview (FR-C05). The platform then queries a controlled, peer-reviewed question repository strictly indexed against those verified competencies (FR-Q03).",
    },
    {
      id: "02",
      title: "Uneven topic coverage & conversational rabbit holes",
      category: "Domain Breadth",
      problemSummary:
        "Live interviews frequently drift into a 40-minute debate on a single edge case, leaving 80% of core competencies completely unverified.",
      problemDetails:
        "Without structured agenda enforcement, interviews reflect the personal interests or recency bias of the interviewer. If a discussion stalls on syntax or a specific library bug, critical areas like system design, concurrency, database sharding, and operational reliability are skipped entirely.",
      solutionSummary:
        "A structured three-stage adaptive flow with real-time topic coverage tracking.",
      solutionDetails:
        "Every session follows a pedagogical progression: Ice-breaker → Deep Technical → Techno-Managerial (FR-M03). Each question is tagged by domain, and Quorix continuously benchmarks covered vs. unprobed topics (FR-R03), alerting board interviewers or the AI engine when key areas are being neglected.",
    },
    {
      id: "03",
      title: "Subjective, anecdotal 'gut-feeling' evaluations",
      category: "Evaluation Rigor",
      problemSummary:
        "Feedback is notoriously vague, delayed, and uncalibrated, with hiring committees receiving one-line impressions without supporting evidence.",
      problemDetails:
        "Different interviewers apply conflicting personal standards to the same candidate. Candidates are rejected without actionable feedback on whether their answers lacked technical depth, prompt relevance, or structural clarity, making decisions impossible to audit.",
      solutionSummary:
        "Standardized tri-factor rubric scoring across Relevance, Depth, and Clarity with verifiable explanations.",
      solutionDetails:
        "Quorix isolates three orthogonal evaluation dimensions on a 1-10 point scale. Every score is accompanied by line-by-line justification citing specific technical statements from the candidate. Human interviewers retain full authority to review, contextualize, or override AI scores (SRS §4.1 & §9.4).",
    },
    {
      id: "04",
      title: "The divide between solo practice and live board panels",
      category: "Platform Architecture",
      problemSummary:
        "Mock platforms are isolated chat toys that fail to simulate multi-expert boards, while human interview panels lack real-time question assistance.",
      problemDetails:
        "Candidates practice against one-turn chatbots that don't prepare them for multi-member technical panels. Conversely, live interviewers juggle note-taking, timekeeping, and follow-up formulation without assistive tooling during high-stakes sessions.",
      solutionSummary:
        "A dual-mode platform supporting autonomous AI practice and live multi-expert boardrooms with AI co-pilot.",
      solutionDetails:
        "Quorix provides a unified ecosystem: candidates practice in adaptive solo simulations (FR-M01), while organizations conduct live board sessions (FR-L01). For live panels, Quorix matches experts by domain relevance (FR-E03), suggests real-time follow-ups from the question bank (FR-L04), and records timestamped event logs (FR-L06).",
    },
  ];

  const functionalModules = [
    {
      module: "Candidate Lifecycle & Resume Intelligence",
      description:
        "Candidate registration, profile management, CV parsing, skill extraction, and candidate verification prior to session start.",
      deliverables: [
        "Secure registration and role-based access control (RBAC)",
        "Resume parser extracting skills, frameworks, and experience levels",
        "Pre-interview candidate verification of extracted domain tags",
        "Historical practice archives and interview report history",
      ],
    },
    {
      module: "Controlled Question Bank & Taxonomy",
      description:
        "Curated question management with multi-dimensional taxonomy, domain filtering, and administrative governance.",
      deliverables: [
        "Create, edit, archive, and search across global question banks",
        "Taxonomy tags: Subject, Topic, Difficulty Tier (1–5), Competency",
        "Topic-wise filtering aligned with candidate's declared profile vector",
        "Tamper-proof role restrictions preventing unauthorized edits",
      ],
    },
    {
      module: "Adaptive AI Mock Engine",
      description:
        "Autonomous interview simulator with real-time difficulty adjustment, three-stage interview flow, and scoring feedback.",
      deliverables: [
        "One-click autonomous solo mock session initialization",
        "Structured progression: Ice-breaker → Technical → Techno-Managerial",
        "Dynamic difficulty adjustment driven by recent answer signals",
        "Per-answer real-time scoring with optional Speech-to-Text (STT)",
      ],
    },
    {
      module: "Live Expert Boardroom & Co-Pilot",
      description:
        "Multi-interviewer live board panel with candidate domain visibility, real-time question suggestions, and timeline logging.",
      deliverables: [
        "Configurable live session parameters (panel size, duration, tier)",
        "Board member access synchronized with candidate's verified tags",
        "AI Co-pilot with relevance rating for ad-hoc interviewer questions",
        "Timestamped recording of question-answer events and panel notes",
      ],
    },
    {
      module: "Expert Management & Semantic Matching",
      description:
        "Structured profiles for industry interviewers with automated board-to-candidate domain relevance scoring.",
      deliverables: [
        "Structured expert profile schema (skills, publications, board history)",
        "Searchable domain tags for panel allocation",
        "Algorithmic relevance matching between candidate and board experts",
        "Administrative review workflow for expert panel assignments",
      ],
    },
    {
      module: "Post-Interview Reporting & Coverage Analytics",
      description:
        "Comprehensive audit reports with per-question breakdowns, topic coverage radar, and administrative quality trends.",
      deliverables: [
        "Per-question score breakdowns with AI explanation and evidence",
        "Topic coverage report identifying tested vs. under-tested domains",
        "Question quality distributions and interviewer trend analytics",
        "Strict role-based report visibility and institutional data policies",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1918] flex flex-col font-sans selection:bg-[#E5E2DA] selection:text-[#1A1918]">
      {/* Navigation */}
      <header className="border-b border-[#E5E2DA] bg-[#FAF8F5]/90 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-base font-bold tracking-wider text-[#1A1918]">
              QUORIX
            </span>
          
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-xs font-medium text-[#6E6B65]">
            <a
              href="#problems"
              className="hover:text-[#1A1918] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
            >
              Problems &amp; Solutions
            </a>
            <a
              href="#lifecycle"
              className="hover:text-[#1A1918] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
            >
              Adaptive Flow
            </a>
            <a
              href="#rubric"
              className="hover:text-[#1A1918] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
            >
              Evaluation Rubric
            </a>
            <a
              href="#requirements"
              className="hover:text-[#1A1918] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
            >
              SRS Modules
            </a>
          </nav>

          <div className="flex items-center space-x-3">
            {authUser ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5 text-xs text-[#1A1918]">
                  <User className="w-3.5 h-3.5 text-[#6E6B65]" />
                  <span className="font-medium">{authUser.name}</span>
                  <span className="text-[10px] font-mono border border-[#E5E2DA] bg-[#FFFFFF] px-1.5 py-0.5 text-[#6E6B65] uppercase">
                    {authUser.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center text-xs text-[#6E6B65] hover:text-[#1A1918] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs font-medium text-[#6E6B65] hover:text-[#1A1918] transition-colors px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-3.5 py-1.5 border border-transparent hover:bg-[#2C2A28] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1918]"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* HERO SECTION — Clean, Restrained, High-Impact Editorial Layout */}
        <section className="border-b border-[#E5E2DA] pt-20 pb-20 px-6">
          <div className="max-w-4xl mx-auto space-y-8 text-center sm:text-left">
            {/* Context meta label */}
          
          

            {/* Primary Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#1A1918] leading-[1.12]">
              Technical interviewing grounded in rubrics, not intuition.
            </h1>

            {/* Sub-headline / Value Proposition */}
            <p className="text-lg sm:text-xl text-[#55524C] leading-relaxed max-w-2xl font-normal">
              Quorix eliminates arbitrary trivia and subjective feedback from the
              hiring pipeline. Built with automated resume parsing, an adaptive
              three-stage question flow, and multi-dimensional scoring across
              Relevance, Depth, and Clarity.
            </p>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2">
              <a
                href="#problems"
                className="inline-flex items-center justify-center text-sm font-medium bg-[#1A1918] text-[#FAF8F5] px-6 py-3 hover:bg-[#2C2A28] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1918]"
              >
                Read Problem &amp; Architecture Analysis
              </a>
              <a
                href="#requirements"
                className="inline-flex items-center justify-center text-sm font-medium bg-[#FFFFFF] text-[#1A1918] border border-[#D5D1C7] px-6 py-3 hover:bg-[#F2EFE9] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1918]"
              >
                View Functional Modules
              </a>
            </div>

            {/* Four Foundation Principles Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-10 border-t border-[#E5E2DA]">
              <div className="space-y-1">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Candidate Profile
                </div>
                <div className="text-sm font-semibold text-[#1A1918]">
                  Resume-Driven
                </div>
                <p className="text-xs text-[#6E6B65] leading-relaxed">
                  Extracted skill tags prevent irrelevant question matching.
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Interview Arc
                </div>
                <div className="text-sm font-semibold text-[#1A1918]">
                  3-Stage Flow
                </div>
                <p className="text-xs text-[#6E6B65] leading-relaxed">
                  Ice-breaker → Core Technical → Techno-Managerial.
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Evaluation
                </div>
                <div className="text-sm font-semibold text-[#1A1918]">
                  Tri-Factor Rubric
                </div>
                <p className="text-xs text-[#6E6B65] leading-relaxed">
                  Explicit 1-10 metrics on Relevance, Depth, and Clarity.
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-mono text-[#6E6B65] uppercase">
                  Auditability
                </div>
                <div className="text-sm font-semibold text-[#1A1918]">
                  Topic Coverage
                </div>
                <p className="text-xs text-[#6E6B65] leading-relaxed">
                  Tracks tested vs. untested areas across the entire domain.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEMS & SOLUTIONS SECTION — Detailed, Informative, Clean */}
        <section id="problems" className="border-b border-[#E5E2DA] py-20 px-6">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="space-y-3">
              <div className="text-xs font-mono text-[#6E6B65] uppercase tracking-wider">
             Current Flaws in the Interview Preparation Process
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1918]">
                The systemic flaws in technical interviews
              </h2>
              <p className="text-base text-[#55524C] max-w-2xl leading-relaxed">
                Conventional interviews fail due to mismatched question banks,
                unfocused conversations, subjective scorecards, and siloed
                preparation. Here is how Quorix systematically resolves each
                failure point.
              </p>
            </div>

            {/* Problem Navigation Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {problemsAndSolutions.map((item, idx) => {
                const isActive = selectedProblemIndex === idx;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedProblemIndex(idx)}
                    className={`text-left p-4 border transition-all text-xs focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                      isActive
                        ? "border-[#1A1918] bg-[#FFFFFF] shadow-sm text-[#1A1918]"
                        : "border-[#E5E2DA] bg-[#FAF8F5] text-[#6E6B65] hover:border-[#D5D1C7] hover:bg-[#FFFFFF]"
                    }`}
                  >
                    <div className="font-mono text-[11px] text-[#8E8B84] mb-1">
                      Problem {item.id}
                    </div>
                    <div className="font-semibold text-sm leading-snug line-clamp-2">
                      {item.title}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Problem / Solution Detailed Comparison Card */}
            {(() => {
              const current = problemsAndSolutions[selectedProblemIndex];
              return (
                <div className="border border-[#D5D1C7] bg-[#FFFFFF] shadow-xs">
                  {/* Card Header */}
                  <div className="border-b border-[#E5E2DA] bg-[#F7F5F0] px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-xs font-bold text-[#1A1918]">
                        CASE {current.id}: {current.category.toUpperCase()}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-[#6E6B65]">
                    </span>
                  </div>

                  {/* Two-Column Side-by-Side: The Problem vs. The Quorix Fix */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E5E2DA]">
                    {/* The Problem */}
                    <div className="p-6 sm:p-8 space-y-4 bg-[#FAF8F5]">
                      <div className="flex items-center space-x-2 text-xs font-mono text-[#8E8B84] uppercase font-semibold">
                        <AlertTriangle className="w-4 h-4 text-[#8E8B84]" />
                        <span>The Problem In Traditional Practice</span>
                      </div>
                      <h3 className="text-base font-semibold text-[#1A1918] leading-snug">
                        {current.problemSummary}
                      </h3>
                      <p className="text-sm text-[#55524C] leading-relaxed">
                        {current.problemDetails}
                      </p>
                    </div>

                    {/* The Quorix Fix */}
                    <div className="p-6 sm:p-8 space-y-4 bg-[#FFFFFF]">
                      <div className="flex items-center space-x-2 text-xs font-mono text-[#1F7A55] uppercase font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-[#1F7A55]" />
                        <span>How Quorix Resolves This Architecturally</span>
                      </div>
                      <h3 className="text-base font-semibold text-[#1A1918] leading-snug">
                        {current.solutionSummary}
                      </h3>
                      <p className="text-sm text-[#423F3A] leading-relaxed">
                        {current.solutionDetails}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>

        {/* INTERVIEW LIFECYCLE SECTION — 3-Stage Adaptive Arc */}
        <section id="lifecycle" className="border-b border-[#E5E2DA] bg-[#F7F5F0] py-20 px-6">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="space-y-3">
              <div className="text-xs font-mono text-[#6E6B65] uppercase tracking-wider">
                How Quorix Structures Every Interview 
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1918]">
                The three-stage adaptive interview arc
              </h2>
              <p className="text-base text-[#55524C] max-w-2xl leading-relaxed">
                Rather than jumping into disconnected questions, Quorix
                structures every interview into an intentional progression that
                gauges fundamental grasp, technical depth, and trade-off maturity.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Stage 1 */}
              <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-3 shadow-xs">
                <div className="font-mono text-xs text-[#8E8B84]">
                  STAGE 01
                </div>
                <h3 className="text-lg font-bold text-[#1A1918]">
                  Ice-Breaker &amp; Profile Grounding
                </h3>
                <p className="text-xs text-[#55524C] leading-relaxed">
                  Calibrates the interview against the candidate&apos;s verified
                  resume. Validates core background, projects, primary language
                  runtimes, and architectural choices.
                </p>
                <div className="pt-2 text-[11px] font-mono text-[#6E6B65] border-t border-[#E5E2DA]">
                  Goal: Establish candidate baseline and comfort.
                </div>
              </div>

              {/* Stage 2 */}
              <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-3 shadow-xs">
                <div className="font-mono text-xs text-[#8E8B84]">
                  STAGE 02
                </div>
                <h3 className="text-lg font-bold text-[#1A1918]">
                  Core Technical &amp; System Design
                </h3>
                <p className="text-xs text-[#55524C] leading-relaxed">
                  Focuses on deep technical domain competencies. The AI engine
                  dynamically scales question difficulty based on recent answer
                  quality signals (FR-M04).
                </p>
                <div className="pt-2 text-[11px] font-mono text-[#6E6B65] border-t border-[#E5E2DA]">
                  Goal: Probe architectural depth and implementation mastery.
                </div>
              </div>

              {/* Stage 3 */}
              <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-3 shadow-xs">
                <div className="font-mono text-xs text-[#8E8B84]">
                  STAGE 03
                </div>
                <h3 className="text-lg font-bold text-[#1A1918]">
                  Techno-Managerial &amp; Trade-offs
                </h3>
                <p className="text-xs text-[#55524C] leading-relaxed">
                  Evaluates operational failure handling, network partitions,
                  SLO budgeting, cost trade-offs, and communication under system
                  duress.
                </p>
                <div className="pt-2 text-[11px] font-mono text-[#6E6B65] border-t border-[#E5E2DA]">
                  Goal: Assess senior judgment, trade-offs, and clarity.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* EVALUATION RUBRIC SECTION — Tri-Factor AI Scoring (SRS §4.1) */}
        <section id="rubric" className="border-b border-[#E5E2DA] py-20 px-6">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="space-y-3">
              <div className="text-xs font-mono text-[#6E6B65] uppercase tracking-wider">
                 Scoring Rubric Specification
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1918]">
                Tri-factor answer evaluation rubric
              </h2>
              <p className="text-base text-[#55524C] max-w-2xl leading-relaxed">
                Quorix avoids single-number opacity. Every answer is evaluated
                across three independent dimensions on a standardized 1–10 point
                scale, backed by concrete evidence from the candidate&apos;s answer.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Relevance */}
              <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#8E8B84]">
                    DIMENSION 01
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#1A1918] bg-[#F7F5F0] border border-[#E5E2DA] px-2 py-0.5">
                    1–10 SCALE
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#1A1918]">Relevance</h3>
                <p className="text-xs text-[#55524C] leading-relaxed">
                  Evaluates how directly and strictly the candidate&apos;s answer
                  addresses the specific technical question asked, without
                  evading key constraints or rambling into unrelated territory.
                </p>
                <div className="border-t border-[#E5E2DA] pt-3 text-[11px] font-mono text-[#6E6B65] space-y-1">
                  <div className="font-semibold text-[#1A1918]">
                    Verification Criteria:
                  </div>
                  <div>• Direct constraint satisfaction</div>
                  <div>• Elimination of evasive filler language</div>
                  <div>• Adherence to scenario boundaries</div>
                </div>
              </div>

              {/* Depth */}
              <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#8E8B84]">
                    DIMENSION 02
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#1A1918] bg-[#F7F5F0] border border-[#E5E2DA] px-2 py-0.5">
                    1–10 SCALE
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#1A1918]">Depth</h3>
                <p className="text-xs text-[#55524C] leading-relaxed">
                  Demonstrates fundamental technical comprehension, awareness of
                  architectural trade-offs, concurrency issues, edge cases, and
                  production failure recovery.
                </p>
                <div className="border-t border-[#E5E2DA] pt-3 text-[11px] font-mono text-[#6E6B65] space-y-1">
                  <div className="font-semibold text-[#1A1918]">
                    Verification Criteria:
                  </div>
                  <div>• Architectural trade-off analysis</div>
                  <div>• Failure recovery (retries, DLQs, timeouts)</div>
                  <div>• Low-level system awareness</div>
                </div>
              </div>

              {/* Clarity */}
              <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#8E8B84]">
                    DIMENSION 03
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#1A1918] bg-[#F7F5F0] border border-[#E5E2DA] px-2 py-0.5">
                    1–10 SCALE
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#1A1918]">Clarity</h3>
                <p className="text-xs text-[#55524C] leading-relaxed">
                  Measures structural coherence, terminology accuracy,
                  conciseness, and how effectively the candidate articulates
                  complex engineering trade-offs.
                </p>
                <div className="border-t border-[#E5E2DA] pt-3 text-[11px] font-mono text-[#6E6B65] space-y-1">
                  <div className="font-semibold text-[#1A1918]">
                    Verification Criteria:
                  </div>
                  <div>• Logical sequencing and structure</div>
                  <div>• Accurate domain terminology</div>
                  <div>• Decision-ready articulation</div>
                </div>
              </div>
            </div>

            {/* Human in the loop governance clause */}
            <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-5 text-xs text-[#55524C] flex items-start space-x-3 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-[#1A1918] shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold text-[#1A1918]">
                  Human-in-the-Loop Governance Clause:{" "}
                </span>
                Automated scores are treated strictly as decision-support
                information. In live expert interviews, authorized human board
                interviewers maintain unilateral authority to review, contextualize,
                or override automated scoring observations.
              </div>
            </div>
          </div>
        </section>

        {/* FUNCTIONAL REQUIREMENTS CHECKLIST (SRS V1.0) */}
        <section id="requirements" className="border-b border-[#E5E2DA] bg-[#F7F5F0] py-20 px-6">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="space-y-3">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1918]">
                What Quorix Provides
              </h2>
              <p className="text-base text-[#55524C] max-w-2xl leading-relaxed">
                Comprehensive summary of all the features
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {functionalModules.map((mod) => (
                <div

                  className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-3 shadow-xs"
                >

                  <h3 className="text-base font-bold text-[#1A1918]">
                    {mod.module}
                  </h3>

                  <p className="text-xs text-[#55524C] leading-relaxed">
                    {mod.description}
                  </p>

                  <ul className="space-y-1.5 border-t border-[#E5E2DA] pt-3">
                    {mod.deliverables.map((item, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-[#423F3A] flex items-start space-x-2"
                      >
                        <span className="text-[#8E8B84] font-mono">›</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECURITY & DATA PROTECTION CONTROLS (SRS §9) */}
        <section className="py-16 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="border border-[#E5E2DA] bg-[#FFFFFF] p-8 space-y-6 shadow-xs">
              <div className="flex items-center space-x-3">
                <ShieldCheck className="w-5 h-5 text-[#1A1918]" />
                <h3 className="text-lg font-bold text-[#1A1918] tracking-tight">
                  Security, Privacy &amp; AI Safety Controls
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
                <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-2">
                  <div className="font-bold text-[#1A1918]">
                    Role-Based Access
                  </div>
                  <p className="text-[#55524C] text-[11px] leading-relaxed">
                    Strict boundary isolation across Candidate, Expert, and
                    Admin domains. Unauthorized users cannot edit questions.
                  </p>
                </div>

                <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-2">
                  <div className="font-bold text-[#1A1918]">
                    Server-Side AI Isolation
                  </div>
                  <p className="text-[#55524C] text-[11px] leading-relaxed">
                    Model credentials and API keys are stored server-side only.
                    LLM responses are schema-validated before database write.
                  </p>
                </div>

                <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-2">
                  <div className="font-bold text-[#1A1918]">
                    Data Encryption &amp; Audit
                  </div>
                  <p className="text-[#55524C] text-[11px] leading-relaxed">
                    Passwords securely hashed with bcrypt; transit encrypted
                    over HTTPS; full event timestamps recorded in audit logs.
                  </p>
                </div>

                <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-2">
                  <div className="font-bold text-[#1A1918]">
                    Prompt Injection Defense
                  </div>
                  <p className="text-[#55524C] text-[11px] leading-relaxed">
                    Candidate answers cannot execute queries or alter prompts.
                    Deterministic scoring rubrics prevent adversarial jailbreaks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#FAF8F5] border-t border-[#E5E2DA] py-12 px-6 text-xs text-[#6E6B65]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-[#1A1918] font-mono">QUORIX</span>
              <span className="text-[#D5D1C7]">|</span>
              <span>AI-Powered Interview Platform</span>
            </div>
            
          </div>

   
        </div>
      </footer>
    </div>
  );
}
