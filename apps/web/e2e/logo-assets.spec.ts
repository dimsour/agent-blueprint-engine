import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from '@playwright/test'

/**
 * Cuts the supplied artwork into the assets the headers use.
 *
 * The brand arrives as one square file: a mark above a wordmark. A 44px top bar needs the mark
 * alone and a hero needs the lockup, so both are cut from the source rather than approximated
 * with a CSS crop, which would have to be re-tuned by eye the moment the artwork changes.
 *
 *   pnpm --filter web logo
 *
 * Not part of `test:e2e`: it writes files into the repository, which a test run should not do.
 * Re-run it when `brand/agent-blueprint.png` is replaced, and re-measure the bounds below.
 *
 * Every cut but the favicon is tight to its subject, so each file carries its own aspect ratio
 * and `next/image` reads it from the static import. Only the favicon is padded to a square,
 * because that is what a tab icon is.
 */

/** The source, and what is where inside it — measured from its own alpha channel. */
const SOURCE = { file: 'brand/agent-blueprint.png', size: 1254 }
const MARK = { x: 278, y: 143, w: 680, h: 561 }
const LOCKUP = { x: 137, y: 143, w: 987, h: 1006 }

interface Cut {
  to: string
  from: { x: number; y: number; w: number; h: number }
  /** Output width in pixels; the height follows the subject unless `square`. */
  width: number
  /** Pads the cut into a square canvas, for the one asset that has to be one. */
  square?: boolean
}

const CUTS: Cut[] = [
  // The favicon, at the filename the App Router reads.
  { to: 'src/app/icon.png', from: MARK, width: 256, square: true },
  { to: 'src/assets/logo-mark.png', from: MARK, width: 320 },
  { to: 'src/assets/logo-lockup.png', from: LOCKUP, width: 640 },
]

test('logo-assets', async ({ page }) => {
  const source = readFileSync(join(process.cwd(), SOURCE.file)).toString('base64')

  for (const cut of CUTS) {
    // A square canvas has to hold the whole subject, so it is scaled by its longer side and
    // the padding falls out of the difference. A tight one is scaled by its width.
    const inset = cut.square ? 8 : 0
    const scale = cut.square
      ? (cut.width - inset * 2) / Math.max(cut.from.w, cut.from.h)
      : cut.width / cut.from.w
    const boxW = Math.round(cut.from.w * scale)
    const boxH = Math.round(cut.from.h * scale)

    await page.setViewportSize({
      width: cut.square ? cut.width : boxW,
      height: cut.square ? cut.width : boxH,
    })
    await page.setContent(
      `<body style="margin:0;background:transparent">
         <div style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center">
           <div style="width:${boxW}px;height:${boxH}px;overflow:hidden;position:relative">
             <img src="data:image/png;base64,${source}"
                  style="position:absolute;width:${SOURCE.size * scale}px;height:${SOURCE.size * scale}px;
                         left:${-cut.from.x * scale}px;top:${-cut.from.y * scale}px" />
           </div>
         </div>
       </body>`,
    )
    const path = join(process.cwd(), cut.to)
    mkdirSync(dirname(path), { recursive: true })
    await page.screenshot({ path, omitBackground: true })
  }
})
