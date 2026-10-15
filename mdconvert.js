const MdConvert = {
  _PDFJS_BASES: [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build'
  ],
  _pdfjsPromise: null,
  _remoteDown: false,

  _fnUrl() {
    const base = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url) || ''
    return base.replace(/\/$/, '') + '/functions/v1/convert'
  },

  async _authHeader() {
    let token = (typeof SUPABASE_CONFIG !== 'undefined' && (SUPABASE_CONFIG.jwtKey || SUPABASE_CONFIG.anonKey)) || ''
    try {
      const sb = (typeof getSupabase === 'function') ? getSupabase() : null
      const s = sb ? await sb.auth.getSession() : null
      if (s?.data?.session?.access_token) token = s.data.session.access_token
    } catch (e) {}
    return 'Bearer ' + token
  },

  isTextType(mime, name) {
    const m = (mime || '').toLowerCase()
    const n = (name || '').toLowerCase()
    return m.startsWith('text/') || /\.(txt|md|markdown|csv|json)$/.test(n)
  },

  isPdfType(mime, name) {
    const m = (mime || '').toLowerCase()
    const n = (name || '').toLowerCase()
    return m === 'application/pdf' || /\.pdf$/.test(n)
  },

  _loadPdfJs() {
    if (typeof window !== 'undefined' && window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
    if (this._pdfjsPromise) return this._pdfjsPromise
    this._pdfjsPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new Error('브라우저 환경이 아닙니다.'))
      let i = 0
      const tryNext = () => {
        if (i >= this._PDFJS_BASES.length) { this._pdfjsPromise = null; return reject(new Error('pdf.js 로드에 실패했습니다. (네트워크)')) }
        const base = this._PDFJS_BASES[i++]
        const s = document.createElement('script')
        s.src = base + '/pdf.min.js'
        s.onload = () => {
          const lib = window.pdfjsLib
          if (!lib) return tryNext()
          try { lib.GlobalWorkerOptions.workerSrc = base + '/pdf.worker.min.js' } catch (e) {}
          resolve(lib)
        }
        s.onerror = () => tryNext()
        document.head.appendChild(s)
      }
      tryNext()
    })
    return this._pdfjsPromise
  },

  _itemsToText(items) {
    let s = ''
    let lastY = null
    for (const it of (items || [])) {
      const y = (it.transform && it.transform.length >= 6) ? Math.round(it.transform[5]) : null
      const gap = lastY !== null && y !== null && Math.abs(y - lastY) > 3
      if (gap && !/\n$/.test(s)) s += '\n'
      s += it.str
      s += it.hasEOL ? '\n' : ' '
      if (y !== null) lastY = y
    }
    return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  },

  _libPromises: {},

  _loadLib(key, srcs, globalName) {
    if (typeof window !== 'undefined' && window[globalName]) return Promise.resolve(window[globalName])
    if (this._libPromises[key]) return this._libPromises[key]
    const list = Array.isArray(srcs) ? srcs : [srcs]
    this._libPromises[key] = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new Error('브라우저 환경이 아닙니다.'))
      let i = 0
      const tryNext = () => {
        if (i >= list.length) { delete this._libPromises[key]; return reject(new Error(globalName + ' 라이브러리 로드 실패 (네트워크)')) }
        const s = document.createElement('script')
        s.src = list[i++]
        s.onload = () => { const g = window[globalName]; g ? resolve(g) : tryNext() }
        s.onerror = () => tryNext()
        document.head.appendChild(s)
      }
      tryNext()
    })
    return this._libPromises[key]
  },

  _ext(name) { return (String(name || '').split('.').pop() || '').toLowerCase() },
  isDocxType(name) { return ['docx', 'doc'].includes(this._ext(name)) },
  isPptxType(name) { return ['pptx', 'ppt'].includes(this._ext(name)) },
  isXlsxType(name) { return ['xlsx', 'xls'].includes(this._ext(name)) },

  async _firstBytes(file, n) {
    try {
      const buf = await file.slice(0, n || 8).arrayBuffer()
      return new Uint8Array(buf)
    } catch (e) { return new Uint8Array(0) }
  },
  _isOle(bytes) {
    return !!(bytes && bytes.length >= 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0)
  },

  _decodeXml(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  },

  _htmlToMarkdown(html) {
    let s = String(html || '')
    s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n')
    s = s.replace(/<\s*\/p\s*>/gi, '\n\n').replace(/<\s*p[^>]*>/gi, '')
    s = s.replace(/<\s*h([1-6])[^>]*>([\s\S]*?)<\s*\/h\1\s*>/gi, (m, lvl, t) => '\n' + '#'.repeat(parseInt(lvl)) + ' ' + t.trim() + '\n\n')
    s = s.replace(/<\s*li[^>]*>/gi, '\n- ').replace(/<\s*\/li\s*>/gi, '')
    s = s.replace(/<\s*\/?(ul|ol|table|tr|thead|tbody|div)[^>]*>/gi, '\n')
    s = s.replace(/<\s*\/?t[dh][^>]*>/gi, ' | ')
    s = s.replace(/<[^>]+>/g, '')
    s = this._decodeXml(s)
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
  },

  async _convertDocx(file) {
    const head = await this._firstBytes(file, 8)
    if (this._isOle(head)) throw new Error('구형 Word(.doc, 97-2003) 형식은 지원되지 않습니다. Word에서 .docx로 저장한 뒤 다시 시도하세요.')
    const mammoth = await this._loadLib('mammoth', ['https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js', 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'], 'mammoth')
    const arrayBuffer = await file.arrayBuffer()
    let markdown = ''
    try {
      if (typeof mammoth.convertToMarkdown === 'function') {
        const res = await mammoth.convertToMarkdown({ arrayBuffer })
        markdown = (res && res.value) || ''
      } else {
        const res = await mammoth.convertToHtml({ arrayBuffer })
        markdown = this._htmlToMarkdown(res && res.value)
      }
    } catch (e) {
      throw new Error('Word(.docx) 파일을 읽을 수 없습니다. 파일이 손상되었거나 .docx 형식이 아닐 수 있습니다.')
    }
    return { markdown, page_count: 1, sections: [{ title: file.name, page: 1, content: markdown }], engine: 'mammoth' }
  },

  _extractSlideText(xml) {
    const lines = []
    const paras = String(xml || '').split(/<a:p[\s>]/).slice(1)
    paras.forEach(p => {
      const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
      let m, buf = []
      while ((m = re.exec(p))) buf.push(this._decodeXml(m[1]))
      const line = buf.join('').replace(/[ \t]{2,}/g, ' ').trim()
      if (line) lines.push(line)
    })
    return lines.join('\n')
  },

  async _convertPptx(file) {
    const head = await this._firstBytes(file, 8)
    if (this._isOle(head)) throw new Error('구형 PowerPoint(.ppt, 97-2003) 형식은 지원되지 않습니다. PowerPoint에서 .pptx로 저장한 뒤 다시 시도하세요.')
    const JSZip = await this._loadLib('jszip', ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'], 'JSZip')
    let zip
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer())
    } catch (e) {
      throw new Error('PPTX 파일을 열 수 없습니다. 파일이 손상되었거나 .pptx 형식이 아닐 수 있습니다.')
    }
    const slideNames = Object.keys(zip.files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10))
    if (!slideNames.length) throw new Error('PPTX에서 슬라이드를 찾지 못했습니다.')
    const parts = []
    const sections = []
    for (let i = 0; i < slideNames.length; i++) {
      const xml = await zip.files[slideNames[i]].async('string')
      const text = this._extractSlideText(xml)
      parts.push('[page ' + (i + 1) + ']\n\n## 슬라이드 ' + (i + 1) + '\n\n' + text)
      sections.push({ title: '슬라이드 ' + (i + 1), page: i + 1, content: text })
    }
    return { markdown: parts.join('\n\n'), page_count: slideNames.length, sections, engine: 'jszip-pptx' }
  },

  async _convertPdf(file) {
    const pdfjsLib = await this._loadPdfJs()
    const data = await file.arrayBuffer()
    let pdf
    try {
      pdf = await pdfjsLib.getDocument({ data }).promise
    } catch (e) {
      const m = (e && e.message) || ''
      if (/password/i.test(m)) throw new Error('암호가 설정된 PDF는 변환할 수 없습니다.')
      throw new Error('PDF를 열 수 없습니다: ' + m)
    }
    const sections = []
    const parts = []
    let empty = 0
    for (let i = 1; i <= pdf.numPages; i++) {
      let text = ''
      try {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text = this._itemsToText(content.items)
      } catch (e) { text = '' }
      if (!text) empty++
      sections.push({ title: 'Page ' + i, page: i, content: text })
      parts.push('[page ' + i + ']\n' + text)
    }
    const markdown = parts.join('\n\n')
    const scanned = pdf.numPages > 0 && empty === pdf.numPages
    return { markdown, page_count: pdf.numPages, sections, engine: 'pdfjs', scanned }
  },

  async _convertXlsx(file) {
    const XLSX = await this._loadLib('xlsx', ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'], 'XLSX')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const parts = []
    const sections = []
    wb.SheetNames.forEach((name, i) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' })
      const lines = rows
        .map(r => (r || []).map(c => String(c == null ? '' : c).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()))
        .filter(r => r.some(c => c !== ''))
        .map(r => '| ' + r.join(' | ') + ' |')
      const md = lines.length ? lines.join('\n') : ''
      parts.push('[page ' + (i + 1) + ']\n\n## ' + name + '\n\n' + md)
      sections.push({ title: name, page: i + 1, content: md })
    })
    return { markdown: parts.join('\n\n'), page_count: wb.SheetNames.length, sections, engine: 'sheetjs' }
  },

  async _convertLocally(file) {
    if (this.isTextType(file.type, file.name)) {
      const text = await file.text()
      return { markdown: text, page_count: 1, sections: [{ title: file.name, page: 1, content: text }], engine: 'local-text' }
    }
    if (this.isPdfType(file.type, file.name)) {
      return this._convertPdf(file)
    }
    if (this.isDocxType(file.name)) {
      return this._convertDocx(file)
    }
    if (this.isPptxType(file.name)) {
      return this._convertPptx(file)
    }
    if (this.isXlsxType(file.name)) {
      return this._convertXlsx(file)
    }
    throw new Error('이 형식은 변환 서버(Edge Function)가 필요합니다: ' + (file.name || file.type || ''))
  },

  convertLocal(file) { return this._convertLocally(file) },

  get serverActive() { return !this._remoteDown },

  resetRemote() { this._remoteDown = false },

  async testServer() {
    try {
      const res = await fetch(this._fnUrl(), { method: 'GET', headers: { Authorization: await this._authHeader() } })
      if (res.status === 404) return { ok: false, status: 404, reason: '변환 서버 미배포 (404)' }
      if (!res.ok) return { ok: false, status: res.status, reason: '변환 서버 오류 (' + res.status + ')' }
      const data = await res.json().catch(() => ({}))
      this._remoteDown = false
      return { ok: true, status: res.status, engine: data.engine || 'markitdown', backend: data.backend || '' }
    } catch (e) {
      return { ok: false, status: 0, reason: '변환 서버에 연결할 수 없습니다. (' + (e && e.message ? e.message : e) + ')' }
    }
  },

  async convert(file, storagePath) {
    if (StorageAdapter.isRemote && !this._remoteDown) {
      try {
        const res = await fetch(this._fnUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: await this._authHeader() },
          body: JSON.stringify({ bucket: StorageAdapter._bucket, path: storagePath, mime: file.type, docType: (file.name || '').split('.').pop() })
        })
        if (res.status === 404) { this._remoteDown = true; throw new Error('변환 서버 미배포 (404)') }
        if (!res.ok) throw new Error('변환 서버 오류 (' + res.status + ')')
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        return { markdown: data.markdown || '', page_count: data.page_count || 0, sections: data.sections || [], engine: data.engine || 'markitdown', scanned: !!data.scanned }
      } catch (e) {
        if (e && e.name === 'TypeError') this._remoteDown = true
        return this._convertLocally(file)
      }
    }
    return this._convertLocally(file)
  }
}
