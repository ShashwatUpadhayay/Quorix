import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, ProfileDoc, UserDoc } from "@/lib/mongodb";
import { parseResumeText } from "@/lib/resumeParser";
import { recordUserActivity } from "@/lib/activity";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const resumeText =
      typeof body.resumeText === "string" ? body.resumeText.trim() : "";

    if (resumeText.length < 30) {
      return NextResponse.json(
        {
          error:
            "Please provide at least a short resume or CV text (30+ characters) to parse.",
        },
        { status: 400 }
      );
    }

    const applyToProfile = body.applyToProfile !== false;
    const updateName = Boolean(body.updateName);

    const parsed = parseResumeText(resumeText, user.role);
    const userId = user._id.toString();

    if (!applyToProfile) {
      return NextResponse.json(
        {
          parsed,
          interviewConfig: parsed.interviewConfig,
        },
        { status: 200 }
      );
    }

    const db = await getDatabase();
    const existing = await db
      .collection<ProfileDoc>("profiles")
      .findOne({ userId });

    const updatedDoc: Omit<ProfileDoc, "_id"> = {
      userId,
      headline: parsed.headline || existing?.headline || "",
      location: parsed.location || existing?.location || "",
      phone: parsed.phone || existing?.phone || "",
      bio: parsed.bio || existing?.bio || "",
      links: {
        github: parsed.links.github || existing?.links?.github || "",
        linkedin: parsed.links.linkedin || existing?.links?.linkedin || "",
        website: parsed.links.website || existing?.links?.website || "",
      },
      skills: parsed.skills.length > 0 ? parsed.skills : existing?.skills || [],
      experience:
        parsed.experience.length > 0
          ? parsed.experience
          : existing?.experience || [],
      education:
        parsed.education.length > 0
          ? parsed.education
          : existing?.education || [],
      publications:
        parsed.publications.length > 0
          ? parsed.publications
          : existing?.publications || [],
      awards: parsed.awards.length > 0 ? parsed.awards : existing?.awards || [],
      certifications:
        parsed.certifications.length > 0
          ? parsed.certifications
          : existing?.certifications || [],
      interviewConfig: parsed.interviewConfig,
      rawResumeText: resumeText.slice(0, 15000),
      updatedAt: new Date(),
    };

    await db
      .collection<ProfileDoc>("profiles")
      .updateOne({ userId }, { $set: updatedDoc }, { upsert: true });

    const userUpdate: Partial<UserDoc> = {
      profileCompleted: true,
      updatedAt: new Date(),
    };
    if (updateName && parsed.name && parsed.name.length >= 2) {
      userUpdate.name = parsed.name;
    }

    await db.collection<UserDoc>("users").updateOne(
      { _id: new ObjectId(userId) as unknown as string },
      { $set: userUpdate }
    );

    await recordUserActivity({
      userId,
      action: "Parsed Resume & Built Profile",
      category: "profile",
      detail: `${parsed.skills.length} skills, ${parsed.experience.length} roles • ${parsed.interviewConfig.difficultyTier} (${parsed.interviewConfig.primaryTopics.slice(0, 2).join(", ")})`,
    });

    const saved = await db
      .collection<ProfileDoc>("profiles")
      .findOne({ userId });

    return NextResponse.json(
      {
        parsed,
        profile: saved ? { ...saved, _id: saved._id?.toString() } : updatedDoc,
        interviewConfig: parsed.interviewConfig,
        updatedName: userUpdate.name,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[Resume Parse Error]:", error);
    return NextResponse.json(
      { error: "Failed to parse resume." },
      { status: 500 }
    );
  }
}
