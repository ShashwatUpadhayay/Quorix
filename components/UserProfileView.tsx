"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  MapPin,
  Mail,
  Phone,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Calendar,
  Award,
  BookOpen,
  Briefcase,
  GraduationCap,
  Code2,
  Activity,
  FileText,
} from "lucide-react";
import ResumeParserPanel from "@/components/ResumeParserPanel";
import type {
  ProfileDoc,
  ActivityLogDoc,
  SkillItem,
  ExperienceItem,
  EducationItem,
  PublicationItem,
  AwardItem,
  CertificationItem,
} from "@/lib/mongodb";

interface SafeUser {
  _id?: string;
  name: string;
  email: string;
  role: "candidate" | "expert" | "admin";
  status: string;
  createdAt?: string | Date;
}

interface UserProfileViewProps {
  onNameUpdated?: (newName: string) => void;
}

type DossierTab =
  | "skills"
  | "experience"
  | "education"
  | "publications"
  | "awards";

type ActivityFilter = "all" | "interview" | "board" | "profile" | "auth";

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(isoOrDate: string | Date): string {
  const date = new Date(isoOrDate);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getHeatmapColor(count: number): string {
  if (count <= 0) return "#EFECE4";
  if (count === 1) return "#CBE4D6";
  if (count === 2) return "#7CC09D";
  if (count <= 4) return "#349266";
  return "#1F7A55";
}

export default function UserProfileView({ onNameUpdated }: UserProfileViewProps) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [profile, setProfile] = useState<ProfileDoc | null>(null);
  const [activities, setActivities] = useState<ActivityLogDoc[]>([]);
  const [dailyCounts, setDailyCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Basic Info Editing State
  const [isEditingBasic, setIsEditingBasic] = useState(false);
  const [showResumeImport, setShowResumeImport] = useState(false);
  const [basicForm, setBasicForm] = useState({
    name: "",
    headline: "",
    location: "",
    phone: "",
    bio: "",
    github: "",
    linkedin: "",
    website: "",
  });

  // Heatmap Interactive State
  const [heatmapWeeks, setHeatmapWeeks] = useState<26 | 52>(26);
  const [hoveredDay, setHoveredDay] = useState<{
    dateKey: string;
    count: number;
  } | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(
    null
  );

  // Application Dossier Tab State
  const [dossierTab, setDossierTab] = useState<DossierTab>("skills");
  const [showAddForm, setShowAddForm] = useState(false);

  // Inline Add Forms State
  const [skillForm, setSkillForm] = useState<{
    name: string;
    level: SkillItem["level"];
  }>({ name: "", level: "Core" });

  const [expForm, setExpForm] = useState({
    role: "",
    organization: "",
    period: "",
    summary: "",
  });

  const [eduForm, setEduForm] = useState({
    degree: "",
    institution: "",
    year: "",
    grade: "",
  });

  const [pubForm, setPubForm] = useState({
    title: "",
    venue: "",
    year: "",
    url: "",
  });

  const [awardForm, setAwardForm] = useState({
    title: "",
    issuer: "",
    year: "",
    description: "",
  });

  const [certForm, setCertForm] = useState({
    name: "",
    issuer: "",
    year: "",
  });

  // Activity Filter State
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  const loadProfileData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Could not load profile from database.");
      }
      const data = await res.json();
      setUser(data.user);
      setProfile(data.profile);
      setActivities(data.activities || []);
      setDailyCounts(data.dailyCounts || {});
      setBasicForm({
        name: data.user?.name || "",
        headline: data.profile?.headline || "",
        location: data.profile?.location || "",
        phone: data.profile?.phone || "",
        bio: data.profile?.bio || "",
        github: data.profile?.links?.github || "",
        linkedin: data.profile?.links?.linkedin || "",
        website: data.profile?.links?.website || "",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfileData();
  }, [loadProfileData]);
  const persistProfile = async (
    patch: Record<string, unknown>,
    activityLabel: string,
    activityDetail: string
  ) => {
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...patch,
          activityLabel,
          activityDetail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }
      await loadProfileData();
      setSaveNotice(activityLabel);
      setTimeout(() => setSaveNotice(null), 2500);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBasic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!basicForm.name.trim() || basicForm.name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    const ok = await persistProfile(
      {
        name: basicForm.name.trim(),
        headline: basicForm.headline,
        location: basicForm.location,
        phone: basicForm.phone,
        bio: basicForm.bio,
        links: {
          github: basicForm.github,
          linkedin: basicForm.linkedin,
          website: basicForm.website,
        },
      },
      "Updated Basic Profile",
      "Edited personal details, bio, and external links"
    );
    if (ok) {
      setIsEditingBasic(false);
      if (onNameUpdated) onNameUpdated(basicForm.name.trim());
    }
  };

  // Dossier Add / Remove Handlers
  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillForm.name.trim() || !profile) return;
    const newSkill: SkillItem = {
      id: `sk_${Date.now()}`,
      name: skillForm.name.trim(),
      level: skillForm.level,
    };
    const nextSkills = [...(profile.skills || []), newSkill];
    const ok = await persistProfile(
      { skills: nextSkills },
      "Added Skill",
      `Added ${newSkill.name} (${newSkill.level})`
    );
    if (ok) {
      setSkillForm({ name: "", level: "Core" });
      setShowAddForm(false);
    }
  };

  const handleRemoveSkill = async (id: string, name: string) => {
    if (!profile) return;
    const nextSkills = (profile.skills || []).filter((s) => s.id !== id);
    await persistProfile(
      { skills: nextSkills },
      "Removed Skill",
      `Removed ${name} from profile skills`
    );
  };

  const handleAddExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expForm.role.trim() || !expForm.organization.trim() || !profile) return;
    const item: ExperienceItem = {
      id: `exp_${Date.now()}`,
      role: expForm.role.trim(),
      organization: expForm.organization.trim(),
      period: expForm.period.trim() || "Present",
      summary: expForm.summary.trim(),
    };
    const next = [item, ...(profile.experience || [])];
    const ok = await persistProfile(
      { experience: next },
      "Added Experience",
      `${item.role} at ${item.organization}`
    );
    if (ok) {
      setExpForm({ role: "", organization: "", period: "", summary: "" });
      setShowAddForm(false);
    }
  };

  const handleRemoveExperience = async (id: string, label: string) => {
    if (!profile) return;
    const next = (profile.experience || []).filter((i) => i.id !== id);
    await persistProfile(
      { experience: next },
      "Removed Experience",
      `Removed ${label}`
    );
  };

  const handleAddEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eduForm.degree.trim() || !eduForm.institution.trim() || !profile) return;
    const item: EducationItem = {
      id: `edu_${Date.now()}`,
      degree: eduForm.degree.trim(),
      institution: eduForm.institution.trim(),
      year: eduForm.year.trim() || "2026",
      grade: eduForm.grade.trim(),
    };
    const next = [item, ...(profile.education || [])];
    const ok = await persistProfile(
      { education: next },
      "Added Education",
      `${item.degree} — ${item.institution}`
    );
    if (ok) {
      setEduForm({ degree: "", institution: "", year: "", grade: "" });
      setShowAddForm(false);
    }
  };

  const handleRemoveEducation = async (id: string, label: string) => {
    if (!profile) return;
    const next = (profile.education || []).filter((i) => i.id !== id);
    await persistProfile(
      { education: next },
      "Removed Education",
      `Removed ${label}`
    );
  };

  const handleAddPublication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubForm.title.trim() || !pubForm.venue.trim() || !profile) return;
    const item: PublicationItem = {
      id: `pub_${Date.now()}`,
      title: pubForm.title.trim(),
      venue: pubForm.venue.trim(),
      year: pubForm.year.trim() || "2026",
      url: pubForm.url.trim(),
    };
    const next = [item, ...(profile.publications || [])];
    const ok = await persistProfile(
      { publications: next },
      "Added Publication",
      `Published "${item.title}" (${item.venue})`
    );
    if (ok) {
      setPubForm({ title: "", venue: "", year: "", url: "" });
      setShowAddForm(false);
    }
  };

  const handleRemovePublication = async (id: string, title: string) => {
    if (!profile) return;
    const next = (profile.publications || []).filter((i) => i.id !== id);
    await persistProfile(
      { publications: next },
      "Removed Publication",
      `Removed publication "${title}"`
    );
  };

  const handleAddAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!awardForm.title.trim() || !awardForm.issuer.trim() || !profile) return;
    const item: AwardItem = {
      id: `awd_${Date.now()}`,
      title: awardForm.title.trim(),
      issuer: awardForm.issuer.trim(),
      year: awardForm.year.trim() || "2026",
      description: awardForm.description.trim(),
    };
    const next = [item, ...(profile.awards || [])];
    const ok = await persistProfile(
      { awards: next },
      "Added Award",
      `${item.title} (${item.issuer})`
    );
    if (ok) {
      setAwardForm({ title: "", issuer: "", year: "", description: "" });
      setShowAddForm(false);
    }
  };

  const handleRemoveAward = async (id: string, title: string) => {
    if (!profile) return;
    const next = (profile.awards || []).filter((i) => i.id !== id);
    await persistProfile(
      { awards: next },
      "Removed Award",
      `Removed award "${title}"`
    );
  };

  const handleAddCertification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certForm.name.trim() || !certForm.issuer.trim() || !profile) return;
    const item: CertificationItem = {
      id: `cert_${Date.now()}`,
      name: certForm.name.trim(),
      issuer: certForm.issuer.trim(),
      year: certForm.year.trim() || "2026",
    };
    const next = [item, ...(profile.certifications || [])];
    const ok = await persistProfile(
      { certifications: next },
      "Added Certification",
      `${item.name} (${item.issuer})`
    );
    if (ok) {
      setCertForm({ name: "", issuer: "", year: "" });
      setShowAddForm(false);
    }
  };

  const handleRemoveCertification = async (id: string, name: string) => {
    if (!profile) return;
    const next = (profile.certifications || []).filter((i) => i.id !== id);
    await persistProfile(
      { certifications: next },
      "Removed Certification",
      `Removed certification "${name}"`
    );
  };

  // Build GitHub-style calendar weeks (columns of 7 days, Sun -> Sat)
  const heatmapGrid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // End at Saturday of the current week so columns stay aligned
    const endDayOfWeek = today.getDay(); // 0=Sun..6=Sat
    const totalDays = heatmapWeeks * 7 - (6 - endDayOfWeek);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (totalDays - 1));

    const weeks: Array<{
      monthLabel?: string;
      days: Array<{ dateKey: string; count: number; isFuture: boolean }>;
    }> = [];

    let currentWeek: Array<{
      dateKey: string;
      count: number;
      isFuture: boolean;
    }> = [];
    let lastLabeledMonth = -1;

    const totalCells = heatmapWeeks * 7;
    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + i);
      const key = toDateKey(cellDate);
      const isFuture = cellDate > today;
      const count = isFuture ? 0 : dailyCounts[key] || 0;

      currentWeek.push({ dateKey: key, count, isFuture });

      if (currentWeek.length === 7) {
        // Determine if this week starts a new month (check Sunday or first non-future day)
        const firstDayMonth = cellDate.getMonth();
        const sundayDate = new Date(cellDate);
        sundayDate.setDate(cellDate.getDate() - 6);
        const weekMonth = sundayDate.getMonth();
        let monthLabel: string | undefined;

        if (weekMonth !== lastLabeledMonth) {
          monthLabel = sundayDate.toLocaleDateString("en-US", {
            month: "short",
          });
          lastLabeledMonth = weekMonth;
        } else if (firstDayMonth !== lastLabeledMonth && i < 14) {
          lastLabeledMonth = weekMonth;
        }

        weeks.push({ monthLabel, days: currentWeek });
        currentWeek = [];
      }
    }

    return weeks;
  }, [heatmapWeeks, dailyCounts]);

  // Activity stats in tabular numbers
  const activityStats = useMemo(() => {
    const keys = Object.keys(dailyCounts).filter((k) => dailyCounts[k] > 0);
    const totalActions = Object.values(dailyCounts).reduce((a, b) => a + b, 0);
    const activeDays = keys.length;

    // Calculate current streak ending today or yesterday
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let currentStreak = 0;
    const cursor = new Date(today);

    if (!dailyCounts[toDateKey(cursor)]) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dailyCounts[toDateKey(cursor)] > 0) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { totalActions, activeDays, currentStreak };
  }, [dailyCounts]);

  // Filtered activity timeline
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (selectedDateFilter && act.dateKey !== selectedDateFilter) {
        return false;
      }
      if (activityFilter !== "all" && act.category !== activityFilter) {
        return false;
      }
      return true;
    });
  }, [activities, selectedDateFilter, activityFilter]);

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center text-xs font-mono text-[#6E6B65]">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        <span>Loading profile &amp; activity history...</span>
      </div>
    );
  }

  const initials = (user?.name || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const dossierTabs: Array<{
    id: DossierTab;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: "skills",
      label: "Skills",
      count: profile?.skills?.length || 0,
      icon: Code2,
    },
    {
      id: "experience",
      label: "Experience",
      count: profile?.experience?.length || 0,
      icon: Briefcase,
    },
    {
      id: "education",
      label: "Education",
      count: profile?.education?.length || 0,
      icon: GraduationCap,
    },
    {
      id: "publications",
      label: "Publications",
      count: profile?.publications?.length || 0,
      icon: BookOpen,
    },
    {
      id: "awards",
      label: "Awards & Certs",
      count:
        (profile?.awards?.length || 0) + (profile?.certifications?.length || 0),
      icon: Award,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-[#E5E2DA] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-mono text-[#6E6B65] uppercase">
            {user?.role === "expert"
              ? "Expert Dossier & Activity"
              : "Candidate Dossier & Activity"}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1918]">
            Profile &amp; Activity Record
          </h1>
          <p className="text-sm text-[#55524C] leading-relaxed max-w-2xl">
            Manage your personal details, application credentials, and review your daily platform activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saveNotice && (
            <div className="inline-flex items-center space-x-1.5 border border-[#CBE4D6] bg-[#F2F8F5] px-3 py-1.5 text-xs font-mono text-[#1F7A55]">
              <Check className="w-3.5 h-3.5" />
              <span>Saved: {saveNotice}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowResumeImport((prev) => !prev)}
            className="inline-flex items-center space-x-1.5 border border-[#D5D1C7] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#1A1918] hover:bg-[#EAE6DD] transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{showResumeImport ? "Hide Resume Parser" : "Auto-Fill From Resume"}</span>
          </button>
        </div>
      </div>

      {showResumeImport && (
        <ResumeParserPanel
          onProfileSynced={async ({ updatedName }) => {
            await loadProfileData();
            if (updatedName) onNameUpdated?.(updatedName);
            setSaveNotice("Resume parsed");
          }}
        />
      )}

      {error && (
        <div className="border border-[#E5C9C0] bg-[#FAF3F0] p-3.5 text-xs text-[#B45332] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-[#B45332] hover:text-[#1A1918]"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. BASIC DETAILS CARD */}
      {/* ================================================================= */}
      <section className="border border-[#E5E2DA] bg-[#FAF8F5] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start space-x-4">
            {/* Clean SVG/CSS Monogram Avatar */}
            <div className="w-14 h-14 border border-[#D5D1C7] bg-[#FFFFFF] flex items-center justify-center font-mono text-base font-bold text-[#1A1918] shrink-0">
              {initials}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[#1A1918]">
                  {user?.name}
                </h2>
                <span className="border border-[#D5D1C7] bg-[#FFFFFF] px-2 py-0.5 text-[10px] font-mono uppercase text-[#423F3A]">
                  {user?.role}
                </span>
              </div>
              <p className="text-sm text-[#423F3A]">
                {profile?.headline || "Add a headline describing your engineering focus"}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-[#6E6B65]">
                <span className="inline-flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{user?.email}</span>
                </span>
                {profile?.location && (
                  <span className="inline-flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{profile.location}</span>
                  </span>
                )}
                {profile?.phone && (
                  <span className="inline-flex items-center space-x-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{profile.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsEditingBasic(!isEditingBasic)}
            className="inline-flex items-center space-x-1.5 text-xs font-medium border border-[#D5D1C7] bg-[#FFFFFF] text-[#1A1918] px-3.5 py-2 hover:bg-[#F2EFE9] active:scale-[0.98] transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-[#1A1918]"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>{isEditingBasic ? "Cancel Edit" : "Edit Basic Info"}</span>
          </button>
        </div>

        {/* Bio & Links Display */}
        {!isEditingBasic && (
          <div className="space-y-3 pt-2 border-t border-[#E5E2DA]">
            <p className="text-sm text-[#55524C] leading-relaxed max-w-prose">
              {profile?.bio ||
                "No summary added yet. Click Edit Basic Info to add your background, engineering interests, and links."}
            </p>

            {(profile?.links?.github ||
              profile?.links?.linkedin ||
              profile?.links?.website) && (
              <div className="flex flex-wrap gap-3 pt-1 text-xs font-mono">
                {profile.links.github && (
                  <a
                    href={profile.links.github}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 border border-[#E5E2DA] bg-[#FFFFFF] px-2.5 py-1 text-[#1A1918] hover:border-[#1A1918] transition-colors"
                  >
                    <Link2 className="w-3 h-3 text-[#6E6B65]" />
                    <span>GitHub</span>
                  </a>
                )}
                {profile.links.linkedin && (
                  <a
                    href={profile.links.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 border border-[#E5E2DA] bg-[#FFFFFF] px-2.5 py-1 text-[#1A1918] hover:border-[#1A1918] transition-colors"
                  >
                    <Link2 className="w-3 h-3 text-[#6E6B65]" />
                    <span>LinkedIn</span>
                  </a>
                )}
                {profile.links.website && (
                  <a
                    href={profile.links.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 border border-[#E5E2DA] bg-[#FFFFFF] px-2.5 py-1 text-[#1A1918] hover:border-[#1A1918] transition-colors"
                  >
                    <Link2 className="w-3 h-3 text-[#6E6B65]" />
                    <span>Portfolio</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Inline Edit Form for Basic Info */}
        {isEditingBasic && (
          <form
            onSubmit={handleSaveBasic}
            className="border-t border-[#E5E2DA] pt-5 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="prof-name"
                  className="block text-xs font-medium text-[#1A1918]"
                >
                  Full Name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  required
                  value={basicForm.name}
                  onChange={(e) =>
                    setBasicForm({ ...basicForm, name: e.target.value })
                  }
                  className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="prof-headline"
                  className="block text-xs font-medium text-[#1A1918]"
                >
                  Headline / Role
                </label>
                <input
                  id="prof-headline"
                  type="text"
                  value={basicForm.headline}
                  onChange={(e) =>
                    setBasicForm({ ...basicForm, headline: e.target.value })
                  }
                  placeholder="e.g. Backend Systems Engineer • Distributed Storage"
                  className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="prof-location"
                  className="block text-xs font-medium text-[#1A1918]"
                >
                  Location
                </label>
                <input
                  id="prof-location"
                  type="text"
                  value={basicForm.location}
                  onChange={(e) =>
                    setBasicForm({ ...basicForm, location: e.target.value })
                  }
                  placeholder="e.g. Bengaluru, India"
                  className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="prof-phone"
                  className="block text-xs font-medium text-[#1A1918]"
                >
                  Phone (Optional)
                </label>
                <input
                  id="prof-phone"
                  type="text"
                  value={basicForm.phone}
                  onChange={(e) =>
                    setBasicForm({ ...basicForm, phone: e.target.value })
                  }
                  placeholder="+91 98765 43210"
                  className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="prof-bio"
                className="block text-xs font-medium text-[#1A1918]"
              >
                Summary / Bio
              </label>
              <textarea
                id="prof-bio"
                rows={3}
                value={basicForm.bio}
                onChange={(e) =>
                  setBasicForm({ ...basicForm, bio: e.target.value })
                }
                placeholder="Concise engineering summary, domains of expertise, or interviewing focus..."
                className="w-full border border-[#D5D1C7] bg-[#FFFFFF] p-3 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="prof-github"
                  className="block text-xs font-medium text-[#1A1918]"
                >
                  GitHub URL
                </label>
                <input
                  id="prof-github"
                  type="url"
                  value={basicForm.github}
                  onChange={(e) =>
                    setBasicForm({ ...basicForm, github: e.target.value })
                  }
                  placeholder="https://github.com/username"
                  className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="prof-linkedin"
                  className="block text-xs font-medium text-[#1A1918]"
                >
                  LinkedIn URL
                </label>
                <input
                  id="prof-linkedin"
                  type="url"
                  value={basicForm.linkedin}
                  onChange={(e) =>
                    setBasicForm({ ...basicForm, linkedin: e.target.value })
                  }
                  placeholder="https://linkedin.com/in/username"
                  className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="prof-website"
                  className="block text-xs font-medium text-[#1A1918]"
                >
                  Portfolio / Website
                </label>
                <input
                  id="prof-website"
                  type="url"
                  value={basicForm.website}
                  onChange={(e) =>
                    setBasicForm({ ...basicForm, website: e.target.value })
                  }
                  placeholder="https://yoursite.dev"
                  className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingBasic(false)}
                className="text-xs font-medium text-[#6E6B65] hover:text-[#1A1918] px-3 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-4 py-2 hover:bg-[#2C2A28] disabled:opacity-50 transition-all focus-visible:outline-2 focus-visible:outline-[#1A1918]"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                <span>Save Basic Details</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ================================================================= */}
      {/* PROFILE-DERIVED INTERVIEW CALIBRATION */}
      {/* ================================================================= */}
      {profile?.interviewConfig && (
        <section className="border border-[#E5E2DA] bg-[#FFFFFF] p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-mono uppercase text-[#6E6B65]">
              Active Interview Calibration (Driven By Your Profile)
            </div>
            <div className="text-xs font-mono text-[#1F7A55] font-semibold">
              {profile.interviewConfig.recommendedTrack}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-3">
              <div className="text-[10px] font-mono text-[#6E6B65]">
                DIFFICULTY TIER
              </div>
              <div className="text-sm font-bold text-[#1A1918] mt-0.5 tabular-nums">
                {profile.interviewConfig.difficultyTier} (Tier{" "}
                {profile.interviewConfig.difficultyNumeric}/4)
              </div>
            </div>

            <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-3">
              <div className="text-[10px] font-mono text-[#6E6B65]">
                EXPERIENCE SIGNAL
              </div>
              <div className="text-sm font-bold text-[#1A1918] mt-0.5 tabular-nums">
                {profile.interviewConfig.experienceYears} yrs estimated
              </div>
            </div>

            <div className="border border-[#E5E2DA] bg-[#FAF8F5] p-3">
              <div className="text-[10px] font-mono text-[#6E6B65]">
                PRIMARY TOPICS
              </div>
              <div className="text-xs font-medium text-[#1A1918] mt-1 truncate">
                {profile.interviewConfig.primaryTopics.join(" • ")}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* 2. GITHUB-STYLE DAILY ACTIVITY HEATMAP */}
      {/* ================================================================= */}
      <section className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-[#1A1918]" />
              <h2 className="text-base font-bold text-[#1A1918]">
                Daily Platform Activity
              </h2>
            </div>
            <p className="text-xs text-[#6E6B65]">
              Click any day cell to filter your activity log below.
            </p>
          </div>

          {/* Range Switcher & Tabular Telemetry */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center space-x-4 font-mono tabular-nums text-[#423F3A]">
              <div>
                <span className="font-bold text-[#1A1918]">
                  {activityStats.totalActions}
                </span>{" "}
                <span className="text-[#6E6B65]">actions</span>
              </div>
              <div>
                <span className="font-bold text-[#1A1918]">
                  {activityStats.activeDays}
                </span>{" "}
                <span className="text-[#6E6B65]">active days</span>
              </div>
              <div>
                <span className="font-bold text-[#1F7A55]">
                  {activityStats.currentStreak}d
                </span>{" "}
                <span className="text-[#6E6B65]">streak</span>
              </div>
            </div>

            <div className="inline-flex border border-[#E5E2DA] bg-[#FAF8F5] text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setHeatmapWeeks(26)}
                className={`px-2.5 py-1 transition-colors ${
                  heatmapWeeks === 26
                    ? "bg-[#FFFFFF] text-[#1A1918] font-semibold border-r border-[#E5E2DA]"
                    : "text-[#6E6B65] hover:text-[#1A1918] border-r border-[#E5E2DA]"
                }`}
              >
                6M
              </button>
              <button
                type="button"
                onClick={() => setHeatmapWeeks(52)}
                className={`px-2.5 py-1 transition-colors ${
                  heatmapWeeks === 52
                    ? "bg-[#FFFFFF] text-[#1A1918] font-semibold"
                    : "text-[#6E6B65] hover:text-[#1A1918]"
                }`}
              >
                1Y
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Heatmap Grid */}
        <div className="overflow-x-auto pb-1">
          <div className="inline-block min-w-full">
            {/* Month Labels */}
            <div className="flex items-center pl-8 mb-1.5 text-[10px] font-mono text-[#8E8B84]">
              {heatmapGrid.map((week, wIdx) => (
                <div
                  key={wIdx}
                  className="w-[15px] shrink-0 overflow-visible whitespace-nowrap"
                >
                  {week.monthLabel || ""}
                </div>
              ))}
            </div>

            <div className="flex items-start">
              {/* Day of Week Labels */}
              <div className="w-8 shrink-0 flex flex-col justify-between h-[102px] pr-2 text-[10px] font-mono text-[#8E8B84] py-[13px]">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
              </div>

              {/* Grid Columns */}
              <div className="flex gap-[3px]">
                {heatmapGrid.map((week, wIdx) => (
                  <div key={wIdx} className="flex flex-col gap-[3px]">
                    {week.days.map((day) => {
                      const isSelected = selectedDateFilter === day.dateKey;
                      return (
                        <button
                          key={day.dateKey}
                          type="button"
                          disabled={day.isFuture}
                          onMouseEnter={() =>
                            !day.isFuture &&
                            setHoveredDay({
                              dateKey: day.dateKey,
                              count: day.count,
                            })
                          }
                          onMouseLeave={() => setHoveredDay(null)}
                          onClick={() => {
                            if (day.isFuture) return;
                            setSelectedDateFilter(
                              isSelected ? null : day.dateKey
                            );
                          }}
                          style={{
                            backgroundColor: day.isFuture
                              ? "transparent"
                              : getHeatmapColor(day.count),
                          }}
                          className={`w-[12px] h-[12px] rounded-[2px] transition-transform focus-visible:outline-2 focus-visible:outline-[#1A1918] ${
                            day.isFuture
                              ? "cursor-default"
                              : "cursor-pointer hover:scale-110"
                          } ${
                            isSelected
                              ? "ring-2 ring-[#1A1918] ring-offset-1"
                              : day.isFuture
                                ? ""
                                : "border border-[#E5E2DA]/60"
                          }`}
                          aria-label={`${formatDisplayDate(day.dateKey)}: ${day.count} activities`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stable Inspection Footer & Legend */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#E5E2DA] text-[11px] font-mono text-[#6E6B65]">
          <div className="min-h-[18px]">
            {hoveredDay ? (
              <span>
                <strong className="text-[#1A1918]">
                  {formatDisplayDate(hoveredDay.dateKey)}
                </strong>{" "}
                — {hoveredDay.count}{" "}
                {hoveredDay.count === 1 ? "activity" : "activities"}
              </span>
            ) : selectedDateFilter ? (
              <span>
                Filtering feed by{" "}
                <strong className="text-[#1A1918]">
                  {formatDisplayDate(selectedDateFilter)}
                </strong>
              </span>
            ) : (
              <span>Hover a square for details or click to filter activity</span>
            )}
          </div>

          <div className="flex items-center space-x-1.5">
            <span>Less</span>
            {[0, 1, 2, 3, 5].map((lvl) => (
              <span
                key={lvl}
                style={{ backgroundColor: getHeatmapColor(lvl) }}
                className="w-[10px] h-[10px] rounded-[2px] border border-[#E5E2DA]/60 inline-block"
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 3. APPLICATION DOSSIER (Skills, Experience, Education, Pubs, Awards) */}
      {/* ================================================================= */}
      <section className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A1918]">
              Application Dossier
            </h2>
            <p className="text-xs text-[#6E6B65]">
              Structured background details used across candidate vetting and expert board matching.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center space-x-1.5 text-xs font-medium bg-[#1A1918] text-[#FAF8F5] px-3.5 py-2 hover:bg-[#2C2A28] active:scale-[0.98] transition-all w-fit focus-visible:outline-2 focus-visible:outline-[#1A1918]"
          >
            {showAddForm ? (
              <>
                <X className="w-3.5 h-3.5" />
                <span>Close Form</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>
                  Add{" "}
                  {dossierTab === "awards"
                    ? "Award / Cert"
                    : dossierTab.slice(0, -1)}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Clean Single-Row Tab Selector */}
        <div className="flex flex-wrap border-b border-[#E5E2DA] gap-1">
          {dossierTabs.map((tab) => {
            const Icon = tab.icon;
            const active = dossierTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDossierTab(tab.id);
                  setShowAddForm(false);
                }}
                className={`inline-flex items-center space-x-2 px-3.5 py-2.5 text-xs border-b-2 transition-colors ${
                  active
                    ? "border-[#1A1918] text-[#1A1918] font-semibold"
                    : "border-transparent text-[#6E6B65] hover:text-[#1A1918]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span className="font-mono text-[10px] text-[#8E8B84] tabular-nums">
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: SKILLS */}
        {dossierTab === "skills" && (
          <div className="space-y-4">
            {showAddForm && (
              <form
                onSubmit={handleAddSkill}
                className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 flex flex-col sm:flex-row gap-3 items-end"
              >
                <div className="flex-1 w-full space-y-1">
                  <label
                    htmlFor="sk-name"
                    className="block text-xs font-medium text-[#1A1918]"
                  >
                    Skill / Technology
                  </label>
                  <input
                    id="sk-name"
                    type="text"
                    required
                    value={skillForm.name}
                    onChange={(e) =>
                      setSkillForm({ ...skillForm, name: e.target.value })
                    }
                    placeholder="e.g. Distributed Consensus, PostgreSQL, Go"
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                  />
                </div>
                <div className="w-full sm:w-44 space-y-1">
                  <label
                    htmlFor="sk-level"
                    className="block text-xs font-medium text-[#1A1918]"
                  >
                    Proficiency
                  </label>
                  <select
                    id="sk-level"
                    value={skillForm.level}
                    onChange={(e) =>
                      setSkillForm({
                        ...skillForm,
                        level: e.target.value as SkillItem["level"],
                      })
                    }
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1A1918] focus-visible:outline-2 focus-visible:outline-[#1A1918]"
                  >
                    <option value="Core">Core</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Foundational">Foundational</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto bg-[#1A1918] text-[#FAF8F5] px-4 py-2 text-xs font-medium hover:bg-[#2C2A28] disabled:opacity-50"
                >
                  Save Skill
                </button>
              </form>
            )}

            {profile?.skills && profile.skills.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {profile.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="border border-[#E5E2DA] bg-[#FAF8F5] px-3.5 py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#1A1918]">
                        {skill.name}
                      </div>
                      <div className="text-[10px] font-mono text-[#6E6B65]">
                        {skill.level}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill.id, skill.name)}
                      className="text-[#8E8B84] hover:text-[#B45332] p-1"
                      aria-label={`Remove ${skill.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-[#D5D1C7] p-6 text-center text-xs text-[#6E6B65]">
                No skills added yet. Add your technical skills to calibrate interviews and board matching.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EXPERIENCE */}
        {dossierTab === "experience" && (
          <div className="space-y-4">
            {showAddForm && (
              <form
                onSubmit={handleAddExperience}
                className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Role / Title
                    </label>
                    <input
                      type="text"
                      required
                      value={expForm.role}
                      onChange={(e) =>
                        setExpForm({ ...expForm, role: e.target.value })
                      }
                      placeholder="Senior Backend Engineer"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Organization
                    </label>
                    <input
                      type="text"
                      required
                      value={expForm.organization}
                      onChange={(e) =>
                        setExpForm({
                          ...expForm,
                          organization: e.target.value,
                        })
                      }
                      placeholder="Acme Systems"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Period
                    </label>
                    <input
                      type="text"
                      value={expForm.period}
                      onChange={(e) =>
                        setExpForm({ ...expForm, period: e.target.value })
                      }
                      placeholder="2024 – Present"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#1A1918]">
                    Summary / Key Contributions
                  </label>
                  <textarea
                    rows={2}
                    value={expForm.summary}
                    onChange={(e) =>
                      setExpForm({ ...expForm, summary: e.target.value })
                    }
                    placeholder="Key systems owned, scale metrics, or architecture decisions..."
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] p-2.5 text-xs"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#1A1918] text-[#FAF8F5] px-4 py-2 text-xs font-medium hover:bg-[#2C2A28]"
                  >
                    Save Experience
                  </button>
                </div>
              </form>
            )}

            {profile?.experience && profile.experience.length > 0 ? (
              <div className="space-y-3">
                {profile.experience.map((exp) => (
                  <div
                    key={exp.id}
                    className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#1A1918]">
                          {exp.role}
                        </span>
                        <span className="text-xs text-[#6E6B65]">at</span>
                        <span className="text-xs font-medium text-[#1A1918]">
                          {exp.organization}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[#8E8B84]">
                        {exp.period}
                      </div>
                      {exp.summary && (
                        <p className="text-xs text-[#55524C] leading-relaxed pt-1">
                          {exp.summary}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleRemoveExperience(
                          exp.id,
                          `${exp.role} at ${exp.organization}`
                        )
                      }
                      className="text-[#8E8B84] hover:text-[#B45332] p-1 shrink-0"
                      aria-label={`Remove ${exp.role}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-[#D5D1C7] p-6 text-center text-xs text-[#6E6B65]">
                No experience entries yet. Add your roles or projects.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EDUCATION */}
        {dossierTab === "education" && (
          <div className="space-y-4">
            {showAddForm && (
              <form
                onSubmit={handleAddEducation}
                className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Degree / Program
                    </label>
                    <input
                      type="text"
                      required
                      value={eduForm.degree}
                      onChange={(e) =>
                        setEduForm({ ...eduForm, degree: e.target.value })
                      }
                      placeholder="B.Tech in Computer Science & Engineering"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Institution
                    </label>
                    <input
                      type="text"
                      required
                      value={eduForm.institution}
                      onChange={(e) =>
                        setEduForm({ ...eduForm, institution: e.target.value })
                      }
                      placeholder="Gautam Buddha University"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Graduation Year / Span
                    </label>
                    <input
                      type="text"
                      value={eduForm.year}
                      onChange={(e) =>
                        setEduForm({ ...eduForm, year: e.target.value })
                      }
                      placeholder="2023 – 2027"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      CGPA / Grade (Optional)
                    </label>
                    <input
                      type="text"
                      value={eduForm.grade}
                      onChange={(e) =>
                        setEduForm({ ...eduForm, grade: e.target.value })
                      }
                      placeholder="8.9 / 10"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#1A1918] text-[#FAF8F5] px-4 py-2 text-xs font-medium hover:bg-[#2C2A28]"
                  >
                    Save Education
                  </button>
                </div>
              </form>
            )}

            {profile?.education && profile.education.length > 0 ? (
              <div className="space-y-3">
                {profile.education.map((edu) => (
                  <div
                    key={edu.id}
                    className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-[#1A1918]">
                        {edu.degree}
                      </div>
                      <div className="text-xs text-[#55524C]">
                        {edu.institution}
                      </div>
                      <div className="text-[11px] font-mono text-[#8E8B84]">
                        {edu.year}
                        {edu.grade ? ` • Grade: ${edu.grade}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveEducation(edu.id, edu.degree)}
                      className="text-[#8E8B84] hover:text-[#B45332] p-1 shrink-0"
                      aria-label={`Remove ${edu.degree}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-[#D5D1C7] p-6 text-center text-xs text-[#6E6B65]">
                No education records added yet.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PUBLICATIONS */}
        {dossierTab === "publications" && (
          <div className="space-y-4">
            {showAddForm && (
              <form
                onSubmit={handleAddPublication}
                className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Paper / Article Title
                    </label>
                    <input
                      type="text"
                      required
                      value={pubForm.title}
                      onChange={(e) =>
                        setPubForm({ ...pubForm, title: e.target.value })
                      }
                      placeholder="Adaptive Rubric Scoring in Automated Technical Assessments"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Journal / Conference / Venue
                    </label>
                    <input
                      type="text"
                      required
                      value={pubForm.venue}
                      onChange={(e) =>
                        setPubForm({ ...pubForm, venue: e.target.value })
                      }
                      placeholder="IEEE Access / NeurIPS Workshop"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      Year
                    </label>
                    <input
                      type="text"
                      value={pubForm.year}
                      onChange={(e) =>
                        setPubForm({ ...pubForm, year: e.target.value })
                      }
                      placeholder="2026"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-[#1A1918]">
                      DOI / Link (Optional)
                    </label>
                    <input
                      type="url"
                      value={pubForm.url}
                      onChange={(e) =>
                        setPubForm({ ...pubForm, url: e.target.value })
                      }
                      placeholder="https://doi.org/..."
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#1A1918] text-[#FAF8F5] px-4 py-2 text-xs font-medium hover:bg-[#2C2A28]"
                  >
                    Save Publication
                  </button>
                </div>
              </form>
            )}

            {profile?.publications && profile.publications.length > 0 ? (
              <div className="space-y-3">
                {profile.publications.map((pub) => (
                  <div
                    key={pub.id}
                    className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-[#1A1918]">
                        {pub.title}
                      </div>
                      <div className="text-xs font-mono text-[#6E6B65]">
                        {pub.venue} • {pub.year}
                      </div>
                      {pub.url && (
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-[11px] font-mono text-[#1A1918] underline pt-0.5"
                        >
                          View Publication
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleRemovePublication(pub.id, pub.title)
                      }
                      className="text-[#8E8B84] hover:text-[#B45332] p-1 shrink-0"
                      aria-label={`Remove ${pub.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-[#D5D1C7] p-6 text-center text-xs text-[#6E6B65]">
                No publications listed yet. Add papers, technical blogs, or research articles.
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AWARDS & CERTIFICATIONS */}
        {dossierTab === "awards" && (
          <div className="space-y-6">
            {showAddForm && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form
                  onSubmit={handleAddAward}
                  className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-3"
                >
                  <div className="text-xs font-semibold text-[#1A1918]">
                    Add Award or Honor
                  </div>
                  <input
                    type="text"
                    required
                    value={awardForm.title}
                    onChange={(e) =>
                      setAwardForm({ ...awardForm, title: e.target.value })
                    }
                    placeholder="Award title (e.g. National Hackathon Winner)"
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={awardForm.issuer}
                      onChange={(e) =>
                        setAwardForm({ ...awardForm, issuer: e.target.value })
                      }
                      placeholder="Issuer"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      value={awardForm.year}
                      onChange={(e) =>
                        setAwardForm({ ...awardForm, year: e.target.value })
                      }
                      placeholder="Year (2026)"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <input
                    type="text"
                    value={awardForm.description}
                    onChange={(e) =>
                      setAwardForm({
                        ...awardForm,
                        description: e.target.value,
                      })
                    }
                    placeholder="Brief description (optional)"
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#1A1918] text-[#FAF8F5] px-4 py-2 text-xs font-medium hover:bg-[#2C2A28]"
                  >
                    Save Award
                  </button>
                </form>

                <form
                  onSubmit={handleAddCertification}
                  className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 space-y-3"
                >
                  <div className="text-xs font-semibold text-[#1A1918]">
                    Add Certification
                  </div>
                  <input
                    type="text"
                    required
                    value={certForm.name}
                    onChange={(e) =>
                      setCertForm({ ...certForm, name: e.target.value })
                    }
                    placeholder="Certification name (e.g. AWS Solutions Architect)"
                    className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={certForm.issuer}
                      onChange={(e) =>
                        setCertForm({ ...certForm, issuer: e.target.value })
                      }
                      placeholder="Authority"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      value={certForm.year}
                      onChange={(e) =>
                        setCertForm({ ...certForm, year: e.target.value })
                      }
                      placeholder="Year (2026)"
                      className="w-full border border-[#D5D1C7] bg-[#FFFFFF] px-3 py-2 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#1A1918] text-[#FAF8F5] px-4 py-2 text-xs font-medium hover:bg-[#2C2A28]"
                  >
                    Save Certification
                  </button>
                </form>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-xs font-mono text-[#6E6B65] uppercase">
                Awards &amp; Honors ({profile?.awards?.length || 0})
              </div>
              {profile?.awards && profile.awards.length > 0 ? (
                <div className="space-y-2.5">
                  {profile.awards.map((awd) => (
                    <div
                      key={awd.id}
                      className="border border-[#E5E2DA] bg-[#FAF8F5] p-4 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-[#1A1918]">
                          {awd.title}
                        </div>
                        <div className="text-xs font-mono text-[#6E6B65]">
                          {awd.issuer} • {awd.year}
                        </div>
                        {awd.description && (
                          <p className="text-xs text-[#55524C]">
                            {awd.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAward(awd.id, awd.title)}
                        className="text-[#8E8B84] hover:text-[#B45332] p-1 shrink-0"
                        aria-label={`Remove ${awd.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-[#D5D1C7] p-4 text-center text-xs text-[#6E6B65]">
                  No awards added yet.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-xs font-mono text-[#6E6B65] uppercase">
                Certifications ({profile?.certifications?.length || 0})
              </div>
              {profile?.certifications && profile.certifications.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {profile.certifications.map((cert) => (
                    <div
                      key={cert.id}
                      className="border border-[#E5E2DA] bg-[#FAF8F5] p-3.5 flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-semibold text-[#1A1918]">
                          {cert.name}
                        </div>
                        <div className="text-[11px] font-mono text-[#6E6B65]">
                          {cert.issuer} • {cert.year}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleRemoveCertification(cert.id, cert.name)
                        }
                        className="text-[#8E8B84] hover:text-[#B45332] p-1 shrink-0"
                        aria-label={`Remove ${cert.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-[#D5D1C7] p-4 text-center text-xs text-[#6E6B65]">
                  No certifications added yet.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ================================================================= */}
      {/* 4. APP ACTIVITY FEED (Chronological Log of App Usage) */}
      {/* ================================================================= */}
      <section className="border border-[#E5E2DA] bg-[#FFFFFF] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-[#1A1918]" />
            <h2 className="text-base font-bold text-[#1A1918]">
              Application Activity Log
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedDateFilter && (
              <button
                type="button"
                onClick={() => setSelectedDateFilter(null)}
                className="inline-flex items-center space-x-1 border border-[#1A1918] bg-[#FAF8F5] px-2.5 py-1 text-[11px] font-mono text-[#1A1918]"
              >
                <span>{formatDisplayDate(selectedDateFilter)}</span>
                <X className="w-3 h-3" />
              </button>
            )}

            <div className="inline-flex border border-[#E5E2DA] bg-[#FAF8F5] text-[11px] font-mono">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "interview", label: "Interviews" },
                  { id: "board", label: "Boards" },
                  { id: "profile", label: "Profile" },
                  { id: "auth", label: "Auth" },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActivityFilter(cat.id)}
                  className={`px-2.5 py-1 border-r last:border-r-0 border-[#E5E2DA] transition-colors ${
                    activityFilter === cat.id
                      ? "bg-[#FFFFFF] text-[#1A1918] font-semibold"
                      : "text-[#6E6B65] hover:text-[#1A1918]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredActivities.length > 0 ? (
          <div className="divide-y divide-[#E5E2DA] border border-[#E5E2DA]">
            {filteredActivities.map((act, idx) => (
              <div
                key={act._id || `${act.dateKey}-${idx}`}
                className="p-3.5 bg-[#FAF8F5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="border border-[#D5D1C7] bg-[#FFFFFF] px-1.5 py-0.5 text-[10px] font-mono uppercase text-[#423F3A]">
                      {act.category}
                    </span>
                    <span className="text-xs font-semibold text-[#1A1918]">
                      {act.action}
                    </span>
                  </div>
                  <div className="text-xs text-[#55524C]">{act.detail}</div>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#8E8B84] shrink-0">
                  {formatRelativeTime(act.timestamp)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[#D5D1C7] p-6 text-center text-xs text-[#6E6B65]">
            No activity events match the current filter.
          </div>
        )}
      </section>
    </div>
  );
}
