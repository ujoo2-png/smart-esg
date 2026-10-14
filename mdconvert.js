const MdConvert = {
  _PDFJS_BASE: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174',
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
      const s = document.createElement('script')
      s.src = this._PDFJS_BASE + '/pdf.min.js'
      s.onload = () => {
        const lib = window.pdfjsLib
        if (!lib) return reject(new Error('pdf.js 로드에 실패했습니다.'))
        try { lib.GlobalWorkerOptions.workerSrc = this._PDFJS_BASE + '/pdf.worker.min.js' } catch (e) {}
        resolve(lib)
      }
      s.onerror = () => { this._pdfjsPromise = null; reject(new Error('pdf.js 로드에 실패했습니다. (네트워크)')) }
      document.head.appendChild(s)
    })
    return this._pdfjsPromise
  },

  _itemsToText(items) {
    let s = ''
    for (const it of (items || [])) {
      s += it.str
      s += it.hasEOL ? '\n' : ' '
    }
    return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  },

  _libPromises: {},

  _loadLib(key, src, globalName) {
    if (typeof window !== 'undefined' && window[globalName]) return Promise.resolve(window[globalName])
    if (this._libPromises[key]) return this._libPromises[key]
    this._libPromises[key] = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new Error('브라우저 환경이 아닙니다.'))
      const s = document.createElement('script')
      s.src = src
      s.onload = () => { const g = window[globalName]; g ? resolve(g) : reject(new Error(globalName + ' 로드 실패')) }
      s.onerror = () => { delete this._libPromises[key]; reject(new Error(key + ' 라이브러리 로드 실패 (네트워크)')) }
      document.head.appendChild(s)
    })
    return this._libPromises[key]
  },

  _ext(name) { return (String(name || '').split('.').pop() || '').toLowerCase() },
  isDocxType(name) { return ['docx', 'doc'].includes(this._ext(name)) },
  isPptxType(name) { return ['pptx', 'ppt'].includes(this._ext(name)) },

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
    const mammoth = await this._loadLib('mammoth', 'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js', 'mammoth')
    const arrayBuffer = await file.arrayBuffer()
    let markdown = ''
    if (typeof mammoth.convertToMarkdown === 'function') {
      const res = await mammoth.convertToMarkdown({ arrayBuffer })
      markdown = (res && res.value) || ''
    } else {
      const res = await mammoth.convertToHtml({ arrayBuffer })
      markdown = this._htmlToMarkdown(res && res.value)
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
    const JSZip = await this._loadLib('jszip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip')
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const slideNames = Object.keys(zip.files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10))
    const parts = []
    const sections = []
    for (let i = 0; i < slideNames.length; i++) {
      const xml = await zip.files[slideNames[i]].async('string')
      const text = this._extractSlideText(xml)
      parts.push('[page ' + (i + 1) + ']\n' + text)
      sections.push({ title: 'Slide ' + (i + 1), page: i + 1, content: text })
    }
    return { markdown: parts.join('\n\n'), page_count: slideNames.length, sections, engine: 'jszip-pptx' }
  },

  async _convertPdf(file) {
    const pdfjsLib = await this._loadPdfJs()
    const data = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data }).promise
    const sections = []
    const parts = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = this._itemsToText(content.items)
      sections.push({ title: 'Page ' + i, page: i, content: text })
      parts.push('[page ' + i + ']\n' + text)
    }
    return { markdown: parts.join('\n\n'), page_count: pdf.numPages, sections, engine: 'pdfjs' }
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
    throw new Error('이 형식은 변환 서버(Edge Function)가 필요합니다: ' + (file.name || file.type || ''))
  },

  convertLocal(file) { return this._convertLocally(file) },

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
        return { markdown: data.markdown || '', page_count: data.page_count || 0, sections: data.sections || [], engine: data.engine || 'markitdown' }
      } catch (e) {
        if (e && e.name === 'TypeError') this._remoteDown = true
        return this._convertLocally(file)
      }
    }
    return this._convertLocally(file)
  }
}
