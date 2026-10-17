/* RichEditor — 블록 기반 리치 텍스트 에디터 (보고서 본문 / 참고자료 공용)
   블록 모델: { id, type, html, items?, rows? }
   type: h1 h2 h3 p bullets numbers quote code divider table */
;(function () {
  const INLINE_TAGS = ['STRONG', 'B', 'EM', 'I', 'U', 'S', 'A', 'SPAN', 'CODE', 'SUB', 'SUP', 'MARK']

  function uid() { return 'b' + Math.random().toString(36).slice(2, 9) }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[m]))
  }

  function stripTags(html) {
    const d = document.createElement('div')
    d.innerHTML = html == null ? '' : String(html)
    return (d.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  }

  function mkBlock(type, html) {
    return { id: uid(), type: type || 'p', html: html == null ? '' : String(html) }
  }

  function blocksFromText(text) {
    const t = String(text || '')
    if (!t.trim()) return [mkBlock('p', '')]
    const parts = t.split(/\n{2,}/)
    return parts.map(chunk => {
      const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length > 1 && lines.every(l => /^[-*•]\s+/.test(l))) {
        return { id: uid(), type: 'bullets', items: lines.map(l => esc(l.replace(/^[-*•]\s+/, ''))) }
      }
      if (lines.length > 1 && lines.every(l => /^\d+[.)]\s+/.test(l))) {
        return { id: uid(), type: 'numbers', items: lines.map(l => esc(l.replace(/^\d+[.)]\s+/, ''))) }
      }
      if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
        const m = lines[0].match(/^(#{1,3})\s+(.*)$/)
        return mkBlock('h' + m[1].length, esc(m[2]))
      }
      if (lines.length === 1 && /^>\s?/.test(lines[0])) return mkBlock('quote', esc(lines[0].replace(/^>\s?/, '')))
      return mkBlock('p', lines.map(esc).join('<br>'))
    })
  }

  function blocksFromHTML(html) {
    const h = String(html || '').trim()
    if (!h) return [mkBlock('p', '')]
    if (!/<(div|p|h1|h2|h3|h4|ul|ol|blockquote|hr|table|pre)\b/i.test(h)) return blocksFromText(h)
    const root = document.createElement('div')
    root.innerHTML = h
    const out = []
    Array.prototype.forEach.call(root.children, node => {
      if (!node.tagName || node.tagName === '#TEXT' || node.tagName === '#text') return
      const tag = (node.tagName || '').toLowerCase()
      if (/^h[1-3]$/.test(tag)) out.push(mkBlock(tag, node.innerHTML))
      else if (tag === 'h4' || tag === 'h5' || tag === 'h6') out.push(mkBlock('h3', node.innerHTML))
      else if (tag === 'ul' || tag === 'ol') {
        const items = Array.prototype.map.call(node.querySelectorAll(':scope > li'), li => li.innerHTML)
        out.push({ id: uid(), type: tag === 'ol' ? 'numbers' : 'bullets', items })
      } else if (tag === 'blockquote') out.push(mkBlock('quote', node.innerHTML))
      else if (tag === 'pre') out.push(mkBlock('code', node.innerHTML))
      else if (tag === 'hr') out.push(mkBlock('divider', ''))
      else if (tag === 'table') {
        const rows = Array.prototype.map.call(node.querySelectorAll('tr'), tr =>
          Array.prototype.map.call(tr.children, td => td.innerHTML))
        out.push({ id: uid(), type: 'table', rows })
      } else if (tag === 'div' && !node.children.length) {
        if ((node.textContent || '').trim() || node.innerHTML.trim()) out.push(mkBlock('p', node.innerHTML))
      } else out.push(mkBlock('p', node.innerHTML || node.outerHTML))
    })
    if (!out.length) return blocksFromText(h)
    return out
  }

  function htmlFromBlocks(blocks) {
    return blocks.map(b => {
      switch (b.type) {
        case 'h1': return '<h1>' + (b.html || '') + '</h1>'
        case 'h2': return '<h2>' + (b.html || '') + '</h2>'
        case 'h3': return '<h3>' + (b.html || '') + '</h3>'
        case 'quote': return '<blockquote>' + (b.html || '') + '</blockquote>'
        case 'code': return '<pre>' + (b.html || '') + '</pre>'
        case 'divider': return '<hr>'
        case 'bullets': return '<ul>' + (b.items || []).map(i => '<li>' + i + '</li>').join('') + '</ul>'
        case 'numbers': return '<ol>' + (b.items || []).map(i => '<li>' + i + '</li>').join('') + '</ol>'
        case 'table': return '<table><tbody>' + (b.rows || []).map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
        default: return '<p>' + (b.html || '') + '</p>'
      }
    }).join('')
  }

  function textFromBlocks(blocks) {
    return blocks.map(b => {
      switch (b.type) {
        case 'divider': return '—'
        case 'bullets': return (b.items || []).map(i => '· ' + stripTags(i)).join('\n')
        case 'numbers': return (b.items || []).map((i, n) => (n + 1) + '. ' + stripTags(i)).join('\n')
        case 'table': return (b.rows || []).map(r => r.map(c => stripTags(c)).join(' | ')).join('\n')
        default: return stripTags(b.html)
      }
    }).filter(s => s !== '').join('\n\n')
  }

  function blockText(b) {
    if (b.type === 'bullets' || b.type === 'numbers') return (b.items || []).map(stripTags).join(' ')
    if (b.type === 'table') return (b.rows || []).map(r => r.map(stripTags).join(' ')).join(' ')
    if (b.type === 'divider') return ''
    return stripTags(b.html)
  }

  function stats(blocks) {
    const text = textFromBlocks(blocks)
    const chars = text.replace(/\s/g, '').length
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0
    const reading = Math.max(1, Math.round(words / 250))
    return { chars, words, reading, blocks: blocks.length }
  }

  function insertBlock(blocks, idx, block) {
    const i = idx == null ? blocks.length : Math.max(0, Math.min(blocks.length, idx))
    blocks.splice(i, 0, block)
    return blocks
  }
  function removeBlock(blocks, idx) {
    if (idx < 0 || idx >= blocks.length) return blocks
    blocks.splice(idx, 1)
    if (!blocks.length) blocks.push(mkBlock('p', ''))
    return blocks
  }
  function moveBlock(blocks, from, to) {
    if (from === to || from < 0 || from >= blocks.length) return blocks
    const t = Math.max(0, Math.min(blocks.length - 1, to))
    const b = blocks.splice(from, 1)[0]
    blocks.splice(t, 0, b)
    return blocks
  }
  function setBlockType(blocks, idx, type) {
    const b = blocks[idx]
    if (!b) return blocks
    const text = blockText(b)
    if (type === 'bullets' || type === 'numbers') {
      b.type = type
      b.items = text ? [esc(text)] : ['']
      delete b.html
    } else if (type === 'divider') {
      b.type = 'divider'; b.html = ''
    } else {
      b.type = type
      b.html = esc(text)
      delete b.items; delete b.rows
    }
    return blocks
  }
  function splitBlock(blocks, idx, textOffset) {
    const b = blocks[idx]
    if (!b) return blocks
    const full = blockText(b)
    const off = textOffset == null ? full.length : textOffset
    const left = esc(full.slice(0, off))
    const right = esc(full.slice(off))
    const type = b.type === 'h1' || b.type === 'h2' || b.type === 'h3' ? b.type : 'p'
    blocks[idx] = mkBlock(type, left)
    blocks.splice(idx + 1, 0, mkBlock('p', right))
    return blocks
  }

  const SLASH_ITEMS = [
    { type: 'p', label: '본문', hint: '일반 문단' },
    { type: 'h1', label: '제목 1', hint: '큰 제목' },
    { type: 'h2', label: '제목 2', hint: '중간 제목' },
    { type: 'h3', label: '제목 3', hint: '작은 제목' },
    { type: 'bullets', label: '글머리 목록', hint: '불릿' },
    { type: 'numbers', label: '번호 목록', hint: '순서' },
    { type: 'quote', label: '인용', hint: '발언/인용' },
    { type: 'code', label: '코드', hint: '코드 블록' },
    { type: 'table', label: '표', hint: '2x2 표 삽입' },
    { type: 'divider', label: '구분선', hint: '가로선' }
  ]

  function filterSlash(q) {
    const s = String(q || '').toLowerCase().trim()
    if (!s) return SLASH_ITEMS
    return SLASH_ITEMS.filter(i => i.label.includes(s) || i.type.includes(s) || i.hint.includes(s))
  }

  // ================= DOM EDITOR =================
  class RichEditor {
    constructor(opts) {
      opts = opts || {}
      this.blocks = opts.blocks || (opts.html != null ? blocksFromHTML(opts.html) : blocksFromText(opts.htmlText || ''))
      this.onChange = opts.onChange || function () {}
      this.onAI = opts.onAI || null
      this.showAI = opts.showAI !== false
      this.showStats = opts.showStats !== false
      this.showFind = opts.showFind !== false
      this.placeholder = opts.placeholder || '내용을 입력하세요. "/" 로 블록 삽입'
      this.autosaveLabel = opts.autosaveLabel || null
      this.root = null
      this._findOpen = false
      this._findQuery = ''
      this._slash = null
      this._active = 0
    }

    mount(container) {
      container.innerHTML = ''
      this.root = el('div', { className: 'rte' })
      if (this.showStats) this.root.append(this._toolbar())
      if (this.showFind) this.root.append(this._findPanel())
      this.root.append(this._blockList())
      container.append(this.root)
      return this
    }

    refresh() {
      if (!this.root) return
      const list = this.root.querySelector('.rte-list')
      if (!list) return
      list.replaceWith(this._blockList())
      if (this.showStats) this._updateStats()
    }

    _emit() { this.onChange(htmlFromBlocks(this.blocks), this.blocks, textFromBlocks(this.blocks)) }
    _updateStats() {
      const s = stats(this.blocks)
      const node = this.root.querySelector('.rte-stats')
      if (node) node.textContent = `${s.words}단어 · ${s.chars}자 · 약 ${s.reading}분 · ${s.blocks}블록`
    }
    _focusActive() {
      const self = this
      setTimeout(() => {
        if (!window.getSelection) return
        const bodies = self.root.querySelectorAll('.rte-block')
        const bd = bodies[self._active]
        if (!bd || !bd.isContentEditable) return
        bd.focus()
        const range = document.createRange()
        range.selectNodeContents(bd); range.collapse(false)
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
      }, 0)
    }

    _toolbar() {
      const btn = (title, label, fn) => el('button', { className: 'rte-btn', title, onMousedown: e => e.preventDefault(), onClick: fn }, label)
      const cmd = (c, v) => () => { this._exec(c, v) }
      const type = (t) => () => { this.setActiveType(t) }
      return el('div', { className: 'rte-toolbar' },
        el('div', { className: 'rte-group' },
          btn('굵게 (Ctrl+B)', 'B', cmd('bold')),
          btn('기울임 (Ctrl+I)', 'I', cmd('italic')),
          btn('밑줄 (Ctrl+U)', 'U', cmd('underline')),
          btn('취소선', 'S', cmd('strikeThrough')),
          btn('서식 지우기', 'Tx', () => { this._exec('removeFormat'); this._exec('unlink') })),
        el('div', { className: 'rte-sep' }),
        el('div', { className: 'rte-group' },
          btn('제목 1', 'H1', type('h1')),
          btn('제목 2', 'H2', type('h2')),
          btn('제목 3', 'H3', type('h3')),
          btn('본문', 'P', type('p'))),
        el('div', { className: 'rte-sep' }),
        el('div', { className: 'rte-group' },
          btn('글머리 목록', '•≡', type('bullets')),
          btn('번호 목록', '1≡', type('numbers')),
          btn('인용', '❝', type('quote')),
          btn('코드', '</>', type('code')),
          btn('표 삽입', '▦', () => this.insertTable()),
          btn('구분선', '—', () => this.insertBlock('divider'))),
        el('div', { className: 'rte-sep' }),
        el('div', { className: 'rte-group' },
          btn('링크', '🔗', () => this._exec('createLink', promptLink())),
          this.showFind && btn('찾기/바꾸기', '🔍', () => { this._findOpen = !this._findOpen; this.refresh() }),
          btn('블록 추가', '＋', () => this.insertBlockAfter(this._active))),
        el('div', { className: 'rte-spacer' }),
        this.showStats && el('span', { className: 'rte-stats' }, ''),
        this.autosaveLabel && el('span', { className: 'rte-save', id: this.autosaveLabel }, ''))
      function promptLink() { return window.prompt('링크 주소를 입력하세요', 'https://') || 'about:blank' }
    }

    _findPanel() {
      if (!this._findOpen) return el('div', { style: 'display:none' })
      const results = this._findQuery ? this._search(this._findQuery).length : 0
      return el('div', { className: 'rte-find' },
        el('input', { className: 'rte-find-input', placeholder: '찾을 내용', value: this._findQuery,
          onInput: e => { this._findQuery = e.target.value } }),
        el('button', { className: 'rte-btn', onClick: () => this.refresh() }, '검색'),
        el('span', { className: 'rte-find-count' }, results + '건'),
        el('input', { className: 'rte-find-input', placeholder: '바꿀 내용', id: 'rte-replace' }),
        el('button', { className: 'rte-btn', onClick: () => { const v = this.root.querySelector('#rte-replace').value; this.replaceAll(this._findQuery, v) } }, '일괄 치환'))
    }

    _search(q) {
      const out = []
      const s = String(q || '').toLowerCase()
      if (!s) return out
      this.blocks.forEach((b, i) => {
        const t = blockText(b).toLowerCase()
        if (t.includes(s)) out.push(i)
      })
      return out
    }

    replaceAll(q, rep) {
      const s = String(q || '')
      if (!s) return
      const low = s.toLowerCase()
      const R = String(rep == null ? '' : rep)
      this.blocks.forEach(b => {
        const replaceIn = (html) => String(html || '').replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), () => R)
        if (b.type === 'bullets' || b.type === 'numbers') b.items = (b.items || []).map(i => replaceIn(i))
        else if (b.type === 'table') b.rows = (b.rows || []).map(r => r.map(c => replaceIn(c)))
        else b.html = replaceIn(b.html)
        void low
      })
      this.refresh(); this._emit()
    }

    _exec(cmd, val) {
      try { document.execCommand(cmd, false, val) } catch (e) {}
      this._syncAllFromDOM(); this.refresh(); this._emit(); this._focusActive()
    }

    setActiveType(type) {
      const idx = this._active
      if (type === 'bullets' || type === 'numbers') this._execList(type)
      else { setBlockType(this.blocks, idx, type); this.refresh(); this._emit(); this._focusActive() }
    }

    _execList(type) {
      const idx = this._active
      const b = this.blocks[idx]
      if (!b) return
      if (b.type === type) setBlockType(this.blocks, idx, 'p')
      else setBlockType(this.blocks, idx, type)
      this.refresh(); this._emit(); this._focusActive()
    }

    insertBlock(type) { insertBlock(this.blocks, this._active + 1, mkBlock(type, '')); if (type === 'table') this.blocks[this._active + 1].rows = [['&nbsp;', '&nbsp;'], ['&nbsp;', '&nbsp;']]; this.refresh(); this._emit(); this._focusActive() }
    insertBlockAfter(i) { insertBlock(this.blocks, i + 1, mkBlock('p', '')); this._active = i + 1; this.refresh(); this._emit(); this._focusActive() }
    insertTable() { insertBlock(this.blocks, this._active + 1, { id: uid(), type: 'table', rows: [['&nbsp;', '&nbsp;'], ['&nbsp;', '&nbsp;']] }); this.refresh(); this._emit(); this._focusActive() }

    _blockList() {
      const list = el('div', { className: 'rte-list' })
      this.blocks.forEach((b, i) => list.append(this._blockRow(b, i)))
      list.append(el('div', { className: 'rte-add', onClick: () => this.insertBlockAfter(this.blocks.length - 1) }, '＋ 블록 추가 (또는 본문에서 "/")'))
      return list
    }

    _blockRow(b, i) {
      const row = el('div', { className: 'rte-row' + (i === this._active ? ' is-active' : ''), draggable: 'true', 'data-idx': String(i) })
      const handle = el('div', { className: 'rte-handle', title: '드래그하여 이동', onDragstart: e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move' }, onDragover: e => e.preventDefault(), onDrop: e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain')); moveBlock(this.blocks, from, i); this.refresh(); this._emit() } }, '⋮⋮')
      let body
      if (b.type === 'bullets' || b.type === 'numbers') {
        body = el('div', { className: 'rte-block rte-' + b.type, contenteditable: 'true' })
        body._listType = b.type; body._idx = i
        body.innerHTML = (b.items && b.items.length ? b.items : ['']).map(it => '<div class="rte-li">' + it + '</div>').join('')
      } else if (b.type === 'table') {
        body = el('div', { className: 'rte-block rte-table', contenteditable: 'true' })
        body._table = true; body._idx = i
        const rows = b.rows && b.rows.length ? b.rows : [['&nbsp;', '&nbsp;']]
        body.innerHTML = '<table><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
      } else if (b.type === 'divider') {
        body = el('div', { className: 'rte-block rte-divider' }, el('hr'))
      } else {
        body = el('div', { className: 'rte-block rte-' + b.type, contenteditable: 'true' })
        body._idx = i
        body.innerHTML = b.html || ''
        if (!b.html) body.setAttribute('data-ph', this.placeholder)
      }
      if (body.setAttribute) {
        body.addEventListener('focus', () => { this._active = i; this.root.querySelectorAll('.rte-row').forEach(r => r.classList.remove('is-active')); row.classList.add('is-active') })
        body.addEventListener('input', () => this._onBlockInput(body, i))
        body.addEventListener('keydown', e => this._onKey(e, body, i))
        if (body._listType || body._table) body.addEventListener('blur', () => this._syncBlock(body, i))
      }
      const menu = el('div', { className: 'rte-menu' },
        el('button', { className: 'rte-mini', title: '위로', onClick: () => { moveBlock(this.blocks, i, i - 1); this._active = Math.max(0, i - 1); this.refresh(); this._emit() } }, '↑'),
        el('button', { className: 'rte-mini', title: '아래로', onClick: () => { moveBlock(this.blocks, i, i + 1); this._active = Math.min(this.blocks.length - 1, i + 1); this.refresh(); this._emit() } }, '↓'),
        el('button', { className: 'rte-mini', title: '위에 추가', onClick: () => { insertBlock(this.blocks, i, mkBlock('p', '')); this.refresh(); this._emit() } }, '＋'),
        el('button', { className: 'rte-mini', title: '삭제', onClick: () => { removeBlock(this.blocks, i); this.refresh(); this._emit() } }, '✕'))
      if (this.showAI && this.onAI && ['p', 'h1', 'h2', 'h3', 'quote', 'code'].includes(b.type)) {
        menu.append(el('button', { className: 'rte-mini', title: 'AI 다듬기', onClick: () => this.onAI(blockText(b), html => { b.html = esc(html).replace(/\n/g, '<br>'); this.refresh(); this._emit() }) }, '✨'))
      }
      row.append(handle, body, menu)
      return row
    }

    _onBlockInput(body, i) {
      const b = this.blocks[i]
      if (!b) return
      if (body._listType) this._syncList(body, i)
      else if (body._table) this._syncTable(body, i)
      else { b.html = body.innerHTML }
      if (body.innerHTML.trim() === '/') this._openSlash(body, i)
      else this._closeSlash()
      this._emit()
    }

    _syncList(body, i) {
      const b = this.blocks[i]
      b.items = Array.prototype.map.call(body.querySelectorAll('.rte-li'), d => d.innerHTML)
    }
    _syncTable(body, i) {
      const b = this.blocks[i]
      b.rows = Array.prototype.map.call(body.querySelectorAll('tr'), tr => Array.prototype.map.call(tr.children, td => td.innerHTML))
    }
    _syncBlock(body, i) {
      const b = this.blocks[i]
      if (b && body._listType) this._syncList(body, i)
      else if (b && body._table) this._syncTable(body, i)
    }
    _syncAllFromDOM() {
      const bodies = this.root.querySelectorAll('.rte-block')
      Array.prototype.forEach.call(bodies, bd => {
        const i = bd._idx
        if (i == null) return
        const b = this.blocks[i]
        if (!b) return
        if (bd._listType) this._syncList(bd, i)
        else if (bd._table) this._syncTable(bd, i)
        else if (bd.isContentEditable) b.html = bd.innerHTML
      })
    }
    _syncActiveFromDOM() {
      const row = this.root.querySelector('.rte-row.is-active')
      const bd = row && row.querySelector('.rte-block')
      if (bd && bd._idx != null) this._active = bd._idx
    }

    _onKey(e, body, i) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        splitBlock(this.blocks, i, null)
        this._active = i + 1
        this.refresh(); this._emit()
        setTimeout(() => { const rows = this.root.querySelectorAll('.rte-block'); if (rows[i + 1]) rows[i + 1].focus() }, 0)
        return
      }
      if (e.key === 'Backspace' && body.textContent === '' && i > 0) {
        e.preventDefault()
        const prevText = blockText(this.blocks[i - 1])
        removeBlock(this.blocks, i)
        this._active = i - 1
        this.blocks[i - 1].html = esc(prevText)
        this.refresh(); this._emit()
        setTimeout(() => { const rows = this.root.querySelectorAll('.rte-block'); if (rows[i - 1]) rows[i - 1].focus() }, 0)
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); this._exec('bold') }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); this._exec('italic') }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); this._exec('underline') }
      else if (e.key === '/' && body.textContent.trim() === '') { setTimeout(() => this._openSlash(body, i), 0) }
      else if (e.key === 'Escape') this._closeSlash()
    }

    _openSlash(body, i) {
      this._closeSlash()
      const menu = el('div', { className: 'rte-slash' })
      const items = filterSlash('')
      const pick = (it) => () => {
        setBlockType(this.blocks, i, it.type === 'table' ? 'table' : it.type)
        if (it.type === 'table') this.blocks[i].rows = [['&nbsp;', '&nbsp;'], ['&nbsp;', '&nbsp;']]
        body.innerHTML = it.type === 'table' ? '' : ''
        this._closeSlash(); this.refresh(); this._emit()
      }
      items.forEach(it => menu.append(el('div', { className: 'rte-slash-item', onClick: pick(it) },
        el('span', { className: 'rte-slash-label' }, it.label), el('span', { className: 'rte-slash-hint' }, it.hint))))
      body.parentElement.append(menu)
      this._slash = menu
    }
    _closeSlash() { if (this._slash && this._slash.parentElement) this._slash.parentElement.removeChild(this._slash); this._slash = null }

    getHTML() { return htmlFromBlocks(this.blocks) }
    getText() { return textFromBlocks(this.blocks) }
    getStats() { return stats(this.blocks) }
    setHTML(html) { this.blocks = blocksFromHTML(html); this.refresh(); this._emit() }
  }

  // tiny DOM helper (editor-local; mirrors app el() but standalone)
  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag)
    attrs = attrs || {}
    Object.keys(attrs).forEach(k => {
      const v = attrs[k]
      if (v == null || v === false) return
      if (k === 'style' && typeof v === 'object') { Object.assign(node.style, v); return }
      if (k === 'className') { node.className = v; return }
      if (k === 'value') { node.value = v; return }
      if (k.startsWith('on') && typeof v === 'function') { node.addEventListener(k.slice(2).toLowerCase(), v); return }
      if (k === 'contenteditable') { node.setAttribute('contenteditable', v); return }
      try { node.setAttribute(k, v) } catch (e) {}
    })
    kids.flat().forEach(k => { if (k == null || k === false) return; node.append(typeof k === 'object' ? k : document.createTextNode(String(k))) })
    return node
  }

  window.RichEditor = {
    RichEditor, uid, esc, stripTags, mkBlock,
    blocksFromText, blocksFromHTML, htmlFromBlocks, textFromBlocks, blockText, stats,
    insertBlock, removeBlock, moveBlock, setBlockType, splitBlock,
    filterSlash, SLASH_ITEMS
  }
})()
