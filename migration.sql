-- ============================================================
-- Smart ESG - Supabase (PostgreSQL) DDL  [미러 모드 v2]
-- 실행: Supabase SQL Editor에서 전체 실행 (기존 테이블 자동 리셋)
--
-- 설계 원칙
--   앱 저장은 localStorage가 원본(source of truth)이고
--   Supabase는 그 사본을 그대로 받아두는 "미러" 역할이다.
--   따라서 스키마는 앱 데이터를 100% 수용하도록 완화한다.
--     - id: UUID 대신 TEXT (앱은 Date.now()+rand 숫자 id 사용)
--     - FK / NOT NULL / UNIQUE / CHECK 제거 (앱 데이터가 위반할 수 있음)
--     - 검증 트리거 미설치 (함수 정의만 남겨 필요 시 재활성화)
--     - RLS 비활성 + anon/authenticated/service_role GRANT 부여
--   무결성/검증은 앱 레이어에서 담당한다.
-- ============================================================

-- ============================================================
-- 0. 리셋 (재실행 안전: 기존 객체 제거)
-- ============================================================

DROP VIEW  IF EXISTS vw_ghg_summary;
DROP TABLE IF EXISTS
    tb_company, tb_department, tb_user, tb_indicator_group, tb_indicator,
    tb_indicator_master, tb_indicator_mapping, tb_assessment, tb_assessment_item,
    tb_evidence, tb_evidence_file, tb_evidence_tag, tb_ghg_emission_factor,
    tb_ghg_activity_data, tb_ai_report_draft, tb_ai_verification_log,
    tb_weight_param, tb_rating_threshold, tb_agency_master, tb_data_masking_rule,
    tb_project_budget, tb_risk_register, tb_ghg_summary, tb_reference_doc,
    tb_report_doc, tb_report_doc_section, tb_report_feedback, tb_reference_chunk
    CASCADE;

DROP FUNCTION IF EXISTS calculate_co2eq() CASCADE;
DROP FUNCTION IF EXISTS check_ai_evidence_before_approval() CASCADE;
DROP FUNCTION IF EXISTS validate_verification_before_approval() CASCADE;
DROP FUNCTION IF EXISTS check_no_ai_generated_emission() CASCADE;

-- ============================================================
-- 1. 기준 정보 테이블
-- ============================================================

-- 1.1 회사
CREATE TABLE tb_company (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT,
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
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    dept_code TEXT,
    dept_name TEXT,
    manager_name TEXT,
    manager_email TEXT,
    parent_dept TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 사용자
CREATE TABLE tb_user (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id TEXT,
    dept_code TEXT,
    username TEXT,
    password TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    position TEXT,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.4 지표 그룹 (Theme)
CREATE TABLE tb_indicator_group (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    authority_code TEXT,
    group_code TEXT,
    group_name TEXT,
    description TEXT,
    sort_order INT DEFAULT 0
);

-- 1.5 세부 지표 (회사 사용 인스턴스)
CREATE TABLE tb_indicator (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_id TEXT,
    authority_code TEXT,
    indicator_code TEXT,
    indicator_name TEXT,
    pillar TEXT,
    description TEXT,
    weight_default DECIMAL DEFAULT 1.0,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    data_type TEXT,
    unit TEXT,
    dept_code TEXT,
    review_cycle TEXT,
    scope2_split_required BOOLEAN DEFAULT false,
    materiality_optional BOOLEAN DEFAULT true,
    theme_code TEXT
);

-- 1.6 세부 지표 마스터 (표준 기관 카탈로그, 읽기 전용 시드)
CREATE TABLE tb_indicator_master (
    indicator_code TEXT PRIMARY KEY,
    agency_code TEXT,
    theme_code TEXT,
    indicator_name TEXT,
    pillar_type TEXT,
    scope2_split_required BOOLEAN DEFAULT false,
    materiality_optional BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    dept_code TEXT,
    review_cycle TEXT,
    description TEXT,
    data_type TEXT,
    unit TEXT,
    weight_default DECIMAL DEFAULT 1.0
);

-- 1.7 기관 간 지표 매핑
CREATE TABLE tb_indicator_mapping (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    source_authority TEXT,
    source_indicator_id TEXT,
    target_authority TEXT,
    target_indicator_id TEXT,
    mapping_type TEXT,
    confidence TEXT,
    notes TEXT
);

-- ============================================================
-- 2. 평가 테이블
-- ============================================================

CREATE TABLE tb_assessment (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id TEXT,
    title TEXT,
    assessment_year INT,
    authority_code TEXT,
    status TEXT DEFAULT 'draft',
    total_score DECIMAL,
    rating TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tb_assessment_item (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    assessment_id TEXT,
    indicator_id TEXT,
    score DECIMAL,
    weight DECIMAL DEFAULT 1.0,
    narrative TEXT,
    target_value TEXT,
    actual_value TEXT,
    status TEXT DEFAULT 'pending'
);

-- ============================================================
-- 3. 증빙 테이블
-- ============================================================

CREATE TABLE tb_evidence (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    assessment_id TEXT,
    title TEXT,
    description TEXT,
    file_url TEXT,
    file_type TEXT,
    file_size INT,
    status TEXT DEFAULT 'self',
    notes TEXT,
    uploaded_by TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    expiry_date DATE,
    contains_sensitive_data BOOLEAN DEFAULT false,
    reuse_linked_indicators TEXT[] DEFAULT '{}',
    upload_count_flag BOOLEAN DEFAULT false
);

CREATE TABLE tb_evidence_file (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    evidence_id TEXT,
    file_name TEXT,
    file_path TEXT,
    file_size INT,
    mime_type TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tb_evidence_tag (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    evidence_id TEXT,
    indicator_id TEXT,
    is_primary BOOLEAN DEFAULT false
);

-- ============================================================
-- 4. 온실가스 테이블
-- ============================================================

CREATE TABLE tb_ghg_emission_factor (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    energy_type TEXT,
    scope INT,
    scope2_method TEXT,
    factor DECIMAL,
    unit TEXT,
    source TEXT,
    valid_from DATE,
    valid_to DATE
);

CREATE TABLE tb_ghg_activity_data (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    assessment_id TEXT,
    energy_type TEXT,
    scope INT,
    scope2_method TEXT,
    value DECIMAL,
    unit TEXT,
    emission_factor_id TEXT,
    co2eq DECIMAL,
    period_start DATE,
    period_end DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    dept_code TEXT,
    evidence_id TEXT,
    calculated_emission DECIMAL
);

-- 배출량 산정 트리거 함수 (미러 모드에서는 미설치, 필요 시 CREATE TRIGGER로 활성화)
CREATE OR REPLACE FUNCTION calculate_co2eq()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.emission_factor_id IS NOT NULL THEN
        NEW.co2eq := NEW.value * (SELECT factor FROM tb_ghg_emission_factor WHERE id = NEW.emission_factor_id);
    ELSE
        NEW.co2eq := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE TABLE tb_ai_report_draft (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    assessment_id TEXT,
    indicator_id TEXT,
    draft_text TEXT,
    evidence_ids TEXT[] DEFAULT '{}',
    ver_status TEXT DEFAULT 'pending',
    ver_result JSONB,
    ver_date TIMESTAMPTZ,
    human_status TEXT DEFAULT 'pending',
    human_reviewer TEXT,
    human_reviewed_at TIMESTAMPTZ,
    human_feedback TEXT,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    masked_before_send BOOLEAN DEFAULT false,
    cited_evidence_ids TEXT[] DEFAULT '{}'
);

CREATE TABLE tb_ai_verification_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    draft_id TEXT,
    verifier TEXT DEFAULT 'opencode_ai',
    result TEXT,
    score DECIMAL,
    criteria_results JSONB,
    fail_reasons JSONB,
    suggestions JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. 설정 테이블
-- ============================================================

CREATE TABLE tb_weight_param (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    authority_code TEXT,
    year INT,
    theme_code TEXT,
    weight DECIMAL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tb_rating_threshold (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    authority_code TEXT,
    year INT,
    rating TEXT,
    min_score DECIMAL,
    max_score DECIMAL,
    notes TEXT,
    effective_from DATE
);

-- ============================================================
-- 7. v1.1 스키마: 기관 마스터
-- ============================================================

CREATE TABLE tb_agency_master (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code TEXT,
    name TEXT,
    track_type TEXT DEFAULT 'VOLUNTARY',
    description TEXT,
    effective_date DATE,
    website_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. v1.1 스키마: 데이터 마스킹 규칙
-- ============================================================

CREATE TABLE tb_data_masking_rule (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    field_name TEXT,
    masking_type TEXT,
    description TEXT,
    applies_to_ai_api BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. v1.1 스키마: 프로젝트 예산
-- ============================================================

CREATE TABLE tb_project_budget (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_name TEXT,
    category TEXT,
    planned_amount DECIMAL DEFAULT 0,
    actual_amount DECIMAL DEFAULT 0,
    status TEXT DEFAULT 'planned',
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. v1.1 스키마: 리스크 레지스터
-- ============================================================

CREATE TABLE tb_risk_register (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    risk_name TEXT,
    category TEXT,
    description TEXT,
    probability INT,
    impact INT,
    score INT GENERATED ALWAYS AS (probability * impact) STORED,
    status TEXT DEFAULT 'identified',
    owner TEXT,
    mitigation_plan TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 11. v1.1 스키마: GHG 요약 저장소
-- ============================================================

CREATE TABLE tb_ghg_summary (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    assessment_id TEXT,
    scope INT,
    scope2_method TEXT,
    total DECIMAL DEFAULT 0,
    unit TEXT DEFAULT 'tCO2eq',
    last_updated TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 12. 참고자료 라이브러리 / 보고서 작성기 (v1.9.9)
-- ============================================================

CREATE TABLE tb_reference_doc (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT,
    source_org TEXT,
    industry TEXT,
    year INT,
    file_name TEXT,
    file_type TEXT,
    mime_type TEXT,
    file_size BIGINT,
    storage_path TEXT,
    markdown TEXT,
    page_count INT DEFAULT 0,
    chunk_count INT DEFAULT 0,
    engine TEXT,
    status TEXT DEFAULT 'pending',
    error TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    converted_at TIMESTAMPTZ
);

CREATE TABLE tb_report_doc (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT,
    status TEXT DEFAULT 'draft',
    progress INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tb_report_doc_section (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    doc_id TEXT,
    title TEXT,
    content TEXT,
    sort_order INT DEFAULT 0,
    status TEXT DEFAULT 'empty',
    indicator_refs JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tb_report_feedback (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    doc_id TEXT,
    section_id TEXT,
    kind TEXT,
    message TEXT,
    suggestion TEXT,
    reference_title TEXT,
    page INT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tb_reference_chunk (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    reference_id TEXT,
    page INT,
    section_title TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 13. 인덱스
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
CREATE INDEX idx_indicator_code ON tb_indicator(indicator_code);
CREATE INDEX idx_indicator_dept ON tb_indicator(dept_code);
CREATE INDEX idx_ghg_activity_assessment ON tb_ghg_activity_data(assessment_id);
CREATE INDEX idx_ghg_summary_assessment ON tb_ghg_summary(assessment_id);
CREATE INDEX idx_ai_draft_assessment ON tb_ai_report_draft(assessment_id, indicator_id);
CREATE INDEX idx_ai_draft_status ON tb_ai_report_draft(ver_status, human_status);
CREATE INDEX idx_agency_master_code ON tb_agency_master(code);
CREATE INDEX idx_agency_master_track ON tb_agency_master(track_type);
CREATE INDEX idx_risk_register_category ON tb_risk_register(category, status);
CREATE INDEX idx_project_budget_status ON tb_project_budget(status);
CREATE INDEX idx_masking_rule_active ON tb_data_masking_rule(is_active, applies_to_ai_api);
CREATE INDEX idx_evidence_expiry ON tb_evidence(expiry_date);
CREATE INDEX idx_reference_doc_status ON tb_reference_doc(status);
CREATE INDEX idx_reference_chunk_ref ON tb_reference_chunk(reference_id);
CREATE INDEX idx_report_section_doc ON tb_report_doc_section(doc_id, sort_order);
CREATE INDEX idx_report_feedback_section ON tb_report_feedback(section_id, status);

-- ============================================================
-- 14. 검증 트리거 함수
--     미러 모드에서는 트리거를 설치하지 않는다.
--     (앱 데이터가 위반할 수 있어 동기화가 실패하기 때문)
--     무결성 규칙을 DB에서 강제하려면 아래 함수로 CREATE TRIGGER 하면 된다.
-- ============================================================

CREATE OR REPLACE FUNCTION check_ai_evidence_before_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.human_status = 'approved' AND NEW.ver_status = 'pass' THEN
        IF NEW.evidence_ids IS NULL OR array_length(NEW.evidence_ids, 1) IS NULL THEN
            RAISE EXCEPTION 'AI 생성 문장을 승인하려면 최소 1개 이상의 증빙(evidence_ids)이 연결되어야 합니다.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_verification_before_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.human_status = 'approved' AND (OLD.ver_status IS DISTINCT FROM 'pass') THEN
        RAISE EXCEPTION 'AI 검증(PASS)을 통과한 후에만 사람 승인이 가능합니다. 현재 ver_status: %', OLD.ver_status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
-- 15. 시드 데이터
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
    ('MKT', '마케팅팀', NULL, NULL, NULL, true);

INSERT INTO tb_agency_master (code, name, track_type, description, effective_date) VALUES
    ('ECOVADIS', 'EcoVadis', 'VOLUNTARY', '글로벌 ESG 평가기관, P-A-R 필러 가중치', NULL),
    ('KSSB', 'KSSB (지속가능성 기준위원회)', 'MANDATORY', '한국 지속가능성 기준, 법정 공시 의무', '2025-03-01'),
    ('KCGS', 'KCGS (한국기업지배구조원)', 'VOLUNTARY', 'ESG 등급 평가, 5등급 체계', NULL),
    ('NICE', 'NICE (나이스평가정보)', 'VOLUNTARY', '중소기업 ESG 평가, 기본/심화 모드', NULL),
    ('ISSB', 'ISSB (국제지속가능성기준위원회)', 'MANDATORY', 'IFRS S1/S2 국제 공시기준', '2024-01-01');

INSERT INTO tb_data_masking_rule (field_name, masking_type, description, applies_to_ai_api) VALUES
    ('employee_name', 'FULL', '직원 이름 전체 마스킹', true),
    ('business_number', 'FULL', '사업자등록번호 마스킹', true),
    ('revenue', 'AGGREGATE_ONLY', '매출액 개별값 숨김, 합계만 노출', true),
    ('salary_info', 'PARTIAL', '급여 정보 부분 마스킹', true),
    ('email', 'PARTIAL', '이메일 부분 마스킹', true);

INSERT INTO tb_project_budget (project_name, category, planned_amount, actual_amount, status) VALUES
    ('Smart ESG 시스템 구축', 'system', 50000000, 35000000, 'in_progress'),
    ('ESG 교육 컨설팅', 'consulting', 15000000, 8000000, 'in_progress'),
    ('GHG 측정 시스템', 'system', 20000000, 0, 'planned');

INSERT INTO tb_risk_register (risk_name, category, description, probability, impact, status) VALUES
    ('탄소세 도입 리스크', 'climate', 'EU CBAM 등 탄소 국경세 도입에 따른 비용 증가', 4, 5, 'mitigating'),
    ('공급망 인권 리스크', 'supply_chain', '협력사 인권 침해 이슈 발생 가능성', 3, 4, 'identified'),
    ('데이터 유출 리스크', 'governance', 'ESG 데이터 관리 부실로 인한 정보 유출', 2, 5, 'identified');

INSERT INTO tb_ghg_emission_factor (energy_type, scope, scope2_method, factor, unit, source) VALUES
    ('electricity', 2, 'location-based', 0.4781, 'tCO2eq/MWh', 'KEPCO 2024'),
    ('electricity', 2, 'market-based', 0.3542, 'tCO2eq/MWh', 'KEPCO 2024 (REC)'),
    ('natural_gas', 1, NULL, 0.202, 'tCO2eq/MWh', 'IPCC'),
    ('diesel', 1, NULL, 2.68, 'tCO2eq/kL', 'IPCC'),
    ('gasoline', 1, NULL, 2.31, 'tCO2eq/kL', 'IPCC'),
    ('water', 3, NULL, 0.00034, 'tCO2eq/ton', 'K-Water 2024'),
    ('waste', 3, NULL, 0.42, 'tCO2eq/ton', 'ME 2024'),
    ('business_travel', 3, NULL, 0.255, 'tCO2eq/km', 'DEFRA 2024 (항공)'),
    ('commuting', 3, NULL, 0.15, 'tCO2eq/km', 'ME 2024 (자동차)'),
    ('transportation', 3, NULL, 0.062, 'tCO2eq/tkm', 'GLEC 2024'),
    ('purchased_goods', 3, NULL, 1.2, 'tCO2eq/ton', 'ECOFYS 2024'),
    ('capital_goods', 3, NULL, 0.8, 'tCO2eq/ton', 'ECOFYS 2024'),
    ('fuel_related', 3, NULL, 0.89, 'tCO2eq/MWh', 'IPCC'),
    ('upstream_transport', 3, NULL, 0.048, 'tCO2eq/tkm', 'GLEC 2024'),
    ('waste_generated', 3, NULL, 0.58, 'tCO2eq/ton', 'ME 2024');

INSERT INTO tb_rating_threshold (authority_code, year, rating, min_score, max_score) VALUES
    ('ECOVADIS', 2025, 'Platinum', 78, 100),
    ('ECOVADIS', 2025, 'Gold', 68, 77.99),
    ('ECOVADIS', 2025, 'Silver', 59, 67.99),
    ('ECOVADIS', 2025, 'Bronze', 50, 58.99),
    ('ECOVADIS', 2026, 'Platinum', 82, 100),
    ('ECOVADIS', 2026, 'Gold', 72, 81.99),
    ('ECOVADIS', 2026, 'Silver', 63, 71.99),
    ('ECOVADIS', 2026, 'Bronze', 54, 62.99);

INSERT INTO tb_weight_param (authority_code, year, theme_code, weight) VALUES
    ('ECOVADIS', 2026, 'ENV', 25),
    ('ECOVADIS', 2026, 'LHR', 25),
    ('ECOVADIS', 2026, 'ETH', 25),
    ('ECOVADIS', 2026, 'SP', 25);

INSERT INTO tb_indicator_group (authority_code, group_code, group_name, sort_order) VALUES
    ('ECOVADIS', 'ENV', '환경 (Environment)', 1),
    ('ECOVADIS', 'LHR', '노동·인권 (Labor & Human Rights)', 2),
    ('ECOVADIS', 'ETH', '윤리 (Ethics)', 3),
    ('ECOVADIS', 'SP', '지속가능한 조달 (Sustainable Procurement)', 4),
    ('KSSB', 'KSSB1', '일반사항 (제1호)', 1),
    ('KSSB', 'KSSB2', '기후 (제2호)', 2),
    ('KCGS', 'E', '환경', 1),
    ('KCGS', 'S', '사회', 2),
    ('KCGS', 'G', '지배구조', 3);

-- ENV (환경)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-ENV-POL', 'ECOVADIS', 'Environment', '환경방침', 'POLICY', false, false),
    ('EV-ENV-OPS', 'ECOVADIS', 'Environment', '사업장 운영 환경영향(에너지·GHG·용수·생물다양성·오염)', 'ACTION', true, true),
    ('EV-ENV-PRD', 'ECOVADIS', 'Environment', '제품 사용·폐기 영향', 'ACTION', false, true),
    ('EV-ENV-CERT', 'ECOVADIS', 'Environment', '환경 인증(ISO14001 등)', 'ACTION', false, false),
    ('EV-ENV-RES', 'ECOVADIS', 'Environment', '환경성과 보고', 'RESULT', true, false),
    ('EV-ENV-ANO', 'ECOVADIS', 'Environment', '대기·소음·악취', 'RESULT', false, false);

-- LHR (노동·인권)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-LHR-POL', 'ECOVADIS', 'Labor & Human Rights', '인권·노동 정책', 'POLICY', false, false),
    ('EV-LHR-HRM', 'ECOVADIS', 'Labor & Human Rights', '인적자원관리(재해예방/교육/근로조건)', 'ACTION', false, false),
    ('EV-LHR-SD', 'ECOVADIS', 'Labor & Human Rights', '사회적 대화(노사협의/직원참여)', 'ACTION', false, false),
    ('EV-LHR-HR', 'ECOVADIS', 'Labor & Human Rights', '인권(노동법준수/다양성/차별금지)', 'ACTION', false, false),
    ('EV-LHR-CS', 'ECOVADIS', 'Labor & Human Rights', '경력·숙련도(직업훈련/역량개발)', 'ACTION', false, false),
    ('EV-LHR-CLL', 'ECOVADIS', 'Labor & Human Rights', '아동·강제노동 방지', 'ACTION', false, false),
    ('EV-LHR-RES', 'ECOVADIS', 'Labor & Human Rights', '노동·인권 성과 보고', 'RESULT', false, false);

-- ETH (윤리)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-ETH-POL', 'ECOVADIS', 'Ethics', '윤리·반부패 정책', 'POLICY', false, false),
    ('EV-ETH-COR', 'ECOVADIS', 'Ethics', '부패방지 조치', 'ACTION', false, false),
    ('EV-ETH-COMP', 'ECOVADIS', 'Ethics', '공정경쟁(반경쟁행위 방지)', 'ACTION', false, false),
    ('EV-ETH-INFO', 'ECOVADIS', 'Ethics', '정보관리 책임(정보보안)', 'ACTION', false, false),
    ('EV-ETH-ANT', 'ECOVADIS', 'Ethics', '독점금지(공정거래)', 'ACTION', false, false);

-- SP (지속가능한 조달)
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required, materiality_optional) VALUES
    ('EV-SP-POL', 'ECOVADIS', 'Sustainable Procurement', '지속가능조달 정책', 'POLICY', false, false),
    ('EV-SP-ENV', 'ECOVADIS', 'Sustainable Procurement', '공급사 환경실사', 'ACTION', false, false),
    ('EV-SP-SOC', 'ECOVADIS', 'Sustainable Procurement', '공급사 사회(노동·인권)실사', 'ACTION', false, false),
    ('EV-SP-RES', 'ECOVADIS', 'Sustainable Procurement', '조달 성과(커버리지/개선율)', 'RESULT', false, false),
    ('EV-360', 'ECOVADIS', 'Cross-cutting', '360° Watch 외부 모니터링', 'RESULT', false, false);

-- KSSB 제1호 - 일반사항
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required) VALUES
    ('KSSB1-GOV', 'KSSB', 'General', '지속가능성 관련 거버넌스', 'GOVERNANCE', false),
    ('KSSB1-STRAT', 'KSSB', 'General', '지속가능성 관련 전략·재무영향', 'STRATEGY', false),
    ('KSSB1-RISK', 'KSSB', 'General', '지속가능성 위험관리 절차', 'RISK_MGMT', false),
    ('KSSB1-MET', 'KSSB', 'General', '지속가능성 지표 및 목표', 'METRICS', false);

-- KSSB 제2호 - 기후
INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required) VALUES
    ('KSSB2-GOV', 'KSSB2', 'Climate', '기후 관련 거버넌스', 'GOVERNANCE', false),
    ('KSSB2-STRAT', 'KSSB2', 'Climate', '기후 관련 전략·재무영향', 'STRATEGY', false),
    ('KSSB2-RISK', 'KSSB2', 'Climate', '기후 위험관리 절차', 'RISK_MGMT', false),
    ('KSSB2-MET', 'KSSB2', 'Climate', 'Scope1/2/3 배출량 등 기후지표·목표', 'METRICS', true);

INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type) VALUES
    ('KCGS-ENV', 'KCGS', 'Environment', '환경 부문 공시자료', 'RESULT'),
    ('KCGS-SOC', 'KCGS', 'Social', '사회 부문 공시자료', 'RESULT'),
    ('KCGS-GOV', 'KCGS', 'Governance', '지배구조 부문 공시자료', 'RESULT'),
    ('NICE-ENV', 'NICE', 'Environment', '환경 부문 공시자료', 'RESULT'),
    ('NICE-SOC', 'NICE', 'Social', '사회 부문 공시자료', 'RESULT'),
    ('NICE-GOV', 'NICE', 'Governance', '지배구조 부문 공시자료', 'RESULT');

INSERT INTO tb_indicator_master (indicator_code, agency_code, theme_code, indicator_name, pillar_type, scope2_split_required) VALUES
    ('KESG-E1', 'K-ESG', 'Environment', '환경경영', 'RESULT', false),
    ('KESG-E2', 'K-ESG', 'Environment', '탄소중립', 'RESULT', true),
    ('KESG-S1', 'K-ESG', 'Social', '사회공헌', 'RESULT', false),
    ('KESG-S2', 'K-ESG', 'Social', '안전보건', 'RESULT', false),
    ('KESG-G1', 'K-ESG', 'Governance', '윤리경영', 'RESULT', false),
    ('KESG-G2', 'K-ESG', 'Governance', '정보공개', 'RESULT', false);

-- KSSB ↔ EcoVadis 매핑
INSERT INTO tb_indicator_mapping (source_authority, source_indicator_id, target_authority, target_indicator_id, mapping_type, confidence)
SELECT 'ECOVADIS', s.indicator_code, 'KSSB', t.indicator_code, m.type, m.conf
FROM (VALUES
    ('EV-ENV-OPS', 'KSSB2-MET', 'expanded', 'high'),
    ('EV-ENV-POL', 'KSSB1-GOV', 'expanded', 'high'),
    ('EV-ENV-POL', 'KSSB1-STRAT', 'expanded', 'high'),
    ('EV-ENV-OPS', 'KSSB1-MET', 'indirect', 'medium'),
    ('EV-ETH-INFO', 'KSSB1-GOV', 'indirect', 'medium'),
    ('EV-LHR-HR', 'KSSB1-RISK', 'direct', 'high'),
    ('EV-LHR-SD', 'KSSB1-MET', 'expanded', 'medium'),
    ('EV-LHR-CS', 'KSSB1-STRAT', 'expanded', 'medium'),
    ('EV-SP-POL', 'KSSB1-RISK', 'indirect', 'medium')
) AS m(src_code, tgt_code, type, conf)
JOIN tb_indicator_master s ON s.agency_code='ECOVADIS' AND s.indicator_code=m.src_code
JOIN tb_indicator_master t ON t.agency_code='KSSB' AND t.indicator_code=m.tgt_code;

-- ============================================================
-- 16. RLS 비활성 + 권한 부여 (미러: anon 키로 읽기/쓰기 허용)
-- ============================================================

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- ============================================================
-- 완료 (미러 모드 v2)
-- ============================================================
