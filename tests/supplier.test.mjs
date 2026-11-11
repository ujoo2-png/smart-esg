import test from 'node:test'
import assert from 'node:assert/strict'
import { createEnv } from './helpers/env.mjs'

function makeEnv() {
  const env = createEnv()
  env.load('supplier.js')
  return { env, Store: env.Store, Supplier: env.evaluate('Supplier') }
}

test('협력사: 데모 데이터 삭제 후 새로고침해도 되살아나지 않는다', () => {
  const { Store } = makeEnv()
  assert.ok(Store.data.suppliers.length > 0)
  const removed = Store.deleteDemoSuppliers()
  assert.ok(removed > 0)
  assert.equal(Store.data.suppliers.length, 0)
  Store._load()
  assert.equal(Store.data.suppliers.length, 0)
})

test('협력사: 삭제 시 VSME 이력·리스크 항목이 함께 정리된다', () => {
  const { Store, Supplier } = makeEnv()
  const s = Supplier.add({ name: '테스트협력사' })
  const answers = {}
  Supplier.getVSMEChecklist('basic').forEach(q => { answers[q.id] = 'yes' })
  Supplier.submitVSME(s.id, 'basic', answers)
  Store.addSupplierRiskItem({ supplier_id: s.id, question_id: 'e1', axis: 'E', answer: 'yes' })
  assert.equal(Store.getVSMEAssessments(s.id).length, 1)
  assert.equal(Store.getSupplierRiskItems(s.id).length, 1)
  Supplier.delete(s.id)
  assert.equal(Store.getVSMEAssessments(s.id).length, 0)
  assert.equal(Store.getSupplierRiskItems(s.id).length, 0)
})

test('VSME: 문항 id 맵 응답은 순서가 바뀌어도 점수가 동일하다', () => {
  const { Supplier } = makeEnv()
  const map = {}
  Supplier.getVSMEChecklist('basic').forEach((q, i) => { map[q.id] = i < 6 ? 'yes' : 'no' })
  assert.equal(Supplier.calcVSMEScore(map, 'basic'), 50)
})

test('VSME: 기존 배열 응답도 하위호환으로 채점된다', () => {
  const { Supplier } = makeEnv()
  assert.equal(Supplier.calcVSMEScore(['yes', 'no'], 'basic'), Math.round(1 / 12 * 100))
})

test('VSME: 사용자 설문 추가·채점·스냅샷 보존', () => {
  const { Store, Supplier } = makeEnv()
  const s = Supplier.add({ name: '설문테스트' })
  const q = Store.addQuestionnaire({
    name: '테스트 설문',
    description: '2문항',
    questions: [
      { category: '환경', question: '환경 정책이 있는가?' },
      { category: '사회', question: '인권 정책이 있는가?' }
    ]
  })
  assert.equal(Supplier.getQuestionnaires().length, 3)
  const answers = { [q.questions[0].id]: 'yes', [q.questions[1].id]: 'no' }
  Supplier.submitVSME(s.id, q.id, answers)
  const latest = Supplier.getLatestVSME(s.id)
  assert.equal(latest.questionnaire_name, '테스트 설문')
  assert.equal(latest.score, 50)
  assert.equal(latest.grade, 'C')
  assert.equal(Supplier.getAssessmentQuestionnaire(latest).questions.length, 2)
  Store.deleteQuestionnaire(q.id)
  assert.equal(Supplier.getQuestionnaires().length, 2)
  assert.equal(Supplier.getAssessmentQuestionnaire(Store.getVSMEAssessments(s.id)[0]).questions.length, 2)
})

test('VSME: 설문 이름 중복과 빈 이름을 거부한다', () => {
  const { Store } = makeEnv()
  Store.addQuestionnaire({ name: '중복 설문', questions: [{ question: 'A?' }] })
  assert.throws(() => Store.addQuestionnaire({ name: '중복 설문', questions: [{ question: 'B?' }] }), /같은 이름/)
  assert.throws(() => Store.addQuestionnaire({ name: '   ', questions: [{ question: 'C?' }] }), /설문 이름/)
})

test('VSME 일괄등록: 가로형(문항ID 컬럼) 파싱', () => {
  const { Supplier } = makeEnv()
  const rows = [
    ['협력사', '업종', '설문지', '입력일', 'vb-1', 'vb-2', 'vb-3'],
    ['대동포리마', '제조', 'VSME 기본 모듈', '2026-03-05', '예', '아니오', '해당없음']
  ]
  const parsed = Supplier.parseBulkRows(rows)
  assert.equal(parsed.format, 'wide')
  assert.equal(parsed.assessments.length, 1)
  assert.equal(parsed.assessments[0].supplierName, '대동포리마')
  assert.equal(parsed.assessments[0].questionnaireId, 'basic')
  assert.equal(parsed.assessments[0].answers['vb-1'], 'yes')
  assert.equal(parsed.assessments[0].answers['vb-2'], 'no')
  assert.equal(parsed.assessments[0].assessedAt.slice(0, 10), '2026-03-05')
})

test('VSME 일괄등록: 세로형(내보내기 응답상세) 파싱·병합', () => {
  const { Supplier } = makeEnv()
  const rows = [
    ['협력사', '업종', '설문지', '응답일', '점수', '등급', '영역', '문항', '응답', '응답코드'],
    ['대동포리마', '제조', 'VSME 기본 모듈', '2026-03-06', '', '', '환경', '환경경영 정책이 있는가?', '예', 'yes'],
    ['대동포리마', '제조', 'VSME 기본 모듈', '2026-03-06', '', '', '환경', '온실가스 배출량을 측정하는가?', '아니오', 'no']
  ]
  const parsed = Supplier.parseBulkRows(rows)
  assert.equal(parsed.format, 'long')
  assert.equal(parsed.assessments.length, 1)
  assert.equal(parsed.assessments[0].answers['vb-1'], 'yes')
  assert.equal(parsed.assessments[0].answers['vb-2'], 'no')
})

test('VSME 일괄등록: 미등록 협력사 자동 생성 후 반영', () => {
  const { Store, Supplier } = makeEnv()
  const parsed = Supplier.parseBulkRows([
    ['협력사', '설문지', '입력일', 'vb-1', 'vb-2'],
    ['신규상사', 'VSME 기본 모듈', '2026-03-07', 'yes', 'yes']
  ])
  const r = Supplier.applyBulkImport(parsed)
  assert.equal(r.createdSuppliers, 1)
  assert.equal(r.created, 1)
  const s = Supplier.getAll().find(x => x.name === '신규상사')
  assert.ok(s)
  assert.equal(Store.getVSMEAssessments(s.id).length, 1)
  assert.equal(s.last_vsme_date.slice(0, 10), '2026-03-07')
  assert.equal(s.last_vsme_score, Math.round(2 / 12 * 100))
})

test('VSME: 입력일 지정 저장 및 과거 입력일은 최근 진단일을 덮어쓰지 않는다', () => {
  const { Store, Supplier } = makeEnv()
  const s = Supplier.add({ name: '입력일테스트' })
  const answers = {}
  Supplier.getVSMEChecklist('basic').forEach(q => { answers[q.id] = 'yes' })
  Supplier.submitVSME(s.id, 'basic', answers, '2026-03-10')
  assert.equal(Supplier.getAll().find(x => String(x.id) === String(s.id)).last_vsme_date.slice(0, 10), '2026-03-10')
  Supplier.submitVSME(s.id, 'basic', answers, '2025-01-01')
  assert.equal(Supplier.getAll().find(x => String(x.id) === String(s.id)).last_vsme_date.slice(0, 10), '2026-03-10')
  assert.equal(Store.getVSMEAssessments(s.id).length, 2)
})
