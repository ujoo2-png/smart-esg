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
    throw new Error('이 형식은 변환 서버(Edge Function)가 필요합니다: ' + (file.name || file.type || ''))
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
        return { markdown: data.markdown || '', page_count: data.page_count || 0, sections: data.sections || [], engine: data.engine || 'markitdown' }
      } catch (e) {
        if (e && e.name === 'TypeError') this._remoteDown = true
        return this._convertLocally(file)
      }
    }
    return this._convertLocally(file)
  }
}
