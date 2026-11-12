import { computeInterviewConfig } from "@/lib/adaptiveEngine";
import type {
  AwardItem,
  CertificationItem,
  EducationItem,
  ExperienceItem,
  InterviewConfig,
  PublicationItem,
  SkillItem,
} from "@/lib/mongodb";

export interface ParsedResumeResult {
  name?: string;
  headline: string;
  location: string;
  phone: string;
  bio: string;
  links: {
    github: string;
    linkedin: string;
    website: string;
  };
  skills: SkillItem[];
  experience: ExperienceItem[];
  education: EducationItem[];
  publications: PublicationItem[];
  awards: AwardItem[];
  certifications: CertificationItem[];
  interviewConfig: InterviewConfig;
}

const KNOWN_SKILLS: string[] = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Golang",
  "Rust",
  "Java",
  "C++",
  "C#",
  ".NET",
  "SQL",
  "NoSQL",
  "React",
  "Next.js",
  "Vue",
  "Angular",
  "Svelte",
  "Tailwind CSS",
  "Node.js",
  "Express",
  "NestJS",
  "FastAPI",
  "Django",
  "Flask",
  "Spring Boot",
  "GraphQL",
  "REST",
  "gRPC",
  "tRPC",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "DynamoDB",
  "Cassandra",
  "Elasticsearch",
  "Prisma",
  "Kafka",
  "RabbitMQ",
  "Docker",
  "Kubernetes",
  "Terraform",
  "AWS",
  "GCP",
  "Azure",
  "CI/CD",
  "GitHub Actions",
  "Linux",
  "Nginx",
  "Prometheus",
  "Grafana",
  "Microservices",
  "Distributed Systems",
  "System Design",
  "PyTorch",
  "TensorFlow",
  "LangChain",
  "RAG",
  "LLM",
  "Machine Learning",
  "Deep Learning",
  "NLP",
  "Scikit-Learn",
  "Playwright",
  "Jest",
  "Vitest",
  "OAuth",
  "JWT",
  "RBAC",
  "Git",
];

type SectionKey =
  | "header"
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "publications"
  | "awards"
  | "certifications"
  | "projects";

function detectSectionHeader(line: string): SectionKey | null {
  const clean = line
    .trim()
    .replace(/[:\-_=*#]+/g, " ")
    .trim()
    .toLowerCase();
  if (!clean || clean.length > 42) return null;

  if (/^(summary|profile|about|objective|executive summary)$/.test(clean)) {
    return "summary";
  }
  if (
    /^(skills|technical skills|core competencies|technologies|tech stack|competencies)$/.test(
      clean
    )
  ) {
    return "skills";
  }
  if (
    /^(experience|work experience|employment|professional experience|career history|work history)$/.test(
      clean
    )
  ) {
    return "experience";
  }
  if (/^(education|academic background|academics|qualifications)$/.test(clean)) {
    return "education";
  }
  if (/^(publications|papers|research|articles)$/.test(clean)) {
    return "publications";
  }
  if (/^(awards|honors|achievements|honors & awards|awards & honors)$/.test(clean)) {
    return "awards";
  }
  if (
    /^(certifications|licenses|licenses & certifications|certificates)$/.test(
      clean
    )
  ) {
    return "certifications";
  }
  if (/^(projects|key projects|selected projects)$/.test(clean)) {
    return "projects";
  }
  return null;
}

function splitSections(rawText: string): Record<SectionKey, string[]> {
  const sections: Record<SectionKey, string[]> = {
    header: [],
    summary: [],
    skills: [],
    experience: [],
    education: [],
    publications: [],
    awards: [],
    certifications: [],
    projects: [],
  };

  let current: SectionKey = "header";
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const detected = detectSectionHeader(line);
    if (detected) {
      current = detected;
      continue;
    }

    sections[current].push(line);
  }

  return sections;
}

function makeId(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}`;
}

function extractLinks(text: string): {
  github: string;
  linkedin: string;
  website: string;
} {
  const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s,;)]+/i);
  const linkedinMatch = text.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/[^\s,;)]+/i
  );
  const allUrls = text.match(/https?:\/\/[^\s,;)]+/gi) || [];

  const website =
    allUrls.find(
      (u) =>
        !/github\.com/i.test(u) &&
        !/linkedin\.com/i.test(u)
    ) || "";

  return {
    github: githubMatch ? githubMatch[0] : "",
    linkedin: linkedinMatch ? linkedinMatch[0] : "",
    website,
  };
}

function extractPhone(text: string): string {
  const match = text.match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/
  );
  return match ? match[0].trim() : "";
}

function extractLocation(headerLines: string[]): string {
  for (const line of headerLines.slice(0, 6)) {
    const locMatch = line.match(
      /\b([A-Z][a-zA-Z\s]{2,20},\s*(?:[A-Z]{2}|India|USA|UK|Canada|Germany|Singapore|Remote))\b/
    );
    if (locMatch) return locMatch[1].trim();
  }
  return "";
}

function extractName(headerLines: string[]): string | undefined {
  for (const line of headerLines.slice(0, 3)) {
    if (
      line.includes("@") ||
      /https?:\/\//i.test(line) ||
      /\d{3}[\s.-]\d{3}/.test(line)
    ) {
      continue;
    }
    const clean = line.replace(/[|•]/g, " ").trim();
    const words = clean.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z.\-\s]+$/.test(clean)) {
      return clean;
    }
  }
  return undefined;
}

function extractSkills(
  skillLines: string[],
  fullText: string,
  headline: string
): SkillItem[] {
  const found = new Map<string, SkillItem>();
  const lowerFull = fullText.toLowerCase();

  // 1. Parse explicit skill lines separated by commas, pipes, bullets, or colons
  for (const line of skillLines) {
    const cleaned = line.replace(/^[-•*]\s*/, "");
    const withoutLabel = cleaned.includes(":")
      ? cleaned.split(":").slice(1).join(":")
      : cleaned;
    const tokens = withoutLabel
      .split(/[,|•;/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 36);

    for (const token of tokens) {
      const key = token.toLowerCase();
      if (!found.has(key)) {
        found.set(key, {
          id: makeId("sk", found.size),
          name: token,
          level: found.size < 5 ? "Core" : "Intermediate",
        });
      }
    }
  }

  // 2. Scan full text against known engineering taxonomy
  for (const skillName of KNOWN_SKILLS) {
    const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?=$|[^a-z0-9+#.])`, "i");
    if (regex.test(lowerFull) && !found.has(skillName.toLowerCase())) {
      const isInHeadline = headline.toLowerCase().includes(skillName.toLowerCase());
      found.set(skillName.toLowerCase(), {
        id: makeId("sk", found.size),
        name: skillName,
        level: isInHeadline || found.size < 4 ? "Core" : "Intermediate",
      });
    }
  }

  return Array.from(found.values()).slice(0, 24);
}

function extractExperience(expLines: string[]): ExperienceItem[] {
  if (expLines.length === 0) return [];
  const items: ExperienceItem[] = [];
  let current: ExperienceItem | null = null;
  const bullets: string[] = [];

  const flush = () => {
    if (current) {
      current.summary = bullets.join(" ").trim();
      items.push(current);
      bullets.length = 0;
    }
  };

  const periodRegex =
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*(?:19|20)\d{2}\s*[-–—to]+\s*(?:Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*(?:19|20)\d{2}))/i;

  for (const line of expLines) {
    const isBullet = /^[-•*]/.test(line);
    const periodMatch = line.match(periodRegex);

    if (!isBullet && (periodMatch || line.includes(" at ") || line.includes(" | ") || line.includes(" — ") || line.includes(" - "))) {
      const period = periodMatch ? periodMatch[1].trim() : "";
      const stripped = line.replace(periodRegex, "").replace(/[|()]+$/g, "").trim();

      // Heuristic: if line looks like a role/company header
      if (stripped.length >= 4 && stripped.length <= 100) {
        flush();
        let role = stripped;
        let organization = "";

        if (/\s+at\s+/i.test(stripped)) {
          const parts = stripped.split(/\s+at\s+/i);
          role = parts[0].trim();
          organization = parts.slice(1).join(" at ").replace(/[|,-]+$/, "").trim();
        } else if (stripped.includes("|")) {
          const parts = stripped.split("|").map((p) => p.trim()).filter(Boolean);
          role = parts[0] || stripped;
          organization = parts[1] || "";
        } else if (/\s+[-–—]\s+/.test(stripped)) {
          const parts = stripped.split(/\s+[-–—]\s+/);
          role = parts[0].trim();
          organization = parts[1]?.trim() || "";
        }

        current = {
          id: makeId("exp", items.length),
          role: role || "Software Engineer",
          organization: organization || "Organization",
          period: period || "Recent",
          summary: "",
        };
        continue;
      }
    }

    const cleanedBullet = line.replace(/^[-•*]\s*/, "").trim();
    if (current) {
      bullets.push(cleanedBullet);
    } else if (cleanedBullet.length > 10) {
      current = {
        id: makeId("exp", items.length),
        role: cleanedBullet.slice(0, 60),
        organization: "Organization",
        period: "Recent",
        summary: "",
      };
    }
  }

  flush();
  return items.slice(0, 8);
}

function extractEducation(eduLines: string[]): EducationItem[] {
  const items: EducationItem[] = [];
  for (const raw of eduLines) {
    const line = raw.replace(/^[-•*]\s*/, "").trim();
    if (line.length < 4) continue;

    const yearMatch = line.match(/\b((?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?)\b/);
    const gradeMatch = line.match(/\b(?:GPA|CGPA)[:\s]*([0-9.]+(?:\/[0-9.]+)?)\b/i);
    const cleaned = line
      .replace(/\b((?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?)\b/, "")
      .replace(/\b(?:GPA|CGPA)[:\s]*[0-9.]+(?:\/[0-9.]+)?\b/i, "")
      .replace(/[()|]+$/g, "")
      .trim();

    let degree = cleaned;
    let institution = "";
    if (cleaned.includes(",")) {
      const parts = cleaned.split(",").map((p) => p.trim());
      degree = parts[0] || cleaned;
      institution = parts.slice(1).join(", ");
    } else if (/\s+[-–|]\s+/.test(cleaned)) {
      const parts = cleaned.split(/\s+[-–|]\s+/);
      degree = parts[0].trim();
      institution = parts[1]?.trim() || "";
    }

    items.push({
      id: makeId("edu", items.length),
      degree: degree || "Degree",
      institution: institution || "University / Institute",
      year: yearMatch ? yearMatch[1] : "",
      grade: gradeMatch ? gradeMatch[1] : undefined,
    });
  }
  return items.slice(0, 5);
}

function extractPublications(pubLines: string[]): PublicationItem[] {
  const items: PublicationItem[] = [];
  for (const raw of pubLines) {
    const line = raw.replace(/^[-•*]\s*/, "").trim();
    if (line.length < 6) continue;
    const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
    const urlMatch = line.match(/https?:\/\/[^\s,;)]+/i);
    const cleaned = line
      .replace(/https?:\/\/[^\s,;)]+/i, "")
      .replace(/\b(?:19|20)\d{2}\b/, "")
      .trim();
    const parts = cleaned.split(/\s+[-–|]\s+|\.\s+/);
    items.push({
      id: makeId("pub", items.length),
      title: parts[0]?.replace(/[",]+$/g, "").trim() || cleaned,
      venue: parts[1]?.trim() || "Published Work",
      year: yearMatch ? yearMatch[1] : "",
      url: urlMatch ? urlMatch[0] : undefined,
    });
  }
  return items.slice(0, 6);
}

function extractAwards(awardLines: string[]): AwardItem[] {
  const items: AwardItem[] = [];
  for (const raw of awardLines) {
    const line = raw.replace(/^[-•*]\s*/, "").trim();
    if (line.length < 4) continue;
    const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
    const cleaned = line.replace(/\b(?:19|20)\d{2}\b/, "").trim();
    const parts = cleaned.split(/\s+[-–|,]\s+/);
    items.push({
      id: makeId("awd", items.length),
      title: parts[0]?.trim() || cleaned,
      issuer: parts[1]?.trim() || "Recognition",
      year: yearMatch ? yearMatch[1] : "",
      description: parts.slice(2).join(" — ") || undefined,
    });
  }
  return items.slice(0, 6);
}

function extractCertifications(certLines: string[]): CertificationItem[] {
  const items: CertificationItem[] = [];
  for (const raw of certLines) {
    const line = raw.replace(/^[-•*]\s*/, "").trim();
    if (line.length < 4) continue;
    const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
    const cleaned = line.replace(/\b(?:19|20)\d{2}\b/, "").trim();
    const parts = cleaned.split(/\s+[-–|,]\s+/);
    items.push({
      id: makeId("cert", items.length),
      name: parts[0]?.trim() || cleaned,
      issuer: parts[1]?.trim() || "Certified",
      year: yearMatch ? yearMatch[1] : "",
    });
  }
  return items.slice(0, 6);
}

export function parseResumeText(
  rawText: string,
  fallbackRole: string = "candidate"
): ParsedResumeResult {
  const sections = splitSections(rawText);
  const name = extractName(sections.header);
  const links = extractLinks(rawText);
  const phone = extractPhone(rawText);
  const location = extractLocation(sections.header);

  const experience = extractExperience(sections.experience);
  const education = extractEducation(sections.education);
  const publications = extractPublications(sections.publications);
  const awards = extractAwards(sections.awards);
  const certifications = extractCertifications(sections.certifications);

  const headerTitleCandidate = sections.header.find(
    (l) =>
      l !== name &&
      !l.includes("@") &&
      !/https?:\/\//i.test(l) &&
      !/\d{3}[\s.-]\d{3}/.test(l) &&
      l.length >= 4 &&
      l.length <= 72
  );

  const headline =
    headerTitleCandidate ||
    experience[0]?.role ||
    (fallbackRole === "expert"
      ? "Industry Panel Interviewer"
      : "Software Engineer");

  const skills = extractSkills(sections.skills, rawText, headline);

  const summaryText = sections.summary.join(" ").trim();
  const bio =
    summaryText ||
    (experience[0]
      ? `${headline} with experience at ${experience[0].organization} focused on ${skills
          .slice(0, 4)
          .map((s) => s.name)
          .join(", ")}.`
      : "");

  const interviewConfig = computeInterviewConfig({
    skills,
    experience,
    headline,
    rawText,
  });

  return {
    name,
    headline,
    location,
    phone,
    bio,
    links,
    skills,
    experience,
    education,
    publications,
    awards,
    certifications,
    interviewConfig,
  };
}
