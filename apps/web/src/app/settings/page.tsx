import { Settings } from '@/components/settings/settings'

export const metadata = { title: 'Settings · Agent Blueprint' }

/** Everything here lives in this browser, so the page is entirely a client concern. */
export default function SettingsPage() {
  return <Settings />
}
