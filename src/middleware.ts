import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk runs here only to attach the session to the request. Access control
 * itself lives in `requireSession()`, next to the data it protects — path
 * matching in middleware can drift from how Next actually routes a request,
 * and a missed pattern there would be a silent hole.
 */
export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
