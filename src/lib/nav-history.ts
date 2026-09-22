/**
 * Where this tab was before the page it is on now.
 *
 * A deal is opened from the Pipeline, Leads, the Forecast drill-down,
 * Deployments or another deal. Its back link used to go to `/pipeline` every
 * time — wrong from anywhere else, and even from the Pipeline it threw away
 * the search and filters in the URL. The shell records each page as it is
 * reached, so the back link can name the page and return to it as it was.
 */
const CURRENT = "moeving:nav-current";
const PREVIOUS = "moeving:nav-previous";

function read(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Called by the shell on every navigation, with the full path and query. */
export function recordPage(url: string) {
  try {
    const current = sessionStorage.getItem(CURRENT);
    if (current === url) return;
    if (current) sessionStorage.setItem(PREVIOUS, current);
    sessionStorage.setItem(CURRENT, url);
  } catch {
    /* private mode: the back link falls back to its default */
  }
}

/**
 * The page before `here`, or null.
 *
 * React runs a page's effects before the shell's, so on first render the
 * shell may not have recorded `here` yet. Either way round, the answer is the
 * last page that is not this one.
 */
export function previousPage(here: string) {
  const current = read(CURRENT);
  if (current && current !== here) return current;
  return read(PREVIOUS);
}

const SECTIONS: [string, string][] = [
  ["/pipeline", "Pipeline"],
  ["/leads", "Leads"],
  ["/forecast", "Forecast"],
  ["/deployments", "Deployments"],
  ["/dashboard", "Dashboard"],
  ["/opportunities/", "Back"],
];

/** What a back link to `url` should say, or null if it is not a page to go back to. */
export function backLabel(url: string) {
  const path = url.split("?")[0]!;
  return SECTIONS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? null;
}
