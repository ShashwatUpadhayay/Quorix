"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  DOMAIN_NAMES,
  PIPELINE_STAGES,
  STAGE_LABELS,
} from "@/lib/questionPipeline/taxonomy";

interface ReviewQuestion {
  id: string;
  text: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  stage: string;
  expectedPoints: string[];
  competencyTags: string[];
  status: string;
  source: string;
  provider?: string;
  model?: string;
  reviewNotes?: string;
  reviewedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BankStats {
  total: number;
  approved: number;
  draft: number;
  rejected: number;
  archived: number;
  bySource: Record<string, number>;
  byDomain: Array<{ domain: string; approved: number; draft: number }>;
  embeddingModel: string;
}

interface ReviewResponse {
  questions: ReviewQuestion[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  stats: BankStats;
  filters: {
    domains: string[];
    stages: string[];
  };
}

interface EditForm {
  text: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  stage: string;
  expectedPoints: string;
  competencyTags: string;
  reviewNotes: string;
}

const STATUS_TABS = [
  { id: "draft", label: "Drafts" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

function toEditForm(question: ReviewQuestion): EditForm {
  return {
    text: question.text,
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    stage: question.stage,
    expectedPoints: question.expectedPoints.join("\n"),
    competencyTags: question.competencyTags.join(", "),
    reviewNotes: question.reviewNotes || "",
  };
}

function formToUpdates(form: EditForm) {
  return {
    text: form.text.trim(),
    topic: form.topic,
    subtopic: form.subtopic,
    difficulty: Number(form.difficulty),
    stage: form.stage,
    expectedPoints: form.expectedPoints
      .split("\n")
      .map((point) => point.trim())
      .filter(Boolean),
    competencyTags: form.competencyTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    reviewNotes: form.reviewNotes.trim(),
  };
}

export default function QuestionReviewBoard({
  reviewerName,
}: {
  reviewerName: string;
}) {
  const [status, setStatus] = useState("draft");
  const [domain, setDomain] = useState("");
  const [stage, setStage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQuery(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status,
        domain,
        stage,
        q: query,
        page: String(page),
        limit: "20",
      });
      const response = await fetch(`/api/questions/review?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load review queue.");
      }
      setData(payload as ReviewResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load review queue."
      );
    } finally {
      setLoading(false);
    }
  }, [status, domain, stage, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = data?.stats;
  const questions = data?.questions || [];
  const pagination = data?.pagination;

  const domainOptions = useMemo(
    () => (data?.filters.domains?.length ? data.filters.domains : DOMAIN_NAMES),
    [data]
  );

  const startEdit = (question: ReviewQuestion) => {
    setEditingId(question.id);
    setForm(toEditForm(question));
    setNotice(null);
  };

  const runAction = async (
    question: ReviewQuestion,
    action: "approve" | "reject" | "save" | "archive"
  ) => {
    setBusyId(question.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/questions/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: question.id,
          action,
          updates:
            editingId === question.id && form ? formToUpdates(form) : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Review action failed.");
      }
      setNotice(
        action === "approve"
          ? "Question approved and embedded."
          : action === "reject"
            ? "Question rejected."
            : action === "archive"
              ? "Question archived."
              : "Edits saved."
      );
      setEditingId(null);
      setForm(null);
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Review action failed."
      );
    } finally {
      setBusyId(null);
    }
  };

  const bootstrapCurated = async () => {
    setBusyId("bootstrap");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/questions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bootstrap-curated" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not seed the curated bank.");
      }
      setNotice(
        `Curated bank is ready (${payload.inserted} rows written, ${payload.stats?.approved || 0} approved total).`
      );
      await load();
    } catch (bootstrapError) {
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : "Could not seed the curated bank."
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1918] p-5 sm:p-8 lg:p-12 font-sans selection:bg-[#E5E2DA]">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="border-b border-[#E5E2DA] pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#6E6B65]">
              <span className="w-2 h-2 rounded-xs bg-[#1F7A55]" />
              <span>Question Bank · Hard Review Gate</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Review &amp; approve questions
            </h1>
            <p className="text-sm text-[#55524C] leading-relaxed max-w-2xl">
              Signed in as <span className="font-semibold">{reviewerName}</span>.
              Drafts are generated offline by the seed script. Only approved
              questions enter retrieval; edits are re-embedded on approval.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs font-medium hover:bg-[#F2EFE9] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => void bootstrapCurated()}
              disabled={busyId === "bootstrap"}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A1918] text-[#FAF8F5] px-3 py-2 text-xs font-medium hover:bg-[#2C2A28] disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Bootstrap curated bank</span>
            </button>
          </div>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Approved", value: stats?.approved ?? 0, tone: "text-[#1F7A55]" },
            { label: "Drafts", value: stats?.draft ?? 0, tone: "text-[#1A1918]" },
            { label: "Rejected", value: stats?.rejected ?? 0, tone: "text-[#B45332]" },
            { label: "Total", value: stats?.total ?? 0, tone: "text-[#1A1918]" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-4"
            >
              <div className="text-[10px] font-mono uppercase text-[#8E8B84]">
                {item.label}
              </div>
              <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${item.tone}`}>
                {item.value}
              </div>
            </div>
          ))}
        </section>

        <div className="text-[11px] font-mono text-[#6E6B65] flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#1F7A55]" />
            Embedding model: {stats?.embeddingModel || "—"}
          </span>
          <span>·</span>
          <span>
            Sources:{" "}
            {stats
              ? Object.entries(stats.bySource)
                  .map(([source, count]) => `${source} ${count}`)
                  .join(" · ") || "none"
              : "—"}
          </span>
        </div>

        {/* Filters */}
        <section className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatus(tab.id);
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  status === tab.id
                    ? "border-[#1A1918] bg-[#1A1918] text-[#FAF8F5]"
                    : "border-[#E5E2DA] bg-[#FAF8F5] text-[#55524C] hover:text-[#1A1918]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
              <span>Domain</span>
              <select
                value={domain}
                onChange={(event) => {
                  setDomain(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3 py-2 text-xs text-[#1A1918]"
              >
                <option value="">All domains</option>
                {domainOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
              <span>Stage</span>
              <select
                value={stage}
                onChange={(event) => {
                  setStage(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3 py-2 text-xs text-[#1A1918]"
              >
                <option value="">All stages</option>
                {PIPELINE_STAGES.map((option) => (
                  <option key={option} value={option}>
                    {STAGE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
              <span>Search</span>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#8E8B84]" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Text, subtopic or tag"
                  className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] pl-8 pr-3 py-2 text-xs text-[#1A1918] placeholder-[#8E8B84]"
                />
              </div>
            </label>
          </div>
        </section>

        {notice && (
          <div className="flex items-center gap-2 rounded-lg border border-[#CBE4D6] bg-[#EDF3EC] p-3 text-xs text-[#1F7A55]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-[#E5C9C0] bg-[#FFF8F5] p-3 text-xs text-[#B45332]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Queue */}
        <section className="space-y-4">
          {loading && questions.length === 0 ? (
            <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-8 text-center text-xs text-[#6E6B65]">
              Loading review queue…
            </div>
          ) : questions.length === 0 ? (
            <div className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-10 text-center space-y-2">
              <div className="text-sm font-semibold">Nothing in this queue</div>
              <p className="text-xs text-[#6E6B65]">
                Seed drafts with <code className="font-mono">npm run seed:questions</code>{" "}
                or switch tabs.
              </p>
            </div>
          ) : (
            questions.map((question) => {
              const isEditing = editingId === question.id && form;
              const isBusy = busyId === question.id;
              return (
                <article
                  key={question.id}
                  className="rounded-xl border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                    <span className="rounded border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 text-[#423F3A]">
                      {question.topic} / {question.subtopic}
                    </span>
                    <span className="rounded border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 text-[#423F3A]">
                      {STAGE_LABELS[question.stage as keyof typeof STAGE_LABELS] ||
                        question.stage}
                    </span>
                    <span className="rounded border border-[#E5E2DA] bg-[#FAF8F5] px-2 py-0.5 text-[#423F3A]">
                      Difficulty {question.difficulty}/5
                    </span>
                    <span className="rounded border border-[#CBE4D6] bg-[#EDF3EC] px-2 py-0.5 text-[#1F7A55]">
                      {question.source}
                    </span>
                    <span className="text-[#8E8B84]">{question.status}</span>
                    {question.provider && (
                      <span className="text-[#8E8B84]">
                        {question.provider}/{question.model}
                      </span>
                    )}
                  </div>

                  {isEditing && form ? (
                    <div className="space-y-3">
                      <label className="block space-y-1 text-[11px] font-mono text-[#6E6B65]">
                        <span>Question text</span>
                        <textarea
                          value={form.text}
                          onChange={(event) =>
                            setForm({ ...form, text: event.target.value })
                          }
                          rows={3}
                          className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] p-3 text-xs text-[#1A1918] leading-relaxed"
                        />
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
                          <span>Domain</span>
                          <select
                            value={form.topic}
                            onChange={(event) =>
                              setForm({ ...form, topic: event.target.value })
                            }
                            className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-2 text-xs"
                          >
                            {DOMAIN_NAMES.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
                          <span>Subtopic</span>
                          <input
                            value={form.subtopic}
                            onChange={(event) =>
                              setForm({ ...form, subtopic: event.target.value })
                            }
                            className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-2 text-xs"
                          />
                        </label>

                        <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
                          <span>Difficulty</span>
                          <select
                            value={form.difficulty}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                difficulty: Number(event.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-2 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
                          <span>Stage</span>
                          <select
                            value={form.stage}
                            onChange={(event) =>
                              setForm({ ...form, stage: event.target.value })
                            }
                            className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-2 text-xs"
                          >
                            {PIPELINE_STAGES.map((option) => (
                              <option key={option} value={option}>
                                {STAGE_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="block space-y-1 text-[11px] font-mono text-[#6E6B65]">
                        <span>Expected points (one per line)</span>
                        <textarea
                          value={form.expectedPoints}
                          onChange={(event) =>
                            setForm({ ...form, expectedPoints: event.target.value })
                          }
                          rows={4}
                          className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] p-3 text-xs text-[#1A1918] leading-relaxed"
                        />
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
                          <span>Competency tags (comma separated)</span>
                          <input
                            value={form.competencyTags}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                competencyTags: event.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-2 text-xs"
                          />
                        </label>
                        <label className="space-y-1 text-[11px] font-mono text-[#6E6B65]">
                          <span>Reviewer notes</span>
                          <input
                            value={form.reviewNotes}
                            onChange={(event) =>
                              setForm({ ...form, reviewNotes: event.target.value })
                            }
                            className="w-full rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-2.5 py-2 text-xs"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-semibold leading-relaxed">
                        {question.text}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3 space-y-1.5">
                          <div className="text-[10px] font-mono uppercase text-[#8E8B84]">
                            Expected points
                          </div>
                          <ul className="list-disc list-inside space-y-1 text-[#423F3A] leading-relaxed">
                            {question.expectedPoints.map((point, index) => (
                              <li key={index}>{point}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-lg border border-[#E5E2DA] bg-[#FAF8F5] p-3 space-y-2">
                          <div className="text-[10px] font-mono uppercase text-[#8E8B84]">
                            Competency tags
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {question.competencyTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded border border-[#D5D1C7] bg-[#FFFFFF] px-2 py-0.5 text-[10px] font-mono text-[#423F3A]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {question.reviewNotes && (
                            <p className="text-[11px] text-[#6E6B65] pt-1 border-t border-[#E5E2DA]">
                              {question.reviewNotes}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[10px] font-mono text-[#8E8B84]">
                      {question.reviewedBy
                        ? `Reviewed by ${question.reviewedBy}`
                        : "Not reviewed"}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          isEditing
                            ? (setEditingId(null), setForm(null))
                            : startEdit(question)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium hover:bg-[#F2EFE9]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{isEditing ? "Cancel edit" : "Edit"}</span>
                      </button>

                      {isEditing && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void runAction(question, "save")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D1C7] bg-[#FAF8F5] px-3 py-1.5 text-xs font-medium hover:bg-[#EFECE4] disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save edits</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runAction(question, "approve")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F7A55] text-[#FFFFFF] px-3 py-1.5 text-xs font-medium hover:bg-[#196546] disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runAction(question, "reject")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5C9C0] bg-[#FFF8F5] px-3 py-1.5 text-xs font-medium text-[#B45332] hover:bg-[#FAF3F0] disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-[#6E6B65]">
              Page {pagination.page} of {pagination.pages} · {pagination.total} rows
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-1.5 font-medium hover:bg-[#F2EFE9] disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() =>
                  setPage((current) => Math.min(pagination.pages, current + 1))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-1.5 font-medium hover:bg-[#F2EFE9] disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
