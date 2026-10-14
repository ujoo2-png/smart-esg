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

  _client() {
    const sb = (typeof getSupabase === 'function') ? getSupabase() : null
    if (!sb) throw new Error('Supabase 클라이언트를 만들 수 없습니다. supabase.js의 URL/anonKey를 확인하세요.')
    return sb
  },

  _err(error, action) {
    const msg = (error && error.message) ? error.message : String(error)
    const low = msg.toLowerCase()
    if (low.includes('bucket not found')) return `저장소 버킷 '${this._bucket}'이(가) 없습니다. Supabase 대시보드 → Storage에서 '${this._bucket}' 버킷을 생성하세요.`
    if (low.includes('row-level security') || low.includes('policy') || low.includes('unauthorized') || low.includes('permission') || low.includes('violates')) return `버킷 접근 권한이 없습니다. '${this._bucket}' 버킷에 Storage 정책을 추가하세요. (${msg})`
    if (low.includes('failed to fetch') || low.includes('network')) return `네트워크 오류: Supabase에 연결할 수 없습니다. (${msg})`
    return action + ' 실패: ' + msg
  },

  async upload(path, file) {
    if (!this.isRemote) {
      await this._idbPut(path, file)
      return { path, mode: 'local' }
    }
    const sb = this._client()
    const { error } = await sb.storage.from(this._bucket).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
    if (error) throw new Error(this._err(error, '업로드'))
    return { path, mode: this.mode }
  },

  async getBlob(path) {
    if (!this.isRemote) {
      const blob = await this._idbGet(path)
      if (!blob) throw new Error('파일을 찾을 수 없습니다.')
      return blob
    }
    const { data, error } = await this._client().storage.from(this._bucket).download(path)
    if (error) throw new Error(this._err(error, '다운로드'))
    return data
  },

  async remove(path) {
    if (!this.isRemote) return this._idbDel(path)
    const { error } = await this._client().storage.from(this._bucket).remove([path])
    if (error) throw new Error(this._err(error, '삭제'))
    return true
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
    const sb = this._client()
    const path = `_healthcheck/${Date.now()}.txt`
    const file = new Blob(['health-check'], { type: 'text/plain' })
    const up = await sb.storage.from(this._bucket).upload(path, file, { upsert: true, contentType: 'text/plain' })
    if (up.error) throw new Error(this._err(up.error, '업로드'))
    const rm = await sb.storage.from(this._bucket).remove([path])
    if (rm.error) throw new Error(this._err(rm.error, '삭제'))
    return { ok: true, mode: this.mode }
  }
}
