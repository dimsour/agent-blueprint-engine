import { Wizard } from '@/components/wizard/wizard'

export const metadata = { title: 'New Blueprint' }

/** The draft lives in the browser for the whole flow; nothing is written until Create. */
export default function NewBlueprintPage() {
  return <Wizard />
}
