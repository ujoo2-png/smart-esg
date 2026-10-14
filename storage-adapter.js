const StorageAdapter = {
  _bucket: 'references',
  _dbName: 'esg-storage',
  _storeName: 'files',
  _db: null,

  get mode() {
    try { return localStorage.getItem('esg_storage_mode') || 'local' } catch (e) { return 'local' }
  },

  setMode(mode) {
    localStorage.setItem('esg_storage_mode', mode)
  },

  get isRemote() {
    return this.mode !== 'local'
  },

  _openDb() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db)
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB를 사용할 수 없습니다.'))
      const req = indexedDB.open(this._dbName, 1)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(this._storeName)) req.result.createObjectStore(this._storeName) }
      req.onsuccess = () => { this._db = req.result; resolve(this._db) }
      req.onerror = () => reject(req.error)
    })
  },

  async _idbGet(path) {
    const db = await this._openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._storeName, 'readonly')
      const r = tx.objectStore(this._storeName).get(path)
      r.onsuccess = () => resolve(r.result || null)
      r.onerror = () => reject(r.error)
    })
  },

  async _idbPut(path, blob) {
    const db = await this._openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._storeName, 'readwrite')
      tx.objectStore(this._storeName).put(blob, path)
      tx.oncomplete = () => resolve(path)
      tx.onerror = () => reject(tx.error)
    })
  },

  async _idbDel(path) {
    const db = await this._openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._storeName, 'readwrite')
      tx.objectStore(this._storeName).delete(path)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  },

  _fnUrl(name) {
    const base = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url) || ''
    return base.replace(/\/$/, '') + '/functions/v1/' + name
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

  async upload(path, file) {
    if (!this.isRemote) {
      await this._idbPut(path, file)
      return { path, mode: 'local' }
    }
    const res = await fetch(this._fnUrl('sign-upload'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await this._authHeader() },
      body: JSON.stringify({ bucket: this._bucket, path, contentType: file.type || 'application/octet-stream', size: file.size })
    })
    if (!res.ok) throw new Error('업로드 서명 발급 실패 (' + res.status + ')')
    const { uploadUrl, method } = await res.json()
    const put = await fetch(uploadUrl, { method: method || 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
    if (!put.ok) throw new Error('저장소 업로드 실패 (' + put.status + ')')
    return { path, mode: this.mode }
  },

  async getBlob(path) {
    if (!this.isRemote) {
      const blob = await this._idbGet(path)
      if (!blob) throw new Error('파일을 찾을 수 없습니다.')
      return blob
    }
    const res = await fetch(this._fnUrl('sign-download'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await this._authHeader() },
      body: JSON.stringify({ bucket: this._bucket, path })
    })
    if (!res.ok) throw new Error('다운로드 서명 발급 실패 (' + res.status + ')')
    const { url } = await res.json()
    const file = await fetch(url)
    if (!file.ok) throw new Error('저장소 다운로드 실패 (' + file.status + ')')
    return file.blob()
  },

  async remove(path) {
    if (!this.isRemote) return this._idbDel(path)
    const res = await fetch(this._fnUrl('remove-object'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await this._authHeader() },
      body: JSON.stringify({ bucket: this._bucket, path })
    })
    return res.ok
  },

  async testConnection() {
    if (!this.isRemote) {
      await this._idbPut('.healthcheck', new Blob(['ok']))
      const ok = !!(await this._idbGet('.healthcheck'))
      await this._idbDel('.healthcheck')
      return { ok, mode: 'local' }
    }
    if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.url || SUPABASE_CONFIG.url.includes('your-project')) {
      throw new Error('Supabase URL이 설정되지 않았습니다 (supabase.js).')
    }
    const path = `_healthcheck/${Date.now()}.txt`
    const file = new Blob(['health-check'], { type: 'text/plain' })
    await this.upload(path, file)
    await this.remove(path)
    return { ok: true, mode: this.mode }
  }
}

