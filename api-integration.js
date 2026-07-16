const API_ENDPOINTS = [
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
    return API_ENDPOINTS
  },

  getEndpoint(id) {
    return API_ENDPOINTS.find(e => e.id === id)
  },

  toggleEndpoint(id) {
    const ep = API_ENDPOINTS.find(e => e.id === id)
    if (ep) {
      ep.status = ep.status === 'active' ? 'inactive' : 'active'
      Store._save()
    }
    return ep
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
    const endpoints = API_ENDPOINTS.filter(e => e.status === 'active')
    const totalRecords = endpoints.reduce((s, e) => s + e.record_count, 0)
    const lastSyncs = endpoints.filter(e => e.last_sync).map(e => new Date(e.last_sync).getTime())
    const latestSync = lastSyncs.length ? new Date(Math.max(...lastSyncs)) : null
    return {
      active_endpoints: endpoints.length,
      total_endpoints: API_ENDPOINTS.length,
      total_records: totalRecords,
      latest_sync: latestSync ? latestSync.toISOString() : '연동 이력 없음'
    }
  }
}
