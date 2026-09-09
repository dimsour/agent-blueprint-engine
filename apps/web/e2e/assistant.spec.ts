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
  await page.route('https://stub.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'stub',
        choices: [{ message: { role: 'assistant', content: JSON.stringify(answer) } }],
      }),
    }),
  )
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
      .getByLabel('What happened')
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
      .getByLabel('Draft this with AI')
      .fill('A crew that reviews pull requests and blocks anything unverified.')
    await page.getByRole('button', { name: 'Draft', exact: true }).click()

    const proposals = page.getByRole('list', { name: 'Proposed changes' })
    await expect(proposals.getByRole('listitem')).toHaveCount(4)
    // Nothing has been written into the draft yet: the name is still what the author typed.
    await expect(page.getByLabel('Name')).toHaveValue('')

    await page.getByRole('button', { name: 'Apply 4 changes' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('PR Review Crew')

    // The wizard stays on step one; drafting fills the page in, it does not skip the questions.
    await expect(page.getByRole('heading', { name: 'What are you building?' })).toBeVisible()
  })
})
