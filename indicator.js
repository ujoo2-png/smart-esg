const Indicator = {
  getGroups(authorityCode) {
    return Store.getIndicatorGroups().filter(g => g.authority_code === authorityCode)
  },

  getIndicators(groupId) {
    return Store.getIndicators().filter(i => i.group_id === groupId && i.is_active)
  },

  getIndicatorById(id) {
    return Store.getIndicators().find(i => i.id === id)
  },

  getIndicatorByCode(authorityCode, code) {
    return Store.getIndicators().find(i => i.authority_code === authorityCode && i.indicator_code === code)
  },

  getMappings(sourceId) {
    return Store.getIndicatorMappings().filter(m => m.source_indicator_id === sourceId)
  },

  getMappedTargets(sourceId, targetAuthority) {
    const mappings = this.getMappings(sourceId)
    const targetIds = mappings.map(m => m.target_indicator_id)
    return Store.getIndicators().filter(i => targetIds.includes(i.id) && i.authority_code === targetAuthority)
  },

  getAuthorityName(code) {
    const names = {
      ECOVADIS: 'EcoVadis',
      KSSB: 'KSSB (한국지속가능성공시기준)',
      KCGS: 'KCGS (한국기업지배구조원)',
      NICE: 'NICE (나이스디앤비)',
      'K-ESG': 'K-ESG 가이드라인'
    }
    return names[code] || code
  },

  _enNames: {
    'EV-ENV-POL': 'Environmental Policy',
    'EV-ENV-OPS': 'Operations & Environmental Impact',
    'EV-ENV-PRD': 'Product Use & Disposal',
    'EV-ENV-CERT': 'Environmental Certifications',
    'EV-ENV-RES': 'Environmental Performance Reporting',
    'EV-ENV-ANO': 'Air, Noise, Odors',
    'EV-LHR-POL': 'Labor & Human Rights Policy',
    'EV-LHR-HRM': 'Human Resource Management',
    'EV-LHR-HR': 'Human Rights',
    'EV-LHR-RES': 'Labor & HR Performance Reporting',
    'EV-LHR-SD': 'Social Dialogue',
    'EV-LHR-CS': 'Career & Skills',
    'EV-LHR-CLL': 'Child & Forced Labor Prevention',
    'EV-ETH-POL': 'Ethics & Anti-corruption Policy',
    'EV-ETH-COR': 'Anti-corruption Measures',
    'EV-ETH-COMP': 'Fair Competition',
    'EV-ETH-INFO': 'Information Security',
    'EV-ETH-ANT': 'Antitrust & Fair Trade',
    'EV-SP-POL': 'Sustainable Procurement Policy',
    'EV-SP-ENV': 'Supplier Environmental Assessment',
    'EV-SP-SOC': 'Supplier Social Assessment',
    'EV-SP-RES': 'Procurement Performance',
    'EV-360': '360° Watch External Monitoring',
    'KSSB1-GOV': 'Sustainability Governance',
    'KSSB1-STRAT': 'Sustainability Strategy & Financial Impact',
    'KSSB1-RISK': 'Sustainability Risk Management',
    'KSSB1-MET': 'Sustainability Metrics & Targets',
    'KSSB2-GOV': 'Climate Governance',
    'KSSB2-STRAT': 'Climate Strategy & Financial Impact',
    'KSSB2-RISK': 'Climate Risk Management',
    'KSSB2-MET': 'Climate Metrics (Scope1/2/3)',
    'KCGS-GOV': 'Governance Disclosure',
    'KCGS-SOC': 'Social Disclosure',
    'KCGS-ENV': 'Environmental Disclosure',
    'NICE-ENV': 'Environmental Disclosure',
    'NICE-SOC': 'Social Disclosure',
    'NICE-GOV': 'Governance Disclosure',
    'KESG-E1': 'Environmental Management',
    'KESG-E2': 'Carbon Neutrality',
    'KESG-S1': 'Social Contribution',
    'KESG-S2': 'Safety & Health',
    'KESG-G1': 'Ethical Management',
    'KESG-G2': 'Information Disclosure'
  },

  _enGroupNames: {
    ENV: 'Environment',
    LHR: 'Labor & Human Rights',
    ETH: 'Ethics',
    SP: 'Sustainable Procurement',
    KSSB1: 'General (No.1)',
    KSSB2: 'Climate (No.2)',
    E: 'Environment',
    S: 'Social',
    G: 'Governance'
  },

  getGroupDisplayName(group) {
    if (!group) return ''
    const en = this._enGroupNames[group.group_code] || ''
    return en ? `${group.group_name} (${en})` : group.group_name
  },

  getDisplayName(indicator) {
    if (!indicator) return ''
    const en = this._enNames[indicator.indicator_code] || ''
    return en ? `${indicator.indicator_name} (${en})` : indicator.indicator_name
  },

  getNameAndCode(indicator) {
    return `${indicator.indicator_code} - ${this.getDisplayName(indicator)}`
  },

  getPillarName(pillar) {
    const names = {
      POLICY: '정책', ACTION: '조치·이행', RESULT: '결과·보고',
      GOVERNANCE: '지배구조', STRATEGY: '전략', RISK_MGMT: '위험관리', METRICS: '지표·목표',
      Policies: '정책', Actions: '조치·이행', Results: '결과·보고'
    }
    return names[pillar] || pillar
  },

  getPillarOptions(authorityCode) {
    if (authorityCode === 'KSSB') {
      return ['GOVERNANCE', 'STRATEGY', 'RISK_MGMT', 'METRICS']
    }
    return ['POLICY', 'ACTION', 'RESULT']
  },

  toggleActive(indicatorId) {
    const indicator = this.getIndicatorById(indicatorId)
    if (!indicator) return
    Store.updateIndicator(indicatorId, { is_active: !indicator.is_active })
  },

  toggleMateriality(indicatorId) {
    const indicator = this.getIndicatorById(indicatorId)
    if (!indicator) return
    Store.updateIndicator(indicatorId, { materiality_optional: indicator.materiality_optional !== true })
  },

  getScore(assessmentId, indicatorId) {
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === assessmentId)
    const item = items.find(i => i.indicator_id === indicatorId)
    return item?.score ?? null
  }
}
