-- ============================================================
-- Smart ESG - Supabase (PostgreSQL) DDL
-- 실행: Supabase SQL Editor에서 순서대로 실행
-- 주의: tb_evidence_file 생성 후 tb_ghg_activity_data에
--       FK를 ALTER TABLE로 추가하므로 순환참조 없음
-- ============================================================

-- 0. UUID 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 기준 정보 테이블
-- ============================================================

-- 1.1 회사
CREATE TABLE tb_company (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    business_number TEXT,
    ceo_name TEXT,
    address TEXT,
    industry_code TEXT,
    employee_count INT,
    revenue DECIMAL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.2 부서
CREATE TABLE tb_department (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dept_code TEXT UNIQUE NOT NULL,
    dept_name TEXT NOT NULL,
    manager_name TEXT,
    manager_email TEXT,
    parent_dept TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 사용자
CREATE TABLE tb_user (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES tb_company(id) ON DELETE SET NULL,
    dept_code TEXT REFERENCES tb_department(dept_code) ON DELETE SET NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    position TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','manager','user','viewer')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','inactive')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 지표 그룹 (Theme)
CREATE TABLE tb_indicator_group (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    authority_code TEXT NOT NULL CHECK (authority_code IN ('ECOVADIS','KSSB','KCGS','NICE','K-ESG')),
    group_code TEXT NOT NULL,
    group_name TEXT NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    UNIQUE(authority_code, group_code)
);

-- 1.4 세부 지표 (기존 — 그룹 FK 의존)
CREATE TABLE tb_indicator (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES tb_indicator_group(id) ON DELETE CASCADE,
    authority_code TEXT NOT NULL,
    indicator_code TEXT NOT NULL,
    indicator_name TEXT NOT NULL,
    pillar TEXT CHECK (pillar IN ('POLICY','ACTION','RESULT','GOVERNANCE','STRATEGY','RISK_MGMT','METRICS',NULL)),
    description TEXT,
    weight_default DECIMAL DEFAULT 1.0,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    data_type TEXT CHECK (data_type IN ('text','number','boolean','date','file','select')),
    unit TEXT,
    dept_code TEXT,
    review_cycle TEXT CHECK (review_cycle IN ('annual','semi_annual','quarterly','monthly') OR review_cycle IS NULL),
    scope2_split_required BOOLEAN DEFAULT false,
    materiality_optional BOOLEAN DEFAULT true,
    UNIQUE(authority_code, indicator_code)
);

-- 1.4a 세부 지표 마스터 (v1.2 — 그룹 FK 불필요, 단일 키, 카탈로그 역할)
-- tb_indicator_master = 표준 기관이 정의한 지표 목록 (읽기 전용 시드 데이터)
-- tb_indicator = 회사가 실제로 사용하는 지표 인스턴스 (커스터마이징 가능)
CREATE TABLE IF NOT EXISTS tb_indicator_master (
    indicator_code TEXT PRIMARY KEY,
    agency_code TEXT NOT NULL,
    theme_code TEXT NOT NULL,
    indicator_name TEXT NOT NULL,
    pillar_type TEXT NOT NULL CHECK (pillar_type IN ('POLICY','ACTION','RESULT','GOVERNANCE','STRATEGY','RISK_MGMT','METRICS')),
    scope2_split_required BOOLEAN DEFAULT false,
    materiality_optional BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    dept_code TEXT,
    review_cycle TEXT CHECK (review_cycle IN ('annual','semi_annual','quarterly','monthly') OR review_cycle IS NULL),
    description TEXT,
    data_type TEXT CHECK (data_type IN ('text','number','boolean','date','file','select')),
    unit TEXT,
    weight_default DECIMAL DEFAULT 1.0
);

-- 1.5 기관 간 지표 매핑
CREATE TABLE tb_indicator_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_authority TEXT NOT NULL,
    source_indicator_id TEXT NOT NULL REFERENCES tb_indicator_master(indicator_code) ON DELETE CASCADE,
    target_authority TEXT NOT NULL,
    target_indicator_id TEXT NOT NULL REFERENCES tb_indicator_master(indicator_code) ON DELETE CASCADE,
    mapping_type TEXT NOT NULL CHECK (mapping_type IN ('direct','expanded','indirect')),
    confidence TEXT CHECK (confidence IN ('high','medium','low')),
    notes TEXT,
    UNIQUE(source_indicator_id, target_indicator_id)
);

-- ============================================================
-- 2. 평가 테이블
-- ============================================================

-- 2.1 평가 건
CREATE TABLE tb_assessment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES tb_company(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    assessment_year INT NOT NULL,
    authority_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','verified','approved','rejected')),
    total_score DECIMAL,
    rating TEXT,
    created_by UUID REFERENCES tb_user(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.2 평가 항목별 데이터
CREATE TABLE tb_assessment_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES tb_assessment(id) ON DELETE CASCADE,
    indicator_id UUID NOT NULL REFERENCES tb_indicator(id) ON DELETE CASCADE,
    score DECIMAL,
    weight DECIMAL DEFAULT 1.0,
    narrative TEXT,
    target_value TEXT,
    actual_value TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','excluded')),
    UNIQUE(assessment_id, indicator_id)
);

-- ============================================================
-- 3. 증빙 테이블
-- ============================================================

-- 3.1 증빙 메타
CREATE TABLE tb_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES tb_assessment(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT,
    file_type TEXT CHECK (file_type IN ('pdf','xlsx','docx','img','etc')),
    file_size INT,
    status TEXT NOT NULL DEFAULT 'self' CHECK (status IN ('self','internal_reviewed','externally_verified')),
    notes TEXT,
    uploaded_by UUID REFERENCES tb_user(id),
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 3.2 증빙 파일 (실제 파일 바이너리 URL)
CREATE TABLE tb_evidence_file (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evidence_id UUID NOT NULL REFERENCES tb_evidence(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INT,
    mime_type TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 3.3 증빙-지표 태깅 (1:N)
CREATE TABLE tb_evidence_tag (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evidence_id UUID NOT NULL REFERENCES tb_evidence(id) ON DELETE CASCADE,
    indicator_id UUID NOT NULL REFERENCES tb_indicator(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    UNIQUE(evidence_id, indicator_id)
);

-- ============================================================
-- 4. 온실가스 테이블
-- ============================================================

-- 4.1 배출계수
CREATE TABLE tb_ghg_emission_factor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    energy_type TEXT NOT NULL,
    scope INT NOT NULL CHECK (scope IN (1,2,3)),
    scope2_method TEXT CHECK (scope2_method IN ('location-based','market-based',NULL)),
    factor DECIMAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT,
    valid_from DATE,
    valid_to DATE,
    UNIQUE(energy_type, scope, scope2_method, valid_from)
);

-- 4.2 활동자료
CREATE TABLE tb_ghg_activity_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES tb_assessment(id) ON DELETE CASCADE,
    energy_type TEXT NOT NULL,
    scope INT NOT NULL CHECK (scope IN (1,2,3)),
    scope2_method TEXT CHECK (scope2_method IN ('location-based','market-based')),
    value DECIMAL NOT NULL,
    unit TEXT NOT NULL,
    emission_factor_id UUID REFERENCES tb_ghg_emission_factor(id),
    co2eq DECIMAL GENERATED ALWAYS AS (
        CASE
            WHEN emission_factor_id IS NOT NULL
            THEN value * (SELECT factor FROM tb_ghg_emission_factor WHERE id = emission_factor_id)
            ELSE NULL
        END
    ) STORED,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.2b 활동자료 FK (별도 ALTER)
ALTER TABLE tb_ghg_activity_data
    ADD CONSTRAINT fk_ghg_activity_factor
    FOREIGN KEY (emission_factor_id)
    REFERENCES tb_ghg_emission_factor(id);

-- 4.3 GHG 집계 (뷰)
CREATE VIEW vw_ghg_summary AS
SELECT
    assessment_id,
    scope,
    scope2_method,
    SUM(co2eq) AS total_co2eq,
    COUNT(*) AS entry_count
FROM tb_ghg_activity_data
WHERE co2eq IS NOT NULL
GROUP BY assessment_id, scope, scope2_method;

-- ============================================================
-- 5. AI 보고서 테이블
-- ============================================================

-- 5.1 AI 생성 초안
CREATE TABLE tb_ai_report_draft (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES tb_assessment(id) ON DELETE CASCADE,
    indicator_id UUID NOT NULL REFERENCES tb_indicator(id) ON DELETE CASCADE,
    draft_text TEXT NOT NULL,
    evidence_ids UUID[] DEFAULT '{}',
    ver_status TEXT NOT NULL DEFAULT 'pending' CHECK (ver_status IN ('pending','pass','fail')),
    ver_result JSONB,
    ver_date TIMESTAMPTZ,
    human_status TEXT NOT NULL DEFAULT 'pending' CHECK (human_status IN ('pending','approved','rejected','revision_requested')),
    human_reviewer UUID REFERENCES tb_user(id),
    human_reviewed_at TIMESTAMPTZ,
    human_feedback TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5.2 AI 검증 로그
CREATE TABLE tb_ai_verification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draft_id UUID NOT NULL REFERENCES tb_ai_report_draft(id) ON DELETE CASCADE,
    verifier TEXT NOT NULL DEFAULT 'opencode_ai',
    result TEXT NOT NULL CHECK (result IN ('PASS','FAIL')),
    score DECIMAL CHECK (score >= 0 AND score <= 100),
    criteria_results JSONB,
    fail_reasons JSONB,
    suggestions JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. 설정 테이블
-- ============================================================

-- 6.1 가중치 파라미터 (연도별)
CREATE TABLE tb_weight_param (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    authority_code TEXT NOT NULL,
    year INT NOT NULL,
    theme_code TEXT NOT NULL,
    weight DECIMAL NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(authority_code, year, theme_code)
);

-- 6.2 등급 기준 (연도별 갱신 가능)
CREATE TABLE tb_rating_threshold (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    authority_code TEXT NOT NULL,
    year INT NOT NULL,
    rating TEXT NOT NULL,
    min_score DECIMAL NOT NULL,
    max_score DECIMAL,
    notes TEXT,
    effective_from DATE,
    UNIQUE(authority_code, year, rating)
);

-- ============================================================
-- 7. 인덱스
-- ============================================================

CREATE INDEX idx_assessment_company ON tb_assessment(company_id, assessment_year);
CREATE INDEX idx_assessment_authority ON tb_assessment(authority_code, status);
CREATE INDEX idx_assessment_item_assessment ON tb_assessment_item(assessment_id);
CREATE INDEX idx_assessment_item_indicator ON tb_assessment_item(indicator_id);
CREATE INDEX idx_evidence_assessment ON tb_evidence(assessment_id, status);
CREATE INDEX idx_evidence_tag_indicator ON tb_evidence_tag(indicator_id);
CREATE INDEX idx_indicator_group ON tb_indicator_group(authority_code);
CREATE INDEX idx_indicator_group_id ON tb_indicator(group_id);
CREATE INDEX idx_indicator_authority ON tb_indicator(authority_code, is_active);
CREATE INDEX idx_ghg_activity_assessment ON tb_ghg_activity_data(assessment_id);
CREATE INDEX idx_ai_draft_assessment ON tb_ai_report_draft(assessment_id, indicator_id);
CREATE INDEX idx_ai_draft_status ON tb_ai_report_draft(ver_status, human_status);

-- ============================================================
-- 8. 트리거: AI 문장-증빙 연결 검증
-- ============================================================

CREATE OR REPLACE FUNCTION check_ai_evidence_before_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- AI 생성 문장(human_status=approved)인 경우 증빙 연결 필수
    IF NEW.human_status = 'approved' AND NEW.ver_status = 'pass' THEN
        IF NEW.evidence_ids IS NULL OR array_length(NEW.evidence_ids, 1) IS NULL THEN
            RAISE EXCEPTION 'AI 생성 문장을 승인하려면 최소 1개 이상의 증빙(evidence_ids)이 연결되어야 합니다.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_ai_evidence
    BEFORE UPDATE OF human_status ON tb_ai_report_draft
    FOR EACH ROW
    WHEN (NEW.human_status = 'approved')
    EXECUTE FUNCTION check_ai_evidence_before_approval();

-- ============================================================
-- 9. 트리거: 검증 PASS 전 사람 승인 불가
-- ============================================================

CREATE OR REPLACE FUNCTION validate_verification_before_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.human_status = 'approved' AND (OLD.ver_status IS DISTINCT FROM 'pass') THEN
        RAISE EXCEPTION 'AI 검증(PASS)을 통과한 후에만 사람 승인이 가능합니다. 현재 ver_status: %', OLD.ver_status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_verification
    BEFORE UPDATE OF human_status ON tb_ai_report_draft
    FOR EACH ROW
    WHEN (NEW.human_status = 'approved')
    EXECUTE FUNCTION validate_verification_before_approval();

-- ============================================================
-- 10. 시드 데이터: EcoVadis 등급 기준 (2025~2026)
-- ============================================================

INSERT INTO tb_rating_threshold (authority_code, year, grade, min_score, max_score) VALUES
    ('ECOVADIS', 2025, 'Platinum', 78, 100),
    ('ECOVADIS', 2025, 'Gold', 68, 77.99),
    ('ECOVADIS', 2025, 'Silver', 59, 67.99),
    ('ECOVADIS', 2025, 'Bronze', 50, 58.99),
    ('ECOVADIS', 2026, 'Platinum', 82, 100),
    ('ECOVADIS', 2026, 'Gold', 72, 81.99),
    ('ECOVADIS', 2026, 'Silver', 63, 71.99),
    ('ECOVADIS', 2026, 'Bronze', 54, 62.99)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 11. 시드 데이터: EcoVadis 4대 테마 기본 가중치
-- ============================================================

INSERT INTO tb_weight_param (authority_code, year, theme_code, weight) VALUES
    ('ECOVADIS', 2026, 'ENV', 25),
    ('ECOVADIS', 2026, 'LHR', 25),
    ('ECOVADIS', 2026, 'ETH', 25),
    ('ECOVADIS', 2026, 'SP', 25)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 12. 시드 데이터: EcoVadis 지표 그룹 (4대 테마)
-- ============================================================

INSERT INTO tb_indicator_group (authority_code, group_code, group_name, sort_order) VALUES
    ('ECOVADIS', 'ENV', '환경 (Environment)', 1),
    ('ECOVADIS', 'LHR', '노동·인권 (Labor & Human Rights)', 2),
    ('ECOVADIS', 'ETH', '윤리 (Ethics)', 3),
    ('ECOVADIS', 'SP', '지속가능한 조달 (Sustainable Procurement)', 4)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 13. 시드 데이터: KSSB 지표 그룹
-- ============================================================

INSERT INTO tb_indicator_group (authority_code, group_code, group_name, sort_order) VALUES
    ('KSSB', 'KSSB1', '일반사항 (제1호)', 1),
    ('KSSB', 'KSSB2', '기후 (제2호)', 2)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 14. 시드 데이터: KCGS 지표 그룹
-- ============================================================

INSERT INTO tb_indicator_group (authority_code, group_code, group_name, sort_order) VALUES
    ('KCGS', 'E', '환경', 1),
    ('KCGS', 'S', '사회', 2),
    ('KCGS', 'G', '지배구조', 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 15. 시드 데이터: EcoVadis 18개 세부 기준 (P-A-R 필러별)
-- ============================================================
-- tb_indicator_master는 "표준이 정의한 지표 목록" (카탈로그)
-- tb_indicator는 "회사가 실제로 사용하는 지표" (인스턴스)
-- 인스턴스 생성 시 tb_indicator_master.indicator_code를 복사하여 연결

-- ENV (환경)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-ENV-POL', 'ECOVADIS', 'Environment', '환경방침', 'POLICY', false, false),
    ('EV-ENV-OPS', 'ECOVADIS', 'Environment', '사업장 운영 환경영향(에너지·GHG·용수·생물다양성·오염)', 'ACTION', true, true),
    ('EV-ENV-PRD', 'ECOVADIS', 'Environment', '제품 사용·폐기 영향', 'ACTION', false, true),
    ('EV-ENV-CERT', 'ECOVADIS', 'Environment', '환경 인증(ISO14001 등)', 'ACTION', false, false),
    ('EV-ENV-RES', 'ECOVADIS', 'Environment', '환경성과 보고', 'RESULT', true, false)
ON CONFLICT (indicator_code) DO NOTHING;

-- LHR (노동·인권)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-LHR-POL', 'ECOVADIS', 'Labor & Human Rights', '인권·노동 정책', 'POLICY', false, false),
    ('EV-LHR-HRM', 'ECOVADIS', 'Labor & Human Rights', '인적자원관리(재해예방/교육/근로조건)', 'ACTION', false, false),
    ('EV-LHR-HR', 'ECOVADIS', 'Labor & Human Rights', '인권(노동법준수/다양성/차별금지)', 'ACTION', false, false),
    ('EV-LHR-RES', 'ECOVADIS', 'Labor & Human Rights', '노동·인권 성과 보고', 'RESULT', false, false)
ON CONFLICT (indicator_code) DO NOTHING;

-- ETH (윤리)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-ETH-POL', 'ECOVADIS', 'Ethics', '윤리·반부패 정책', 'POLICY', false, false),
    ('EV-ETH-COR', 'ECOVADIS', 'Ethics', '부패방지 조치', 'ACTION', false, false),
    ('EV-ETH-COMP', 'ECOVADIS', 'Ethics', '공정경쟁(반경쟁행위 방지)', 'ACTION', false, false),
    ('EV-ETH-INFO', 'ECOVADIS', 'Ethics', '정보관리 책임(정보보안)', 'ACTION', false, false)
ON CONFLICT (indicator_code) DO NOTHING;

-- SP (지속가능한 조달)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-SP-POL', 'ECOVADIS', 'Sustainable Procurement', '지속가능조달 정책', 'POLICY', false, false),
    ('EV-SP-ENV', 'ECOVADIS', 'Sustainable Procurement', '공급사 환경실사', 'ACTION', false, false),
    ('EV-SP-SOC', 'ECOVADIS', 'Sustainable Procurement', '공급사 사회(노동·인권)실사', 'ACTION', false, false),
    ('EV-SP-RES', 'ECOVADIS', 'Sustainable Procurement', '조달 성과(커버리지/개선율)', 'RESULT', false, false),
    ('EV-360', 'ECOVADIS', 'Cross-cutting', '360° Watch 외부 모니터링', 'RESULT', false, false)
ON CONFLICT (indicator_code) DO NOTHING;

-- ============================================================
-- 16. 시드 데이터: KSSB 지표 (ISSB 4대 축)
-- ============================================================

-- KSSB 제1호 - 일반사항
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required) VALUES
    ('KSSB1-GOV', 'KSSB', 'General', '지속가능성 관련 거버넌스', 'GOVERNANCE', false),
    ('KSSB1-STRAT', 'KSSB', 'General', '지속가능성 관련 전략·재무영향', 'STRATEGY', false),
    ('KSSB1-RISK', 'KSSB', 'General', '지속가능성 위험관리 절차', 'RISK_MGMT', false),
    ('KSSB1-MET', 'KSSB', 'General', '지속가능성 지표 및 목표', 'METRICS', false)
ON CONFLICT (indicator_code) DO NOTHING;

-- KSSB 제2호 - 기후
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required) VALUES
    ('KSSB2-GOV', 'KSSB2', 'Climate', '기후 관련 거버넌스', 'GOVERNANCE', false),
    ('KSSB2-STRAT', 'KSSB2', 'Climate', '기후 관련 전략·재무영향', 'STRATEGY', false),
    ('KSSB2-RISK', 'KSSB2', 'Climate', '기후 위험관리 절차', 'RISK_MGMT', false),
    ('KSSB2-MET', 'KSSB2', 'Climate', 'Scope1/2/3 배출량 등 기후지표·목표', 'METRICS', true)
ON CONFLICT (indicator_code) DO NOTHING;

-- ============================================================
-- 17. 시드 데이터: KCGS / NICE (대분류)
-- ============================================================

INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type) VALUES
    ('KCGS-ENV', 'KCGS', 'Environment', '환경 부문 공시자료', 'RESULT'),
    ('KCGS-SOC', 'KCGS', 'Social', '사회 부문 공시자료', 'RESULT'),
    ('KCGS-GOV', 'KCGS', 'Governance', '지배구조 부문 공시자료', 'RESULT'),
    ('NICE-ENV', 'NICE', 'Environment', '환경 부문 공시자료', 'RESULT'),
    ('NICE-SOC', 'NICE', 'Social', '사회 부문 공시자료', 'RESULT'),
    ('NICE-GOV', 'NICE', 'Governance', '지배구조 부문 공시자료', 'RESULT')
ON CONFLICT (indicator_code) DO NOTHING;

-- ============================================================
-- 17-2. 시드 데이터: K-ESG 가이드라인 (E·S·G)
-- ============================================================

INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required) VALUES
    ('KESG-E1', 'K-ESG', 'Environment', '환경경영', 'RESULT', false),
    ('KESG-E2', 'K-ESG', 'Environment', '탄소중립', 'RESULT', true),
    ('KESG-S1', 'K-ESG', 'Social', '사회공헌', 'RESULT', false),
    ('KESG-S2', 'K-ESG', 'Social', '안전보건', 'RESULT', false),
    ('KESG-G1', 'K-ESG', 'Governance', '윤리경영', 'RESULT', false),
    ('KESG-G2', 'K-ESG', 'Governance', '정보공개', 'RESULT', false)
ON CONFLICT (indicator_code) DO NOTHING;

-- ============================================================
-- 18. 시드 데이터: KSSB ↔ EcoVadis 매핑 (핵심 항목)
-- ============================================================

INSERT INTO tb_indicator_mapping (source_authority, source_indicator_id, target_authority, target_indicator_id, mapping_type, confidence)
SELECT 'ECOVADIS', s.indicator_code, 'KSSB', t.indicator_code, m.type, m.conf
FROM (VALUES
    ('EV-ENV-OPS', 'KSSB2-MET', 'expanded', 'high'),
    ('EV-ENV-POL', 'KSSB1-GOV', 'expanded', 'high'),
    ('EV-ENV-POL', 'KSSB1-STRAT', 'expanded', 'high'),
    ('EV-ENV-OPS', 'KSSB1-MET', 'indirect', 'medium'),
    ('EV-ETH-INFO', 'KSSB1-GOV', 'indirect', 'medium'),
    ('EV-LHR-HR', 'KSSB1-RISK', 'direct', 'high'),
    ('EV-SP-POL', 'KSSB1-RISK', 'indirect', 'medium')
) AS m(src_code, tgt_code, type, conf)
JOIN tb_indicator_master s ON s.agency_code='ECOVADIS' AND s.indicator_code=m.src_code
JOIN tb_indicator_master t ON t.agency_code='KSSB' AND t.indicator_code=m.tgt_code
ON CONFLICT DO NOTHING;

-- ============================================================
-- 완료
-- ============================================================

-- ============================================================
-- 18. v1.1 스키마: 기관 마스터 테이블
-- ============================================================

CREATE TABLE tb_agency_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    track_type TEXT NOT NULL DEFAULT 'VOLUNTARY' CHECK (track_type IN ('VOLUNTARY','MANDATORY')),
    description TEXT,
    effective_date DATE,
    website_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO tb_agency_master (code, name, track_type, description, effective_date) VALUES
    ('ECOVADIS', 'EcoVadis', 'VOLUNTARY', '글로벌 ESG 평가기관, P-A-R 필러 가중치', NULL),
    ('KSSB', 'KSSB (지속가능성 기준위원회)', 'MANDATORY', '한국 지속가능성 기준, 법정 공시 의무', '2025-03-01'),
    ('KCGS', 'KCGS (한국기업지배구조원)', 'VOLUNTARY', 'ESG 등급 평가, 5등급 체계', NULL),
    ('NICE', 'NICE (나이스평가정보)', 'VOLUNTARY', '중소기업 ESG 평가, 기본/심화 모드', NULL),
    ('ISSB', 'ISSB (국제지속가능성기준위원회)', 'MANDATORY', 'IFRS S1/S2 국제 공시기준', '2024-01-01')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 19a. v1.1 스키마: 부서 마스터 시드 데이터
-- ============================================================

INSERT INTO tb_department (dept_code, dept_name, manager_name, manager_email, parent_dept, is_active) VALUES
    ('ESG', 'ESG경영팀', NULL, NULL, NULL, true),
    ('ENV', '환경팀', NULL, NULL, 'ESG', true),
    ('HR', '인사팀', NULL, NULL, NULL, true),
    ('FIN', '재무팀', NULL, NULL, NULL, true),
    ('PRD', '생산팀', NULL, NULL, NULL, true),
    ('QAL', '품질관리팀', NULL, NULL, NULL, true),
    ('PUR', '구매팀', NULL, NULL, NULL, true),
    ('IT', 'IT팀', NULL, NULL, NULL, true),
    ('LAW', '법무팀', NULL, NULL, NULL, true),
    ('SAF', '안전보건팀', NULL, NULL, 'ENV', true),
    ('GEN', '총무팀', NULL, NULL, NULL, true),
    ('MKT', '마케팅팀', NULL, NULL, NULL, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 19. v1.1 스키마: 데이터 마스킹 규칙
-- ============================================================

CREATE TABLE tb_data_masking_rule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_name TEXT NOT NULL UNIQUE,
    masking_type TEXT NOT NULL CHECK (masking_type IN ('FULL','PARTIAL','AGGREGATE_ONLY')),
    description TEXT,
    applies_to_ai_api BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO tb_data_masking_rule (field_name, masking_type, description, applies_to_ai_api) VALUES
    ('employee_name', 'FULL', '직원 이름 전체 마스킹', true),
    ('business_number', 'FULL', '사업자등록번호 마스킹', true),
    ('revenue', 'AGGREGATE_ONLY', '매출액 개별값 숨김, 합계만 노출', true),
    ('salary_info', 'PARTIAL', '급여 정보 부분 마스킹', true),
    ('email', 'PARTIAL', '이메일 부분 마스킹', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 20. v1.1 스키마: 프로젝트 예산 관리
-- ============================================================

CREATE TABLE tb_project_budget (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('system','personnel','consulting','training','etc')),
    planned_amount DECIMAL NOT NULL DEFAULT 0,
    actual_amount DECIMAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','on_hold')),
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO tb_project_budget (project_name, category, planned_amount, actual_amount, status) VALUES
    ('Smart ESG 시스템 구축', 'system', 50000000, 35000000, 'in_progress'),
    ('ESG 교육 컨설팅', 'consulting', 15000000, 8000000, 'in_progress'),
    ('GHG 측정 시스템', 'system', 20000000, 0, 'planned')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 21. v1.1 스키마: 리스크 레지스터
-- ============================================================

CREATE TABLE tb_risk_register (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    risk_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('climate','resource','biodiversity','labor','governance','supply_chain')),
    description TEXT,
    probability INT NOT NULL CHECK (probability >= 1 AND probability <= 5),
    impact INT NOT NULL CHECK (impact >= 1 AND impact <= 5),
    score INT GENERATED ALWAYS AS (probability * impact) STORED,
    status TEXT NOT NULL DEFAULT 'identified' CHECK (status IN ('identified','mitigating','monitoring','closed')),
    owner TEXT,
    mitigation_plan TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO tb_risk_register (risk_name, category, description, probability, impact, status) VALUES
    ('탄소세 도입 리스크', 'climate', 'EU CBAM 등 탄소 국경세 도입에 따른 비용 증가', 4, 5, 'mitigating'),
    ('공급망 인권 리스크', 'supply_chain', '협력사 인권 침해 이슈 발생 가능성', 3, 4, 'identified'),
    ('데이터 유출 리스크', 'governance', 'ESG 데이터 관리 부실로 인한 정보 유출', 2, 5, 'identified')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 22. v1.1 스키마: GHG 요약 저장소
-- ============================================================

CREATE TABLE tb_ghg_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES tb_assessment(id) ON DELETE CASCADE,
    scope INT NOT NULL CHECK (scope IN (1,2,3)),
    scope2_method TEXT CHECK (scope2_method IN ('location-based','market-based')),
    total DECIMAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'tCO2eq',
    last_updated TIMESTAMPTZ DEFAULT now(),
    UNIQUE(assessment_id, scope, scope2_method)
);

-- ============================================================
-- 23. v1.1 스키마: 기존 테이블 ALTER (지표 필드 추가 — tb_indicator)
-- ============================================================

ALTER TABLE tb_indicator
    ADD COLUMN IF NOT EXISTS dept_code TEXT,
    ADD COLUMN IF NOT EXISTS review_cycle TEXT CHECK (review_cycle IN ('annual','semi_annual','quarterly','monthly') OR review_cycle IS NULL),
    ADD COLUMN IF NOT EXISTS scope2_split_required BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS materiality_optional BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS indicator_code TEXT,
    ADD COLUMN IF NOT EXISTS theme_code TEXT;

-- tb_indicator.indicator_code 유니크 제약조건 (마스터 카탈로그 연결용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_indicator_code_unique ON tb_indicator(indicator_code) WHERE indicator_code IS NOT NULL;

-- tb_indicator.indicator_code → tb_indicator_master.indicator_code FK (카탈로그 연결)
-- NOTE: FK는 시드 데이터 삽입 후 추가 (지표 인스턴스 생성 시 마스터에서 복사)

-- ============================================================
-- 23a. v1.3 스키마: tb_rating_threshold max_score 컬럼 추가
-- ============================================================

ALTER TABLE tb_rating_threshold
    ADD COLUMN IF NOT EXISTS max_score DECIMAL;

-- ============================================================
-- 24. v1.1 스키마: 기존 테이블 ALTER (증빙 필드 추가)
-- ============================================================

ALTER TABLE tb_evidence
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS contains_sensitive_data BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reuse_linked_indicators UUID[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS upload_count_flag BOOLEAN DEFAULT false;

-- ============================================================
-- 25. v1.1 스키마: AI 초안 필드 추가
-- ============================================================

ALTER TABLE tb_ai_report_draft
    ADD COLUMN IF NOT EXISTS masked_before_send BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS cited_evidence_ids UUID[] DEFAULT '{}';

-- ============================================================
-- 26. v1.1 스키마: (tb_rating_threshold는 CREATE TABLE에 max_score, effective_from 포함)

-- ============================================================
-- 27. v1.1 스키마: GHG 활동 필드 추가
-- ============================================================

ALTER TABLE tb_ghg_activity_data
    ADD COLUMN IF NOT EXISTS dept_code TEXT,
    ADD COLUMN IF NOT EXISTS evidence_id UUID,
    ADD COLUMN IF NOT EXISTS calculated_emission DECIMAL;

-- ============================================================
-- 28. v1.1 인덱스 추가
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_agency_master_code ON tb_agency_master(code);
CREATE INDEX IF NOT EXISTS idx_agency_master_track ON tb_agency_master(track_type);
CREATE INDEX IF NOT EXISTS idx_risk_register_category ON tb_risk_register(category, status);
CREATE INDEX IF NOT EXISTS idx_risk_register_score ON tb_risk_register(score DESC);
CREATE INDEX IF NOT EXISTS idx_project_budget_status ON tb_project_budget(status);
CREATE INDEX IF NOT EXISTS idx_masking_rule_active ON tb_data_masking_rule(is_active, applies_to_ai_api);
CREATE INDEX IF NOT EXISTS idx_ghg_summary_assessment ON tb_ghg_summary(assessment_id);
CREATE INDEX IF NOT EXISTS idx_evidence_expiry ON tb_evidence(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_draft_masked ON tb_ai_report_draft(masked_before_send);
CREATE INDEX IF NOT EXISTS idx_indicator_dept ON tb_indicator(dept_code) WHERE dept_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_indicator_code ON tb_indicator(indicator_code) WHERE indicator_code IS NOT NULL;

-- ============================================================
-- 29. v1.1 트리거: AI 생성 emission 산정금지 검증
-- ============================================================

CREATE OR REPLACE FUNCTION check_no_ai_generated_emission()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.calculated_emission IS NOT NULL AND NEW.calculated_emission != NEW.value * (
        SELECT factor FROM tb_ghg_emission_factor WHERE id = NEW.emission_factor_id
    ) THEN
        RAISE EXCEPTION 'GHG 배출량은 AI가 생성할 수 없습니다. 배출계수를 이용한 산정만 허용됩니다.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 완료 (v1.1 스키마)
-- ============================================================
