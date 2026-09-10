/**
 * The assistant, end to end, against an endpoint that is not there.
 *
 * The model is stubbed at the network boundary rather than mocked in code, so everything
 * between the button and the Blueprint is the real thing: the settings the browser stores, the
 * client, the schemas, the assembler, the review, and the store. What is being proved is the
 * rule the whole feature rests on — what the model proposed and what the user accepted are two
 * different lists, and only the second one reaches the project.
 */
import { expect, type Page, test } from '@playwright/test'

/** Three proposals: an Iron Law, a skill, and a rule nobody asked for. */
const COMPOUND_ANSWER = {
  summary: 'Three things learned from the migration hotfix.',
  proposals: [
    {
      kind: 'iron-law',
      artifact: {
        id: 'migrations-need-a-way-back',
        name: 'Every migration has a way back',
        rule: 'Never merge a schema migration without a tested rollback in the same change.',
        rationale: 'The one that shipped without a rollback cost four hours at 2am.',
        category: 'data',
        severity: 'critical',
      },
      note: 'From the note about the 2am hotfix.',
    },
    {
      kind: 'skill',
      artifact: {
        id: 'writing-a-rollback',
        name: 'Writing a rollback',
        whenToUse: 'When a change includes a schema migration.',
        body: 'Write the down migration first and run it against a copy of production data.',
      },
      note: 'Nobody knew how to reverse the change.',
    },
    {
      kind: 'rule',
      artifact: {
        id: 'deploy-on-a-weekday',
        name: 'Deploy on a weekday',
        guidance: 'Prefer deploying schema changes between Monday and Thursday.',
        category: 'process',
      },
    },
  ],
}

/**
 * Configure an endpoint in the browser and answer for it. The settings go in before any script
 * runs, because the panel reads them the moment it opens.
 */
async function stubEndpoint(page: Page, answer: unknown) {
  await page.addInitScript(
    ([settings, key]) => {
      localStorage.setItem('ab:settings:ai', settings as string)
      sessionStorage.setItem('ab:credentials:ai', key as string)
    },
    [
      JSON.stringify({
        presetId: 'custom',
        baseUrl: 'https://stub.test/v1',
        model: 'stub',
        jsonSchema: true,
        viaProxy: false,
        extraHeaders: {},
      }),
      'sk-stub-abcdefghijklmnop',
    ],
  )
  await page.route('https://stub.test/**', (route) => {
    // The app streams by default, and an endpoint answers a streaming request as a stream.
    // Fulfilling with a whole completion would be a shape no endpoint produces, and the
    // screens under test would fail for a reason that has nothing to do with them.
    const body = route.request().postData() ?? ''
    const streaming = body.includes('"stream":true')
    const content = JSON.stringify(answer)
    return route.fulfill(
      streaming
        ? { status: 200, contentType: 'text/event-stream', body: sse(content) }
        : {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              model: 'stub',
              choices: [{ message: { role: 'assistant', content } }],
            }),
          },
    )
  })
}

/** One answer as server-sent events, in three chunks the way a real one arrives. */
function sse(content: string): string {
  const size = Math.max(1, Math.ceil(content.length / 3))
  const parts = [content.slice(0, size), content.slice(size, size * 2), content.slice(size * 2)]
  return parts
    .filter((part) => part !== '')
    .map((delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`)
    .concat('data: [DONE]\n\n')
    .join('')
}

async function openStarter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /React Expert/ }).click()
  await page.waitForURL(/\/p\//)
  await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
}

function tree(page: Page) {
  return page.getByRole('navigation', { name: 'Blueprint artifacts' })
}

test.describe('the assistant', () => {
  test('applies the changes that were accepted and leaves the rest behind', async ({ page }) => {
    await stubEndpoint(page, COMPOUND_ANSWER)
    await openStarter(page)

    await page.getByRole('button', { name: /^AI/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Assistant')

    await page.getByRole('button', { name: 'Turn this into reusable knowledge' }).click()
    await page
      .getByLabel('What happened', { exact: true })
      .fill('We shipped a migration without a rollback and had to hotfix at 2am.')
    await page.getByRole('button', { name: 'Ask' }).click()

    const proposals = page.getByRole('list', { name: 'Proposed changes' })
    await expect(proposals.getByRole('listitem')).toHaveCount(3)
    // The evidence the model attached is on the row, which is what makes it reviewable.
    await expect(proposals).toContainText('From the note about the 2am hotfix.')

    await page.getByRole('checkbox', { name: 'Reject Deploy on a weekday' }).click()
    await expect(page.getByText('2 of 3 accepted')).toBeVisible()
    await page.getByRole('button', { name: 'Apply 2 changes' }).click()

    // Two artifacts arrived; the third never existed.
    await expect(
      tree(page).getByRole('button', { name: /^Every migration has a way back/ }),
    ).toBeVisible()
    await expect(tree(page).getByRole('button', { name: /^Writing a rollback/ })).toBeVisible()
    await expect(tree(page).getByRole('button', { name: /^Deploy on a weekday/ })).toHaveCount(0)
  })

  test('a model finding navigates to the artifact it is about', async ({ page }) => {
    await stubEndpoint(page, {
      contradictions: [
        {
          first: { kind: 'agent', id: 'react-expert' },
          second: { kind: 'agent', id: 'react-expert' },
          conflict: 'A stubbed finding, so that the navigation can be checked.',
          severity: 'medium',
        },
      ],
    })
    await openStarter(page)

    await page.keyboard.press('Control+/')
    await page.getByRole('button', { name: 'Find contradictions' }).click()
    await page.getByRole('button', { name: 'Ask' }).click()

    const findings = page.getByRole('list', { name: 'AI findings' })
    await expect(findings).toContainText('BP-AI-CONTRA-001')
    await findings.getByRole('button', { name: 'Agent: react-expert' }).first().click()

    // The panel closes and the artifact it named is what the workspace is showing.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/id=react-expert/)
  })

  test('offers Settings rather than a spinner when no endpoint is configured', async ({ page }) => {
    await openStarter(page)

    await page.getByRole('button', { name: /^AI/ }).click()
    await expect(page.getByText('No AI endpoint yet')).toBeVisible()
    await expect(page.getByRole('link', { name: /Set one up/ })).toHaveAttribute(
      'href',
      '/settings',
    )
  })
})

/** A better version of one skill: the quick action every other one is composed the same way. */
const IMPROVED_SKILL = {
  artifact: {
    // A different id from the one selected, on purpose: the operation must ignore it.
    id: 'react-testing-improved',
    name: 'React testing',
    whenToUse: 'When adding or changing a React component.',
    body: '## Verifying it\n\nRun `pnpm test` and read the output before claiming the component works.',
  },
  note: 'Added a verification section naming the command.',
}

/** A first draft for the wizard: two agents, a skill and a law. */
const BLUEPRINT_DRAFT = {
  name: 'PR Review Crew',
  description: 'Reviews pull requests and blocks anything unverified.',
  primaryAgentId: 'reviewer',
  agents: [
    {
      id: 'reviewer',
      name: 'Reviewer',
      role: 'reviewer',
      responsibilities: ['Read the diff and report what is wrong with it'],
      skillIds: ['diff-reading'],
      body: 'You review pull requests. You do not approve what you have not read.',
    },
  ],
  skills: [
    {
      id: 'diff-reading',
      name: 'Reading a diff',
      whenToUse: 'When a pull request has to be reviewed.',
      body: 'Read the diff hunk by hunk. Name the file and line for every comment.',
    },
  ],
  ironLaws: [
    {
      id: 'no-unverified-approval',
      name: 'Never approve what was not verified',
      rule: 'Never approve a pull request without reading its diff and observing the test output.',
      category: 'process',
      severity: 'critical',
    },
  ],
}

test.describe('quick actions', () => {
  test('improves the selected skill, and the change is the one that was shown', async ({
    page,
  }) => {
    await stubEndpoint(page, IMPROVED_SKILL)
    await openStarter(page)

    await tree(page)
      .getByRole('button', { name: /^React testing/ })
      .click()
    await page.getByRole('button', { name: /^AI/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Working on the skill')

    await page.getByRole('button', { name: 'Add verification' }).click()
    await page.getByRole('button', { name: 'Ask' }).click()

    // One op, on the artifact that was selected — the model's own id for it is ignored.
    const proposals = page.getByRole('list', { name: 'Proposed changes' })
    await expect(proposals.getByRole('listitem')).toHaveCount(1)
    await expect(proposals).toContainText('body')
    await page.getByRole('button', { name: 'Apply 1 change' }).click()

    // The skill it landed on is the one that was selected, not the id the model sent back.
    await page.getByRole('tab', { name: /Markdown/ }).click()
    await expect(page.getByText('blueprint/skills/react-testing/SKILL.md')).toBeVisible()
    await expect(page.locator('.cm-content')).toContainText('Verifying it')
  })
})

test.describe('the wizard', () => {
  test('drafts a first Blueprint, which is still a proposal', async ({ page }) => {
    await stubEndpoint(page, BLUEPRINT_DRAFT)
    await page.goto('/new')

    await page
      .getByLabel('Draft this with AI', { exact: true })
      .fill('A crew that reviews pull requests and blocks anything unverified.')
    await page.getByRole('button', { name: 'Draft', exact: true }).click()

    const proposals = page.getByRole('list', { name: 'Proposed changes' })
    await expect(proposals.getByRole('listitem')).toHaveCount(4)
    // Nothing has been written into the draft yet: the name is still what the author typed.
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')

    await page.getByRole('button', { name: 'Apply 4 changes' }).click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('PR Review Crew')

    // The wizard stays on step one; drafting fills the page in, it does not skip the questions.
    await expect(page.getByRole('heading', { name: 'What are you building?' })).toBeVisible()
  })
})

/**
 * What a slow model looks like (P9-08).
 *
 * The reported failure was "No answer within 120s" from a local model that was working, with a
 * spinner and no way to stop it. These drive an endpoint that answers in pieces, slowly, which
 * is what every endpoint does and what the fast stub above cannot show.
 */
test.describe('waiting for a slow model', () => {
  /** An endpoint that sends the answer a piece at a time, pausing between pieces. */
  async function trickle(page: Page, answer: unknown, pauseMs: number) {
    await page.addInitScript(
      ([key, settings, credential]) => {
        localStorage.setItem(key as string, settings as string)
        sessionStorage.setItem('ab:credentials:ai', credential as string)
      },
      [
        'ab:settings:ai',
        JSON.stringify({
          presetId: 'custom',
          baseUrl: 'https://slow.test/v1',
          model: 'stub',
          jsonSchema: true,
          viaProxy: false,
          extraHeaders: {},
          stream: true,
        }),
        'sk-stub-abcdefghijklmnop',
      ],
    )
    await page.route('https://slow.test/**', async (route) => {
      const content = JSON.stringify(answer)
      const size = Math.max(1, Math.ceil(content.length / 4))
      const parts = [0, 1, 2, 3].map((index) => content.slice(index * size, (index + 1) * size))
      // Playwright fulfils in one go, so the pause is before the body rather than between its
      // pieces. That is the half that matters here: the wait before anything arrives.
      await new Promise((resolve) => setTimeout(resolve, pauseMs))
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: parts
          .filter((part) => part !== '')
          .map(
            (delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`,
          )
          .concat('data: [DONE]\n\n')
          .join(''),
      })
    })
  }

  test('says what is happening instead of showing a spinner', async ({ page }) => {
    await trickle(page, BLUEPRINT_DRAFT, 1_500)
    await page.goto('/new')

    await page.getByLabel('Draft this with AI', { exact: true }).fill('A PR review crew.')
    await page.getByRole('button', { name: 'Draft', exact: true }).click()

    // While nothing has come back, it says so, and says why it might take a while.
    await expect(page.getByText(/Thinking…/)).toBeVisible()
    // Then the answer arrives and the count says how much of it.
    await expect(page.getByRole('list', { name: 'Proposed changes' })).toBeVisible()
  })

  test('can be stopped, and stopping is not a failure', async ({ page }) => {
    await trickle(page, BLUEPRINT_DRAFT, 20_000)
    await page.goto('/new')

    await page.getByLabel('Draft this with AI', { exact: true }).fill('A PR review crew.')
    await page.getByRole('button', { name: 'Draft', exact: true }).click()
    await expect(page.getByText(/Thinking…/)).toBeVisible()

    await page.getByRole('button', { name: 'Stop' }).click()

    // Back to where it started: no proposal, nothing reported, and it offers to try again.
    // The alert region is always in the document; what matters is that it stayed empty.
    await expect(page.getByRole('button', { name: 'Draft', exact: true })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveText('')
    await expect(page.getByRole('list', { name: 'Proposed changes' })).toHaveCount(0)
    await expect(page.getByText(/Thinking…/)).toHaveCount(0)
  })
})

/**
 * Fixing a finding from the list it appears in (P9-12).
 *
 * The path a user actually takes: break something, see the health bar report it, press the
 * control beside the finding, and get back a proposal that has to be accepted before anything
 * changes. Stubbed at the network boundary like everything else here, so the prompt, the
 * schema, the assembler and the review are all the real ones.
 */
test.describe('fixing a finding', () => {
  /** The description the finding says is missing, put back. */
  const FIXED_SKILL = {
    artifacts: [
      {
        kind: 'skill',
        artifact: {
          id: 'react-testing',
          name: 'React testing',
          description: 'Testing React components by behaviour rather than by implementation.',
          whenToUse: 'When adding or changing a component test.',
          body: '## Instructions\n\nQuery by role. Assert on what the user would see.',
        },
        note: 'Restored the description the finding said was missing.',
      },
    ],
    note: 'Added a one-line description so the harness can choose this skill.',
  }

  test('proposes a change from the finding, and applies nothing until it is accepted', async ({
    page,
  }) => {
    await stubEndpoint(page, FIXED_SKILL)
    await openStarter(page)

    // Make the finding rather than hoping the starter has one.
    await tree(page)
      .getByRole('button', { name: /^React testing/ })
      .click()
    await page.getByLabel('Description', { exact: true }).fill('')

    const warnings = page.getByRole('button', { name: /^[1-9]\d* warnings?$/ })
    await expect(warnings).toBeEnabled({ timeout: 10_000 })
    await warnings.click()

    const findings = page.getByRole('list', { name: 'warning findings' })
    await findings.getByRole('button', { name: 'Fix BP-DESC-001 with AI' }).first().click()

    const dialog = page.getByRole('dialog')
    // The instructions the model is given are on screen before it is asked, so what comes
    // back can be judged against what was asked for.
    await expect(dialog).toContainText('every harness chooses which skill to activate')

    await dialog.getByRole('button', { name: 'Fix it' }).click()
    await expect(dialog.getByRole('list', { name: 'Proposed changes' })).toBeVisible()

    // Still empty: a proposal is not a change.
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue('')

    await dialog.getByRole('button', { name: /Apply/ }).click()
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
      /Testing React components/,
    )
  })
})
