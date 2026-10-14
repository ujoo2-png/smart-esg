const MdConvert = {
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

  async _convertLocally(file) {
    if (this.isTextType(file.type, file.name)) {
      const text = await file.text()
      return { markdown: text, page_count: 1, sections: [{ title: file.name, page: 1, content: text }], engine: 'local-text' }
    }
    throw new Error('스캔/이진 문서는 변환 서버(Edge Function)가 필요합니다.')
  },

  async convert(file, storagePath) {
    if (StorageAdapter.isRemote) {
      try {
        const res = await fetch(this._fnUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: await this._authHeader() },
          body: JSON.stringify({ bucket: StorageAdapter._bucket, path: storagePath, mime: file.type, docType: (file.name || '').split('.').pop() })
        })
        if (!res.ok) throw new Error('변환 서버 오류 (' + res.status + ')')
        const data = await res.json()
        return { markdown: data.markdown || '', page_count: data.page_count || 0, sections: data.sections || [], engine: data.engine || 'markitdown' }
      } catch (e) {
        return this._convertLocally(file)
      }
    }
    return this._convertLocally(file)
  }
}
