import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, ProfileDoc, ActivityLogDoc, UserDoc } from "@/lib/mongodb";
import { recordUserActivity, formatDateKey } from "@/lib/activity";
import { computeInterviewConfig } from "@/lib/adaptiveEngine";

function buildDefaultProfile(userId: string, role: string): ProfileDoc {
  return {
    userId,
    headline:
      role === "expert"
        ? "Industry Panel Interviewer"
        : "Software Engineering Candidate",
    location: "",
    phone: "",
    bio: "",
    links: {
      github: "",
      linkedin: "",
      website: "",
    },
    skills: [],
    experience: [],
    education: [],
    publications: [],
    awards: [],
    certifications: [],
    updatedAt: new Date(),
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user._id.toString();
    const db = await getDatabase();

    let profile = await db
      .collection<ProfileDoc>("profiles")
      .findOne({ userId });

    if (!profile) {
      const defaultProfile = buildDefaultProfile(userId, user.role);
      const inserted = await db
        .collection<ProfileDoc>("profiles")
        .insertOne(defaultProfile);
      profile = {
        ...defaultProfile,
        _id: inserted.insertedId.toString(),
      };
    }

    // Fetch last 365 days of activity for this user
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const activities = await db
      .collection<ActivityLogDoc>("activities")
      .find({
        userId,
        timestamp: { $gte: oneYearAgo },
      })
      .sort({ timestamp: -1 })
      .limit(250)
      .toArray();

    // Ensure at least registration date is represented if activities collection was empty
    if (activities.length === 0 && user.createdAt) {
      const createdDate = new Date(user.createdAt);
      const initialActivity: ActivityLogDoc = {
        userId,
        action: "Account Registered",
        category: "auth",
        detail: `Joined Quorix (${user.role} workspace)`,
        dateKey: formatDateKey(createdDate),
        timestamp: createdDate,
      };
      const insertedAct = await db
        .collection<ActivityLogDoc>("activities")
        .insertOne(initialActivity);
      activities.push({
        ...initialActivity,
        _id: insertedAct.insertedId.toString(),
      });
    }

    // Aggregate daily counts for GitHub-style heatmap
    const dailyCounts: Record<string, number> = {};
    for (const act of activities) {
      const key = act.dateKey || formatDateKey(new Date(act.timestamp));
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    }

    const computedConfig =
      profile.interviewConfig ||
      computeInterviewConfig({
        skills: profile.skills || [],
        experience: profile.experience || [],
        headline: profile.headline || "",
        rawText: profile.rawResumeText,
      });

    return NextResponse.json(
      {
        user,
        profile: {
          ...profile,
          interviewConfig: computedConfig,
          _id: profile._id?.toString(),
        },
        activities: activities.map((a) => ({
          ...a,
          _id: a._id?.toString(),
        })),
        dailyCounts,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[Profile GET Error]:", error);
    return NextResponse.json(
      { error: "Failed to load profile data." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user._id.toString();
    const body = await req.json();
    const db = await getDatabase();

    // Optional user name update
    if (typeof body.name === "string" && body.name.trim().length >= 2) {
      await db.collection<UserDoc>("users").updateOne(
        { _id: new ObjectId(userId) as unknown as string },
        {
          $set: {
            name: body.name.trim(),
            profileCompleted: true,
            updatedAt: new Date(),
          },
        }
      );
    }

    const existing = await db
      .collection<ProfileDoc>("profiles")
      .findOne({ userId });

    const updatedDoc: Omit<ProfileDoc, "_id"> = {
      userId,
      headline:
        typeof body.headline === "string"
          ? body.headline.trim()
          : existing?.headline || "",
      location:
        typeof body.location === "string"
          ? body.location.trim()
          : existing?.location || "",
      phone:
        typeof body.phone === "string"
          ? body.phone.trim()
          : existing?.phone || "",
      bio:
        typeof body.bio === "string"
          ? body.bio.trim()
          : existing?.bio || "",
      links: {
        github:
          typeof body.links?.github === "string"
            ? body.links.github.trim()
            : existing?.links?.github || "",
        linkedin:
          typeof body.links?.linkedin === "string"
            ? body.links.linkedin.trim()
            : existing?.links?.linkedin || "",
        website:
          typeof body.links?.website === "string"
            ? body.links.website.trim()
            : existing?.links?.website || "",
      },
      skills: Array.isArray(body.skills)
        ? body.skills
        : existing?.skills || [],
      experience: Array.isArray(body.experience)
        ? body.experience
        : existing?.experience || [],
      education: Array.isArray(body.education)
        ? body.education
        : existing?.education || [],
      publications: Array.isArray(body.publications)
        ? body.publications
        : existing?.publications || [],
      awards: Array.isArray(body.awards)
        ? body.awards
        : existing?.awards || [],
      certifications: Array.isArray(body.certifications)
        ? body.certifications
        : existing?.certifications || [],
      rawResumeText: existing?.rawResumeText,
      updatedAt: new Date(),
    };

    updatedDoc.interviewConfig = computeInterviewConfig({
      skills: updatedDoc.skills,
      experience: updatedDoc.experience,
      headline: updatedDoc.headline,
      rawText: updatedDoc.rawResumeText,
    });

    await db.collection<ProfileDoc>("profiles").updateOne(
      { userId },
      { $set: updatedDoc },
      { upsert: true }
    );

    const activityAction =
      typeof body.activityLabel === "string" && body.activityLabel.trim()
        ? body.activityLabel.trim()
        : "Updated Profile";
    const activityDetail =
      typeof body.activityDetail === "string" && body.activityDetail.trim()
        ? body.activityDetail.trim()
        : "Modified application profile details";

    await recordUserActivity({
      userId,
      action: activityAction,
      category: "profile",
      detail: activityDetail,
    });

    return NextResponse.json(
      {
        message: "Profile saved.",
        profile: updatedDoc,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[Profile PUT Error]:", error);
    return NextResponse.json(
      { error: "Failed to save profile." },
      { status: 500 }
    );
  }
}
