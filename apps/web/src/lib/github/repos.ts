/**
 * Choosing where a Blueprint goes: an account, a repository, a branch.
 *
 * The shapes here are deliberately small. GitHub's repository object has over a hundred fields
 * and the push flow needs six of them, so this narrows to what the UI shows and what the commit
 * needs — and in doing so states, in one place, exactly how much of GitHub this app understands.
 *
 * Two facts drive most of what follows. A repository can be listed and still not be writable,
 * so `canPush` is read from GitHub's own `permissions` rather than assumed from ownership. And
 * a repository created a second ago has no commits at all, so `defaultBranch` names a branch
 * that does not exist yet; the push path treats that as the ordinary first-commit case rather
 * than as an error.
 */
import { githubPaginate, githubRequest } from './client'

export interface RepoRef {
  owner: string
  name: string
}

export interface GitHubRepo extends RepoRef {
  fullName: string
  /** The branch GitHub would show first. It does not exist yet on a repository with no commits. */
  defaultBranch: string
  /** What this token may do here, as GitHub reports it — not inferred from who owns it. */
  canPush: boolean
}

interface RepoPayload {
  name: string
  full_name: string
  default_branch?: string
  owner: { login: string }
  permissions?: { push?: boolean; admin?: boolean }
}

function toRepo(payload: RepoPayload): GitHubRepo {
  return {
    owner: payload.owner.login,
    name: payload.name,
    fullName: payload.full_name,
    defaultBranch: payload.default_branch || 'main',
    canPush: payload.permissions?.push ?? payload.permissions?.admin ?? false,
  }
}

/**
 * The repositories to suggest: the hundred this token touched most recently.
 *
 * `affiliation` is what makes an organisation's repositories appear at all — the default is
 * owner-only, and a user pushing to their employer's repository would otherwise find an empty
 * list and no explanation. One page is deliberate: this fills a suggestion list beside a field
 * that accepts anything typed into it, so paging an account with two thousand repositories
 * would cost twenty requests to complete a list nobody reads to the end.
 */
export async function listRepositories(token: string): Promise<GitHubRepo[]> {
  const payloads = await githubPaginate<RepoPayload>(
    token,
    {
      path: '/user/repos',
      query: {
        affiliation: 'owner,collaborator,organization_member',
        sort: 'updated',
        per_page: 100,
      },
    },
    1,
  )
  return payloads.map(toRepo)
}

export async function getRepository(token: string, ref: RepoRef): Promise<GitHubRepo> {
  const { data } = await githubRequest<RepoPayload>(token, {
    path: `/repos/${ref.owner}/${ref.name}`,
  })
  return toRepo(data)
}

export interface NewRepo {
  name: string
  description?: string
  private: boolean
  /** An organisation login, or nothing for the signed-in user's own account. */
  org?: string
}

/**
 * Creates a repository, with nothing in it.
 *
 * No README, no licence, no `.gitignore`. An initialised repository has a commit that this app
 * did not make, which turns the first push into a merge question for no benefit; an empty one
 * takes the Blueprint as its first commit and reads as what it is.
 */
export async function createRepository(token: string, repo: NewRepo): Promise<GitHubRepo> {
  const { data } = await githubRequest<RepoPayload>(token, {
    method: 'POST',
    path: repo.org ? `/orgs/${repo.org}/repos` : '/user/repos',
    body: {
      name: repo.name,
      private: repo.private,
      auto_init: false,
      ...(repo.description ? { description: repo.description } : {}),
    },
  })
  // The create response carries no permissions block; the account that just made it can write.
  return { ...toRepo(data), canPush: true }
}

export interface GitHubBranch {
  name: string
  /** The commit the branch points at: the parent of anything pushed onto it. */
  sha: string
}

export async function listBranches(token: string, ref: RepoRef): Promise<GitHubBranch[]> {
  const payloads = await githubPaginate<{ name: string; commit: { sha: string } }>(token, {
    path: `/repos/${ref.owner}/${ref.name}/branches`,
    query: { per_page: 100 },
  })

  return payloads.map((branch) => ({ name: branch.name, sha: branch.commit.sha }))
}

/** The branch as GitHub has it now, or nothing when it does not exist yet. */
export async function getBranch(
  token: string,
  ref: RepoRef,
  branch: string,
): Promise<GitHubBranch | undefined> {
  const { data } = await githubRequest<{ object: { sha: string } } | undefined>(token, {
    path: `/repos/${ref.owner}/${ref.name}/git/ref/heads/${encodeBranch(branch)}`,
    allowMissing: true,
  })
  return data ? { name: branch, sha: data.object.sha } : undefined
}

/**
 * A branch name as it goes into a ref path.
 *
 * `feature/thing` is one branch, not two path segments, and `encodeURIComponent` would send
 * `feature%2Fthing`, which the ref endpoints answer 404 for. The separator stays; everything
 * else is escaped.
 */
export function encodeBranch(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/')
}

/**
 * Accepts what a person actually has in their clipboard.
 *
 * A repository is copied from the address bar, from the clone box, or typed as `owner/name`.
 * Making the field understand all three is a few lines here and one fewer thing to get right
 * when someone is halfway through a push.
 */
export function parseRepoRef(input: string): RepoRef | undefined {
  const trimmed = input.trim().replace(/\.git$/, '')
  if (!trimmed) return undefined

  const withoutHost = trimmed
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')

  const [owner, name, ...rest] = withoutHost.split('/')
  if (!owner || !name || rest.length > 0) return undefined
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return undefined
  return { owner, name }
}
