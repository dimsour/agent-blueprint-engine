import { Settings } from '@/components/settings/settings'
import { githubOAuthConfigured } from '@/lib/github/oauth-server'

export const metadata = { title: 'Settings · Agent Blueprint' }

/**
 * Whether this deployment offers GitHub sign-in is a question about its environment, and only
 * the server holds the environment. Rendering per request rather than at build time means
 * setting the two variables is enough to turn sign-in on; a rebuild is not needed.
 */
export const dynamic = 'force-dynamic'

/** Everything else here lives in this browser, so the rest of the page is a client concern. */
export default function SettingsPage() {
  return <Settings oauthAvailable={githubOAuthConfigured()} />
}
