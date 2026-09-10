import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@playwright/test'

/**
 * Cuts the supplied artwork into the assets the headers use.
 *
 * The brand arrives as one square file: a mark above a wordmark. A 44px top bar needs the mark
 * alone, and a hero needs the lockup, so both are cut from the source rather than approximated
 * with a CSS crop that breaks the moment the artwork changes.
 *
 *   pnpm --filter web logo
 *
 * Not part of `test:e2e`: it writes files into the repository, which a test run should not do.
 * Re-run it when `brand/agent-blueprint.png` is replaced, and check the measured bounds still hold — they
 * come from the artwork's own alpha channel, printed below.
 */
test('logo-assets', async ({ page }) => {
  const src = readFileSync(join(process.cwd(), 'brand/agent-blueprint.png')).toString('base64')
  mkdirSync(join(process.cwd(), 'public'), { recursive: true })

  // Measured from the artwork's own alpha channel, not eyeballed: the mark occupies
  // x 278-957, y 143-703, and the wordmark sits below it from y 734.
  const shots = [
    // The favicon is the mark, at the filename the App Router reads.
    { to: 'src/app/icon.png', x: 278, y: 143, w: 680, h: 561, out: 256, pad: 8 },
    { to: 'public/logo-mark.png', x: 278, y: 143, w: 680, h: 561, out: 256, pad: 8 },
    { to: 'public/logo-lockup.png', x: 137, y: 143, w: 987, h: 1006, out: 640, pad: 0 },
  ]

  for (const shot of shots) {
    const scale = (shot.out - shot.pad * 2) / Math.max(shot.w, shot.h)
    const boxW = shot.w * scale
    const boxH = shot.h * scale
    await page.setViewportSize({ width: shot.out, height: shot.out })
    await page.setContent(
      `<body style="margin:0;background:transparent">
         <div style="width:${shot.out}px;height:${shot.out}px;display:flex;align-items:center;justify-content:center">
           <div style="width:${boxW}px;height:${boxH}px;overflow:hidden;position:relative">
             <img src="data:image/png;base64,${src}"
                  style="position:absolute;width:${1254 * scale}px;height:${1254 * scale}px;
                         left:${-shot.x * scale}px;top:${-shot.y * scale}px" />
           </div>
         </div>
       </body>`,
    )
    await page.screenshot({
      path: join(process.cwd(), shot.to),
      omitBackground: true,
    })
  }
})
