-- ============================================================
-- CMS Platform — Production Seed Data
-- Run AFTER migrations on production database
-- Creates: Universities, Colleges, Academic Years, Semesters,
--          Subjects (medical), First Super Admin, Sample Questions
-- ============================================================
-- WARNING: Run only once. Use ON CONFLICT DO NOTHING for idempotency.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. UNIVERSITIES (سوريا + دول عربية مجاورة)
-- ============================================================
INSERT INTO universities (id, name_ar, name_en, slug, country, city, website, is_active, created_at, updated_at)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'جامعة دمشق', 'Damascus University', 'damascus-university', 'سوريا', 'دمشق', 'https://damascusuniversity.edu.sy', true, NOW(), NOW()),
  ('11111111-0000-0000-0000-000000000002', 'جامعة حلب', 'Aleppo University', 'aleppo-university', 'سوريا', 'حلب', 'https://alepuniv.edu.sy', true, NOW(), NOW()),
  ('11111111-0000-0000-0000-000000000003', 'جامعة تشرين', 'Tishreen University', 'tishreen-university', 'سوريا', 'اللاذقية', 'https://tishreen.edu.sy', true, NOW(), NOW()),
  ('11111111-0000-0000-0000-000000000004', 'جامعة البعث', 'Al-Baath University', 'al-baath-university', 'سوريا', 'حمص', 'https://baath-univ.edu.sy', true, NOW(), NOW()),
  ('11111111-0000-0000-0000-000000000005', 'الجامعة الافتراضية السورية', 'Syrian Virtual University', 'syrian-virtual-university', 'سوريا', 'دمشق', 'https://svuonline.org', true, NOW(), NOW()),
  ('11111111-0000-0000-0000-000000000006', 'جامعة الأزهر', 'Al-Azhar University', 'al-azhar-university', 'مصر', 'القاهرة', 'https://azhar.eg', true, NOW(), NOW()),
  ('11111111-0000-0000-0000-000000000007', 'جامعة الملك سعود', 'King Saud University', 'king-saud-university', 'السعودية', 'الرياض', 'https://ksu.edu.sa', true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 2. COLLEGES (لكل جامعة سورية رئيسية - كلية الطب البشري)
-- ============================================================
INSERT INTO colleges (id, university_id, name_ar, name_en, slug, is_active, created_at, updated_at)
VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'كلية الطب البشري', 'Faculty of Medicine', 'medicine', true, NOW(), NOW()),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'كلية الطب البشري', 'Faculty of Medicine', 'medicine', true, NOW(), NOW()),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'كلية الطب البشري', 'Faculty of Medicine', 'medicine', true, NOW(), NOW()),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 'كلية الطب البشري', 'Faculty of Medicine', 'medicine', true, NOW(), NOW()),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000005', 'كلية الطب البشري', 'Faculty of Medicine', 'medicine', true, NOW(), NOW()),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000006', 'كلية الطب البشري', 'Faculty of Medicine', 'medicine', true, NOW(), NOW()),
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000007', 'كلية الطب البشري', 'Faculty of Medicine', 'medicine', true, NOW(), NOW())
ON CONFLICT (university_id, slug) DO NOTHING;

-- ============================================================
-- 3. ACADEMIC YEARS (6 سنوات لكلية الطب)
-- ============================================================
-- Damascus University - Medicine
INSERT INTO academic_years (id, college_id, name_ar, name_en, slug, year_number, is_active, created_at, updated_at)
VALUES
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'السنة الأولى', 'First Year', 'year-1', 1, true, NOW(), NOW()),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'السنة الثانية', 'Second Year', 'year-2', 2, true, NOW(), NOW()),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', 'السنة الثالثة', 'Third Year', 'year-3', 3, true, NOW(), NOW()),
  ('33333333-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001', 'السنة الرابعة', 'Fourth Year', 'year-4', 4, true, NOW(), NOW()),
  ('33333333-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000001', 'السنة الخامسة', 'Fifth Year', 'year-5', 5, true, NOW(), NOW()),
  ('33333333-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000001', 'السنة السادسة', 'Sixth Year', 'year-6', 6, true, NOW(), NOW())
ON CONFLICT (college_id, year_number) DO NOTHING;

-- ============================================================
-- 4. SEMESTERS (فصول دراسية للسنة الثالثة كمثال)
-- ============================================================
INSERT INTO semesters (id, academic_year_id, name_ar, name_en, slug, is_active, created_at, updated_at)
VALUES
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'الفصل الأول', 'First Semester', 'semester-1', true, NOW(), NOW()),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003', 'الفصل الثاني', 'Second Semester', 'semester-2', true, NOW(), NOW())
ON CONFLICT (academic_year_id, slug) DO NOTHING;

-- ============================================================
-- 5. SUBJECTS — مواد السنة الثالثة (مثال شامل)
-- ============================================================
INSERT INTO subjects (id, semester_id, name_ar, name_en, slug, code, description, is_active, created_at, updated_at)
VALUES
  -- الفصل الأول
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'التشريح المجهري', 'Histology', 'histology', 'MED301', 'دراسة الأنسجة والأعضاء على المستوى المجهري', true, NOW(), NOW()),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'علم الأجنة', 'Embryology', 'embryology', 'MED302', 'دراسة تطور الجنين من الإخصاب حتى الولادة', true, NOW(), NOW()),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001', 'الكيمياء الحيوية', 'Biochemistry', 'biochemistry', 'MED303', 'دراسة التفاعلات الكيميائية في الكائنات الحية', true, NOW(), NOW()),
  ('55555555-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000001', 'علم الأعصاب', 'Neuroscience', 'neuroscience', 'MED304', 'دراسة الجهاز العصبي المركزي والطرفي', true, NOW(), NOW()),
  -- الفصل الثاني
  ('55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000002', 'علم الأمراض', 'Pathology', 'pathology', 'MED305', 'دراسة الأمراض والتغيرات المرضية في الأنسجة', true, NOW(), NOW()),
  ('55555555-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000002', 'علم الأدوية', 'Pharmacology', 'pharmacology', 'MED306', 'دراسة تأثير الأدوية على الجسم', true, NOW(), NOW()),
  ('55555555-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000002', 'علم الجراثيم', 'Microbiology', 'microbiology', 'MED307', 'دراسة البكتيريا والفيروسات والفطريات', true, NOW(), NOW()),
  ('55555555-0000-0000-0000-000000000008', '44444444-0000-0000-0000-000000000002', 'علم المناعة', 'Immunology', 'immunology', 'MED308', 'دراسة جهاز المناعة واستجاباته', true, NOW(), NOW())
ON CONFLICT (semester_id, slug) DO NOTHING;

-- ============================================================
-- 6. FIRST SUPER ADMIN (تغيير كلمة المرور فور أول تسجيل دخول!)
-- ============================================================
-- Password Hash is BCrypt hash for: "CMS@Admin2026!ChangeMe"
-- Use the AuthController to generate proper hash via API on first launch
INSERT INTO admins (
  id, phone, phone_normalized, password_hash, full_name, role,
  email, is_active, is_first_login, two_factor_enabled,
  created_at, updated_at
)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  '0000000000',
  '0000000000',
  '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- placeholder hash
  'مدير عام CMS',
  'super_admin',
  'admin@cms.example.com',
  true,
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT (phone_normalized) DO NOTHING;

-- ============================================================
-- 7. SAMPLE QUESTIONS (5 أسئلة تجريبية في مادة التشريح المجهري)
-- ============================================================
INSERT INTO questions (
  id, subject_id, text, explanation, difficulty, type, status,
  created_by, created_at, updated_at
)
VALUES
  ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
   'أي من الأنواع التالية ينتمي إلى النسيج الطلائي المطبق الطبقي؟',
   'النسيج الطلائي المطبق الطبقي يتكون من عدة طبقات من الخلايا، وتوجد فيه الخلايا القاعدية مرتبطة بالغشاء القاعدي بينما تكون الخلايا السطحية مسطحة. يوجد في الجلد والفم والمريء.',
   'Medium', 'MCQ', 'Published',
   '99999999-0000-0000-0000-000000000001', NOW(), NOW()),

  ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001',
   'ما هي الوظيفة الرئيسية للخلايا الكأسية في النسيج الطلائي العمادي المطلائي بالأهداب؟',
   'الخلايا الكأسية تفرز المخاط الذي يلتقط الجسيمات الغريبة ويساعد الأهداب على نقلها نحو الخارج، مما يحمي الجهاز التنفسي من العدوى.',
   'Easy', 'MCQ', 'Published',
   '99999999-0000-0000-0000-000000000001', NOW(), NOW()),

  ('66666666-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000001',
   'أي عضية خلوية مسؤولة عن إنتاج الطاقة (ATP)؟',
   'الميتوكوندريا هي عضية الخلية المسؤولة عن إنتاج الطاقة عبر عملية الفسفرة التأكسدية في سلسلة نقل الإلكترون.',
   'Easy', 'MCQ', 'Published',
   '99999999-0000-0000-0000-000000000001', NOW(), NOW()),

  ('66666666-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001',
   'ما يميز النسيج الضام الكثيف غير المنتظم عن النسيج الضام الكثيف المنتظم؟',
   'النسيج الضام الكثيف غير المنتظم يحتوي على ألياف كولاجينية مرتبة عشوائياً في اتجاهات متعددة (مثل الأدمة)، بينما المنتظم يحتوي على ألياف متوازية (مثل الأوتار).',
   'Medium', 'MCQ', 'Published',
   '99999999-0000-0000-0000-000000000001', NOW(), NOW()),

  ('66666666-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000001',
   'أي من التالي يعتبر من الخلايا المتخصصة في النسيج الطلائي الغدي؟',
   'الخلايا العنيبية (Acinar cells) هي خلايا متخصصة في النسيج الطلائي الغدي توجد في الغدد خارجية الإفراز مثل البنكرياس والغدد اللعابية.',
   'Hard', 'MCQ', 'Published',
   '99999999-0000-0000-0000-000000000001', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. QUESTION OPTIONS (4 خيارات لكل سؤال)
-- ============================================================
-- Question 1 options
INSERT INTO question_options (id, question_id, text, is_correct, "order", created_at)
VALUES
  ('77777777-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'البشرة', false, 1, NOW()),
  ('77777777-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', 'المريء', false, 2, NOW()),
  ('77777777-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000001', 'الجلد (البشرة)', true, 3, NOW()),
  ('77777777-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000001', 'الأنبوب الهضمي', false, 4, NOW())
ON CONFLICT (id) DO NOTHING;

-- Question 2 options
INSERT INTO question_options (id, question_id, text, is_correct, "order", created_at)
VALUES
  ('77777777-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000002', 'إنتاج الإنزيمات الهاضمة', false, 1, NOW()),
  ('77777777-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000002', 'إفراز المخاط', true, 2, NOW()),
  ('77777777-0000-0000-0000-000000000007', '66666666-0000-0000-0000-000000000002', 'امتصاص المغذيات', false, 3, NOW()),
  ('77777777-0000-0000-0000-000000000008', '66666666-0000-0000-0000-000000000002', 'إنتاج الأجسام المضادة', false, 4, NOW())
ON CONFLICT (id) DO NOTHING;

-- Question 3 options
INSERT INTO question_options (id, question_id, text, is_correct, "order", created_at)
VALUES
  ('77777777-0000-0000-0000-000000000009', '66666666-0000-0000-0000-000000000003', 'النواة', false, 1, NOW()),
  ('77777777-0000-0000-0000-000000000010', '66666666-0000-0000-0000-000000000003', 'جهاز جولجي', false, 2, NOW()),
  ('77777777-0000-0000-0000-000000000011', '66666666-0000-0000-0000-000000000003', 'الميتوكوندريا', true, 3, NOW()),
  ('77777777-0000-0000-0000-000000000012', '66666666-0000-0000-0000-000000000003', 'الشبكة الإندوبلازمية', false, 4, NOW())
ON CONFLICT (id) DO NOTHING;

-- Question 4 options
INSERT INTO question_options (id, question_id, text, is_correct, "order", created_at)
VALUES
  ('77777777-0000-0000-0000-000000000013', '66666666-0000-0000-0000-000000000004', 'عدد الألياف الكولاجينية', false, 1, NOW()),
  ('77777777-0000-0000-0000-000000000014', '66666666-0000-0000-0000-000000000004', 'ترتيب الألياف', true, 2, NOW()),
  ('77777777-0000-0000-0000-000000000015', '66666666-0000-0000-0000-000000000004', 'نوع الخلايا', false, 3, NOW()),
  ('77777777-0000-0000-0000-000000000016', '66666666-0000-0000-0000-000000000004', 'وجود الأوعية الدموية', false, 4, NOW())
ON CONFLICT (id) DO NOTHING;

-- Question 5 options
INSERT INTO question_options (id, question_id, text, is_correct, "order", created_at)
VALUES
  ('77777777-0000-0000-0000-000000000017', '66666666-0000-0000-0000-000000000005', 'الخلايا العنيبية', true, 1, NOW()),
  ('77777777-0000-0000-0000-000000000018', '66666666-0000-0000-0000-000000000005', 'الخلايا الليفية', false, 2, NOW()),
  ('77777777-0000-0000-0000-000000000019', '66666666-0000-0000-0000-000000000005', 'الخلايا العضلية', false, 3, NOW()),
  ('77777777-0000-0000-0000-000000000020', '66666666-0000-0000-0000-000000000005', 'الخلايا العصبية', false, 4, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 9. SYSTEM SETTINGS (إعدادات عامة للنظام)
-- ============================================================
INSERT INTO system_settings (key, value, description, updated_at)
VALUES
  ('platform_name', 'CMS - College Medical System', 'اسم المنصة', NOW()),
  ('platform_name_ar', 'منصة CMS الطبية', 'اسم المنصة بالعربية', NOW()),
  ('default_language', 'ar', 'اللغة الافتراضية', NOW()),
  ('default_timezone', 'Asia/Riyadh', 'المنطقة الزمنية الافتراضية', NOW()),
  ('maintenance_mode', 'false', 'وضع الصيانة', NOW()),
  ('max_login_attempts', '5', 'أقصى محاولات دخول', NOW()),
  ('otp_expiry_minutes', '5', 'مدة صلاحية رمز التحقق', NOW()),
  ('session_timeout_minutes', '15', 'انتهاء صلاحية الجلسة', NOW()),
  ('enable_offline_mode', 'true', 'تفعيل الوضع غير المتصل', NOW()),
  ('enable_watermark', 'true', 'تفعيل العلامة المائية', NOW()),
  ('platform_version', '1.0.0', 'إصدار المنصة', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- ============================================================
-- 10. AUDIT LOG (تسجيل بدء الإطلاق)
-- ============================================================
INSERT INTO audit_logs (id, entity_type, entity_id, action, old_values, new_values, performed_by, performed_at, ip_address, user_agent)
VALUES (
  '88888888-0000-0000-0000-000000000001',
  'System',
  '00000000-0000-0000-0000-000000000000',
  'PRODUCTION_LAUNCH',
  NULL,
  '{"version":"1.0.0","launched_at":"' || NOW() || '","phase":"32"}'::jsonb,
  '99999999-0000-0000-0000-000000000001',
  NOW(),
  '0.0.0.0',
  'Production Launch Script'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT '--- SEED DATA SUMMARY ---' AS info;
SELECT 'Universities' AS table_name, COUNT(*) AS count FROM universities
UNION ALL
SELECT 'Colleges', COUNT(*) FROM colleges
UNION ALL
SELECT 'Academic Years', COUNT(*) FROM academic_years
UNION ALL
SELECT 'Semesters', COUNT(*) FROM semesters
UNION ALL
SELECT 'Subjects', COUNT(*) FROM subjects
UNION ALL
SELECT 'Admins', COUNT(*) FROM admins
UNION ALL
SELECT 'Questions', COUNT(*) FROM questions
UNION ALL
SELECT 'Question Options', COUNT(*) FROM question_options
UNION ALL
SELECT 'System Settings', COUNT(*) FROM system_settings;

-- ============================================================
-- DONE
-- IMPORTANT: First login credentials (must change immediately):
--   Phone: 0000000000
--   Password: CMS@Admin2026!ChangeMe
-- After first login, immediately change the password!
-- ============================================================
