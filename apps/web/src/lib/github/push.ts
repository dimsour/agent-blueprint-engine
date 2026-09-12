/**
 * The push itself: one commit, or nothing.
 *
 * The Contents API would be simpler and wrong — it writes one file per request, so a failure
 * halfway leaves a repository holding half a Blueprint, with a commit for each file. The Git
 * Data API builds the whole tree first and moves the branch once, which is why a push here
 * either happened or did not.
 *
 * The branch is moved without `force`, so a push whose parent is no longer the branch head is
 * refused by GitHub rather than overwriting whatever arrived in the meantime. That is the
 * correct answer: the plan the user approved was made against a repository that has since
 * changed, and the honest response is to look again.
 *
 * With one exception, and it is GitHub's rather than ours (P9-24). The Git Data API refuses
 * to create a tree, a commit or a ref in a repository that has no commits at all — every call
 * answers "Git Repository is empty." — so the first commit cannot be made the way every later
 * one is. What works is the Contents API, which writes one file and makes the first commit as
 * a side effect. So an empty repository is seeded with one file through that API, and then
 * the real commit is built the usual way as a root commit and the branch is moved onto it
 * with `force`: the seed commit becomes unreachable and the history holds exactly the one
 * commit the preview promised. Forcing there overwrites nothing anyone else made — the seed
 * was ours, a second ago — which is the one case the no-force rule was never about.
 */
import { byteLength, encodeUtf8, type ProjectFile, toBase64 } from '@agent-blueprint/core'

import { GitHubError, githubRequest } from './client'
import { encodeBranch, type RepoRef } from './repos'

/** GitHub's answer, on every git-data endpoint, for a repository with no commits. */
function isEmptyRepository(error: unknown): boolean {
  return (
    error instanceof GitHubError &&
    error.status === 409 &&
    /repository is empty/i.test(error.message)
  )
}

/**
 * The first commit, made the only way GitHub allows one: one file, through the Contents API.
 *
 * The file and its content do not matter — the real commit that follows carries the whole
 * tree and does not descend from this one — so it is the first write, by path, and the
 * message says what this commit is for in case anyone ever finds it.
 */
async function seedRepository(
  token: string,
  base: string,
  branch: string,
  writes: Record<string, ProjectFile>,
): Promise<string> {
  const [path] = Object.keys(writes).sort()
  if (path === undefined) {
    throw new GitHubError(
      'invalid',
      'There is nothing to write, so nothing can seed the repository.',
    )
  }
  const content = writes[path] ?? ''
  const bytes = typeof content === 'string' ? encodeUtf8(content) : content
  const { data } = await githubRequest<{ commit: { sha: string } }>(token, {
    method: 'PUT',
    path: `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
    body: {
      message: 'Initialise the repository',
      content: toBase64(bytes),
      branch,
    },
  })
  return data.commit.sha
}

/**
 * GitHub's documented ceiling for one tree request. Only inline text counts against it: a
 * file that is not text is uploaded as its own blob first, where GitHub's much larger blob
 * limit applies instead.
 */
const MAX_TREE_BYTES = 7_000_000

export interface PushInput {
  token: string
  repo: RepoRef
  branch: string
  message: string
  /** The commit the plan was made against. Absent when the branch does not exist yet. */
  parentCommit?: string
  writes: Record<string, ProjectFile>
  deletes: readonly string[]
}

export interface PushResult {
  commitSha: string
  /** Where the user can go and look at what was pushed. */
  url: string
  written: number
  deleted: number
}

interface TreeItem {
  path: string
  mode: '100644'
  type: 'blob'
  content?: string
  /** A blob already uploaded (binary), or `null` to remove the path. */
  sha?: string | null
}

export async function pushToGitHub(input: PushInput): Promise<PushResult> {
  const { token, repo, branch, parentCommit } = input
  const base = `/repos/${repo.owner}/${repo.name}`

  const size = Object.values(input.writes).reduce(
    (total, content) => total + (typeof content === 'string' ? byteLength(content) : 0),
    0,
  )
  if (size > MAX_TREE_BYTES) {
    throw new GitHubError(
      'invalid',
      'This project is larger than GitHub accepts in a single commit. Export it as a ZIP and commit it with Git.',
    )
  }

  // A tree item carries inline `content` only for text: the field is UTF-8, so bytes have to
  // become a blob of their own first and be named by sha.
  const items: TreeItem[] = []
  for (const path of Object.keys(input.writes).sort()) {
    const content = input.writes[path] ?? ''
    if (typeof content === 'string') {
      items.push({ path, mode: '100644', type: 'blob', content })
      continue
    }
    const { data: blob } = await githubRequest<{ sha: string }>(token, {
      method: 'POST',
      path: `${base}/git/blobs`,
      body: { content: toBase64(content), encoding: 'base64' },
    })
    items.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  // Removing a path means naming it with a null sha against the tree it is being removed from,
  // so a delete only means anything when there is a base tree to remove it from.
  if (parentCommit) {
    for (const path of [...input.deletes].sort()) {
      items.push({ path, mode: '100644', type: 'blob', sha: null })
    }
  }

  const baseTree = parentCommit ? await treeOf(token, base, parentCommit) : undefined

  const createTree = () =>
    githubRequest<{ sha: string }>(token, {
      method: 'POST',
      path: `${base}/git/trees`,
      body: { ...(baseTree ? { base_tree: baseTree } : {}), tree: items },
    })

  // A repository with no commits refuses this call. Seed it and ask again; from here on the
  // git-data endpoints work, and the branch the seed made is moved at the end.
  let seeded = false
  const { data: tree } = await createTree().catch(async (error: unknown) => {
    if (parentCommit !== undefined || !isEmptyRepository(error)) throw error
    await seedRepository(token, base, branch, input.writes)
    seeded = true
    return createTree()
  })

  const { data: commit } = await githubRequest<{ sha: string; html_url?: string }>(token, {
    method: 'POST',
    path: `${base}/git/commits`,
    body: {
      message: input.message,
      tree: tree.sha,
      parents: parentCommit ? [parentCommit] : [],
    },
  })

  if (parentCommit) {
    await githubRequest(token, {
      method: 'PATCH',
      path: `${base}/git/refs/heads/${encodeBranch(branch)}`,
      // Never force: a branch that moved since the plan was made is a conversation, not a race
      // this app should win.
      body: { sha: commit.sha, force: false },
    }).catch((error: unknown) => {
      if (error instanceof GitHubError && (error.code === 'invalid' || error.code === 'conflict')) {
        throw new GitHubError(
          'conflict',
          'The branch moved on GitHub while this push was being prepared. Look at the preview again.',
          error.status,
        )
      }
      throw error
    })
  } else if (seeded) {
    // The branch exists because the seed made it, pointing at a commit nobody else has seen.
    // Moving it onto the root commit is the one forced move this module makes, and it
    // overwrites only what this same call wrote a moment ago.
    await githubRequest(token, {
      method: 'PATCH',
      path: `${base}/git/refs/heads/${encodeBranch(branch)}`,
      body: { sha: commit.sha, force: true },
    })
  } else {
    await githubRequest(token, {
      method: 'POST',
      path: `${base}/git/refs`,
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    })
  }

  return {
    commitSha: commit.sha,
    url: commit.html_url ?? `https://github.com/${repo.owner}/${repo.name}/commit/${commit.sha}`,
    written: Object.keys(input.writes).length,
    deleted: items.length - Object.keys(input.writes).length,
  }
}

async function treeOf(token: string, base: string, commitSha: string): Promise<string> {
  const { data } = await githubRequest<{ tree: { sha: string } }>(token, {
    path: `${base}/git/commits/${commitSha}`,
  })
  return data.tree.sha
}
