'use client'

/**
 * A value the server cannot know.
 *
 * Browser capabilities and platform details are undefined during server rendering, so
 * branching on them directly makes the first client render disagree with the HTML and React
 * throws the whole page away and re-renders it. `useSyncExternalStore` is the sanctioned way
 * to say "render this on the server, then correct it once hydrated", without the state
 * update in an effect that the React lint rules rightly forbid.
 */
import { useSyncExternalStore } from 'react'

/** Nothing ever changes these mid-session, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {}

export function useClientValue<T>(read: () => T, onServer: T): T {
  return useSyncExternalStore(subscribeToNothing, read, () => onServer)
}
