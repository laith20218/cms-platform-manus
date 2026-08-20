BEGIN;

INSERT INTO universities (
    id, logo_url, country, city, website, created_at, updated_at,
    name_ar, name_en, slug, description, status, sort_order, deleted_at
) VALUES (
    '11111111-1111-4111-8111-111111111111', NULL, 'Syria', 'Damascus', NULL, now(), now(),
    'جامعة الاختبار الطبية', 'E2E Medical University', 'e2e-medical-university',
    'Isolated Phase 39 Browser E2E fixture.', 'active', 1, NULL
) ON CONFLICT (id) DO NOTHING;

INSERT INTO colleges (
    id, university_id, icon, created_at, updated_at,
    name_ar, name_en, slug, description, status, sort_order, deleted_at
) VALUES (
    '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', NULL, now(), now(),
    'كلية الطب التجريبية', 'E2E College of Medicine', 'e2e-college-medicine',
    'Isolated Phase 39 Browser E2E fixture.', 'active', 1, NULL
) ON CONFLICT (id) DO NOTHING;

INSERT INTO academic_years (
    id, college_id, year_number, created_at, updated_at,
    name_ar, name_en, slug, description, status, sort_order, deleted_at
) VALUES (
    '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 1, now(), now(),
    'السنة الأولى التجريبية', 'E2E First Year', 'e2e-first-year',
    'Isolated Phase 39 Browser E2E fixture.', 'active', 1, NULL
) ON CONFLICT (id) DO NOTHING;

COMMIT;
