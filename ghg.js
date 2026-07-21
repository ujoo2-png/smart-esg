// GHG 배출량 계산 엔진
// 결정론적 계산 (AI 추정 금지), Scope 1/2(location+market)/3

const ENERGY_LABELS = {
  electricity: '전력',
  natural_gas: '천연가스',
  diesel: '경유',
  gasoline: '휘발유',
  water: '용수',
  waste: '폐기물',
  business_travel: '업무출장',
  commuting: '출퇴근',
  transportation: '운송·물류',
  purchased_goods: '구매재화',
  capital_goods: '자본재',
  fuel_related: '연료관련활동',
  upstream_transport: '상향운송',
  waste_generated: '생성폐기물',
  other: '기타'
}

const GHG = {
  factors: [],

  init() {
    this.factors = Store.getGHGFactors()
    if (!this.factors.length) this._seedDefaultFactors()
  },

  _seedDefaultFactors() {
    const defaults = [
      { energy_type: 'electricity', scope: 2, scope2_method: 'location-based', factor: 0.4781, unit: 'tCO2eq/MWh', source: 'KEPCO 2024' },
      { energy_type: 'electricity', scope: 2, scope2_method: 'market-based', factor: 0.3542, unit: 'tCO2eq/MWh', source: 'KEPCO 2024 (REC)' },
      { energy_type: 'natural_gas', scope: 1, scope2_method: null, factor: 0.202, unit: 'tCO2eq/MWh', source: 'IPCC' },
      { energy_type: 'diesel', scope: 1, scope2_method: null, factor: 2.68, unit: 'tCO2eq/kL', source: 'IPCC' },
      { energy_type: 'gasoline', scope: 1, scope2_method: null, factor: 2.31, unit: 'tCO2eq/kL', source: 'IPCC' },
      { energy_type: 'water', scope: 3, scope2_method: null, factor: 0.00034, unit: 'tCO2eq/ton', source: 'K-Water 2024' },
      { energy_type: 'waste', scope: 3, scope2_method: null, factor: 0.42, unit: 'tCO2eq/ton', source: 'ME 2024' },
      { energy_type: 'business_travel', scope: 3, scope2_method: null, factor: 0.255, unit: 'tCO2eq/km', source: 'DEFRA 2024 (항공)' },
      { energy_type: 'commuting', scope: 3, scope2_method: null, factor: 0.15, unit: 'tCO2eq/km', source: 'ME 2024 (자동차)' },
      { energy_type: 'transportation', scope: 3, scope2_method: null, factor: 0.062, unit: 'tCO2eq/tkm', source: 'GLEC 2024' },
      { energy_type: 'purchased_goods', scope: 3, scope2_method: null, factor: 1.2, unit: 'tCO2eq/ton', source: 'ECOFYS 2024' },
      { energy_type: 'capital_goods', scope: 3, scope2_method: null, factor: 0.8, unit: 'tCO2eq/ton', source: 'ECOFYS 2024' },
      { energy_type: 'fuel_related', scope: 3, scope2_method: null, factor: 0.89, unit: 'tCO2eq/MWh', source: 'IPCC' },
      { energy_type: 'upstream_transport', scope: 3, scope2_method: null, factor: 0.048, unit: 'tCO2eq/tkm', source: 'GLEC 2024' },
      { energy_type: 'waste_generated', scope: 3, scope2_method: null, factor: 0.58, unit: 'tCO2eq/ton', source: 'ME 2024' }
    ]
    defaults.forEach(f => Store.addGHGFactor(f))
    this.factors = Store.getGHGFactors()
  },

  getFactor(energyType, scope, scope2Method) {
    return this.factors.find(f =>
      f.energy_type === energyType &&
      f.scope === scope &&
      (f.scope2_method === scope2Method || (f.scope2_method === null && scope2Method === undefined))
    )
  },

  calculateSingle(activity) {
    const factor = this.getFactor(activity.energy_type, activity.scope, activity.scope2_method)
    if (!factor) return null
    return activity.value * factor.factor
  },

  addActivity(data) {
    const factor = this.getFactor(data.energy_type, data.scope, data.scope2_method)
    const entry = {
      id: Date.now(),
      ...data,
      period_start: data.period_start || null,
      period_end: data.period_end || null,
      notes: data.notes || '',
      emission_factor_id: factor?.id ?? null,
      co2eq: factor ? data.value * factor.factor : null,
      created_at: new Date().toISOString()
    }
    Store.addGHGActivity(entry)
    return entry
  },

  getSummary(assessmentId) {
    const activities = Store.getGHGActivities().filter(a => a.assessment_id === assessmentId)
    const summary = {}
    activities.forEach(a => {
      const key = `${a.scope}${a.scope2_method ? '_' + a.scope2_method : ''}`
      if (!summary[key]) summary[key] = { scope: a.scope, scope2_method: a.scope2_method, total: 0, count: 0 }
      summary[key].total += a.co2eq || 0
      summary[key].count++
    })
    return summary
  },

  formatSummary(summary) {
    const lines = []
    Object.entries(summary).forEach(([key, val]) => {
      const label = val.scope2_method
        ? `Scope 2 (${val.scope2_method === 'location-based' ? '위치기준' : '시장기준'})`
        : `Scope ${val.scope}`
      lines.push(`${label}: ${val.total.toFixed(2)} tCO2eq (${val.count}건)`)
    })
    return lines.join('\n')
  }
}
