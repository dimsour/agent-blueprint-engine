import { readFile } from 'node:fs/promises'

import { expect, type Page, test } from '@playwright/test'
import JSZip from 'jszip'

/** What a downloaded archive actually holds, which is the only proof the screen was honest. */
async function pathsInZip(path: string | null): Promise<string[]> {
  if (!path) throw new Error('The download has no file behind it.')
  const zip = await JSZip.loadAsync(await readFile(path))
  return Object.keys(zip.files).filter((name) => !zip.files[name]?.dir)
}

/** Opens the React Expert starter and waits for the workspace to finish loading. */
async function openStarter(page: Page, label = 'React Expert') {
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(label) }).click()
  await page.waitForURL(/\/p\//)
  await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
}

/**
 * An artifact in the project tree. Scoped and anchored: each row also has an actions menu
 * labelled "Actions for <name>", and a row with findings is named "<name>, N findings".
 */
function artifact(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Blueprint artifacts' })
    .getByRole('button', { name: new RegExp(`^${name}(,|$)`) })
}

/** A report section in the tree. "Export" also names a button in the top bar. */
function report(page: Page, label: string) {
  return page
    .getByRole('navigation', { name: 'Blueprint artifacts' })
    .getByRole('button', { name: label, exact: true })
}

/**
 * A kind group in the tree. The Overview canvas lists the same counts, so this has to say
 * which of the two it means.
 */
function kindGroup(page: Page, label: string) {
  return page.getByRole('navigation', { name: 'Blueprint artifacts' }).getByRole('button', {
    name: label,
    exact: true,
  })
}

/** The page itself must never scroll sideways; panels scroll inside their own bounds. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('dashboard', () => {
  test('lists the starter blueprints and the ways to begin', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Design once')
    await expect(page.getByRole('link', { name: 'Create Blueprint' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import ZIP' })).toBeVisible()

    await expect(page.getByText('10 complete agent systems')).toBeVisible()
    await expect(page.getByRole('button', { name: /React Expert/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Full Software Engineering Team/ })).toBeVisible()
  })

  test('creating from a template opens the workspace with the blueprint loaded', async ({
    page,
  }) => {
    await openStarter(page)

    // The top bar names the project and the tree lists its artifacts.
    await expect(page.getByText('React Expert').first()).toBeVisible()
    await expect(kindGroup(page, 'Skills 4')).toBeVisible()
    await expect(kindGroup(page, 'Agents 1')).toBeVisible()

    // A clean starter reports no problems.
    await expect(page.getByText('No findings. This Blueprint is clean.')).toBeVisible()
  })

  test('hydrates without throwing away the server render', async ({ page }) => {
    // The folder button depends on a browser capability the server cannot see. Branching on
    // it directly made React discard the server HTML and re-render the whole page.
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.waitForTimeout(500)

    expect(errors).toEqual([])
  })

  test('a project reopens from the recent list', async ({ page }) => {
    await openStarter(page)
    await page.goto('/')

    const recent = page.getByRole('button', { name: /React Expert.*artifacts/s })
    await expect(recent).toBeVisible()
    await recent.click()
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
  })
})

test.describe('workspace layout', () => {
  test('renders at 1280x800 without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openStarter(page)
    await expectNoHorizontalScroll(page)
  })

  test('renders at 1024x700 without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await openStarter(page)
    await expectNoHorizontalScroll(page)
  })

  test('selecting an artifact shows it in the canvas and the inspector', async ({ page }) => {
    await openStarter(page)

    await artifact(page, 'React testing').click()
    await expect(artifact(page, 'React testing')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByText('Nothing to report for this artifact.')).toBeVisible()
  })

  test('the inspector says what uses the selected artifact and navigates there', async ({
    page,
  }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()

    const usedBy = page.getByRole('list', { name: 'Used by' })
    await expect(usedBy).toContainText('React Expert')

    await usedBy.getByText('React Expert').click()
    await expect(page.getByRole('heading', { name: 'React Expert' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Depends on' })).toContainText('React testing')
  })

  test('deleting an artifact names what it affects first', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('list', { name: 'Affected artifacts' })).toContainText(
      'React Expert',
    )

    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(artifact(page, 'React testing')).toHaveCount(0)
  })

  test('the delete dialog names every artifact that would be affected', async ({ page }) => {
    await openStarter(page)
    // Both workflows delegate to the agent, so both have to be listed: an impact list that
    // stopped at the first one would be worse than none, because it reads as complete.
    await artifact(page, 'React Expert').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    const affected = page.getByRole('dialog').getByRole('list', { name: 'Affected artifacts' })
    await expect(affected).toContainText('Build a Component')
    await expect(affected).toContainText('Review UI Changes')

    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(artifact(page, 'React Expert')).toBeVisible()
  })

  test('adding from a template shows the change before applying it', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByRole('button', { name: 'New from template' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name', { exact: true }).fill('Bundle Budget')
    await expect(dialog).toContainText('bundle-budget')
    await dialog.getByRole('button', { name: 'Add' }).click()

    await expect(artifact(page, 'Bundle Budget')).toBeVisible()
  })

  test('shows the health bar with the artifact count and the targets', async ({ page }) => {
    await openStarter(page)

    await expect(page.getByText(/\d+ artifacts/)).toBeVisible()
    // Each target says its status in words, not only in the colour of a dot, and the status
    // comes from the same report the score does.
    await expect(page.getByRole('button', { name: /^claude-code: / })).toBeVisible()
    await expect(page.getByRole('button', { name: /^codex: / })).toBeVisible()
    await expect(page.getByText(/Health\s*\d+/)).toBeVisible()
  })

  test('the health bar counts agree with the findings behind them', async ({ page }) => {
    await openStarter(page)

    // Three zeroes beside a score of 97 was the bug: the counts and the score have to be
    // read off one report, so a count that is not zero must open findings, and a count that
    // is zero must have none to open.
    const warnings = page.getByRole('button', { name: /^\d+ warnings$/ })
    const count = Number((await warnings.getAttribute('aria-label'))?.split(' ')[0] ?? '0')
    if (count === 0) {
      await expect(warnings).toBeDisabled()
      return
    }

    await warnings.click()
    await expect(
      page.getByRole('list', { name: 'warning findings' }).getByRole('listitem'),
    ).toHaveCount(count)
  })

  test('a reopened project reports what is wrong with it before anything is touched', async ({
    page,
  }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByLabel('Description', { exact: true }).fill('')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

    // The bug (P9-11): validation ran on the first keystroke, never on load, so a project
    // came back looking clean and only admitted the problem once it was edited again.
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()

    const warnings = page.getByRole('button', { name: /^[1-9]\d* warnings?$/ })
    await expect(warnings).toBeVisible()
    await warnings.click()
    await expect(page.getByRole('list', { name: 'warning findings' })).toContainText('BP-DESC-001')
  })

  test('editing an artifact saves it and survives a reload', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()

    const description = page.getByLabel('Description', { exact: true })
    await description.fill('Testing components by role and label.')

    // The change is unsaved, then autosave commits it without being asked.
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await artifact(page, 'React testing').click()
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
      'Testing components by role and label.',
    )
  })

  test('renaming an artifact updates the agent that uses it', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Accessibility').click()

    await page.getByLabel('Id', { exact: true }).fill('a11y')
    // The inspector offers "Rename…", which opens a dialog; this is the form's inline commit.
    await page.getByRole('button', { name: 'Rename', exact: true }).click()

    // The agent's skill picker now shows the new id as selected.
    await page.getByRole('button', { name: 'React Expert', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Accessibility', pressed: true })).toBeVisible()
    // And nothing broke: no dangling reference is reported.
    await expect(page.getByText('BP-REF-001')).toHaveCount(0)
  })

  test('an unknown project id explains itself instead of hanging', async ({ page }) => {
    await page.goto('/p/does-not-exist')
    await expect(page.getByRole('heading', { name: /could not be opened/ })).toBeVisible()
    await page.getByRole('link', { name: 'Back to all projects' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Design once')
  })
})

test.describe('overview graph', () => {
  test('draws the Blueprint and selects from it', async ({ page }) => {
    await openStarter(page)

    const graph = page.getByLabel('Blueprint overview graph', { exact: true })
    await expect(graph).toBeVisible()
    // One node per artifact, laid out and painted.
    await expect(page.locator('.react-flow__node')).toHaveCount(19)

    await page.locator('.react-flow__node', { hasText: 'React testing' }).click()
    await expect(page).toHaveURL(/id=react-testing/)
    await expect(page.getByRole('heading', { name: 'React testing' })).toBeVisible()
  })

  test('filtering by kind leaves a smaller graph', async ({ page }) => {
    await openStarter(page)
    await expect(page.locator('.react-flow__node')).toHaveCount(19)

    const filters = page.getByRole('group', { name: 'Filter by kind' })
    await filters.getByRole('button', { name: 'Skills' }).click()

    await expect(page.locator('.react-flow__node')).toHaveCount(15)
    await expect(filters.getByRole('button', { name: 'Skills' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('the list is still there for counting', async ({ page }) => {
    await openStarter(page)
    await page.getByRole('button', { name: 'Show the list' }).click()

    await expect(page.getByRole('list', { name: 'Artifacts by kind' })).toBeVisible()
  })
})

test.describe('workflow editor', () => {
  test('opens on the graph, and adds a step that survives a reload', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()

    // A workflow is a drawing, so it opens as one.
    await expect(page.getByRole('tab', { name: /Graph/ })).toHaveAttribute('data-state', 'active')
    const before = await page.locator('.react-flow__node').count()

    await page
      .getByRole('group', { name: 'Step palette' })
      .getByRole('button', {
        name: 'Verification',
      })
      .click()
    await expect(page.locator('.react-flow__node')).toHaveCount(before + 1)

    // The step panel opens on the new step, and names it.
    await expect(page.getByLabel('Label', { exact: true })).toHaveValue('Verification')
    await page.getByLabel('Label', { exact: true }).fill('Run the tests')

    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })
    await page.reload()
    await expect(page.locator('.react-flow__node')).toHaveCount(before + 1)
    await expect(page.locator('.react-flow__node', { hasText: 'Run the tests' })).toBeVisible()
  })

  test('a disconnected step is reported on the step itself', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()

    await page
      .getByRole('group', { name: 'Step palette' })
      .getByRole('button', { name: 'Review' })
      .click()

    // Nothing reaches it, which is exactly what BP-WF-010 is for.
    await expect(page.getByText('BP-WF-010').first()).toBeVisible({ timeout: 10_000 })
  })

  test('tidy lays the steps out without moving them again', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()

    await page.getByRole('button', { name: 'Tidy' }).click()
    await expect(page.getByText('Tidied the graph')).toBeVisible()

    const positions = async () =>
      page
        .locator('.react-flow__node')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform))
    const first = await positions()

    await page.getByRole('button', { name: 'Tidy' }).click()
    await expect(await positions()).toEqual(first)
  })

  test('inserts a template as a subgraph, twice, without the copies fusing', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()
    const before = await page.locator('.react-flow__node').count()

    await page.getByRole('button', { name: 'Insert a whole workflow' }).click()
    await page.getByRole('menuitem', { name: 'Code review' }).click()
    await expect(page.getByText(/Inserted Code review/).first()).toBeVisible()
    const once = await page.locator('.react-flow__node').count()
    expect(once).toBeGreaterThan(before)

    await page.getByRole('button', { name: 'Insert a whole workflow' }).click()
    await page.getByRole('menuitem', { name: 'Code review' }).click()
    const twice = await page.locator('.react-flow__node').count()

    // Two whole copies: the second insert adds exactly as many steps as the first, rather
    // than reusing ids that already exist.
    expect(twice - once).toBe(once - before)

    // And beside the first copy rather than on top of it. Superimposed steps look like one
    // step, which is how an insert that did nothing and an insert that worked look the same.
    const transforms = await page
      .locator('.react-flow__node')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform))
    expect(new Set(transforms).size).toBe(transforms.length)
  })

  test('Delete removes the selected step and the connections that reached it', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()

    const steps = page.locator('.react-flow__node')
    const connections = page.locator('.react-flow__edge')
    const stepsBefore = await steps.count()
    const connectionsBefore = await connections.count()
    expect(connectionsBefore).toBeGreaterThan(0)

    // One in the middle, so something is joined to it and the edges have to go too.
    await steps.nth(1).click()
    await expect(page.getByRole('complementary', { name: 'Step settings' })).toBeVisible()

    await page.keyboard.press('Delete')

    await expect(steps).toHaveCount(stepsBefore - 1)
    expect(await connections.count()).toBeLessThan(connectionsBefore)
    // The panel belongs to a step that no longer exists.
    await expect(page.getByRole('complementary', { name: 'Step settings' })).toBeHidden()

    // One press of undo, not two: the step and its connections went in a single change.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(steps).toHaveCount(stepsBefore)
    await expect(connections).toHaveCount(connectionsBefore)
  })

  test('typing in the step panel is not a delete', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()

    const steps = page.locator('.react-flow__node')
    const before = await steps.count()
    await steps.nth(1).click()

    const label = page.getByLabel('Label', { exact: true })
    await label.click()
    await label.press('End')
    await label.press('Backspace')
    await label.press('Delete')

    await expect(steps).toHaveCount(before)
  })

  test('a step keeps where it was dragged to, across a reload', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()

    const step = page.locator('.react-flow__node').first()
    const box = await step.boundingBox()
    if (!box) throw new Error('The first step has no box to drag.')
    const before = await step.evaluate((node) => (node as HTMLElement).style.transform)

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    // In steps, because React Flow starts a drag from movement rather than from the press.
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 90, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(() => step.evaluate((node) => (node as HTMLElement).style.transform))
      .not.toBe(before)
    const moved = await step.evaluate((node) => (node as HTMLElement).style.transform)

    // Positions are part of the workflow file, so a drag is an edit and has to be saved.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })
    await page.reload()
    await expect(page.locator('.react-flow__node').first()).toHaveAttribute(
      'style',
      new RegExp(moved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  })

  test('two steps are connected from the panel, with the kind chosen', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()
    const connections = page.getByText(/^\d+ connections$/)
    const before = Number((await connections.innerText()).split(' ')[0])

    // Dragging between handles is the mouse gesture and always draws a sequential edge. The
    // panel is the keyboard path, and the only place the kind is chosen while connecting.
    await page.locator('.react-flow__node', { hasText: 'Report the outcome' }).click()
    const panel = page.getByRole('complementary', { name: 'Step settings' })
    await panel.getByLabel('Kind of the next connection', { exact: true }).click()
    await page.getByRole('option', { name: 'fallback' }).click()

    await panel.getByRole('button', { name: 'Verify', exact: true }).click()

    await expect(connections).toHaveText(`${before + 1} connections`)
    const leadsTo = panel.getByRole('list', { name: 'Leads to' })
    await expect(leadsTo).toContainText('Verify')
    await expect(leadsTo).toContainText('fallback')

    // And the same step is not offered a second time, since the connection now exists.
    await expect(panel.getByRole('button', { name: 'Verify', exact: true })).toHaveCount(0)
  })

  test('the form is still there behind the graph', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()
    await page.getByRole('tab', { name: /Visual/ }).click()

    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Build a Component')
  })

  /**
   * A canvas sizes itself from its container, so a container that does not fill its pane
   * makes the graph clip its own last step and the step panel end mid-sentence — with the
   * empty half below still looking like canvas. Nothing throws, and no other assertion here
   * would notice, which is why this one measures.
   */
  test('the canvas fills the pane it was given', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()
    await expect(page.locator('.react-flow__node').first()).toBeVisible()

    const canvas = await page.locator('.react-flow').boundingBox()
    const pane = await page.locator('#workspace-editor').boundingBox()
    expect(canvas?.height ?? 0).toBeGreaterThan((pane?.height ?? 0) * 0.8)
  })
})

test.describe('addressable workspace', () => {
  test('selecting an artifact puts it in the address bar', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()

    await expect(page).toHaveURL(/view=skills&id=react-testing/)
  })

  test('a link to an artifact opens on that artifact', async ({ page }) => {
    await openStarter(page)
    const url = new URL(page.url())

    await page.goto(`${url.pathname}?view=skills&id=accessibility`)
    await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible()
    await expect(artifact(page, 'Accessibility')).toHaveAttribute('aria-current', 'true')
  })

  test('a reload comes back to the same artifact', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByRole('tab', { name: /Preview/ }).click()

    await page.reload()

    // The artifact returns; the tab does not, because a reload is a fresh look at it.
    await expect(page.getByRole('heading', { name: 'React testing' })).toBeVisible()
    await expect(artifact(page, 'React testing')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('tab', { name: /Visual/ })).toHaveAttribute('data-state', 'active')
  })

  test('Overview leaves the selection and shows the whole Blueprint', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await report(page, 'Overview').click()

    await expect(page.getByLabel('Blueprint overview graph', { exact: true })).toBeVisible()
    await expect(page.getByText('No findings. This Blueprint is clean.')).toBeVisible()
  })
})

test.describe('trust surfaces', () => {
  test('a finding in the health bar opens the artifact it is about', async ({ page }) => {
    await openStarter(page)
    // Make one, rather than hoping the starter has one.
    await artifact(page, 'React testing').click()
    await page.getByLabel('Description', { exact: true }).fill('')
    await report(page, 'Overview').click()

    const warnings = page.getByRole('button', { name: /warnings?$/ })
    await expect(warnings).toBeEnabled({ timeout: 10_000 })
    await warnings.click()

    const findings = page.getByRole('list', { name: 'warning findings' })
    await expect(findings).toBeVisible()
    await findings.getByRole('button').first().click()

    // The panel closed and the artifact is open.
    await expect(findings).toHaveCount(0)
    await expect(page).toHaveURL(/id=/)
  })

  test('a finding says how to fix it, not only what is wrong', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByLabel('Description', { exact: true }).fill('')
    await report(page, 'Overview').click()

    const warnings = page.getByRole('button', { name: /warnings?$/ })
    await expect(warnings).toBeEnabled({ timeout: 10_000 })
    await warnings.click()

    const findings = page.getByRole('list', { name: 'warning findings' })
    const help = findings.getByRole('button', { name: 'How to fix BP-DESC-001' }).first()
    await help.click()

    // What to do about it, and why it is worth doing — neither of which fits on the row.
    await expect(findings).toContainText('every harness chooses which skill to activate')
    // And it stays open to be read. Help that closes when focus moves is help for a mouse.
    await expect(help).toHaveAttribute('aria-expanded', 'true')
  })

  test('a workflow finding opens the step it names', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Build a Component').click()
    await page
      .getByRole('group', { name: 'Step palette' })
      .getByRole('button', { name: 'Review' })
      .click()
    await report(page, 'Overview').click()

    const warnings = page.getByRole('button', { name: /warnings?$/ })
    await expect(warnings).toBeEnabled({ timeout: 10_000 })
    await warnings.click()
    await page
      .getByRole('list', { name: 'warning findings' })
      .getByRole('button', { name: /BP-WF-010/ })
      .first()
      .click()

    // The graph opens with the step's own settings panel already showing.
    await expect(page.getByRole('complementary', { name: 'Step settings' })).toBeVisible()
    await expect(page.getByLabel('Label', { exact: true })).toHaveValue('Review')
  })

  test('the evaluation view explains the score', async ({ page }) => {
    await openStarter(page)
    await report(page, 'Evaluation').click()

    await expect(page).toHaveURL(/view=evaluation/)
    await expect(page.getByRole('list', { name: 'Dimension scores' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Requirement results' })).toBeVisible()
  })

  test('the compatibility view says what each harness cannot do', async ({ page }) => {
    await openStarter(page)
    await report(page, 'Compatibility').click()

    await expect(page).toHaveURL(/view=compatibility/)
    await page.getByRole('button', { name: 'Pi', exact: true }).click()

    // Pi cannot do memory natively, and the table says so.
    await expect(page.getByRole('table')).toContainText('Memory')
    await expect(page.getByRole('list', { name: 'Compatibility notes' })).toContainText('Pi')
  })

  test('the export view shows compiled files and downloads them with the source', async ({
    page,
  }) => {
    await openStarter(page)
    await report(page, 'Export').click()

    await expect(page).toHaveURL(/view=export/)
    await expect(page.getByRole('list', { name: 'Claude Code files' })).toContainText('CLAUDE.md')

    await page.getByRole('button', { name: 'CLAUDE.md' }).first().click()
    await expect(page.getByText('Nothing is blocking this export')).toHaveCount(0)

    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe('react-expert.zip')
  })
})

test.describe('export and import', () => {
  test('an exported archive imports back as the same Blueprint', async ({ page }) => {
    await openStarter(page)

    // Edit first, so the archive proves it holds the live Blueprint and not the starter.
    await artifact(page, 'React testing').click()
    await page.getByLabel('Description', { exact: true }).fill('Round tripped through a ZIP.')

    // The top bar's Export opens the export view, which is the one place files leave.
    await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page).toHaveURL(/view=export/)
    await expect(page.getByRole('list', { name: 'Source files' })).toContainText(
      'blueprint/blueprint.yaml',
    )

    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe('react-expert.zip')
    const archive = await download.path()

    // The archive holds the source project and the compiled output, which is the whole
    // claim the screen makes.
    const paths = await pathsInZip(archive)
    expect(paths.some((path) => path.startsWith('blueprint/'))).toBe(true)
    expect(paths.some((path) => path.startsWith('.claude/'))).toBe(true)
    expect(paths).toContain('CLAUDE.md')

    // Import it back. The dialog reports what it found before anything is stored.
    await page.goto('/')
    await page
      .getByLabel('Import a Blueprint archive or manifest', { exact: true })
      .setInputFiles(archive)

    const importDialog = page.getByRole('dialog')
    await expect(importDialog.getByRole('heading', { name: /React Expert/ })).toBeVisible()
    await expect(importDialog.getByText(/read cleanly/i)).toBeVisible()
    await importDialog.getByRole('button', { name: /Open project/ }).click()
    await page.waitForURL(/\/p\//)

    // Same artifacts, and the unsaved edit came along.
    await expect(kindGroup(page, 'Skills 4')).toBeVisible()
    await expect(kindGroup(page, 'Agents 1')).toBeVisible()
    await artifact(page, 'React testing').click()
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
      'Round tripped through a ZIP.',
    )
  })

  test('the export shortcut opens the same view', async ({ page }) => {
    await openStarter(page)
    await page.keyboard.press('ControlOrMeta+e')

    await expect(page).toHaveURL(/view=export/)
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible()
  })

  test('a file that is not a project says so instead of opening', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Import a Blueprint archive or manifest', { exact: true }).setInputFiles({
      name: 'notes.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('nope'),
    })

    await expect(page.getByText(/Could not read that file/)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('settings', () => {
  test('lists what this browser is holding, and can let it go', async ({ page }) => {
    await openStarter(page)
    await page.goto('/settings')

    await expect(page.getByRole('list', { name: 'Stored projects' })).toContainText('React Expert')

    await page.getByRole('button', { name: /Remove every local project/ }).click()
    await expect(page.getByText('Nothing stored yet.')).toBeVisible()

    await page.goto('/')
    await expect(page.getByText('Recent projects')).toHaveCount(0)
  })
})

test.describe('creating a project', () => {
  test('is one screen, and lands in the editor (P9-03)', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Create Blueprint' }).click()
    await page.waitForURL(/\/new/)

    // One question. The id follows the name until it is edited.
    await expect(page.getByRole('button', { name: /Create project/ })).toBeDisabled()
    await page.getByLabel('Name', { exact: true }).fill('Rust Review Crew')
    await expect(page.getByLabel('Id', { exact: true })).toHaveValue('rust-review-crew')
    await page
      .getByLabel('Description', { exact: true })
      .fill('Reviews Rust changes before they merge.')

    // Nothing between the question and the answer: no stepper, and nothing to press Next on.
    await expect(page.getByRole('navigation', { name: 'Wizard steps' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Next/ })).toHaveCount(0)

    await page.getByRole('button', { name: /Create project/ }).click()
    await page.waitForURL(/\/p\//)

    // The workspace opens on it: empty, and the place the artifacts are added from now on.
    await expect(page.getByRole('banner')).toContainText('Rust Review Crew')
    await expect(kindGroup(page, 'Agents 0')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toContainText('0 artifacts')

    // The defaults a new project keeps, because the wizard no longer asks.
    await expect(page.getByText('claude-code')).toBeVisible()
    await expect(page.getByText('codex')).toBeVisible()
  })

  test('a half-finished draft is offered again on the next visit', async ({ page }) => {
    await page.goto('/new')
    await page.getByLabel('Name', { exact: true }).fill('Half Finished')
    // The draft is written on a timer; give it room, then leave and come back.
    await page.waitForTimeout(1200)

    await page.goto('/')
    await page.goto('/new')

    await expect(page.getByText(/part way through/i)).toBeVisible()
    await page.getByRole('button', { name: /Pick it up/ }).click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Half Finished')
  })

  test('a new project survives a reload, and can be filled in from the editor', async ({
    page,
  }) => {
    await page.goto('/new')
    await page.getByLabel('Name', { exact: true }).fill('Minimal Crew')
    await page.getByRole('button', { name: /Create project/ }).click()
    await page.waitForURL(/\/p\//)

    // What the removed steps used to do, done where it is done better.
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog')
    await palette.getByRole('combobox').fill('Create Agent')
    await palette.getByRole('option', { name: /Create Agent/ }).click()
    await page.getByLabel('Name', { exact: true }).fill('Only Agent')

    // Autosave commits it; the badge is what says the write finished, not the click.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await expect(kindGroup(page, 'Agents 1')).toBeVisible()
    await expect(artifact(page, 'Only Agent')).toBeVisible()
  })
})

test.describe('command palette', () => {
  test('opens with the keyboard and creates a skill', async ({ page }) => {
    await openStarter(page)
    await page.keyboard.press('ControlOrMeta+k')

    const palette = page.getByRole('dialog')
    await expect(palette.getByRole('combobox')).toBeFocused()

    await palette.getByRole('combobox').fill('Create Skill')
    await palette.getByRole('option', { name: /Create Skill/ }).click()

    // The new skill is selected and its form is open, ready to be named.
    await expect(page.getByRole('tab', { name: /Visual/ })).toHaveAttribute('data-state', 'active')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('New skill')
    await expect(artifact(page, 'New skill')).toBeVisible()
  })

  test('opens from the top bar and jumps to an artifact', async ({ page }) => {
    await openStarter(page)
    await page.getByRole('button', { name: /Commands/ }).click()

    const palette = page.getByRole('dialog')
    await palette.getByRole('combobox').fill('accessibility')
    await palette.getByRole('option', { name: /Accessibility/ }).click()

    await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible()
  })

  test('closes on Escape without doing anything', async ({ page }) => {
    await openStarter(page)
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the preview shortcut opens the preview tab', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.keyboard.press('ControlOrMeta+p')

    await expect(page.getByRole('tab', { name: /Preview/ })).toHaveAttribute('data-state', 'active')
    await expect(page.getByRole('heading', { name: 'React testing', level: 1 })).toBeVisible()
  })
})

test.describe('source editor', () => {
  test('shows the project file and applies an edit to the visual form', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByRole('tab', { name: /Markdown/ }).click()

    // The tab shows the real file, at its real path.
    await expect(page.getByText('blueprint/skills/react-testing/SKILL.md')).toBeVisible()
    const editor = page.locator('.cm-content')
    await expect(editor).toContainText('name: React testing')

    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type(
      '---\nname: Typed In Editor\ndescription: Written through the editor.\n---\n\n# Typed\n\n## Instructions\n\nDo the thing.\n\n## Verification\n\nCheck it.\n',
    )

    await page.getByRole('tab', { name: /Visual/ }).click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Typed In Editor')
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
      'Written through the editor.',
    )

    // The tree follows the rename of the display name.
    await expect(artifact(page, 'Typed In Editor')).toBeVisible()
  })

  test('blocks the other tabs while the file does not parse, without losing the text', async ({
    page,
  }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByRole('tab', { name: /Markdown/ }).click()

    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('---\nname: [unclosed\n---\n\nBody')

    // Next's route announcer also carries role="alert", so the editor's own alert is singled out.
    await expect(page.getByRole('alert').filter({ hasText: 'Not applied' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Visual/ })).toBeDisabled()
    await expect(editor).toContainText('[unclosed')

    // The Blueprint kept its last valid value, so the tree still shows the old name.
    await expect(artifact(page, 'React testing')).toBeVisible()
  })

  test('renders the body in the preview tab', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'React testing').click()
    await page.getByRole('tab', { name: /Preview/ }).click()

    await expect(page.getByRole('heading', { name: 'React testing', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible()
  })

  test('offers YAML rather than Markdown for a gate', async ({ page }) => {
    await openStarter(page)
    await artifact(page, 'Tests must pass').click()

    await expect(page.getByRole('tab', { name: /YAML/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Preview/ })).toHaveCount(0)

    await page.getByRole('tab', { name: /YAML/ }).click()
    await expect(page.locator('.cm-content')).toContainText('criteria:')
  })
})
