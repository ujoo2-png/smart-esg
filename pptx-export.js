const PptxExport = {
  _libPromise: null,
  _CDN: 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',

  _load() {
    if (typeof window !== 'undefined' && window.PptxGenJS) return Promise.resolve(window.PptxGenJS)
    if (this._libPromise) return this._libPromise
    this._libPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new Error('브라우저 환경이 아닙니다.'))
      const s = document.createElement('script')
      s.src = this._CDN
      s.onload = () => { window.PptxGenJS ? resolve(window.PptxGenJS) : reject(new Error('PptxGenJS 로드 실패')) }
      s.onerror = () => { this._libPromise = null; reject(new Error('PptxGenJS 로드 실패 (네트워크)')) }
      document.head.appendChild(s)
    })
    return this._libPromise
  },

  _chunk(text, maxLen) {
    const lines = String(text || '').split('\n')
    const out = []
    let buf = ''
    for (const line of lines) {
      if (buf && (buf.length + line.length + 1) > maxLen) { out.push(buf); buf = '' }
      if (line.length > maxLen) {
        for (let i = 0; i < line.length; i += maxLen) out.push(line.slice(i, i + maxLen))
        continue
      }
      buf = buf ? buf + '\n' + line : line
    }
    if (buf) out.push(buf)
    return out.length ? out : ['']
  },

  _safeName(name, version) {
    const base = String(name || 'report').replace(/[\\/:*?"<>|]/g, '_').trim() || 'report'
    return base + '_v' + (version || 1) + '.pptx'
  },

  async export(doc, sections, meta = {}) {
    const PptxGenJS = await this._load()
    const pptx = new PptxGenJS()
    const Shape = (PptxGenJS.ShapeType || pptx.ShapeType)
    const NAVY = '1E3A5F', GREEN = '059669', TEXT = '1F2937', MUTED = '6B7280', SOFT = 'F8FAFC'
    const layout = { w: 10, h: 7.5 }
    pptx.defineLayout({ name: 'RD16x9', width: layout.w, height: layout.h })
    pptx.layout = 'RD16x9'

    const title = doc.title || '(제목 없음)'
    const version = meta.version || doc.version || 1
    const dateStr = meta.date || new Date().toLocaleDateString('ko-KR')

    const cover = pptx.addSlide()
    cover.background = { color: 'FFFFFF' }
    cover.addShape(PptxGenJS.ShapeType.rect, { x: 0, y: 0, w: layout.w, h: 2.9, fill: { color: NAVY } })
    cover.addShape(PptxGenJS.ShapeType.rect, { x: 0, y: 2.9, w: layout.w, h: 0.12, fill: { color: GREEN } })
    cover.addText(title, { x: 0.6, y: 1.0, w: layout.w - 1.2, h: 1.2, fontSize: 30, bold: true, color: 'FFFFFF', valign: 'middle' })
    cover.addText('지속가능경영보고서', { x: 0.6, y: 2.2, w: layout.w - 1.2, h: 0.5, fontSize: 14, color: 'D6E0EC' })
    cover.addText('버전 v' + version + '  ·  ' + dateStr + (meta.author ? '  ·  ' + meta.author : ''), { x: 0.6, y: 3.4, w: layout.w - 1.2, h: 0.5, fontSize: 13, color: MUTED })

    if (sections.length) {
      const toc = pptx.addSlide()
      toc.addShape(PptxGenJS.ShapeType.rect, { x: 0, y: 0, w: layout.w, h: 0.12, fill: { color: GREEN } })
      toc.addText('목차', { x: 0.6, y: 0.4, w: layout.w - 1.2, h: 0.7, fontSize: 22, bold: true, color: NAVY })
      toc.addText(sections.map((s, i) => ({ text: (i + 1) + '. ' + (s.title || '(제목 없음)') + '\n', options: { fontSize: 14, color: TEXT, breakLine: true } })),
        { x: 0.8, y: 1.4, w: layout.w - 1.6, h: layout.h - 2.0, valign: 'top' })
    }

    sections.forEach(s => {
      const chunks = this._chunk((s.content || '').trim() || '(내용 없음)', 900)
      chunks.forEach((chunk, ci) => {
        const slide = pptx.addSlide()
        slide.background = { color: 'FFFFFF' }
        slide.addShape(PptxGenJS.ShapeType.rect, { x: 0, y: 0, w: layout.w, h: 0.12, fill: { color: GREEN } })
        slide.addShape(PptxGenJS.ShapeType.rect, { x: 0, y: 0.12, w: 0.14, h: layout.h - 0.12, fill: { color: SOFT } })
        const head = (s.title || '(제목 없음)') + (ci > 0 ? ' (계속)' : '')
        slide.addText(head, { x: 0.5, y: 0.4, w: layout.w - 1.0, h: 0.7, fontSize: 20, bold: true, color: NAVY })
        slide.addText(chunk, { x: 0.55, y: 1.25, w: layout.w - 1.1, h: layout.h - 1.9, fontSize: 12, color: TEXT, valign: 'top', lineSpacingMultiple: 1.35 })
        slide.addText('v' + version + '  ·  ' + (meta.page ? '' : '') + (ci + 1) + '/' + chunks.length,
          { x: layout.w - 1.7, y: layout.h - 0.45, w: 1.2, h: 0.3, fontSize: 9, color: MUTED, align: 'right' })
      })
    })

    const fileName = meta.fileName || this._safeName(title, version)
    await pptx.writeFile({ fileName })
    return fileName
  }
}
