const ESGComponents = {
  _activePanel: null,

  changeLogTimeline(tableName, recordId) {
    const logs = Store.getChangeLogs(tableName, recordId)
    if (!logs.length) return '<div style="padding:12px;color:#888;font-size:12px">변경이력이 없습니다.</div>'
    const actionIcons = { CREATE: '🆕', UPDATE: '✏️', DELETE: '🗑️', APPROVE: '✅', REJECT: '❌', SHARE: '🔗' }
    const actionColors = { CREATE: '#22c55e', UPDATE: '#3b82f6', DELETE: '#ef4444', APPROVE: '#10b981', REJECT: '#ef4444', SHARE: '#8b5cf6' }
    return '<div style="padding:12px;max-height:300px;overflow-y:auto">' +
      logs.map(log => {
        const icon = actionIcons[log.action_type] || '📝'
        const color = actionColors[log.action_type] || '#666'
        const time = new Date(log.changed_at).toLocaleString('ko-KR')
        const field = log.field_name ? `<span style="color:#7C3AED;font-weight:500">${log.field_name}</span>` : ''
        const change = log.old_value && log.new_value ? `<span style="text-decoration:line-through;color:#999">${log.old_value}</span> → <span style="color:#333;font-weight:500">${log.new_value}</span>` : log.new_value || log.old_value || ''
        return `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:12px">
          <span style="flex-shrink:0;width:20px;text-align:center;color:${color}">${icon}</span>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:500;color:#333">${log.action_type}</span>
              <span style="color:#aaa;font-size:10px">${time}</span>
            </div>
            ${field ? `<div style="margin-top:2px">${field}</div>` : ''}
            ${change ? `<div style="margin-top:2px;color:#555">${change}</div>` : ''}
            <div style="margin-top:2px;color:#888;font-size:10px">by ${log.changed_by}</div>
          </div>
        </div>`
      }).join('') + '</div>'
  },

  shareLinkPanel(resourceType, resourceId, resourceName) {
    const links = Store.getShareLinks(resourceType, resourceId)
    const activeLinks = links.filter(l => !l.revoked_at)
    return `<div style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:600;font-size:13px">🔗 공유 링크 (${activeLinks.length}개 활성)</span>
        <button class="btn btn-sm btn-primary" onclick="ESGComponents.createShareLink('${resourceType}','${resourceId}','${resourceName}')">+ 링크 생성</button>
      </div>
      ${links.length ? links.map(l => {
        const isExpired = l.expires_at && new Date(l.expires_at) < new Date()
        const isActive = !l.revoked_at && !isExpired
        const accessCount = Store.getShareAccessLogs(l.id).length
        const url = location.origin + '/share/' + l.share_token
        return `<div style="padding:8px;margin-bottom:6px;border-radius:6px;background:${isActive ? '#f0fdf4' : '#fef2f2'};border:1px solid ${isActive ? '#bbf7d0' : '#fecaca'}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:${l.permission === 'VIEW_ONLY' ? '#dbeafe' : '#fef3c7'};color:${l.permission === 'VIEW_ONLY' ? '#1e40af' : '#92400e'}">${l.permission === 'VIEW_ONLY' ? '열람만 가능' : '코멘트 가능'}</span>
              <span style="font-size:11px;color:#666;margin-left:6px">${l.shared_with || '미지정'}</span>
            </div>
            <div>
              ${isActive ? `<button class="btn btn-sm" style="font-size:10px;color:#ef444c;background:none;border:none" onclick="ESGComponents.revokeShareLink(${l.id})">회수</button>` : '<span style="font-size:10px;color:#ef4444">무효화됨</span>'}
            </div>
          </div>
          <div style="font-size:10px;color:#888;margin-top:4px;display:flex;gap:8px">
            <span>열람 ${accessCount}회</span>
            ${l.expires_at ? `<span>만료: ${new Date(l.expires_at).toLocaleDateString('ko-KR')}</span>` : ''}
            <span>생성: ${new Date(l.created_at).toLocaleDateString('ko-KR')}</span>
          </div>
          ${isActive ? `<div style="margin-top:4px"><input type="text" value="${url}" readonly style="width:100%;font-size:10px;padding:3px 6px;border:1px solid #ddd;border-radius:3px;background:#fff;box-sizing:border-box" onclick="this.select()"></div>` : ''}
        </div>`
      }).join('') : '<div style="text-align:center;color:#888;font-size:12px;padding:12px">생성된 공유 링크가 없습니다.</div>'}
    </div>`
  },

  createShareLink(resourceType, resourceId, resourceName) {
    const form = document.createElement('div')
    form.innerHTML = `
      <div style="padding:4px 0">
        <label style="font-size:12px;font-weight:500;display:block;margin-bottom:4px">공유 대상</label>
        <input type="text" id="shareTarget" placeholder="이메일 또는 메모 (예: 고객사 A 담당자)" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;box-sizing:border-box">
      </div>
      <div style="padding:4px 0">
        <label style="font-size:12px;font-weight:500;display:block;margin-bottom:4px">권한</label>
        <select id="sharePerm" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px">
          <option value="VIEW_ONLY">열람만 가능</option>
          <option value="COMMENT">코멘트 가능</option>
        </select>
      </div>
      <div style="padding:4px 0">
        <label style="font-size:12px;font-weight:500;display:block;margin-bottom:4px">만료일 (선택)</label>
        <input type="date" id="shareExpiry" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;box-sizing:border-box">
      </div>
    `
    if (typeof modal === 'function') {
      modal('공유 링크 생성', form)
      document.getElementById('modal-save').onclick = () => {
        const target = document.getElementById('shareTarget').value
        const perm = document.getElementById('sharePerm').value
        const expiry = document.getElementById('shareExpiry').value || null
        Store.addShareLink(resourceType, resourceId, target, perm, expiry, 'user')
        if (typeof closeModal === 'function') closeModal()
        showToast('공유 링크가 생성되었습니다.', 'success')
      }
    }
  },

  revokeShareLink(id) {
    if (!confirm('이 공유 링크를 회수하시겠습니까?\n회수된 링크는 다시 활성화할 수 없습니다.')) return
    Store.revokeShareLink(id)
    showToast('공유 링크가 회수되었습니다.', 'success')
    if (typeof renderPublicData === 'function') renderPublicData()
  },

  openSlidePanel(title, tabs, defaultTab) {
    this.closeSlidePanel()
    const panel = document.createElement('div')
    panel.id = 'esg-slide-panel'
    panel.style.cssText = 'position:fixed;top:0;right:0;width:480px;max-width:90vw;height:100vh;background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.15);z-index:1000;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .25s ease'
    const activeTab = defaultTab || tabs[0]?.id || ''
    panel.innerHTML = `
      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#fafafa;flex-shrink:0">
        <span style="font-weight:600;font-size:14px">${title}</span>
        <button onclick="ESGComponents.closeSlidePanel()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;padding:0 4px">✕</button>
      </div>
      <div style="display:flex;border-bottom:1px solid #e5e7eb;flex-shrink:0">
        ${tabs.map(t => `<button data-tab="${t.id}" class="esg-tab-btn" style="flex:1;padding:8px;font-size:12px;border:none;background:${t.id === activeTab ? '#f0f6ff' : '#fff'};color:${t.id === activeTab ? '#7C3AED' : '#666'};font-weight:${t.id === activeTab ? '600' : '400'};cursor:pointer;border-bottom:2px solid ${t.id === activeTab ? '#7C3AED' : 'transparent'}">${t.label}</button>`).join('')}
      </div>
      <div id="esg-slide-content" style="flex:1;overflow-y:auto"></div>
    `
    document.body.appendChild(panel)
    requestAnimationFrame(() => { panel.style.transform = 'translateX(0)' })
    panel.querySelectorAll('.esg-tab-btn').forEach(btn => {
      btn.onclick = () => {
        panel.querySelectorAll('.esg-tab-btn').forEach(b => { b.style.background = '#fff'; b.style.color = '#666'; b.style.fontWeight = '400'; b.style.borderBottom = '2px solid transparent' })
        btn.style.background = '#f0f6ff'; btn.style.color = '#7C3AED'; btn.style.fontWeight = '600'; btn.style.borderBottom = '2px solid #7C3AED'
        const tab = tabs.find(t => t.id === btn.dataset.tab)
        if (tab) document.getElementById('esg-slide-content').innerHTML = tab.content
      }
    })
    const firstTab = tabs.find(t => t.id === activeTab)
    if (firstTab) document.getElementById('esg-slide-content').innerHTML = firstTab.content
    const overlay = document.createElement('div')
    overlay.id = 'esg-slide-overlay'
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.3);z-index:999'
    overlay.onclick = () => this.closeSlidePanel()
    document.body.appendChild(overlay)
    document.addEventListener('keydown', this._panelEscHandler = (e) => { if (e.key === 'Escape') this.closeSlidePanel() })
  },

  closeSlidePanel() {
    const panel = document.getElementById('esg-slide-panel')
    const overlay = document.getElementById('esg-slide-overlay')
    if (panel) { panel.style.transform = 'translateX(100%)'; setTimeout(() => panel.remove(), 250) }
    if (overlay) overlay.remove()
    if (this._panelEscHandler) { document.removeEventListener('keydown', this._panelEscHandler); this._panelEscHandler = null }
  }
}
