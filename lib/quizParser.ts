import type { QuizQuestion } from "./mongodb";

export interface ParseResult {
  questions: QuizQuestion[];
  errors: string[];
  totalParsed: number;
}

/**
 * Split a single CSV line honoring double quotes.
 */
function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Robust CSV parser for Quiz Questions.
 * Expects headers or order:
 * Question, Option A, Option B, Option C, Option D, Correct Answer, [Explanation]
 */
export function parseQuizCsv(csvContent: string): ParseResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: QuizQuestion[] = [];
  const errors: string[] = [];

  if (lines.length === 0) {
    return { questions: [], errors: ["CSV file is empty."], totalParsed: 0 };
  }

  // Check if first line is a header
  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  if (
    firstLine.includes("question") ||
    firstLine.includes("option") ||
    firstLine.includes("answer")
  ) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const row = parseCsvLine(rawLine);

    if (row.length < 6) {
      errors.push(`Row ${i + 1}: Insufficient columns (expected at least 6: Question, A, B, C, D, Correct Answer).`);
      continue;
    }

    const questionText = row[0].replace(/^["']|["']$/g, "").trim();
    const optA = row[1].replace(/^["']|["']$/g, "").trim();
    const optB = row[2].replace(/^["']|["']$/g, "").trim();
    const optC = row[3].replace(/^["']|["']$/g, "").trim();
    const optD = row[4].replace(/^["']|["']$/g, "").trim();
    const rawAnswer = row[5].replace(/^["']|["']$/g, "").trim();
    const explanation = row[6] ? row[6].replace(/^["']|["']$/g, "").trim() : "";

    const options = [optA, optB, optC, optD].filter((o) => o.length > 0);

    if (!questionText) {
      errors.push(`Row ${i + 1}: Empty question text.`);
      continue;
    }

    if (options.length < 2) {
      errors.push(`Row ${i + 1}: At least 2 options required.`);
      continue;
    }

    // Resolve correct answer: Could be "A", "B", "C", "D" or the option text itself
    let correctAnswer = rawAnswer;
    const ansUpper = rawAnswer.toUpperCase();
    if (ansUpper === "A" && options[0]) correctAnswer = options[0];
    else if (ansUpper === "B" && options[1]) correctAnswer = options[1];
    else if (ansUpper === "C" && options[2]) correctAnswer = options[2];
    else if (ansUpper === "D" && options[3]) correctAnswer = options[3];

    questions.push({
      id: `q_${Date.now()}_${questions.length + 1}`,
      question: questionText,
      options,
      correctAnswer,
      explanation: explanation || undefined,
    });
  }

  return {
    questions,
    errors,
    totalParsed: questions.length,
  };
}

/**
 * Text / Document parser for quiz questions formatted with numbers and option letters:
 * 1. Question text?
 * A) Option 1
 * B) Option 2
 * C) Option 3
 * D) Option 4
 * Answer: A (or Correct: Option 1)
 * Explanation: ...
 */
export function parseQuizTextDoc(docContent: string): ParseResult {
  const blocks = docContent.split(/\n\s*\n+/);
  const questions: QuizQuestion[] = [];
  const errors: string[] = [];

  for (let bIndex = 0; bIndex < blocks.length; bIndex++) {
    const block = blocks[bIndex].trim();
    if (!block) continue;

    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 3) continue;

    let questionText = "";
    const options: string[] = [];
    let correctAnswer = "";
    let explanation = "";

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      const optMatch = line.match(/^([A-Da-d])[\.\)\:\-]\s*(.+)$/);
      const ansMatch = line.match(/^(?:Answer|Correct(?:\s*Answer)?|Ans)[\:\-]?\s*(.+)$/i);
      const explMatch = line.match(/^(?:Explanation|Reason|Note)[\:\-]?\s*(.+)$/i);

      if (ansMatch) {
        correctAnswer = ansMatch[1].trim();
      } else if (explMatch) {
        explanation = explMatch[1].trim();
      } else if (optMatch) {
        options.push(optMatch[2].trim());
      } else if (!questionText) {
        // Remove leading number if present (e.g., "1. " or "Q1: ")
        questionText = line.replace(/^(?:\d+[\.\)\:\-]|Q\d+[\.\)\:\-])\s*/i, "").trim();
      } else if (options.length === 0) {
        // Multi-line question text before options
        questionText += " " + line;
      }
    }

    if (!questionText || options.length < 2) {
      // If unable to parse as a question block, note as error if it looked like an attempt
      if (questionText || options.length > 0) {
        errors.push(`Block ${bIndex + 1}: Incomplete question format.`);
      }
      continue;
    }

    // Resolve letter answer to actual option text if given as "A", "B", etc.
    const ansUpper = correctAnswer.toUpperCase();
    if (ansUpper === "A" && options[0]) correctAnswer = options[0];
    else if (ansUpper === "B" && options[1]) correctAnswer = options[1];
    else if (ansUpper === "C" && options[2]) correctAnswer = options[2];
    else if (ansUpper === "D" && options[3]) correctAnswer = options[3];

    // If no answer specified or doesn't match an option, fallback to first option or flag error
    if (!correctAnswer) {
      errors.push(`Block ${bIndex + 1}: Missing correct answer specification. Defaulted to Option A.`);
      correctAnswer = options[0];
    }

    questions.push({
      id: `q_${Date.now()}_${questions.length + 1}`,
      question: questionText,
      options,
      correctAnswer,
      explanation: explanation || undefined,
    });
  }

  return {
    questions,
    errors,
    totalParsed: questions.length,
  };
}

/**
 * Universal parser detecting CSV vs Text Document
 */
export function parseQuizInput(rawContent: string, format?: "csv" | "doc" | "auto"): ParseResult {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return { questions: [], errors: ["Input is empty."], totalParsed: 0 };
  }

  const isCsv =
    format === "csv" ||
    (format !== "doc" &&
      (trimmed.includes(",") && (trimmed.includes("Question,") || trimmed.includes("question,") || trimmed.split("\n")[0].split(",").length >= 5)));

  if (isCsv) {
    return parseQuizCsv(trimmed);
  } else {
    return parseQuizTextDoc(trimmed);
  }
}

/**
 * Fisher-Yates shuffle algorithm to guarantee jumbled order of questions
 * so no two candidates or attempts share identical sequences.
 */
export function shuffleQuestions<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const SAMPLE_QUIZ_CSV = `Question,Option A,Option B,Option C,Option D,Correct Answer,Explanation
"What does ACID stand for in relational database management?","Atomicity, Consistency, Isolation, Durability","Access, Control, Integrity, Data","Action, Cloud, Integration, Deployment","Async, Compute, Index, Dispatch","A","ACID guarantees database transactions are processed reliably."
"Which distributed consensus algorithm is used by Raft?","Leader election and log replication","Proof of Work hashing","Vector clocks only","Gossip protocol only","A","Raft achieves consensus via leader election and replicated log entries."
"In Kafka, how is partition parallelism bounded on consumer groups?","Max one consumer per partition within a group","Unlimited consumers per partition","Exactly two consumers per topic","One thread per broker","A","Within a consumer group, each partition is consumed by only one consumer member."
"What is the primary role of an idempotent HTTP request?","Producing the same result regardless of repeated identical requests","Caching the payload indefinitely","Encrypting the request body with HMAC","Requiring zero server-side state","A","An idempotent method produces the same side-effect on the server whether executed once or many times."
"What happens during a split-brain scenario in a distributed cluster?","Network partition causes independent nodes to elect multiple leaders","The CPU registers lose cache coherence","Storage disk writes become strictly serialized","All client connections are permanently terminated","A","Split-brain occurs when isolated sub-clusters believe they are the authoritative cluster."`;
