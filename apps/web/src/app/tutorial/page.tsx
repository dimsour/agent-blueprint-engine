import { Tutorial } from '@/components/tutorial/tutorial'

export const metadata = { title: 'How it works · Agent Blueprint' }

/** Static: it reads no project, because the reader it is for has not made one yet. */
export default function TutorialPage() {
  return <Tutorial />
}
