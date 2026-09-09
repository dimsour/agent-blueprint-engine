'use client'

/**
 * Renders the artifact's Markdown body the way a harness would show it. Raw HTML is not
 * enabled: a Blueprint can come from a shared ZIP or a git clone, so its body is untrusted
 * text.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownPreview({ body }: { body: string }) {
  if (body.trim().length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">This artifact has no body to preview.</p>
    )
  }

  return (
    <div className="prose-blueprint max-w-3xl p-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  )
}
