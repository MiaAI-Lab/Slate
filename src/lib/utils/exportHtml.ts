import { renderMarkdown } from '$lib/renderer/render'
import proseCss from './exportProse.css?inline'
import hljsLight from 'highlight.js/styles/github.css?inline'
import hljsDark from 'highlight.js/styles/github-dark.css?inline'

export function buildExportHTML(
  title: string,
  content: string,
  opts: { dark?: boolean } = {},
): string {
  const body = renderMarkdown(content)
  const hl = opts.dark ? hljsDark : hljsLight
  return `<!DOCTYPE html>
<html lang="en"${opts.dark ? ' class="dark"' : ''}>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${proseCss}</style>
<style>${hl}</style>
</head>
<body>
<article>${body}</article>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
