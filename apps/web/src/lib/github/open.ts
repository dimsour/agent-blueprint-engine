/**
 * Opening a Blueprint that lives in a repository.
 *
 * Only `blueprint/` is read. The compiled files at the repository root are output — they are
 * rebuilt from the source the moment the project opens, and importing them would mean carrying
 * two copies of the same truth and having to decide which one wins (ADR-5). What comes back is
 * the same `ProjectFiles` map a ZIP import produces, so it goes through the same reader, the
 * same diagnostics and the same "nothing is stored until Open is pressed" dialog.
 */
import { DEFAULT_SOURCE_DIR } from '@agent-blueprint/core'

import type { ProjectFiles } from '@/lib/storage'

import { GitHubError } from './client'
import { getRepository, type RepoRef } from './repos'
import { GitHubTreeFs, readRemoteTree } from './tree'

export interface OpenedProject {
  files: ProjectFiles
  /** The branch it was read from, which the user may not have named. */
  branch: string
}

export async function readProjectFromGitHub(
  token: string,
  repo: RepoRef,
  branch?: string,
): Promise<OpenedProject> {
  const target = branch || (await getRepository(token, repo)).defaultBranch

  const tree = await readRemoteTree(token, repo, target)
  if (!tree) {
    throw new GitHubError('not-found', `${repo.owner}/${repo.name} has no branch called ${target}.`)
  }

  const fs = new GitHubTreeFs(token, repo, tree)
  // The build manifest belongs to the repository that was compiled, not to the copy being
  // opened here: it records what the compiler owns *there*. A push reads it from the branch it
  // is pushing to, and a local save would drop it on the first write anyway.
  const paths = (await fs.list(DEFAULT_SOURCE_DIR)).filter(
    (path) => path !== `${DEFAULT_SOURCE_DIR}/build-manifest.json`,
  )

  if (!tree.entries.has(`${DEFAULT_SOURCE_DIR}/blueprint.yaml`)) {
    // A truncated listing is a different answer from "it is not there", and saying the second
    // when the first is true sends the user looking for a file that exists.
    throw new GitHubError(
      'not-found',
      tree.truncated
        ? `GitHub would not list all of ${repo.owner}/${repo.name}, so ${DEFAULT_SOURCE_DIR}/blueprint.yaml could not be found. Clone the repository and open the folder instead.`
        : `There is no Blueprint in ${repo.owner}/${repo.name} on ${target}: it has no ${DEFAULT_SOURCE_DIR}/blueprint.yaml.`,
    )
  }

  return { files: await fs.readAll(paths), branch: target }
}
