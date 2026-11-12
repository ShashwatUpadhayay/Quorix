"use client";

import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import type { InterviewConfig } from "@/lib/mongodb";
import type { ParsedResumeResult } from "@/lib/resumeParser";

// PDF binary parsing is intentionally not supported — it produces garbled output.
// Users with PDFs should open their PDF, select all, copy, and paste the text below.

interface ResumeParserPanelProps {
  onProfileSynced?: (payload: {
    parsed: ParsedResumeResult;
    interviewConfig: InterviewConfig;
    updatedName?: string;
  }) => void;
}

const SAMPLE_RESUME = `Jordan Patel
Senior Backend & Distributed Systems Engineer
Bengaluru, India | +91 98765 43210
https://github.com/jordanpatel | https://linkedin.com/in/jordanpatel

SUMMARY
Backend engineer with 6+ years of experience designing fault-tolerant microservices, event-driven pipelines, and high-throughput databases.

SKILLS
Go, TypeScript, Node.js, PostgreSQL, Redis, Kafka, Kubernetes, Docker, AWS, Distributed Systems, gRPC, Microservices

EXPERIENCE
Senior Backend Engineer at StreamScale | Jan 2022 - Present
- Architected multi-partition Kafka ingestion pipeline handling 120k events/sec with idempotent consumers.
- Reduced p99 PostgreSQL query latency by 48% via composite indexing and connection pooling.

Software Engineer at FinLedger | Jun 2019 - Dec 2021
- Built REST and gRPC settlement APIs in Go and TypeScript backed by PostgreSQL and Redis.
- Automated Kubernetes blue-green deployments with Prometheus SLO alerts.

EDUCATION
B.Tech in Computer Science, NIT Surathkal, 2019, CGPA: 8.9/10

PUBLICATIONS
Deterministic Retry Backoff Under Partition Skew - Systems Engineering Journal 2023

AWARDS
Engineering Excellence Award - StreamScale 2023

CERTIFICATIONS
AWS Certified Solutions Architect - Associate 2022`;


export default function ResumeParserPanel({
  onProfileSynced,
}: ResumeParserPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [updateNameFromResume, setUpdateNameFromResume] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccessNotice(null);
    setFileName(file.name);

    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".pdf")) {
        setFileName(null);
        setError(
          "PDF upload is not supported — browsers cannot reliably extract text from PDF binaries. Open your PDF, press Ctrl+A to select all, copy, then paste the text into the box below."
        );
        return;
      }
      const text = await file.text();
      setResumeText(text);
    } catch {
      setError("Could not read file. Try pasting your resume text below.");
    }
  };

  const handleParseAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (resumeText.trim().length < 30) {
      setError(
        "Enter or upload at least 30 characters of resume content to parse."
      );
      return;
    }

    setParsing(true);
    try {
      const res = await fetch("/api/resume/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          applyToProfile: true,
          updateName: updateNameFromResume,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse resume.");
      }


      setSuccessNotice(
        `Profile populated & interviews calibrated to ${data.interviewConfig.difficultyTier} (Tier ${data.interviewConfig.difficultyNumeric}).`
      );
      onProfileSynced?.({
        parsed: data.parsed,
        interviewConfig: data.interviewConfig,
        updatedName: data.updatedName,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not parse resume."
      );
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleParseAndSave}
        className="border border-[#E5E2DA] bg-[#FAF8F5] p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-mono uppercase text-[#6E6B65]">
              Resume Parser &amp; Adaptive Calibration
            </div>
            <h2 className="text-base font-bold text-[#1A1918]">
              Upload or Paste Your Resume
            </h2>
            <p className="text-xs text-[#55524C] max-w-2xl leading-relaxed">
              Automatically extracts skills, experience, education, publications, awards, and certifications into your profile, then calibrates interview difficulty and topic focus across your workspace.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setResumeText(SAMPLE_RESUME);
                setFileName("sample-resume.txt");
                setError(null);
              }}
              className="border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#1A1918] hover:bg-[#EAE6DD] transition-colors"
            >
              Load Sample Resume
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#1A1918] hover:bg-[#EAE6DD] transition-colors"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              <span>Upload (.txt or .md)</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>
        </div>

        {fileName && (
          <div className="flex items-center gap-2 text-xs font-mono text-[#55524C] border border-[#E5E2DA] bg-[#FFFFFF] px-3 py-2">
            <FileText className="w-3.5 h-3.5 text-[#1F7A55]" />
            <span>Loaded: {fileName}</span>
          </div>
        )}

        <textarea
          rows={9}
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Paste your full resume text here (Name, Summary, Skills, Experience, Education, Publications, Awards, Certifications)..."
          className="w-full border border-[#D5D1C7] bg-[#FFFFFF] p-3.5 text-xs font-mono text-[#1A1918] placeholder-[#8E8B84] leading-relaxed focus-visible:outline-2 focus-visible:outline-[#1A1918]"
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-[#55524C] cursor-pointer">
            <input
              type="checkbox"
              checked={updateNameFromResume}
              onChange={(e) => setUpdateNameFromResume(e.target.checked)}
              className="accent-[#1A1918]"
            />
            <span>Also update my account display name if detected in header</span>
          </label>

          <button
            type="submit"
            disabled={parsing || resumeText.trim().length < 30}
            className="inline-flex items-center justify-center bg-[#1A1918] text-[#FAF8F5] px-5 py-2.5 text-xs font-medium hover:bg-[#2C2A28] disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            <span>
              {parsing
                ? "Parsing Resume & Updating Profile..."
                : "Parse Resume & Build Profile"}
            </span>
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 border border-[#B45332] bg-[#FFF8F5] px-3.5 py-2.5 text-xs text-[#8E351A]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successNotice && (
          <div className="flex items-start gap-2 border border-[#1F7A55] bg-[#F2F9F5] px-3.5 py-2.5 text-xs text-[#155E41]">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successNotice}</span>
          </div>
        )}
      </form>
    </div>
  );
}
