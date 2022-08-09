export function extractMetadata(markdown: string) {
  const titleMatch = markdown.match(/^#\s+(.*)/)

  if (!titleMatch) return {}

  const title = titleMatch[1]

  const body = markdown
    // Remove the title
    .slice(titleMatch[0].length)
    .trim()

  let summary = body
    // Truncate if needed
    .slice(0, 256)
    // Remove excess whitespace
    .trim()

  if (summary.length === 256) {
    summary += '...'
  }

  return { title, summary }
}
