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

    // Every beat of the docs/00 story, in order.
    const steps = ['Start', 'Describe', 'Review', 'See the graph', 'Connect', 'Improve']
    for (const step of steps) {
      await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible()
    }
    for (const step of ['Validate', 'Save', 'Compile', 'Push', 'Use it']) {
      await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible()
    }

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

  test('works with nothing stored, which is who it is for', async ({ page }) => {
    await page.goto('/tutorial')
    await page.evaluate(() => {
      localStorage.clear()
      return indexedDB
        .databases?.()
        .then((all) => Promise.all(all.map((db) => db.name && indexedDB.deleteDatabase(db.name))))
    })
    await page.reload()

    await expect(page.getByRole('heading', { level: 2, name: 'Start' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('img').first()).toBeVisible()
  })
})
