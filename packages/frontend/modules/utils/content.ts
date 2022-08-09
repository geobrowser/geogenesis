export function extractMetadata(markdown: string) {
  const titleMatch = markdown.match(/^#\s+(.*)/)

  if (!titleMatch) return {}

  const title = titleMatch[1]

  const body = markdown
    // Remove the title
    .slice(titleMatch[0].length)
    .trim()

  return { title, summary: ellipsize(body, 256) }
}

export function ellipsize(content: string, length: number) {
  let summary = content
    // Truncate if needed
    .slice(0, 256)
    // Remove excess whitespace
    .trim()

  if (summary.length === 256) {
    summary += '...'
  }

  return summary
}

export function getReadingTime(content: string) {
  return Math.ceil(content.split(' ').length / 250) // minutes
}
