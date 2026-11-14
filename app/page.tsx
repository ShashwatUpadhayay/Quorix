"use client";

import React, { useState, useEffect, useRef, useCallback, CSSProperties } from "react";
import Link from "next/link";
import { ShieldCheck, CheckCircle2, AlertTriangle, User, LogOut } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────── */
interface AuthUser {
  id?: string;
  name: string;
  email: string;
  role: string;
}

/* ─────────────────────────────────────────────────────────────────────────
   useScrollY — RAF-driven scroll tracker
   setState called inside RAF callback (not synchronously in useEffect body).
───────────────────────────────────────────────────────────────────────── */
function useScrollY() {
  const [scrollY, setScrollY] = useState(0);
  const rafRef = useRef<number | null>(null);
  const latestY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      latestY.current = window.scrollY;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        setScrollY(latestY.current);
        rafRef.current = null;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return scrollY;
}

/* ─────────────────────────────────────────────────────────────────────────
   useRevealOnScroll — IntersectionObserver to add a CSS class to children
   No setState involved; we mutate the DOM directly.
───────────────────────────────────────────────────────────────────────── */
function useRevealOnScroll(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal-visible");
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
}

/* ─────────────────────────────────────────────────────────────────────────
   RevealSection wrapper
───────────────────────────────────────────────────────────────────────── */
function RevealSection({
  children,
  className = "",
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useRevealOnScroll(ref as React.RefObject<HTMLElement>);
  return (
    <div
      ref={ref}
      className={`reveal-section ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Landing Page
───────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [selectedProblemIndex, setSelectedProblemIndex] = useState<number>(0);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [navVisible, setNavVisible] = useState<boolean>(false);
  const scrollY = useScrollY();

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
      .catch(() => {});
  }, []);

  useEffect(() => {
    const heroEl = document.getElementById("hero-section");
    if (!heroEl) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setNavVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );
    obs.observe(heroEl);
    return () => obs.disconnect();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuthUser(null);
    } catch {
      // ignored
    }
  }, []);

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
        "Quorix extracts technical proficiencies, frameworks, and architecture experience from uploaded CVs. Candidates verify and correct these tags prior to the interview. The platform then queries a controlled, peer-reviewed question repository strictly indexed against those verified competencies.",
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
        "Every session follows a pedagogical progression: Ice-breaker → Deep Technical → Techno-Managerial. Each question is tagged by domain, and Quorix continuously benchmarks covered vs. unprobed topics, alerting board interviewers or the AI engine when key areas are being neglected.",
    },
    {
      id: "03",
      title: "Subjective, anecdotal gut-feeling evaluations",
      category: "Evaluation Rigor",
      problemSummary:
        "Feedback is notoriously vague, delayed, and uncalibrated, with hiring committees receiving one-line impressions without supporting evidence.",
      problemDetails:
        "Different interviewers apply conflicting personal standards to the same candidate. Candidates are rejected without actionable feedback on whether their answers lacked technical depth, prompt relevance, or structural clarity, making decisions impossible to audit.",
      solutionSummary:
        "Standardized tri-factor rubric scoring across Relevance, Depth, and Clarity with verifiable explanations.",
      solutionDetails:
        "Quorix isolates three orthogonal evaluation dimensions on a 1-10 point scale. Every score is accompanied by line-by-line justification citing specific technical statements from the candidate. Human interviewers retain full authority to review, contextualize, or override AI scores.",
    },
    {
      id: "04",
      title: "The divide between solo practice and live board panels",
      category: "Platform Architecture",
      problemSummary:
        "Mock platforms are isolated chat tools that fail to simulate multi-expert boards, while human interview panels lack real-time question assistance.",
      problemDetails:
        "Candidates practice against one-turn chatbots that do not prepare them for multi-member technical panels. Conversely, live interviewers juggle note-taking, timekeeping, and follow-up formulation without assistive tooling during high-stakes sessions.",
      solutionSummary:
        "A dual-mode platform supporting autonomous AI practice and live multi-expert boardrooms with AI co-pilot.",
      solutionDetails:
        "Quorix provides a unified ecosystem: candidates practice in adaptive solo simulations, while organizations conduct live board sessions. For live panels, Quorix matches experts by domain relevance, suggests real-time follow-ups from the question bank, and records timestamped event logs.",
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
        "Per-answer real-time scoring with optional Speech-to-Text",
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
    <>
      {/* Global reveal animation styles */}
      <style>{`
        .reveal-section {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1);
        }
        .reveal-visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>

      <div
        className="min-h-screen text-[#1A1918] flex flex-col font-sans selection:bg-[#E5E2DA]"
        style={{ background: "#FAF8F5" }}
      >
        {/* ─────────────────────────────────────────────────────────
            NAVBAR — hidden on hero, visible on scroll past hero
        ───────────────────────────────────────────────────────── */}
        <header
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            transform: navVisible ? "translateY(0)" : "translateY(-100%)",
            opacity: navVisible ? 1 : 0,
            pointerEvents: navVisible ? "auto" : "none",
            transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease",
            background: "rgba(250,248,245,0.92)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderBottom: "1px solid rgba(229,226,218,0.8)",
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "0 24px",
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Logo */}
            <span
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "#1A1918",
              }}
            >
              QUORIX
            </span>

            {/* Center nav links */}
            <nav
              style={{
                display: "flex",
                alignItems: "center",
                gap: 32,
                fontSize: 13,
                fontWeight: 500,
                color: "#6E6B65",
              }}
              className="hidden md:flex"
            >
              <a href="#problems" style={{ transition: "color 0.2s" }} className="hover:text-[#1A1918]">
                How It Works
              </a>
              <a href="#lifecycle" style={{ transition: "color 0.2s" }} className="hover:text-[#1A1918]">
                Interview Flow
              </a>
              <a href="#rubric" style={{ transition: "color 0.2s" }} className="hover:text-[#1A1918]">
                Scoring
              </a>
              <a href="#requirements" style={{ transition: "color 0.2s" }} className="hover:text-[#1A1918]">
                Capabilities
              </a>
            </nav>

            {/* Right actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {authUser ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#1A1918" }}>
                    <User style={{ width: 14, height: 14, color: "#6E6B65" }} />
                    <span style={{ fontWeight: 500 }}>{authUser.name}</span>
                  </div>
                  <Link
                    href={authUser.role === "expert" ? "/expert" : "/candidate"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      background: "#1A1918",
                      color: "#FAF8F5",
                      padding: "7px 18px",
                      borderRadius: 9999,
                      textDecoration: "none",
                      transition: "background 0.2s",
                    }}
                    className="hover:bg-[#2C2A28]"
                  >
                    Workspace
                  </Link>
                  <button
                    onClick={handleLogout}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#6E6B65", display: "flex" }}
                    title="Sign out"
                  >
                    <LogOut style={{ width: 14, height: 14 }} />
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    style={{ fontSize: 13, fontWeight: 500, color: "#6E6B65", textDecoration: "none", transition: "color 0.2s" }}
                    className="hover:text-[#1A1918]"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      fontSize: 13,
                      fontWeight: 600,
                      background: "#1A1918",
                      color: "#FAF8F5",
                      padding: "7px 20px",
                      borderRadius: 9999,
                      border: "1px solid #1A1918",
                      textDecoration: "none",
                      transition: "background 0.2s",
                    }}
                    className="hover:bg-[#2C2A28]"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <main style={{ flex: 1 }}>
          {/* ─────────────────────────────────────────────────────────
              HERO — centered, warm gradient sky, mountain parallax
          ───────────────────────────────────────────────────────── */}
          <section
            id="hero-section"
            style={{
              position: "relative",
              minHeight: "100dvh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 60,
              paddingBottom: 140,
              overflow: "hidden",
              background: "linear-gradient(180deg, #FAF8F5 0%, #F5F0E8 45%, #EDE5D5 72%, #DFD5C0 100%)",
            }}
          >
            {/* Soft warm radial glow top-center */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: -60,
                left: "50%",
                transform: "translateX(-50%)",
                width: 700,
                height: 400,
                background: "radial-gradient(ellipse at center, rgba(252,210,160,0.22) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />

            {/* Hero content */}
            <div
              style={{
                position: "relative",
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                maxWidth: 760,
                padding: "0 24px",
                gap: 0,
              }}
            >
              {/* Headline — two lines, accent on second */}
              <h1
                style={{
                  fontSize: "clamp(42px, 7vw, 76px)",
                  fontWeight: 800,
                  lineHeight: 1.06,
                  letterSpacing: "-0.03em",
                  color: "#1A1918",
                  margin: 0,
                  marginBottom: 24,
                }}
              >
                Interviews grounded
                <br />
                <span style={{ color: "#7A6F5D" }}>in rubrics, not guesswork.</span>
              </h1>

              {/* Subtext */}
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.65,
                  color: "#6E6B65",
                  maxWidth: "52ch",
                  margin: "0 auto",
                  marginBottom: 40,
                  fontWeight: 400,
                }}
              >
                Quorix calibrates every question from your actual resume, structures the
                session in a three-stage arc, and scores every answer across Relevance,
                Depth, and Clarity — with evidence.
              </p>

              {/* CTA row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                {authUser ? (
                  <Link
                    href={authUser.role === "expert" ? "/expert" : "/candidate"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 14,
                      fontWeight: 700,
                      background: "#1A1918",
                      color: "#FAF8F5",
                      padding: "13px 28px",
                      borderRadius: 9999,
                      textDecoration: "none",
                      transition: "background 0.2s, transform 0.15s",
                    }}
                    className="hover:bg-[#2C2A28] active:scale-[0.97]"
                  >
                    Open Workspace
                  </Link>
                ) : (
                  <Link
                    href="/register"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 14,
                      fontWeight: 700,
                      background: "#1A1918",
                      color: "#FAF8F5",
                      padding: "13px 28px",
                      borderRadius: 9999,
                      textDecoration: "none",
                      transition: "background 0.2s, transform 0.15s",
                    }}
                    className="hover:bg-[#2C2A28] active:scale-[0.97]"
                  >
                    Start Practicing Free
                  </Link>
                )}
                <a
                  href="#problems"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#1A1918",
                    background: "rgba(255,255,255,0.8)",
                    border: "1px solid rgba(26,25,24,0.18)",
                    padding: "12px 28px",
                    borderRadius: 9999,
                    textDecoration: "none",
                    backdropFilter: "blur(6px)",
                    transition: "background 0.2s, transform 0.15s",
                  }}
                  className="hover:bg-white active:scale-[0.97]"
                >
                  See How It Works
                </a>
              </div>
            </div>

            {/* ── Mountain parallax layers (Warm Travertine & Stone Theme) ── */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 220,
                overflow: "hidden",
                pointerEvents: "none",
                zIndex: 5,
              }}
              aria-hidden
            >
              {/* Layer 1 — farthest, lightest, slowest */}
              <svg
                viewBox="0 0 1440 220"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  transform: `translateY(${scrollY * 0.07}px)`,
                  willChange: "transform",
                }}
              >
                <path
                  d="M0,160 L60,130 L120,150 L200,100 L290,120 L380,80 L460,110 L550,70 L640,95 L730,65 L820,90 L900,55 L980,80 L1060,50 L1150,75 L1240,45 L1320,70 L1440,50 L1440,220 L0,220 Z"
                  fill="#E3DED4"
                />
              </svg>

              {/* Layer 2 */}
              <svg
                viewBox="0 0 1440 220"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  transform: `translateY(${scrollY * 0.13}px)`,
                  willChange: "transform",
                }}
              >
                <path
                  d="M0,170 L80,140 L170,160 L260,115 L350,138 L440,95 L520,120 L610,88 L700,112 L790,78 L880,105 L960,72 L1040,98 L1130,68 L1220,92 L1310,62 L1440,88 L1440,220 L0,220 Z"
                  fill="#D4CDC0"
                />
              </svg>

              {/* Layer 3 */}
              <svg
                viewBox="0 0 1440 220"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  transform: `translateY(${scrollY * 0.2}px)`,
                  willChange: "transform",
                }}
              >
                <path
                  d="M0,185 L90,158 L180,178 L270,142 L360,165 L450,128 L540,152 L630,118 L720,142 L810,108 L900,135 L990,100 L1080,128 L1170,95 L1260,122 L1350,90 L1440,115 L1440,220 L0,220 Z"
                  fill="#BEB5A5"
                />
              </svg>

              {/* Layer 4 — closest, darkest, fastest */}
              <svg
                viewBox="0 0 1440 220"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  transform: `translateY(${scrollY * 0.3}px)`,
                  willChange: "transform",
                }}
              >
                <path
                  d="M0,195 L100,172 L200,190 L300,162 L400,180 L500,155 L600,175 L700,148 L800,168 L900,142 L1000,165 L1100,138 L1200,160 L1300,132 L1440,155 L1440,220 L0,220 Z"
                  fill="#9E9484"
                />
              </svg>
            </div>
          </section>

          {/* ─────────────────────────────────────────────────────────
              PROBLEMS & SOLUTIONS
          ───────────────────────────────────────────────────────── */}
          <section id="problems" style={{ borderBottom: "1px solid #E5E2DA", padding: "96px 24px", background: "#FAF8F5" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <RevealSection className="space-y-3" style={{ marginBottom: 48 }}>
                <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#6E6B65", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Current Flaws in Technical Hiring
                </div>
                <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.025em", color: "#1A1918", lineHeight: 1.15, margin: 0 }}>
                  The systemic flaws in technical interviews
                </h2>
                <p style={{ fontSize: 15, color: "#55524C", lineHeight: 1.65, maxWidth: "58ch", margin: 0 }}>
                  Conventional interviews fail due to mismatched question banks, unfocused conversations, subjective scorecards, and siloed preparation. Here is how Quorix resolves each failure point.
                </p>
              </RevealSection>

              {/* Problem tabs */}
              <RevealSection delay={80} style={{ marginBottom: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  {problemsAndSolutions.map((item, idx) => {
                    const isActive = selectedProblemIndex === idx;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedProblemIndex(idx)}
                        style={{
                          textAlign: "left",
                          padding: "16px",
                          border: isActive ? "1px solid #1A1918" : "1px solid #E5E2DA",
                          background: isActive ? "#FFFFFF" : "#F7F5F0",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          outline: "none",
                        }}
                      >
                        <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "#8E8B84", marginBottom: 6 }}>
                          Problem {item.id}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#1A1918" : "#6E6B65", lineHeight: 1.35 }}>
                          {item.title}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </RevealSection>

              {/* Detail card */}
              <RevealSection delay={160}>
                {(() => {
                  const current = problemsAndSolutions[selectedProblemIndex];
                  return (
                    <div style={{ border: "1px solid #D5D1C7", background: "#FFFFFF" }}>
                      <div style={{ borderBottom: "1px solid #E5E2DA", background: "#F7F5F0", padding: "14px 24px" }}>
                        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, fontWeight: 700, color: "#1A1918" }}>
                          CASE {current.id}: {current.category.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }} className="problem-grid">
                        <div style={{ padding: "32px", background: "#FAF8F5", borderRight: "1px solid #E5E2DA" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "#8E8B84", textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>
                            <AlertTriangle style={{ width: 14, height: 14 }} />
                            <span>Traditional Practice</span>
                          </div>
                          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1A1918", marginBottom: 12, lineHeight: 1.4 }}>{current.problemSummary}</h3>
                          <p style={{ fontSize: 13, color: "#55524C", lineHeight: 1.65 }}>{current.problemDetails}</p>
                        </div>
                        <div style={{ padding: "32px", background: "#FFFFFF" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "#1F7A55", textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>
                            <CheckCircle2 style={{ width: 14, height: 14 }} />
                            <span>How Quorix Resolves This</span>
                          </div>
                          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1A1918", marginBottom: 12, lineHeight: 1.4 }}>{current.solutionSummary}</h3>
                          <p style={{ fontSize: 13, color: "#423F3A", lineHeight: 1.65 }}>{current.solutionDetails}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </RevealSection>
            </div>
          </section>

          {/* ─────────────────────────────────────────────────────────
              INTERVIEW LIFECYCLE — 3-Stage
          ───────────────────────────────────────────────────────── */}
          <section id="lifecycle" style={{ borderBottom: "1px solid #E5E2DA", background: "#F2EFE9", padding: "96px 24px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <RevealSection style={{ marginBottom: 48 }}>
                <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#6E6B65", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
                  How Quorix Structures Every Interview
                </div>
                <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.025em", color: "#1A1918", lineHeight: 1.15, marginBottom: 16 }}>
                  The three-stage adaptive interview arc
                </h2>
                <p style={{ fontSize: 15, color: "#55524C", lineHeight: 1.65, maxWidth: "58ch" }}>
                  Rather than jumping into disconnected questions, Quorix structures every interview into an intentional progression that gauges fundamental grasp, technical depth, and trade-off maturity.
                </p>
              </RevealSection>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
                {[
                  {
                    stage: "STAGE 01",
                    title: "Ice-Breaker & Profile Grounding",
                    body: "Calibrates the interview against the candidate's verified resume. Validates core background, projects, primary language runtimes, and architectural choices.",
                    goal: "Establish candidate baseline and comfort.",
                  },
                  {
                    stage: "STAGE 02",
                    title: "Core Technical & System Design",
                    body: "Focuses on deep technical domain competencies. The AI engine dynamically scales question difficulty based on recent answer quality signals.",
                    goal: "Probe architectural depth and implementation mastery.",
                  },
                  {
                    stage: "STAGE 03",
                    title: "Techno-Managerial & Trade-offs",
                    body: "Evaluates operational failure handling, network partitions, SLO budgeting, cost trade-offs, and communication under system duress.",
                    goal: "Assess senior judgment, trade-offs, and clarity.",
                  },
                ].map((s, i) => (
                  <RevealSection key={s.stage} delay={i * 100}>
                    <div style={{ border: "1px solid #E5E2DA", background: "#FFFFFF", padding: 24, height: "100%" }}>
                      <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "#8E8B84", marginBottom: 12 }}>{s.stage}</div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A1918", marginBottom: 10, lineHeight: 1.3 }}>{s.title}</h3>
                      <p style={{ fontSize: 13, color: "#55524C", lineHeight: 1.65, marginBottom: 16 }}>{s.body}</p>
                      <div style={{ borderTop: "1px solid #E5E2DA", paddingTop: 12, fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#6E6B65" }}>
                        Goal: {s.goal}
                      </div>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </div>
          </section>

          {/* ─────────────────────────────────────────────────────────
              EVALUATION RUBRIC
          ───────────────────────────────────────────────────────── */}
          <section id="rubric" style={{ borderBottom: "1px solid #E5E2DA", padding: "96px 24px", background: "#FAF8F5" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <RevealSection style={{ marginBottom: 48 }}>
                <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#6E6B65", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
                  Scoring Rubric Specification
                </div>
                <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.025em", color: "#1A1918", lineHeight: 1.15, marginBottom: 16 }}>
                  Tri-factor answer evaluation rubric
                </h2>
                <p style={{ fontSize: 15, color: "#55524C", lineHeight: 1.65, maxWidth: "58ch" }}>
                  Every answer is evaluated across three independent dimensions on a standardized 1–10 point scale, backed by concrete evidence from the candidate&apos;s answer.
                </p>
              </RevealSection>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
                {[
                  {
                    dim: "DIMENSION 01",
                    title: "Relevance",
                    body: "Evaluates how directly and strictly the candidate's answer addresses the specific technical question asked, without evading key constraints or rambling into unrelated territory.",
                    criteria: ["Direct constraint satisfaction", "Elimination of evasive filler language", "Adherence to scenario boundaries"],
                  },
                  {
                    dim: "DIMENSION 02",
                    title: "Depth",
                    body: "Demonstrates fundamental technical comprehension, awareness of architectural trade-offs, concurrency issues, edge cases, and production failure recovery.",
                    criteria: ["Architectural trade-off analysis", "Failure recovery (retries, DLQs, timeouts)", "Low-level system awareness"],
                  },
                  {
                    dim: "DIMENSION 03",
                    title: "Clarity",
                    body: "Measures structural coherence, terminology accuracy, conciseness, and how effectively the candidate articulates complex engineering trade-offs.",
                    criteria: ["Logical sequencing and structure", "Accurate domain terminology", "Decision-ready articulation"],
                  },
                ].map((d, i) => (
                  <RevealSection key={d.dim} delay={i * 100}>
                    <div style={{ border: "1px solid #E5E2DA", background: "#FFFFFF", padding: 24, height: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "#8E8B84" }}>{d.dim}</span>
                        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, fontWeight: 600, color: "#1A1918", background: "#F7F5F0", border: "1px solid #E5E2DA", padding: "2px 8px" }}>1–10</span>
                      </div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A1918", marginBottom: 10 }}>{d.title}</h3>
                      <p style={{ fontSize: 13, color: "#55524C", lineHeight: 1.65, marginBottom: 16 }}>{d.body}</p>
                      <div style={{ borderTop: "1px solid #E5E2DA", paddingTop: 12 }}>
                        <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, fontWeight: 600, color: "#1A1918", marginBottom: 6 }}>Verification Criteria:</div>
                        {d.criteria.map((c) => (
                          <div key={c} style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#6E6B65", marginBottom: 4 }}>› {c}</div>
                        ))}
                      </div>
                    </div>
                  </RevealSection>
                ))}
              </div>

              <RevealSection delay={300}>
                <div style={{ border: "1px solid #E5E2DA", background: "#FFFFFF", padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <ShieldCheck style={{ width: 16, height: 16, color: "#1A1918", flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: "#55524C", lineHeight: 1.65, margin: 0 }}>
                    <strong style={{ color: "#1A1918" }}>Human-in-the-Loop Governance Clause: </strong>
                    Automated scores are treated strictly as decision-support information. In live expert interviews, authorized human board interviewers maintain unilateral authority to review, contextualize, or override automated scoring observations.
                  </p>
                </div>
              </RevealSection>
            </div>
          </section>

          {/* ─────────────────────────────────────────────────────────
              PLATFORM CAPABILITIES
          ───────────────────────────────────────────────────────── */}
          <section id="requirements" style={{ borderBottom: "1px solid #E5E2DA", background: "#F2EFE9", padding: "96px 24px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <RevealSection style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.025em", color: "#1A1918", lineHeight: 1.15, marginBottom: 16 }}>
                  What Quorix provides
                </h2>
                <p style={{ fontSize: 15, color: "#55524C", lineHeight: 1.65, maxWidth: "58ch" }}>
                  Comprehensive summary of platform capabilities across both candidate and expert workflows.
                </p>
              </RevealSection>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
                {functionalModules.map((mod, i) => (
                  <RevealSection key={mod.module} delay={(i % 2) * 80}>
                    <div style={{ border: "1px solid #E5E2DA", background: "#FFFFFF", padding: 24, height: "100%" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1A1918", marginBottom: 8, lineHeight: 1.3 }}>{mod.module}</h3>
                      <p style={{ fontSize: 12, color: "#55524C", lineHeight: 1.65, marginBottom: 16 }}>{mod.description}</p>
                      <ul style={{ borderTop: "1px solid #E5E2DA", paddingTop: 12, listStyle: "none", margin: 0, padding: "12px 0 0 0" }}>
                        {mod.deliverables.map((item) => (
                          <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#423F3A", marginBottom: 6 }}>
                            <span style={{ fontFamily: "var(--font-geist-mono), monospace", color: "#8E8B84", flexShrink: 0 }}>›</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </div>
          </section>

          {/* ─────────────────────────────────────────────────────────
              SECURITY CONTROLS
          ───────────────────────────────────────────────────────── */}
          <section style={{ padding: "80px 24px", background: "#FAF8F5" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <RevealSection>
                <div style={{ border: "1px solid #E5E2DA", background: "#FFFFFF", padding: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                    <ShieldCheck style={{ width: 18, height: 18, color: "#1A1918" }} />
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A1918", letterSpacing: "-0.01em", margin: 0 }}>
                      Security, Privacy & AI Safety Controls
                    </h3>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                    {[
                      { title: "Role-Based Access", body: "Strict boundary isolation across Candidate, Expert, and Admin domains. Unauthorized users cannot edit questions." },
                      { title: "Server-Side AI Isolation", body: "Model credentials and API keys are stored server-side only. LLM responses are schema-validated before database write." },
                      { title: "Data Encryption & Audit", body: "Passwords securely hashed with bcrypt; transit encrypted over HTTPS; full event timestamps recorded in audit logs." },
                      { title: "Prompt Injection Defense", body: "Candidate answers cannot execute queries or alter prompts. Deterministic scoring rubrics prevent adversarial jailbreaks." },
                    ].map((c) => (
                      <div key={c.title} style={{ border: "1px solid #E5E2DA", background: "#FAF8F5", padding: 16 }}>
                        <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, fontWeight: 700, color: "#1A1918", marginBottom: 8 }}>{c.title}</div>
                        <p style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#55524C", lineHeight: 1.6, margin: 0 }}>{c.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </RevealSection>
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer style={{ background: "#FAF8F5", borderTop: "1px solid #E5E2DA", padding: "36px 24px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#6E6B65" }}>
              <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, color: "#1A1918", letterSpacing: "0.1em" }}>QUORIX</span>
              <span style={{ color: "#D5D1C7" }}>|</span>
              <span>AI-Powered Interview Platform</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 12, color: "#6E6B65" }}>
              <Link href="/login" style={{ color: "#6E6B65", textDecoration: "none", transition: "color 0.2s" }} className="hover:text-[#1A1918]">Sign In</Link>
              <Link href="/register" style={{ color: "#6E6B65", textDecoration: "none", transition: "color 0.2s" }} className="hover:text-[#1A1918]">Register</Link>
              <a href="#problems" style={{ color: "#6E6B65", textDecoration: "none", transition: "color 0.2s" }} className="hover:text-[#1A1918]">How It Works</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
