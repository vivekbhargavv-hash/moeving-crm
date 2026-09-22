import "server-only";

import { headers } from "next/headers";
import { userAgent } from "next/server";

/**
 * The server's best guess at whether this request will get the desktop
 * layout, for screens that render only one of the two (`useIsDesktop`).
 * Phones say so in the user agent; tablets and computers are wide enough for
 * the desktop layout. A wrong guess is corrected in the browser straight
 * after hydration.
 */
export async function guessDesktop() {
  const { device } = userAgent({ headers: await headers() });
  return device.type !== "mobile";
}
