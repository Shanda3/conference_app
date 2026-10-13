import {SharedScheduleView} from "@/app/shared-schedule-view";
import { getAppUser } from "@/app/auth";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { scheduleShares } from "@/lib/social-schema";
import { loadSharedSchedule } from "@/lib/sharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Shared schedule | ThunderPlains Planner · Techlahoma",
  description: "A read-only conference schedule shared by its owner.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default async function SharedSchedulePage({ params }: { params: Promise<{ token: string }> }) {
  if (!await getAppUser()) notFound();
  const { token } = await params;
  const schedule = await loadSharedSchedule(token, async (hash) => {
    const [row] = await getDb().select({ payloadJson: scheduleShares.payloadJson, revokedAt: scheduleShares.revokedAt })
      .from(scheduleShares).where(eq(scheduleShares.tokenHash, hash)).limit(1);
    return row;
  });
  if (!schedule) notFound();
  return <SharedScheduleView schedule={schedule}/>;
}
