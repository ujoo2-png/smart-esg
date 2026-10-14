const Reference = {
  FILE_TYPES: { pdf: 'PDF', pptx: 'PPT', ppt: 'PPT', docx: 'Word', doc: 'Word', xlsx: 'Excel', xls: 'Excel', txt: '텍스트', md: 'Markdown', csv: 'CSV', json: 'JSON' },

  getAll() { return Store.getReferenceDocs() },
  getById(id) { return Store.getReferenceDoc(id) },

  detectType(name) {
    const ext = (name || '').split('.').pop().toLowerCase()
    return ext || 'etc'
  },

  typeLabel(name) { return this.FILE_TYPES[this.detectType(name)] || '기타' },

  safeFileName(fileName) {
    const raw = String(fileName || '')
    const dot = raw.lastIndexOf('.')
    const hasExt = dot > 0 && dot < raw.length - 1
    const base = hasExt ? raw.slice(0, dot) : raw
    const ext = hasExt ? raw.slice(dot + 1) : ''
    const clean = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '')
    const hash = Math.abs(raw.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)).toString(36)
    let safeBase = clean(base)
    const hadNonAscii = /[^\x00-\x7F]/.test(base)
    if (hadNonAscii) safeBase = (safeBase ? safeBase + '_' : '') + hash
    if (!safeBase) safeBase = 'file_' + hash
    const safeExt = clean(ext).replace(/[^A-Za-z0-9]/g, '')
    return safeExt ? `${safeBase}.${safeExt}` : safeBase
  },

  storagePath(doc, fileName) {
    const companyId = (Store.getCompanies()[0]?.id) || 'default'
    const year = doc.year || new Date().getFullYear()
    return `${companyId}/${year}/${doc.id}/${this.safeFileName(fileName)}`
  },

  chunkMarkdown(markdown, maxLen = 1200) {
    const chunks = []
    if (!markdown) return chunks
    const lines = markdown.split('\n')
    let buf = []
    let bufLen = 0
    let page = 1
    let heading = ''
    const flush = () => {
      if (!buf.length) return
      const content = buf.join('\n').trim()
      if (content) chunks.push({ section_title: heading, page, content })
      buf = []; bufLen = 0
    }
    lines.forEach(line => {
      const pageMatch = line.match(/\[?page\s*[: ]?(\d+)\]?/i)
      if (pageMatch) { flush(); page = parseInt(pageMatch[1]) }
      if (/^#{1,6}\s/.test(line)) { flush(); heading = line.replace(/^#{1,6}\s*/, '').trim() }
      buf.push(line); bufLen += line.length + 1
      if (bufLen >= maxLen) flush()
    })
    flush()
    return chunks
  },

  async create({ title, source_org, industry, year, file, tags }) {
    const doc = Store.addReferenceDoc({ title: title || file.name, source_org: source_org || '', industry: industry || '', year: year || null, file_name: file.name, file_type: this.detectType(file.name), mime_type: file.type || '', file_size: file.size, tags: tags || [] })
    try {
      const path = this.storagePath(doc, file.name)
      Store.updateReferenceDoc(doc.id, { status: 'uploading', storage_path: path })
      await StorageAdapter.upload(path, file)
      Store.updateReferenceDoc(doc.id, { status: 'converting' })
      const result = await MdConvert.convert(file, path)
      this._applyConversion(doc.id, result)
      return Store.getReferenceDoc(doc.id)
    } catch (e) {
      Store.updateReferenceDoc(doc.id, { status: 'error', error: e.message })
      throw e
    }
  },

  _applyConversion(docId, result) {
    const chunks = this.chunkMarkdown(result.markdown || '')
    Store.replaceReferenceChunks(docId, chunks)
    Store.updateReferenceDoc(docId, { markdown: result.markdown || '', page_count: result.page_count || 0, chunk_count: chunks.length, engine: result.engine || '', status: 'ready', error: null, converted_at: new Date().toISOString() })
  },

  async recreate(docId) {
    const doc = Store.getReferenceDoc(docId)
    if (!doc) throw new Error('참고자료를 찾을 수 없습니다.')
    if (!doc.storage_path) { Store.updateReferenceDoc(docId, { status: 'error', error: '원본 파일이 없습니다.' }); return }
    try {
      Store.updateReferenceDoc(docId, { status: 'converting', error: null })
      const blob = await StorageAdapter.getBlob(doc.storage_path)
      const file = new File([blob], doc.file_name, { type: doc.mime_type })
      const result = await MdConvert.convert(file, doc.storage_path)
      this._applyConversion(docId, result)
    } catch (e) {
      Store.updateReferenceDoc(docId, { status: 'error', error: e.message })
    }
  },

  async remove(docId) {
    const doc = Store.getReferenceDoc(docId)
    if (doc?.storage_path) { try { await StorageAdapter.remove(doc.storage_path) } catch (e) {} }
    Store.deleteReferenceDoc(docId)
  },

  async getBlob(docId) {
    const doc = Store.getReferenceDoc(docId)
    if (!doc?.storage_path) throw new Error('원본 파일이 없습니다.')
    return StorageAdapter.getBlob(doc.storage_path)
  },

  search(keyword, limit = 30) {
    const k = (keyword || '').trim().toLowerCase()
    if (!k) return []
    const matches = []
    for (const c of Store.getReferenceChunks()) {
      const idx = (c.content || '').toLowerCase().indexOf(k)
      if (idx > -1) {
        const doc = Store.getReferenceDoc(c.reference_id)
        if (!doc) continue
        matches.push({ reference_id: c.reference_id, source_org: doc.source_org, title: doc.title, year: doc.year, page: c.page, section_title: c.section_title, snippet: c.content.substring(Math.max(0, idx - 60), idx + 140) })
        if (matches.length >= limit) break
      }
    }
    return matches
  },

  getRelevant(indicators, limit = 8) {
    const kws = (indicators || []).map(i => i.indicator_name).filter(Boolean).map(s => s.toLowerCase())
    if (!kws.length) return []
    const out = []
    for (const c of Store.getReferenceChunks()) {
      const text = (c.content || '').toLowerCase()
      if (kws.some(k => text.includes(k))) {
        const doc = Store.getReferenceDoc(c.reference_id)
        if (!doc) continue
        out.push({ reference_id: c.reference_id, source_org: doc.source_org, title: doc.title, year: doc.year, page: c.page, section_title: c.section_title, content: c.content })
        if (out.length >= limit) break
      }
    }
    return out
  },

  suggestIndicators(docId, limit = 10) {
    const chunks = Store.getReferenceChunks(docId)
    if (!chunks.length) return []
    const text = chunks.map(c => c.content || '').join(' ').toLowerCase()
    const scored = []
    Store.getIndicators().filter(i => i.is_active !== false).forEach(ind => {
      const name = (ind.indicator_name || '').toLowerCase()
      if (!name) return
      const words = name.split(/[\s,()/·]+/).filter(w => w.length > 1)
      let score = 0
      words.forEach(w => { if (text.includes(w)) score += 1 })
      if (score > 0) scored.push({ id: ind.id, code: ind.indicator_code, name: ind.indicator_name, score })
    })
    return scored.sort((a, b) => b.score - a.score).slice(0, limit)
  },

  statusLabel(status) {
    return { pending: '대기', uploading: '업로드 중', converting: '변환 중', ready: '준비됨', error: '오류' }[status] || status
  },

  statusColor(status) {
    return { pending: '#9ca3af', uploading: '#3b82f6', converting: '#f59e0b', ready: '#22c55e', error: '#ef4444' }[status] || '#9ca3af'
  }
}
