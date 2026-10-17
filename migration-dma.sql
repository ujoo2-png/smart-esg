-- ============================================================
-- Smart ESG - DMA(이중중대성평가) 테이블 추가 (증분 적용용)
--
-- 목적: 기존 DB를 리셋하지 않고 DMA 3개 테이블만 추가한다.
--       (전체 리셋이 필요하면 migration.sql 전체를 사용)
-- 실행: Supabase SQL Editor에서 이 파일만 실행. 재실행 안전(IF NOT EXISTS).
--
-- 설계: migration.sql과 동일하게 "미러" 원칙을 따른다.
--   - id TEXT (앱은 숫자/문자 혼용 id 사용)
--   - FK/NOT NULL/UNIQUE/CHECK 없음, RLS 비활성, anon GRANT
--   - 무결성은 앱 레이어 담당
-- ============================================================

-- DMA 프로젝트 (평가 사이클 단위)
CREATE TABLE IF NOT EXISTS tb_dma_project (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT,
    year INT,
    boundary TEXT,
    threshold INT DEFAULT 3,
    status TEXT DEFAULT 'draft',
    source TEXT,
    contract_version TEXT,
    assessment_id TEXT,
    approved_by TEXT,
    approved_at TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- DMA 이해관계자 참여
CREATE TABLE IF NOT EXISTS tb_dma_stakeholder (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT,
    name TEXT,
    type TEXT,
    influence INT,
    interest INT,
    engagement TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- DMA 이슈(IRO: 영향·리스크·기회)
CREATE TABLE IF NOT EXISTS tb_dma_iro (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT,
    type TEXT,
    topic TEXT,
    issue_code TEXT,
    dimension TEXT,
    theme_group TEXT,
    quadrant TEXT,
    reliability TEXT,
    sample_n INT,
    sample_error_pct DECIMAL,
    statement TEXT,
    value_chain TEXT,
    likelihood INT,
    impact_score INT,
    financial_score INT,
    evidence_ids JSONB DEFAULT '[]'::jsonb,
    rationale TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 비활성 + 권한 부여 (미러 모드)
ALTER TABLE public.tb_dma_project    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_dma_stakeholder DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_dma_iro        DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.tb_dma_project    TO anon, authenticated, service_role;
GRANT ALL ON public.tb_dma_stakeholder TO anon, authenticated, service_role;
GRANT ALL ON public.tb_dma_iro        TO anon, authenticated, service_role;

-- 완료
