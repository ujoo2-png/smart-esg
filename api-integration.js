const API_DEFAULT_ENDPOINTS = [
  { id: 'erp_ghg', name: 'ERP - 온실가스 배출량', source: 'ERP', category: 'ghg', method: 'POST', path: '/api/v1/ghg', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'erp_energy', name: 'ERP - 에너지 사용량', source: 'ERP', category: 'energy', method: 'POST', path: '/api/v1/energy', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'erp_water', name: 'ERP - 용수 사용량', source: 'ERP', category: 'water', method: 'POST', path: '/api/v1/water', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'erp_waste', name: 'ERP - 폐기물 배출량', source: 'ERP', category: 'waste', method: 'POST', path: '/api/v1/waste', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'hr_workforce', name: 'HR - 인력 현황', source: 'HR', category: 'workforce', method: 'POST', path: '/api/v1/workforce', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'hr_safety', name: 'HR - 산업안전', source: 'HR', category: 'safety', method: 'POST', path: '/api/v1/safety', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'hr_training', name: 'HR - 교육훈련', source: 'HR', category: 'training', method: 'POST', path: '/api/v1/training', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'procurement', name: '조달 - 공급망 관리', source: 'PROCUREMENT', category: 'supply_chain', method: 'POST', path: '/api/v1/supply-chain', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'finance', name: '재무 - 사회공헌/세금', source: 'FINANCE', category: 'financial', method: 'POST', path: '/api/v1/financial', format: 'json', status: 'inactive', last_sync: null, record_count: 0 },
  { id: 'csv_upload', name: 'CSV 파일 업로드', source: 'MANUAL', category: 'any', method: 'CSV', path: '-', format: 'csv', status: 'active', last_sync: null, record_count: 0 }
]

const DATA_SCHEMAS = {
  ghg: { required: ['year', 'scope', 'category', 'quantity', 'unit'], optional: ['source_detail', 'facility', 'emission_factor', 'co2e'] },
  energy: { required: ['year', 'month', 'type', 'quantity', 'unit'], optional: ['facility', 'cost'] },
  water: { required: ['year', 'month', 'quantity', 'unit'], optional: ['facility', 'source_type', 'discharge'] },
  waste: { required: ['year', 'type', 'disposal_method', 'quantity', 'unit'], optional: ['recycled_ratio', 'facility'] },
  workforce: { required: ['year', 'total_employees', 'gender_male', 'gender_female'], optional: ['avg_age', 'turnover_rate', 'contract_type'] },
  safety: { required: ['year', 'accident_count', 'lost_time_injury_count'], optional: ['near_miss', 'safety_training_hours'] },
  training: { required: ['year', 'category', 'hours', 'participants'], optional: ['cost'] },
  supply_chain: { required: ['year', 'supplier_count', 'assessed_count'], optional: ['avg_score', 'tier1_count'] },
  financial: { required: ['year', 'category', 'amount'], optional: ['currency', 'note'] }
}

const API = {
  getEndpoints() {
    return Store.getApiEndpoints()
  },

  getEndpoint(id) {
    return Store.getApiEndpoint(id)
  },

  toggleEndpoint(id) {
    const ep = Store.getApiEndpoint(id)
    if (!ep) return null
    const status = ep.status === 'active' ? 'inactive' : 'active'
    Store.updateApiEndpoint(id, { status })
    return ep
  },

  setEndpointConfig(id, config) {
    return Store.updateApiEndpoint(id, config)
  },

  buildUrl(ep) {
    const base = (ep.base_url || '').replace(/\/+$/, '')
    if (!base) return null
    if (ep.method === 'CSV' || !ep.path || ep.path === '-') return base
    return base + (ep.path.startsWith('/') ? ep.path : '/' + ep.path)
  },

  async _request(ep, { signal, body } = {}) {
    const url = this.buildUrl(ep)
    if (!url) return { ok: false, error: 'BASE_URL_MISSING', message: '엔드포인트 URL이 설정되지 않았습니다.' }
    const method = ep.method === 'CSV' ? 'GET' : ep.method
    const headers = { 'Content-Type': 'application/json', ...(ep.headers || {}) }
    if (ep.auth_token) headers['Authorization'] = ep.auth_token.startsWith('Bearer ') ? ep.auth_token : 'Bearer ' + ep.auth_token
    const started = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal
      })
      const latency = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started)
      return { ok: res.ok, status: res.status, latency, response: res }
    } catch (e) {
      const latency = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started)
      const aborted = e && e.name === 'AbortError'
      return { ok: false, error: aborted ? 'TIMEOUT' : 'FETCH_ERROR', message: aborted ? '응답 시간 초과' : (e && e.message) || '네트워크 오류', latency }
    }
  },

  async testConnection(id) {
    const ep = Store.getApiEndpoint(id)
    if (!ep) return { ok: false, error: 'NOT_FOUND' }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeout = setTimeout(() => controller && controller.abort(), ep.timeout_ms || 8000)
    const result = await this._request(ep, { signal: controller ? controller.signal : undefined, body: this.generatePayloadExample(ep.category) })
    clearTimeout(timeout)
    const patch = {
      last_test_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_status_code: result.status ?? null,
      last_latency_ms: result.latency ?? null,
      last_error: result.ok ? null : (result.error || 'ERROR'),
      status: result.ok ? 'active' : ep.status
    }
    Store.updateApiEndpoint(id, patch)
    Store.addApiDataLog({ endpoint_id: id, type: 'test', ok: result.ok, status_code: result.status ?? null, latency_ms: result.latency ?? null, error: result.ok ? null : (result.error || result.message || 'ERROR') })
    return { ...result, ...patch }
  },

  async pullData(id) {
    const ep = Store.getApiEndpoint(id)
    if (!ep) return { ok: false, error: 'NOT_FOUND' }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeout = setTimeout(() => controller && controller.abort(), ep.timeout_ms || 8000)
    const result = await this._request(ep, { signal: controller ? controller.signal : undefined, body: this.generatePayloadExample(ep.category) })
    clearTimeout(timeout)
    if (!result.ok) {
      Store.addApiDataLog({ endpoint_id: id, type: 'pull', ok: false, status_code: result.status ?? null, error: result.error || result.message || 'ERROR' })
      return { ok: false, imported: 0, error: result.error, message: result.message, status: result.status }
    }
    let rows = []
    try {
      const payload = await result.response.json()
      if (Array.isArray(payload)) rows = payload
      else if (Array.isArray(payload.data)) rows = payload.data
      else if (Array.isArray(payload.records)) rows = payload.records
      else if (payload && typeof payload === 'object') rows = [payload]
    } catch (e) {
      Store.addApiDataLog({ endpoint_id: id, type: 'pull', ok: false, error: 'PARSE_ERROR', message: e.message })
      return { ok: false, imported: 0, error: 'PARSE_ERROR', message: '응답을 JSON으로 해석할 수 없습니다.' }
    }
    const imported = rows.length ? this.importData(ep.category, rows) : { imported: 0, errors: [], total: 0 }
    Store.updateApiEndpoint(id, {
      last_sync: new Date().toISOString(),
      record_count: (ep.record_count || 0) + imported.imported
    })
    Store.addApiDataLog({ endpoint_id: id, type: 'pull', ok: true, status_code: result.status ?? null, latency_ms: result.latency ?? null, imported: imported.imported, total: imported.total })
    return { ok: true, imported: imported.imported, errors: imported.errors || [], total: imported.total, status: result.status }
  },

  getSchema(category) {
    return DATA_SCHEMAS[category] || null
  },

  validatePayload(category, payload) {
    const schema = DATA_SCHEMAS[category]
    if (!schema) return { valid: false, errors: [`Unknown category: ${category}`] }
    const errors = []
    schema.required.forEach(field => {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        errors.push(`Missing required field: ${field}`)
      }
    })
    if (payload.year && (payload.year < 2020 || payload.year > 2030)) {
      errors.push(`Invalid year: ${payload.year}`)
    }
    return { valid: errors.length === 0, errors }
  },

  parseCSV(csvText) {
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) return { data: [], headers: [], errors: ['No data rows'] }
    const headers = lines[0].split(',').map(h => h.trim())
    const data = []
    const errors = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      if (values.length !== headers.length) {
        errors.push(`Row ${i + 1}: column count mismatch`)
        continue
      }
      const row = {}
      headers.forEach((h, idx) => {
        const num = Number(values[idx])
        row[h] = isNaN(num) || h.includes('name') || h.includes('detail') || h.includes('type') || h.includes('method') ? values[idx] : num
      })
      data.push(row)
    }
    return { data, headers, errors }
  },

  getImportTemplate(category) {
    const schema = DATA_SCHEMAS[category]
    if (!schema) return ''
    return [...schema.required, ...schema.optional].join(',')
  },

  importData(category, rows) {
    const schema = DATA_SCHEMAS[category]
    if (!schema) return { imported: 0, errors: ['Unknown category'] }
    const validated = []
    const errors = []
    rows.forEach((row, idx) => {
      const result = this.validatePayload(category, row)
      if (result.valid) validated.push({ ...row, category, imported_at: new Date().toISOString() })
      else errors.push(`Row ${idx + 1}: ${result.errors.join('; ')}`)
    })
    if (validated.length) {
      Store.importApiData(category, validated)
    }
    return { imported: validated.length, errors, total: rows.length }
  },

  generatePayloadExample(category) {
    const schema = DATA_SCHEMAS[category]
    if (!schema) return null
    const example = {}
    schema.required.forEach(f => {
      if (f === 'year') example[f] = 2024
      else if (f === 'month') example[f] = 6
      else if (f.includes('count') || f.includes('quantity') || f.includes('hours') || f.includes('amount')) example[f] = 100
      else if (f === 'unit') example[f] = 'tCO2eq'
      else if (f === 'scope') example[f] = 'scope1'
      else if (f === 'type' || f === 'category' || f === 'method') example[f] = 'example'
      else example[f] = 'string'
    })
    schema.optional.forEach(f => {
      if (f === 'year') example[f] = 2024
      else if (f.includes('count') || f.includes('quantity') || f.includes('rate') || f.includes('hours') || f.includes('amount') || f.includes('ratio')) example[f] = 50
      else example[f] = 'string'
    })
    return example
  },

  getSyncStatus() {
    const all = this.getEndpoints()
    const endpoints = all.filter(e => e.status === 'active')
    const totalRecords = endpoints.reduce((s, e) => s + (e.record_count || 0), 0)
    const lastSyncs = endpoints.filter(e => e.last_sync).map(e => new Date(e.last_sync).getTime())
    const latestSync = lastSyncs.length ? new Date(Math.max(...lastSyncs)) : null
    return {
      active_endpoints: endpoints.length,
      total_endpoints: all.length,
      total_records: totalRecords,
      latest_sync: latestSync ? latestSync.toISOString() : '연동 이력 없음'
    }
  }
}
