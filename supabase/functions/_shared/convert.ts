import { extractText, getDocumentProxy } from 'npm:unpdf'
import mammoth from 'npm:mammoth'
import * as XLSX from 'npm:xlsx'
import { unzipSync } from 'npm:fflate'
import { Buffer } from 'node:buffer'

export interface ConvertResult {
  markdown: string
  page_count: number
  engine: string
  scanned?: boolean
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function detectType(name: string, mime: string): string {
  const ext = (name || '').split('.').pop()?.toLowerCase() || ''
  if (ext) return ext
  const m = (mime || '').toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('word')) return 'docx'
  if (m.includes('sheet') || m.includes('excel')) return 'xlsx'
  if (m.includes('presentation')) return 'pptx'
  if (m.includes('html')) return 'html'
  if (m.startsWith('text/')) return 'txt'
  return 'etc'
}

function isOle(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

async function fromPdf(bytes: Uint8Array): Promise<ConvertResult> {
  const pdf = await getDocumentProxy(bytes)
  const { totalPages, text } = await extractText(pdf, { mergePages: false })
  const pages = Array.isArray(text) ? text : [text]
  const markdown = pages.map((t, i) => `[page ${i + 1}]\n\n${String(t).trim()}`).join('\n\n')
  const scanned = totalPages > 0 && pages.every((t) => !String(t).trim())
  return { markdown, page_count: totalPages, engine: 'unpdf', scanned }
}

async function fromDocx(bytes: Uint8Array): Promise<ConvertResult> {
  const { value } = await mammoth.convertToMarkdown({ buffer: Buffer.from(bytes) })
  return { markdown: value || '', page_count: 0, engine: 'mammoth' }
}

function sheetToMarkdown(rows: unknown[][]): string {
  const clean = rows
    .filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ''))
    .map((r) => r.map((c) => (c == null ? '' : String(c))))
  if (!clean.length) return ''
  const cols = Math.max(...clean.map((r) => r.length))
  const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => r[i] || '')
  const header = pad(clean[0]).map((c) => c.replace(/\|/g, '\\|'))
  const lines = ['| ' + header.join(' | ') + ' |', '| ' + header.map(() => '---').join(' | ') + ' |']
  clean.slice(1).forEach((r) => lines.push('| ' + pad(r).map((c) => c.replace(/\|/g, '\\|')).join(' | ') + ' |'))
  return lines.join('\n')
}

function fromSpreadsheet(bytes: Uint8Array): ConvertResult {
  const wb = XLSX.read(bytes, { type: 'array' })
  const parts: string[] = []
  let page = 0
  wb.SheetNames.forEach((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' }) as unknown[][]
    const table = sheetToMarkdown(rows)
    page += 1
    parts.push(`[page ${page}]\n\n## ${name}\n\n${table}`)
  })
  return { markdown: parts.join('\n\n'), page_count: page, engine: 'xlsx' }
}

async function fromPptx(bytes: Uint8Array): Promise<ConvertResult> {
  const files = unzipSync(bytes)
  const slides: { n: number; xml: Uint8Array }[] = []
  for (const name of Object.keys(files)) {
    const m = name.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (m) slides.push({ n: parseInt(m[1]), xml: files[name] })
  }
  slides.sort((a, b) => a.n - b.n)
  const markdown = slides.map((s, i) => {
    const xml = decode(s.xml)
    const texts = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((mm) => mm[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim())
      .filter(Boolean)
    return `[page ${i + 1}]\n\n## 슬라이드 ${i + 1}\n\n${texts.join('\n\n')}`
  }).join('\n\n')
  return { markdown, page_count: slides.length, engine: 'pptx-xml' }
}

function fromHtml(bytes: Uint8Array): ConvertResult {
  const html = decode(bytes)
  const markdown = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, inner: string) => '\n' + '#'.repeat(parseInt(lvl)) + ' ' + inner.replace(/<[^>]+>/g, '').trim() + '\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner: string) => '- ' + inner.replace(/<[^>]+>/g, '').trim() + '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { markdown, page_count: 0, engine: 'html' }
}

export async function convertDocument(bytes: Uint8Array, name: string, mime: string): Promise<ConvertResult> {
  const type = detectType(name, mime)
  if (['doc', 'ppt', 'docx', 'pptx'].includes(type) && isOle(bytes)) {
    const label = (type === 'doc' || type === 'docx') ? 'Word(.doc)' : 'PowerPoint(.ppt)'
    throw new Error(`구형 ${label} 형식은 지원되지 않습니다. .docx/.pptx로 저장한 뒤 다시 시도하세요.`)
  }
  switch (type) {
    case 'pdf':
      return await fromPdf(bytes)
    case 'docx':
      return await fromDocx(bytes)
    case 'doc':
      return await fromDocx(bytes)
    case 'xlsx':
    case 'xls':
    case 'csv':
      return fromSpreadsheet(bytes)
    case 'pptx':
    case 'ppt':
      return await fromPptx(bytes)
    case 'html':
    case 'htm':
      return fromHtml(bytes)
    case 'txt':
    case 'md':
    case 'markdown':
      return { markdown: decode(bytes), page_count: 0, engine: 'text' }
    default:
      return { markdown: decode(bytes), page_count: 0, engine: 'text' }
  }
}
