export * from './types'
export * from './zip'
export * from './import'
export * from './project'
export { IndexedDbStore, indexedDbStore, resetDbForTests } from './indexeddb'
export { FileSystemAccessStore, fileSystemStore, fileSystemAccessSupported } from './file-system'

import { fileSystemStore } from './file-system'
import { indexedDbStore } from './indexeddb'
import type { ProjectStore } from './types'

/** Every store, in the order the dashboard offers them. Unavailable ones are filtered out. */
export function availableStores(): ProjectStore[] {
  return [indexedDbStore, fileSystemStore].filter((store) => store.available)
}
