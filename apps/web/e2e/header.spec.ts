/**
 * The header surfaces: the mark, and the way back (P9-01, P9-02).
 *
 * Two claims are worth a browser. The first is that the logo is really there — in the tab, and
 * in each of the four headers. `accessibility.spec.ts` would catch an image with no accessible
 * name; it would not catch an image that never arrived.
 *
 * The second is the one that matters. A back control that leaves the app is worse than no back
 * control at all, so both halves of the decision are asserted: `/settings` reached out of a
 * project goes back to that project, and `/settings` opened cold — a bookmark, a pasted link,
 * a fresh tab — goes to `/` rather than to whatever the tab was showing before.
 */
import { expect, type Page, test } from '@playwright/test'

/** The header's own back control. It is a link; the wizard's step "Back" is a button. */
function backControl(page: Page) {
  return page.getByRole('banner').getByRole('link', { name: 'Back' })
}

test.describe('the mark', () => {
  test('is the favicon the browser asks for', async ({ page }) => {
    await page.goto('/')

    // Next serves `src/app/icon.png` at a route of its own and links it from the document.
    const href = await page.locator('link[rel="icon"]').first().getAttribute('href')
    expect(href).toContain('/icon.png')

    const response = await page.request.get(href ?? '')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
  })

  test('is the lockup on the dashboard, resized on the way', async ({ page }) => {
    await page.goto('/')

    const lockup = page.getByRole('img', { name: 'Agent Blueprint' })
    await expect(lockup).toBeVisible()
    // Through the optimizer rather than as the 680 KB original: the point of `next/image`.
    expect(await lockup.getAttribute('src')).toContain('/_next/image')
  })

  test('is the mark alone everywhere the wording already names the product', async ({ page }) => {
    for (const [route, title] of [
      ['/settings', 'Settings'],
      ['/new', 'New Blueprint'],
    ] as const) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

      const mark = page.getByRole('banner').locator('img').first()
      await expect(mark).toBeVisible()
      // Decorative beside a labelled link, so it is hidden from assistive technology rather
      // than read out twice.
      expect(await mark.getAttribute('alt')).toBe('')
    }

    await page.goto('/')
    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    await expect(
      page.getByRole('link', { name: 'Back to all projects' }).locator('img'),
    ).toBeVisible()
  })
})

test.describe('getting back', () => {
  test('from settings opened directly, lands on the dashboard', async ({ page }) => {
    // A tab with history behind it that is not ours. This is the case the control has to get
    // right: `history.back()` here would leave the app entirely.
    await page.route('https://elsewhere.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>somewhere else</p>' }),
    )
    await page.goto('https://elsewhere.test/')
    await page.goto('/settings')

    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await backControl(page).click()

    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Design once')
  })

  test('from settings opened out of a project, returns to that project', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
    const projectId = /\/p\/([^/?]+)/.exec(page.url())?.[1]
    expect(projectId).toBeTruthy()

    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

    await backControl(page).click()

    await expect(page).toHaveURL(new RegExp(`/p/${projectId}`))
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
  })

  test('from the wizard opened directly, lands on the dashboard', async ({ page }) => {
    await page.goto('/new')
    await expect(page.getByRole('heading', { level: 1, name: 'New Blueprint' })).toBeVisible()

    // The step navigation has a "Back" of its own. They are a button and a link, and only one
    // of them leaves the route.
    await backControl(page).click()
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  })

  test('the logo goes home from every route that is not home', async ({ page }) => {
    for (const route of ['/settings', '/new']) {
      await page.goto(route)
      await page.getByRole('link', { name: 'Agent Blueprint home' }).click()
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Design once')
    }

    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    await page.getByRole('link', { name: 'Back to all projects' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Design once')
  })
})

/**
 * The tutorial (P9-06).
 *
 * It exists for somebody who has not made a project, so the checks that matter are that they
 * can find it from where they actually are, that it works with nothing stored, and that its
 * pictures are the generated ones rather than something that drifted.
 */
test.describe('the tutorial', () => {
  test('is reachable from the dashboard, the other routes and the workspace', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/tutorial$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('How it works')

    // It uses the same header, so it must not offer a link to itself.
    await expect(page.getByRole('link', { name: 'How it works' })).toHaveCount(0)

    await page.goto('/settings')
    await page.getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/tutorial$/)

    await page.goto('/')
    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    await page.getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/tutorial$/)
  })

  test('walks the whole story, with a picture of each step', async ({ page }) => {
    await page.goto('/tutorial')

    // Two halves: the loop, then the parts (P9-38).
    await expect(page.getByRole('heading', { level: 2, name: 'The loop' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'The parts' })).toBeVisible()

    // Every beat of the docs/00 story, in order.
    const steps = ['Start', 'Describe', 'Review', 'See the graph', 'Connect', 'Improve']
    for (const step of steps) {
      await expect(page.getByRole('heading', { level: 3, name: step })).toBeVisible()
    }
    for (const step of ['Validate', 'Save', 'Compile', 'Push', 'Use it']) {
      await expect(page.getByRole('heading', { level: 3, name: step })).toBeVisible()
    }

    // Every concept of the docs/00 glossary that is an artifact, plus the ideas that cut
    // across them, each with what to press and what the harness gets.
    const parts = ['Agents', 'Permissions', 'Skills', 'Workflows', 'Hooks', 'Gates']
    for (const part of [...parts, 'The assistant', 'GitHub']) {
      await expect(page.getByRole('heading', { level: 3, name: part })).toBeVisible()
    }
    await expect(page.getByRole('table').first()).toContainText('Claude Code')

    // Served through the optimizer, from the generated set, and every one of them described.
    const shots = page.getByRole('main').getByRole('img')
    const count = await shots.count()
    expect(count).toBeGreaterThan(10)
    for (let index = 0; index < count; index += 1) {
      const shot = shots.nth(index)
      expect(await shot.getAttribute('src')).toContain('/_next/image')
      expect((await shot.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(20)
    }
  })

  // The contents travel with the reader (P9-39): a sidebar beside the text on a wide
  // screen, a menu at the top on a narrow one, and both say which section is on screen.
  test('keeps the contents in reach and marks the section on screen', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/tutorial$/)
    const contents = page.getByRole('complementary', { name: 'Contents' })
    await expect(contents).toBeVisible()
    expect(await contents.getByRole('link').count()).toBeGreaterThanOrEqual(24)

    await contents.getByRole('link', { name: /Hooks/ }).click()
    await expect(page).toHaveURL(/#hook$/)
    await expect(page.getByRole('heading', { level: 3, name: 'Hooks' })).toBeInViewport()
    // Still beside the text after the jump, with the section it landed on marked.
    await expect(contents).toBeInViewport()
    await expect(contents.getByRole('link', { name: /Hooks/ })).toHaveAttribute(
      'aria-current',
      'location',
    )

    // Jumping around the page leaves no history behind: Back is the page the reader came
    // from, not the last section they looked at.
    await contents.getByRole('link', { name: /Gates/ }).click()
    await expect(page).toHaveURL(/#gate$/)
    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/tutorial')

    await page.setViewportSize({ width: 800, height: 900 })
    await expect(contents).toBeHidden()
    const jump = page.getByLabel('Jump to')
    await expect(jump).toBeInViewport()
    await jump.selectOption('gate')
    await expect(page.getByRole('heading', { level: 3, name: 'Gates' })).toBeInViewport()
    await expect(jump).toBeInViewport()
    await expect(jump).toHaveValue('gate')
  })

  test('works with nothing stored, which is who it is for', async ({ page }) => {
    await page.goto('/tutorial')
    await page.evaluate(() => {
      localStorage.clear()
      return indexedDB
        .databases?.()
        .then((all) => Promise.all(all.map((db) => db.name && indexedDB.deleteDatabase(db.name))))
    })
    await page.reload()

    await expect(page.getByRole('heading', { level: 3, name: 'Start' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('img').first()).toBeVisible()
  })
})
