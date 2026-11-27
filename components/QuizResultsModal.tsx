"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Award, CheckCircle2, Clock, Loader2, X } from "lucide-react";

type AttemptStatus = "in_progress" | "completed" | "abandoned" | "timed_out";

interface QuestionResponse {
  questionId: string;
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

interface ExpertAttempt {
  attemptId: string;
  candidateName: string;
  candidateEmail: string;
  attemptNumber: number;
  score: number;
  total: number;
  percentage: number;
  status: AttemptStatus;
  timeSpentSeconds: number | null;
  submittedAt: string | null;
  breakdown: QuestionResponse[];
  answers: Record<string, string>;
}

interface CandidateAttemptSummary {
  attemptId: string;
  attemptNumber: number;
  score: number;
  total: number;
  percentage: number;
  status: AttemptStatus;
  timeSpentSeconds: number | null;
  submittedAt: string | null;
  breakdown: QuestionResponse[];
}

interface ExpertLeaderboardEntry {
  rank: number;
  candidateName: string;
  attemptNumber: number;
  score: number;
  total: number;
  percentage: number;
  timeSpentSeconds: number | null;
}

interface QuizResultsModalProps {
  quizId: string;
  quizTitle: string;
  view: "expert" | "candidate";
  onClose: () => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "In progress";
}

const statusLabel: Record<AttemptStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
  abandoned: "Left early",
  timed_out: "Timed out",
};

export default function QuizResultsModal({
  quizId,
  quizTitle,
  view,
  onClose,
}: QuizResultsModalProps) {
  const [attempts, setAttempts] = useState<ExpertAttempt[]>([]);
  const [candidateAttempts, setCandidateAttempts] = useState<
    CandidateAttemptSummary[]
  >([]);
  const [expertLeaderboard, setExpertLeaderboard] = useState<
    ExpertLeaderboardEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/quizzes/${quizId}/results`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not load quiz results.");
        }
        return data;
      })
      .then((data) => {
        if (!active) return;
        if (view === "expert" && Array.isArray(data.attempts)) {
          setAttempts(data.attempts);
          setExpertLeaderboard(
            Array.isArray(data.leaderboard) ? data.leaderboard : []
          );
        } else if (view === "candidate" && Array.isArray(data.attempts)) {
          setCandidateAttempts(data.attempts);
        } else {
          throw new Error("The results response was incomplete.");
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "Could not load quiz results."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [quizId, view]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1A1918]/45 p-4 backdrop-blur-xs"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-results-title"
        className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[#E5E2DA] bg-[#FAF8F5] p-5 shadow-2xl sm:p-7"
      >
        <header className="mb-5 flex items-start justify-between gap-4 border-b border-[#E5E2DA] pb-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-mono uppercase text-[#6E6B65]">
              <Award className="h-4 w-4 text-[#1F7A55]" />
              {view === "expert"
                ? "Quiz responses & leaderboard"
                : "Your attempt summary"}
            </div>
            <h2
              id="quiz-results-title"
              className="text-xl font-bold text-[#1A1918]"
            >
              {quizTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quiz results"
            className="rounded-md p-1.5 text-[#6E6B65] hover:bg-white hover:text-[#1A1918]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#6E6B65]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading results…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : view === "expert" ? (
          attempts.length === 0 ? (
            <div className="rounded-lg border border-[#E5E2DA] bg-white p-8 text-center text-sm text-[#6E6B65]">
              No candidates have started this quiz yet.
            </div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-lg border border-[#E5E2DA] bg-white p-4">
                <h3 className="mb-3 text-xs font-mono font-semibold uppercase text-[#6E6B65]">
                  Best score per candidate
                </h3>
                {expertLeaderboard.length === 0 ? (
                  <p className="text-xs text-[#8E8B84]">
                    The leaderboard will appear after a candidate submits an attempt.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead className="text-[10px] font-mono uppercase text-[#8E8B84]">
                        <tr>
                          <th className="pb-2 pr-3">Rank</th>
                          <th className="pb-2 pr-3">Candidate</th>
                          <th className="pb-2 pr-3">Score</th>
                          <th className="pb-2">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E2DA]">
                        {expertLeaderboard.map((entry) => (
                          <tr key={`${entry.rank}-${entry.candidateName}`}>
                            <td className="py-2 pr-3 font-mono font-bold text-[#1A1918]">
                              #{entry.rank}
                            </td>
                            <td className="py-2 pr-3 font-medium text-[#1A1918]">
                              {entry.candidateName}
                            </td>
                            <td className="py-2 pr-3 font-mono text-[#1F7A55]">
                              {entry.score}/{entry.total} · {entry.percentage}%
                            </td>
                            <td className="py-2 text-[#6E6B65]">
                              {formatDuration(entry.timeSpentSeconds)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <h3 className="text-xs font-mono font-semibold uppercase text-[#6E6B65]">
                Candidate attempts &amp; responses
              </h3>
              <div className="space-y-3">
              {attempts.map((attempt) => (
                <article
                  key={attempt.attemptId}
                  className="rounded-lg border border-[#E5E2DA] bg-white p-4"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-[#1A1918]">
                        {attempt.candidateName}
                      </h3>
                      <p className="truncate text-xs text-[#6E6B65]">
                        {attempt.candidateEmail}
                      </p>
                      <p className="mt-1 text-[11px] text-[#8E8B84]">
                        Attempt {attempt.attemptNumber} · {formatDate(attempt.submittedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-[#6E6B65]">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(attempt.timeSpentSeconds)}
                      </span>
                      <span
                        className={`rounded-md px-2 py-1 font-medium ${
                          attempt.status === "completed" || attempt.status === "timed_out"
                            ? "bg-[#EDF3EC] text-[#1F7A55]"
                            : "bg-[#F2EFE9] text-[#6E6B65]"
                        }`}
                      >
                        {statusLabel[attempt.status]}
                      </span>
                      {attempt.status === "completed" || attempt.status === "timed_out" ? (
                        <span className="font-mono font-bold text-[#1A1918]">
                          {attempt.score}/{attempt.total} · {attempt.percentage}%
                        </span>
                      ) : null}
                      {(attempt.breakdown.length > 0 ||
                        Object.keys(attempt.answers).length > 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedAttempt((current) =>
                              current === attempt.attemptId ? null : attempt.attemptId
                            )
                          }
                          className="rounded-md border border-[#D5D1C7] px-2.5 py-1.5 font-medium text-[#1A1918] hover:bg-[#FAF8F5]"
                        >
                          {expandedAttempt === attempt.attemptId
                            ? "Hide responses"
                            : "View responses"}
                        </button>
                      )}
                    </div>
                  </div>

                  {expandedAttempt === attempt.attemptId && (
                    <div className="mt-4 space-y-3 border-t border-[#E5E2DA] pt-3">
                      {attempt.breakdown.length > 0 ? (
                        attempt.breakdown.map((response, index) => (
                          <div
                            key={response.questionId}
                            className="rounded-md bg-[#FAF8F5] p-3 text-xs"
                          >
                            <div className="font-semibold text-[#1A1918]">
                              Q{index + 1}. {response.question}
                            </div>
                            <div className="mt-1 text-[#55524C]">
                              Candidate response: {response.selectedAnswer || "No answer"}
                            </div>
                            <div className="mt-1 text-[#1F7A55]">
                              Expected answer: {response.correctAnswer}
                            </div>
                            {response.explanation && (
                              <p className="mt-1 text-[#6E6B65]">
                                {response.explanation}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="space-y-2 text-xs text-[#55524C]">
                          {Object.entries(attempt.answers).map(([questionId, answer]) => (
                            <div key={questionId} className="rounded-md bg-[#FAF8F5] p-3">
                              {questionId}: {answer}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
              </div>
            </div>
          )
        ) : candidateAttempts.length === 0 ? (
          <div className="rounded-lg border border-[#E5E2DA] bg-white p-8 text-center text-sm text-[#6E6B65]">
            No attempts have been submitted for this quiz yet. Your score and answer review will appear here after you finish an attempt.
          </div>
        ) : (
          <div className="space-y-4">
            {candidateAttempts.map((attempt) => (
              <article
                key={attempt.attemptId}
                className="rounded-lg border border-[#E5E2DA] bg-white p-4 sm:p-5"
              >
                <header className="flex flex-col justify-between gap-3 border-b border-[#E5E2DA] pb-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1918]">
                      Attempt {attempt.attemptNumber}
                    </h3>
                    <p className="mt-1 text-[11px] text-[#6E6B65]">
                      {formatDate(attempt.submittedAt)} ·{" "}
                      {formatDuration(attempt.timeSpentSeconds)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#F2EFE9] px-2.5 py-1 text-xs font-medium text-[#6E6B65]">
                      {statusLabel[attempt.status]}
                    </span>
                    {attempt.status === "completed" ||
                    attempt.status === "timed_out" ? (
                      <span className="rounded-md border border-[#CBE4D6] bg-[#EDF3EC] px-2.5 py-1 font-mono text-sm font-bold text-[#1F7A55]">
                        {attempt.score}/{attempt.total} correct · {attempt.percentage}%
                      </span>
                    ) : (
                      <span className="text-xs text-[#8E8B84]">Not scored</span>
                    )}
                  </div>
                </header>

                {attempt.breakdown.length === 0 ? (
                  <p className="pt-3 text-xs text-[#6E6B65]">
                    No answers were recorded for this attempt.
                  </p>
                ) : (
                  <div className="space-y-3 pt-3">
                    {attempt.breakdown.map((response, index) => (
                      <div
                        key={response.questionId}
                        className="rounded-md bg-[#FAF8F5] p-3 text-xs"
                      >
                        <div className="font-semibold text-[#1A1918]">
                          Q{index + 1}. {response.question}
                        </div>
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          <p className="text-[#55524C]">
                            Your answer:{" "}
                            <span
                              className={
                                response.isCorrect
                                  ? "font-semibold text-[#1F7A55]"
                                  : "font-semibold text-[#991B1B]"
                              }
                            >
                              {response.selectedAnswer || "Not answered"}
                            </span>
                          </p>
                          <p className="text-[#55524C]">
                            Correct answer:{" "}
                            <span className="font-semibold text-[#1F7A55]">
                              {response.correctAnswer}
                            </span>
                          </p>
                        </div>
                        {response.explanation && (
                          <p className="mt-2 border-t border-[#E5E2DA] pt-2 text-[#6E6B65]">
                            {response.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="mt-4 flex items-center gap-1.5 text-[11px] text-[#8E8B84]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {view === "expert"
              ? `${attempts.length} attempt${attempts.length === 1 ? "" : "s"} recorded · ${expertLeaderboard.length} candidate${expertLeaderboard.length === 1 ? "" : "s"} ranked`
              : `${candidateAttempts.length} of your attempt${candidateAttempts.length === 1 ? "" : "s"} shown`}
          </div>
        )}
      </section>
    </div>
  );
}
