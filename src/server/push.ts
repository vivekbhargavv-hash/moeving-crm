import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

/**
 * Web push, for the one thing worth interrupting somebody over: a lead has
 * been handed to them.
 *
 * Keys come from the environment (see HANDOFF § 7). Without them push is
 * simply off — assigning still works and the badge still counts; nobody's
 * phone buzzes. A failure to deliver never fails the assignment either: the
 * lead is theirs whether or not the notification arrived.
 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:vivekbhargav.v@gmail.com";

let configured = false;
function ready() {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Where a tap on the notification opens. */
  url: string;
  /** Same tag replaces rather than stacks, e.g. one per lead. */
  tag?: string;
};

export async function pushToUser(
  organizationId: string,
  userId: string,
  message: PushMessage,
) {
  if (!ready()) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.organizationId, organizationId),
        eq(pushSubscriptions.userId, userId),
      ),
    );
  if (!subs.length) return;

  const payload = JSON.stringify(message);
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
      } catch (error) {
        // 404/410: the browser unsubscribed or the app was uninstalled. The
        // address will never work again, so stop sending to it.
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
      }
    }),
  );
  if (gone.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  }
}
