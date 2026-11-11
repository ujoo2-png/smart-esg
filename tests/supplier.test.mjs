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
