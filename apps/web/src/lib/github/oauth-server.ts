/**
 * The server half of GitHub sign-in.
 *
 * These two route handlers are the only server-side code in the product that ever holds a
 * credential, and they hold one for the length of a single function call. The client secret
 * belongs to the deployment and never leaves it; the user's token is exchanged, handed to the
 * page that asked for it, and forgotten. Nothing is written to a cookie, a session or a log
 * (docs/08-security.md).
 *
 * The whole flow is optional. Without `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` the routes
 * answer 404 and the UI offers only a pasted token, which is the path that needs no deployment
 * configuration at all.
 */

export const STATE_COOKIE = 'ab_gh_state'

/** Ten minutes is longer than a sign-in takes and shorter than a coffee break. */
const STATE_MAX_AGE_SECONDS = 600

/** Writing a repository's contents is all this app does with the token. */
export const OAUTH_SCOPE = 'repo'

export const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
export const TOKEN_URL = 'https://github.com/login/oauth/access_token'

export interface OAuthConfig {
  clientId: string
  clientSecret: string
}

export function oauthConfig(): OAuthConfig | undefined {
  const clientId = process.env['GITHUB_CLIENT_ID']
  const clientSecret = process.env['GITHUB_CLIENT_SECRET']
  if (!clientId || !clientSecret) return undefined
  return { clientId, clientSecret }
}

export function githubOAuthConfigured(): boolean {
  return oauthConfig() !== undefined
}

/**
 * Where this app is, as the browser sees it.
 *
 * The redirect URI has to match what was registered with GitHub, and behind a proxy the
 * request's own URL is the internal one. The forwarded headers are what the deployment's proxy
 * sets; falling back to the request URL keeps local development working.
 */
export function appOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? url.host
  const protocol = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${protocol}://${host}`
}

export function newState(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

export function stateCookie(value: string, secure: boolean): string {
  const parts = [
    `${STATE_COOKIE}=${value}`,
    'Path=/api/github/oauth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${value ? STATE_MAX_AGE_SECONDS : 0}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readStateCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === STATE_COOKIE) return rest.join('=')
  }
  return undefined
}

/**
 * Compares in constant time. The values are random and short-lived, so this is belt and braces
 * rather than the thing standing between an attacker and the account — but a comparison that
 * returns early on the first wrong character is a habit worth not having.
 */
export function sameState(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  let different = 0
  for (let index = 0; index < a.length; index += 1) {
    different |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return different === 0
}

/**
 * The page the popup becomes: it hands the token to the window that opened it and closes.
 *
 * `postMessage` with an explicit same-origin target is the delivery. The token is never put in
 * a URL (it would land in history and in any referrer), never in a cookie (it would be sent on
 * every later request), and never stored here. The inline script is the only script this page
 * is allowed to run, which the CSP on the response says in as many words.
 */
export function deliveryPage(
  origin: string,
  payload: { token?: string; error?: string },
): Response {
  const message = JSON.stringify({ source: 'agent-blueprint-github-oauth', ...payload })
    // A token or an error message cannot close this script tag or open a comment.
    .replaceAll('<', '\\u003c')

  const heading = payload.token ? 'Signed in.' : 'Sign-in failed.'
  const detail = payload.token
    ? 'You can close this window.'
    : escapeHtml(payload.error ?? 'GitHub did not return a token.')

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${heading}</title></head>
<body style="font: 14px system-ui; padding: 2rem; color-scheme: light dark">
<h1 style="font-size: 1rem">${heading}</h1>
<p>${detail}</p>
<script>
  window.opener && window.opener.postMessage(${message}, ${JSON.stringify(origin)});
  window.close();
</script>
</body>
</html>`

  return new Response(html, {
    status: payload.token ? 200 : 400,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'",
      // Clearing the state here means one sign-in per authorize, whatever the outcome.
      'set-cookie': stateCookie('', origin.startsWith('https')),
    },
  })
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * What went wrong, in a form that can be shown.
 *
 * Deliberately coarse. The failure modes here are "GitHub said no" and "something in the
 * middle broke", and the difference between them is not something the user can act on. What
 * must never appear is the code, the state or the token, so nothing from the exchange body is
 * passed through except GitHub's own `error_description`, which carries none of them.
 */
export function logOAuthFailure(kind: string, status?: number): void {
  // Error class and HTTP status only, by the rule in docs/08-security.md.
  console.error(`github oauth: ${kind}${status === undefined ? '' : ` (${status})`}`)
}
