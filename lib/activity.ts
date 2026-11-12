import { getDatabase, ActivityLogDoc } from "./mongodb";

/**
 * Formats a Date object as YYYY-MM-DD in local time or ISO date.
 */
export function formatDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Records a user activity event into MongoDB `activities` collection.
 */
export async function recordUserActivity(params: {
  userId: string;
  action: string;
  category: ActivityLogDoc["category"];
  detail: string;
  timestamp?: Date;
}): Promise<void> {
  try {
    const db = await getDatabase();
    const now = params.timestamp || new Date();
    const doc: ActivityLogDoc = {
      userId: params.userId,
      action: params.action,
      category: params.category,
      detail: params.detail,
      dateKey: formatDateKey(now),
      timestamp: now,
    };
    await db.collection<ActivityLogDoc>("activities").insertOne(doc);
  } catch (error) {
    console.error("[Quorix Activity] Failed to record activity:", error);
  }
}
