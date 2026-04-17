const ACCESS_KEY = "hrms_access";
const REFRESH_KEY = "hrms_refresh";

export function saveTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function getAccess(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefresh(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isLoggedIn(): boolean {
  return !!getAccess();
}

// ── Proactive token refresh ───────────────────────────────────────────────────

/** Decode JWT payload without verification (browser-side only). */
function jwtExp(token: string): number | null {
  try {
    // JWT uses base64url — replace url-safe chars before atob
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True if token expires within the next `bufferSeconds` seconds. */
export function isTokenStale(token: string, bufferSeconds = 60): boolean {
  const exp = jwtExp(token);
  if (exp === null) return true; // can't decode → treat as stale
  return Date.now() / 1000 > exp - bufferSeconds;
}

/**
 * Returns a valid access token, refreshing proactively if it's within
 * `bufferSeconds` of expiry. Serialises concurrent callers so only one
 * refresh request fires at a time.
 *
 * Throws if both tokens are absent or the refresh call fails.
 */
let _refreshPromise: Promise<string> | null = null;

export async function getValidToken(
  refreshFn: (refresh: string) => Promise<string>,
  bufferSeconds = 60,
): Promise<string> {
  const access = getAccess();
  if (!access) throw new Error("Not logged in");

  // Token still fresh — return immediately
  if (!isTokenStale(access, bufferSeconds)) return access;

  // Token stale — refresh (serialise concurrent callers)
  if (!_refreshPromise) {
    const refresh = getRefresh();
    if (!refresh) throw new Error("Session expired");

    _refreshPromise = refreshFn(refresh)
      .then((newAccess) => {
        saveTokens(newAccess, refresh);
        return newAccess;
      })
      .finally(() => {
        _refreshPromise = null;
      });
  }

  return _refreshPromise;
}
