const StorageAdapter = {
  _bucket: 'references',
  _dbName: 'esg-storage',
  _storeName: 'files',
  _db: null,
  _timeouts: { upload: 120000, download: 60000, remove: 30000 },

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

  _withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      let settled = false
      const t = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(label + ' 시간이 초과되었습니다. (' + Math.round(ms / 1000) + '초)'))
      }, ms)
      Promise.resolve(promise).then(v => { if (settled) return; settled = true; clearTimeout(t); resolve(v) },
        e => { if (settled) return; settled = true; clearTimeout(t); reject(e) })
    })
  },

  _client() {
    const sb = (typeof getSupabase === 'function') ? getSupabase() : null
    if (!sb) throw new Error('Supabase 클라이언트를 만들 수 없습니다. supabase.js의 URL/anonKey를 확인하세요.')
    return sb
  },

  _status(error) {
    return (error && (error.status || error.statusCode)) ? (error.status || error.statusCode) : null
  },

  _err(error, action) {
    const msg = (error && error.message) ? error.message : String(error)
    const low = msg.toLowerCase()
    const st = this._status(error)
    const name = (error && error.error) ? String(error.error) : ''
    const detail = [st ? 'HTTP ' + st : '', name && name !== msg ? name : ''].filter(Boolean).join(', ')
    const tail = detail ? ' [' + detail + ']' : ''
    if (low.includes('not_found') || low.includes('nosuchkey') || low.includes('object not found') || name === 'not_found')
      return `원본 파일이 저장소에 없습니다(업로드 실패 또는 삭제됨). 다시 업로드하세요. (${msg})${tail}`
    if (low.includes('payload too large') || low.includes('exceed') && low.includes('size') || st === 413)
      return `파일이 너무 큽니다. Supabase Storage 제한(기본 50MB)을 초과했습니다. 더 작은 파일로 올리거나 대시보드 → Storage → Settings에서 File size limit을 늘리세요. (${msg})${tail}`
    if (low.includes('bucket not found')) return `저장소 버킷 '${this._bucket}'이(가) 없습니다. Supabase 대시보드 → Storage에서 '${this._bucket}' 버킷을 생성하세요.${tail}`
    if (low.includes('mime') || low.includes('content-type')) return `허용되지 않은 파일 형식입니다. (${msg})${tail}`
    if (low.includes('row-level security') || low.includes('policy') || low.includes('unauthorized') || low.includes('permission') || low.includes('violates') || low.includes('not authorized'))
      return `버킷 접근 권한(RLS) 오류입니다. '${this._bucket}' 버킷의 Storage 정책을 확인하세요. 저장소 설정(⚙ 저장소)의 SQL을 실행해야 합니다. (${msg})${tail}`
    if (low.includes('already exists')) return `같은 경로의 파일이 이미 있습니다. (${msg})${tail}`
    if (low.includes('failed to fetch') || low.includes('network') || low.includes('time out') || low.includes('timeout'))
      return `네트워크 오류: Supabase에 연결할 수 없습니다. (${msg})${tail}`
    return action + ' 실패: ' + msg + tail
  },

  async upload(path, file) {
    if (!this.isRemote) {
      await this._idbPut(path, file)
      return { path, mode: 'local' }
    }
    const sb = this._client()
    try {
      const res = await this._withTimeout(
        sb.storage.from(this._bucket).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' }),
        this._timeouts.upload, '업로드')
      if (res.error) throw new Error(this._err(res.error, '업로드'))
      return { path, mode: this.mode }
    } catch (e) {
      let local = false
      try { await this._idbPut(path, file); local = true } catch (_) {}
      const err = new Error(e.message)
      err.storagePath = path
      err.localFallback = local
      throw err
    }
  },

  async getBlob(path) {
    if (!this.isRemote) {
      const blob = await this._idbGet(path)
      if (!blob) throw new Error('파일을 찾을 수 없습니다.')
      return blob
    }
    let remoteErr = null
    try {
      const res = await this._withTimeout(
        this._client().storage.from(this._bucket).download(path),
        this._timeouts.download, '다운로드')
      if (res.error) throw new Error(this._err(res.error, '다운로드'))
      return res.data
    } catch (e) { remoteErr = e }
    try {
      const local = await this._idbGet(path)
      if (local) return local
    } catch (_) {}
    throw remoteErr
  },

  async remove(path) {
    let remoteErr = null
    if (this.isRemote) {
      try {
        const res = await this._withTimeout(
          this._client().storage.from(this._bucket).remove([path]),
          this._timeouts.remove, '삭제')
        if (res.error) throw new Error(this._err(res.error, '삭제'))
      } catch (e) { remoteErr = e }
    }
    let localOk = true
    try { await this._idbDel(path) } catch (_) { localOk = false }
    if (remoteErr && !localOk) throw remoteErr
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
