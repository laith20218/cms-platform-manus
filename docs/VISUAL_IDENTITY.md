# VISUAL_IDENTITY.md — Phase 5: Visual Identity

> **الهوية البصرية الكاملة**. تحوّل الـ Moodboard إلى نظام بصري تطبيقي قابل للتنفيذ في الكود.

**المرحلة**: Phase 5
**الحالة**: ✅ Completed
**تاريخ الإنجاز**: 2026-07-30

---

## جدول المحتويات

1. [لوحة الألوان (Color Palette)](#1-لوحة-الألوان)
2. [نظام الخطوط (Typography)](#2-نظام-الخطوط)
3. [نظام الأيقونات (Iconography)](#3-نظام-الأيقونات)
4. [التدرجات (Gradients)](#4-التدرجات)
5. [الظلال (Shadows)](#5-الظلال)
6. [نظام المسافات (Spacing)](#6-نظام-المسافات)
7. [نظام الأحجام (Sizing)](#7-نظام-الأحجام)
8. [نظام الحواف (Border Radius)](#8-نظام-الحواف)
9. [نظام الـ Z-Index](#9-نظام-الـ-z-index)
10. [الوضع الليلي (Dark Mode)](#10-الوضع-الليلي)
11. [متغيرات CSS (CSS Variables)](#11-متغيرات-css)
12. [إعدادات Tailwind (Tailwind Config)](#12-إعدادات-tailwind)

---

## 1. لوحة الألوان

### 1.1 فلسفة الألوان

> **"أزرق طبي رئيسي، سماوي مميِّز، ألوان دلالية واضحة، تباين كافٍ للوصولية."**

كل لون له:
- **دور وظيفي** (Primary, Accent, Success, Warning, Danger, Info).
- **9 تدرجات** (50, 100, 200, 300, 400, 500, 600, 700, 800, 900).
- **استخدام محدد** (Background, Surface, Border, Text).
- **توافق WCAG AA** (تباين ≥ 4.5:1 للنصوص).

### 1.2 اللون الأساسي — Primary (Medical Blue)

مأخوذ من المرجع البصري `#1976D2` (Material Blue 700).

| التدرّج | HEX | RGB | الاستخدام |
|--------|-----|-----|----------|
| **50** | `#E3F2FD` | `227, 242, 253` | خلفيات فاتحة جداً، hover states |
| **100** | `#BBDEFB` | `187, 222, 251` | badges، highlights |
| **200** | `#90CAF9` | `144, 202, 249` | borders، accents خفيفة |
| **300** | `#64B5F6` | `100, 181, 246` | icons ثانوية |
| **400** | `#42A5F5` | `66, 165, 245` | icons، links hover |
| **500** | `#2196F3` | `33, 150, 243` | secondary buttons |
| **600** | `#1E88E5` | `30, 136, 229` | hover على primary |
| **700** | `#1976D2` ⭐ | `25, 118, 210` | **اللون الرئيسي** — أزرار، روابط، active |
| **800** | `#1565C0` | `21, 101, 192` | عناوين، text emphasis |
| **900** | `#0D47A1` | `13, 71, 161` | خلفيات داكنة، footer |

**الاستخدامات**:
- ✅ Primary buttons (background = 700, hover = 600).
- ✅ Active nav items (text = 700, background = 50).
- ✅ Links (text = 700, hover = 600).
- ✅ Focus rings (border = 400).
- ❌ لا تستخدم للنصوص الطويلة (تباين غير كافٍ على بعض الخلفيات).

### 1.3 اللون المميِّز — Accent (Cyan)

مأخوذ من المرجع `#00BCD4`.

| التدرّج | HEX | RGB | الاستخدام |
|--------|-----|-----|----------|
| **50** | `#E0F7FA` | `224, 247, 250` | خلفيات مميِّزة فاتحة |
| **100** | `#B2EBF2` | `178, 235, 242` | highlights ثانوية |
| **200** | `#80DEEA` | `128, 222, 234` | borders مميِّزة |
| **300** | `#4DD0E1` | `77, 208, 225` | icons مميِّزة |
| **400** | `#26C6DA` | `38, 198, 218` | hover على accent |
| **500** | `#00BCD4` ⭐ | `0, 188, 212` | **اللون المميِّز** — تدرجات، accents |
| **600** | `#00ACC1` | `0, 172, 193` | accent داكن |
| **700** | `#0097A7` | `0, 151, 167` | accent أداكن |
| **800** | `#00838F` | `0, 131, 143` | text accent |
| **900** | `#006064` | `0, 96, 100` | accent عميق |

**الاستخدامات**:
- ✅ Gradients مع Primary (`#1976D2 → #00BCD4`).
- ✅ Accent buttons (Secondary).
- ✅ Tooltip backgrounds.
- ✅ Decorative elements.
- ✅ Charts والـ data viz.
- ❌ لا تستخدم للنصوص الأساسية.

### 1.4 لون النجاح — Success (Green)

| التدرّج | HEX | الاستخدام |
|--------|-----|----------|
| **50** | `#E8F5E9` | خلفيات نجاح فاتحة |
| **100** | `#C8E6C9` | badges نجاح |
| **200** | `#A5D6A7` | borders نجاح |
| **300** | `#81C784` | icons نجاح |
| **400** | `#66BB6A` | hover |
| **500** | `#00C853` ⭐ | **اللون الأساسي للنجاح** |
| **600** | `#00B248` | hover على 500 |
| **700** | `#009C40` | text نجاح |
| **800** | `#008638` | خلفيات داكنة |
| **900** | `#006828` | أعمق |

**الاستخدامات**:
- ✅ إجابة صحيحة (background = 500, text = white).
- ✅ Success toasts (background = 50, border = 500, text = 800).
- ✅ Success badges (background = 100, text = 800).
- ✅ Active states للـ toggles إيجابية.

### 1.5 لون الخطأ — Danger (Red)

| التدرّج | HEX | الاستخدام |
|--------|-----|----------|
| **50** | `#FFEBEE` | خلفيات خطأ فاتحة |
| **100** | `#FFCDD2` | badges خطأ |
| **200** | `#EF9A9A` | borders خطأ |
| **300** | `#E57373` | icons خطأ |
| **400** | `#EF5350` | hover |
| **500** | `#FF5252` ⭐ | **اللون الأساسي للخطأ** |
| **600** | `#E63946` | hover على 500 |
| **700** | `#C62828` | text خطأ |
| **800** | `#B71C1C` | خلفيات داكنة |
| **900** | `#8E0000` | أعمق |

**الاستخدامات**:
- ✅ إجابة خاطئة (background = 500, text = white).
- ✅ Error toasts (background = 50, border = 500, text = 800).
- ✅ Delete buttons (background = 500).
- ✅ Required field indicators.
- ✅ Validation errors (text = 700).

### 1.6 لون التحذير — Warning (Amber)

| التدرّج | HEX | الاستخدام |
|--------|-----|----------|
| **50** | `#FFF8E1` | خلفيات تحذير فاتحة |
| **100** | `#FFECB3` | badges تحذير |
| **200** | `#FFE082` | borders تحذير |
| **300** | `#FFD54F` | icons تحذير |
| **400** | `#FFCA28` | hover |
| **500** | `#FFB300` ⭐ | **اللون الأساسي للتحذير** |
| **600** | `#FFA000` | hover على 500 |
| **700** | `#FF8F00` | text تحذير |
| **800** | `#FF6F00` | خلفيات داكنة |
| **900** | `#FF3D00` | أعمق |

**الاستخدامات**:
- ✅ تنبيهات (background = 50, border = 500, text = 800).
- ✅ Warning badges (background = 100, text = 800).
- ✅ Pending states.
- ✅ subscription expiry warnings.

### 1.7 لون المعلومات — Info (Light Blue)

| التدرّج | HEX | الاستخدام |
|--------|-----|----------|
| **50** | `#E1F5FE` | خلفيات معلومات |
| **100** | `#B3E5FC` | badges معلومات |
| **200** | `#81D4FA` | borders |
| **300** | `#4FC3F7` | icons |
| **400** | `#29B6F6` | hover |
| **500** | `#03A9F4` ⭐ | **اللون الأساسي للمعلومات** |
| **600** | `#039BE5` | hover على 500 |
| **700** | `#0288D1` | text معلومات |
| **800** | `#0277BD` | خلفيات داكنة |
| **900** | `#01579B` | أعمق |

**الاستخدامات**:
- ✅ Info toasts (background = 50, border = 500, text = 800).
- ✅ Info badges (background = 100, text = 800).
- ✅ Help tooltips.

### 1.8 الألوان المحايدة — Neutral (Slate)

| التدرّج | HEX | الاستخدام |
|--------|-----|----------|
| **50** | `#F8FAFC` | خلفية عامة فاتحة جداً |
| **100** | `#F1F5F9` | خلفيات ثانوية |
| **200** | `#E2E8F0` | borders فاتحة |
| **300** | `#CBD5E1` | borders متوسطة، disabled |
| **400** | `#94A3B8` | text خافت |
| **500** | `#64748B` | text muted |
| **600** | `#475569` | text ثانوي |
| **700** | `#334155` | text أساسي ثانوي |
| **800** | `#1E293B` | text أساسي |
| **900** | `#0F172A` ⭐ | **text أساسي داكن** |

### 1.9 ألوان النظام (System Colors)

#### الخلفيات (Backgrounds)
| الاسم | HEX | الاستخدام |
|------|-----|----------|
| `bg-primary` | `#EEF6FF` | خلفية التطبيق الأساسية (فاتح) |
| `bg-medical-white` | `#F8FBFF` | خلفية طبية ناصعة |
| `bg-surface` | `#FFFFFF` | أسطح البطاقات الصلبة |
| `bg-glass` | `rgba(255,255,255,.65)` | أسطح زجاجية (Light) |
| `bg-glass-strong` | `rgba(255,255,255,.82)` | أسطح زجاجية قوية |
| `bg-overlay` | `rgba(15,23,42,.50)` | خلفية الـ modals |

#### الحدود (Borders)
| الاسم | HEX/RGB | الاستخدام |
|------|---------|----------|
| `border-light` | `rgba(15,23,42,.08)` | حدود فاتحة |
| `border-strong` | `rgba(15,23,42,.14)` | حدود قوية |
| `border-glass` | `rgba(255,255,255,.50)` | حدود زجاجية |
| `border-primary` | `#1976D2` | حدود primary |
| `border-focus` | `#42A5F5` | حدود focus |

#### النصوص (Text)
| الاسم | HEX | الاستخدام |
|------|-----|----------|
| `text-primary` | `#0F172A` | النص الأساسي (Slate 900) |
| `text-soft` | `#334155` | النص الثانوي (Slate 700) |
| `text-muted` | `#64748B` | النص الخافت (Slate 500) |
| `text-faint` | `#94A3B8` | النص الخافت جداً (Slate 400) |
| `text-brand` | `#1976D2` | نص العلامة (Primary 700) |
| `text-on-primary` | `#FFFFFF` | نص على خلفية primary |
| `text-on-accent` | `#FFFFFF` | نص على خلفية accent |

### 1.10 قواعد استخدام الألوان

#### ✅ افع
- استخدم Primary 700 للأنشطة الرئيسية فقط (1-2 في الصفحة).
- استخدم Neutral 900 للنصوص الأساسية (تباين 16:1 على الأبيض).
- استخدم تدرجات لونية للرسوم البيانية (Primary + Accent + Success).
- اختبر التباين دائماً (WCAG AA: 4.5:1 للنصوص العادية، 3:1 للكبيرة).

#### ❌ لا تفعل
- لا تستخدم Primary 700 كخلفية لصفحة كاملة (مزعج).
- لا تخلط Success 500 مع Danger 500 في نفس المكوّن.
- لا تستخدم ألوان فاتحة جداً (50) للنصوص.
- لا تستخدم أكثر من 3 ألوان دلالية في نفس الوقت.
- لا تعتمد على اللون فقط للدلالة (استخدم أيقونة + نص).

---

## 2. نظام الخطوط

### 2.1 الخطوط المعتمدة

| الخط | الاستخدام | المصدر |
|------|----------|--------|
| **Cairo** | عربي (أساسي) | Google Fonts |
| **Inter** | إنجليزي (أساسي) | Google Fonts |
| **JetBrains Mono** | كود، أرقام مميزة | Google Fonts |

### 2.2 تحميل الخطوط (Font Loading)

```html
<!-- Preconnect for faster loading -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- Cairo (Arabic) -->
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">

<!-- Inter (English) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">

<!-- JetBrains Mono (Code) -->
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

### 2.3 الـ Font Stack

```css
--font-arabic: 'Cairo', 'Tajawal', 'Noto Sans Arabic', system-ui, sans-serif;
--font-latin: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
--font-sans: var(--font-arabic), var(--font-latin);
```

### 2.4 الهرم الطباعي (Type Scale)

> مبني على Modular Scale بنسبة 1.250 (Major Third).

#### العرض الكبير (Desktop ≥ 1024px)

| المستوى | الخط | الحجم | الوزن | Line Height | Letter Spacing | الاستخدام |
|---------|------|------|------|------------|---------------|----------|
| **Display** | Cairo | 64px (4rem) | 800 | 1.1 | -0.02em | Hero sections |
| **H1** | Cairo | 48px (3rem) | 700 | 1.15 | -0.02em | عناوين الصفحات |
| **H2** | Cairo | 36px (2.25rem) | 700 | 1.2 | -0.01em | عناوين الأقسام |
| **H3** | Cairo | 28px (1.75rem) | 600 | 1.3 | -0.01em | عناوين فرعية |
| **H4** | Cairo | 22px (1.375rem) | 600 | 1.4 | 0 | عناوين البطاقات |
| **H5** | Cairo | 18px (1.125rem) | 600 | 1.4 | 0 | عناوين صغيرة |
| **H6** | Cairo | 16px (1rem) | 600 | 1.5 | 0 | labels |
| **Body L** | Cairo | 18px (1.125rem) | 400 | 1.6 | 0 | نص كبير |
| **Body** | Cairo | 16px (1rem) | 400 | 1.6 | 0 | النص الأساسي |
| **Body S** | Cairo | 14px (0.875rem) | 400 | 1.5 | 0 | نص ثانوي |
| **Caption** | Cairo | 12px (0.75rem) | 400 | 1.4 | 0.01em | captions |
| **Overline** | Cairo | 11px (0.6875rem) | 600 | 1.4 | 0.1em | overlines (uppercase) |
| **Code** | JetBrains Mono | 14px (0.875rem) | 400 | 1.5 | 0 | code blocks |

#### العرض المتوسط (Tablet 768px)

| المستوى | الحجم | الخط |
|---------|------|------|
| Display | 48px | Cairo 800 |
| H1 | 36px | Cairo 700 |
| H2 | 28px | Cairo 700 |
| H3 | 24px | Cairo 600 |
| H4 | 20px | Cairo 600 |
| Body | 15px | Cairo 400 |
| Body S | 13px | Cairo 400 |

#### العرض الصغير (Mobile 360px)

| المستوى | الحجم | الخط |
|---------|------|------|
| Display | 32px | Cairo 800 |
| H1 | 26px | Cairo 700 |
| H2 | 22px | Cairo 700 |
| H3 | 18px | Cairo 600 |
| H4 | 16px | Cairo 600 |
| Body | 14px | Cairo 400 |
| Body S | 12px | Cairo 400 |

### 2.5 قواعد الطباعة

#### ✅ افع
- **التباين**: استخدم 3 مستويات كحد أقصى للوزن في الصفحة (400, 600, 700).
- **الطول**: حدّد عرض السطر بـ 60-80 حرفاً عربياً (max-width: 65ch).
- **الارتفاع**: line-height 1.6 للنصوص الطويلة، 1.2 للعناوين.
- **التباعد**: لا تستخدم letter-spacing للعربية (موجود أصلاً).
- **الأرقام**: استخدم tabular-nums للإحصائيات (`font-variant-numeric: tabular-nums`).

#### ❌ لا تفعل
- لا تستخدم أكثر من 3 أحجام خطوط في نفس البطاقة.
- لا تجعل النص الأساسي أصغر من 14px.
- لا تستخدم خط رمزي (Comic Sans، Papyrus، إلخ).
- لا تخلط العربية والإنجليزية بدون font-family مناسبة.
- لا تستخدم `text-align: justify` للعربية (يسبب مسافات غريبة).
- لا تستخدم bold للنصوص الطويلة (يؤذي العين).

### 2.6 الـ Antialiasing

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

---

## 3. نظام الأيقونات

### 3.1 المكتبة المعتمدة

**الأساسية**: [Lucide React](https://lucide.dev/) (ISC License)
- 1000+ أيقونة.
- React 19 compatible.
- تدعم RTL.
- 24x24 viewBox.

**الثانوية**: أيقونات طبية مخصّصة (custom SVG).

### 3.2 أحجام الأيقونات

| الحجم | الاستخدام |
|------|----------|
| 14px | داخل النص (inline) |
| 16px | أيقونات صغيرة في القوائم |
| 20px | الأيقونات الأساسية في الأزرار والقوائم |
| 24px | الأيقونات الرئيسية في الـ headers |
| 32px | الأيقونات في الـ empty states |
| 48px | الأيقونات الكبيرة في الـ onboarding |
| 64px | الأيقونات في الـ splash |

### 3.3 أوزان الأيقونات

| الوزن | الاستخدام |
|------|----------|
| `stroke-width: 1.5` | أيقونات كبيرة (32px+) |
| `stroke-width: 2` | الأيقونات الأساسية (الافتراضي) |
| `stroke-width: 2.5` | أيقونات صغيرة (< 20px) |

### 3.4 ألوان الأيقونات

```css
/* الافتراضي: يرث currentColor */
.icon { color: inherit; }

/* الأيقونات المميزة */
.icon-primary { color: var(--c-primary-700); }
.icon-accent { color: var(--c-accent-500); }
.icon-success { color: var(--c-success-500); }
.icon-danger { color: var(--c-danger-500); }
.icon-warning { color: var(--c-warning-500); }
.icon-muted { color: var(--c-text-muted); }
.icon-on-primary { color: #FFFFFF; }
```

### 3.5 الأيقونات الطبية المخصّصة

أيقونات غير موجودة في Lucide، نصممها بـ SVG:

| الاسم | الوصف | SVG (مبسّط) |
|------|------|-------------|
| `MedicalShield` | درع طبي بداخله صليب | `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z"/><path d="M12 8v6M9 11h6"/></svg>` |
| `ECGPulse` | نبضة قلب على خط | `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h4l2-6 4 12 2-6h8"/></svg>` |
| `Stethoscope` | سماعة طبيب | معقّد، نستخدم Lucide `Stethoscope` |
| `Syringe` | محقن | معقّد، نستخدم Lucide `Syringe` |
| `Brain` | دماغ | معقّد، نستخدم Lucide `Brain` |
| `Heart` | قلب | Lucide `Heart` |
| `Lungs` | رئتان | Lucide `Lungs` (متوفرة في الإصدارات الحديثة) |
| `Bone` | عظم | Lucide `Bone` |
| `Dna` | حمض نووي | Lucide `Dna` |

### 3.6 قواعد الاستخدام

#### ✅ افع
- استخدم أيقونة + نص في القوائم والأزرار الرئيسية.
- استخدم أيقونة فقط في الأماكن الضيقة (icon buttons).
- استخدم `aria-label` للأيقونات بلا نص مرافق.
- استخدم `currentColor` للون (لا hardcode).

#### ❌ لا تفعل
- لا تخلط مكتبات أيقونات مختلفة في نفس الصفحة.
- لا تستخدم emoji كأيقونات.
- لا تستخدم PNG icons (vector فقط).
- لا تستخدم أيقونات ملونة (monochrome).
- لا تستخدم أيقونات > 64px (إلا في splash).
- لا تترك أيقونة بلا `aria-label` أو نص مرافق.

---

## 4. التدرجات

### 4.1 فلسفة التدرجات

> **"تدرجات ناعمة، متّجهة من أعلى-يسار إلى أسفل-يمين، بألوان الهوية."**

### 4.2 التدرجات المعتمدة

#### G1: التدرّج الطبي الأساسي (Primary Brand Gradient)
```css
--grad-primary: linear-gradient(135deg, #1976D2 0%, #00BCD4 100%);
```
- **الاستخدام**: الـ hero sections، الـ splash، الـ logo backgrounds.
- **اتجاه**: 135° (من أعلى-يسار إلى أسفل-يمين).

#### G2: تدرّج الفجر (Dawn Gradient)
```css
--grad-dawn: linear-gradient(180deg, #1565C0 0%, #42A5F5 50%, #EEF6FF 100%);
```
- **الاستخدام**: الخلفيات الكبيرة، الـ hero backgrounds.

#### G3: تدرّج الزجاج (Glass Gradient)
```css
--grad-glass: linear-gradient(135deg, rgba(255,255,255,.65) 0%, rgba(255,255,255,.45) 100%);
```
- **الاستخدام**: الأسطح الزجاجية، الـ cards.

#### G4: تدرّج النجاح (Success Gradient)
```css
--grad-success: linear-gradient(135deg, #00C853 0%, #00E676 100%);
```
- **الاستخدام**: أزرار النجاح، badges الإنجاز.

#### G5: تدرّج الاحتفال (Celebration Gradient)
```css
--grad-celebration: linear-gradient(135deg, #00BCD4 0%, #00C853 100%);
```
- **الاستخدام**: الاحتفالات، الـ achievements، badges مميّزة.

#### G6: تدرّج التحذير (Warning Gradient)
```css
--grad-warning: linear-gradient(135deg, #FFB300 0%, #FFCA28 100%);
```
- **الاستخدام**: badges التحذير.

#### G7: تدرّج الخطأ (Danger Gradient)
```css
--grad-danger: linear-gradient(135deg, #FF5252 0%, #FF8A80 100%);
```
- **الاستخدام**: badges الخطأ.

#### G8: تدرّج الإشعاع (Radial Glow)
```css
--grad-glow: radial-gradient(circle at 30% 20%, rgba(25,118,210,.10) 0%, transparent 50%);
```
- **الاستخدام**: تأثيرات الإشعاع، الـ backgrounds الزخرفية.

### 4.3 قواعد التدرجات

- ✅ استخدم 135° كاتجاه افتراضي.
- ✅ استخدم 2-3 نقاط لونية كحد أقصى في التدرّج.
- ✅ اختبر التدرّج في الوضع الفاتح والداكن.
- ❌ لا تستخدم تدرّجات معقدة (4+ ألوان).
- ❌ لا تستخدم تدرّجات للنصوص (`gradient text`) إلا في حالات نادرة.
- ❌ لا تستخدم تدرّجات حادة (hard stops) إلا في الزخارف.

---

## 5. الظلال

### 5.1 فلسفة الظلال

> **"ظلال ناعمة، متعددة الطبقات، بلون أزرق خفيف، تعكس العمق دون ثقل."**

### 5.2 مستويات الظلال

| المستوى | الـ CSS | الاستخدام |
|---------|--------|----------|
| **Shadow XS** | `0 1px 2px rgba(15,23,42,.04)` | الحدود الخفيفة، الـ chips |
| **Shadow SM** | `0 2px 4px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)` | الـ cards الصغيرة |
| **Shadow MD** | `0 4px 8px rgba(15,23,42,.06), 0 2px 4px rgba(15,23,42,.04)` | الـ cards العادية |
| **Shadow LG** | `0 8px 16px rgba(15,23,42,.08), 0 4px 8px rgba(15,23,42,.04)` | الـ cards المرفوعة، hover |
| **Shadow XL** | `0 12px 24px rgba(15,23,42,.10), 0 8px 16px rgba(15,23,42,.06)` | الـ modals، الـ dropdowns |
| **Shadow 2XL** | `0 20px 40px rgba(15,23,42,.12), 0 12px 24px rgba(15,23,42,.08)` | الـ popovers الكبيرة |
| **Shadow Glass** | `0 8px 32px rgba(25,118,210,.10)` | الأسطح الزجاجية (من المرجع) |
| **Shadow Glow Primary** | `0 0 0 4px rgba(25,118,210,.15)` | focus ring primary |
| **Shadow Glow Accent** | `0 0 0 4px rgba(0,188,212,.15)` | focus ring accent |
| **Shadow Glow Success** | `0 0 0 4px rgba(0,200,83,.15)` | focus ring success |
| **Shadow Glow Danger** | `0 0 0 4px rgba(255,82,82,.15)` | focus ring danger |
| **Shadow Inner** | `inset 0 2px 4px rgba(15,23,42,.06)` | الـ inset effects |

### 5.3 ظلال في الوضع الداكن

في الوضع الداكن، نزيد عمق الظل ونستخدم اللون الأسود:

```css
.dark-mode {
  --shadow-sm: 0 2px 4px rgba(0,0,0,.30), 0 1px 2px rgba(0,0,0,.20);
  --shadow-md: 0 4px 8px rgba(0,0,0,.40), 0 2px 4px rgba(0,0,0,.30);
  --shadow-lg: 0 8px 16px rgba(0,0,0,.50), 0 4px 8px rgba(0,0,0,.40);
}
```

### 5.4 قواعد الظلال

- ✅ استخدم نفس مستوى الظل لكل البطاقات في الصفحة.
- ✅ استخدم ظل أعلى عند hover (`md → lg`).
- ✅ استخدم `Shadow Glass` للأسطح الزجاجية فقط.
- ❌ لا تستخدم ظلالاً سوداء كثيفة في الوضع الفاتح.
- ❌ لا تستخدم أكثر من 3 مستويات ظل في نفس الصفحة.
- ❌ لا تستخدم `text-shadow` للنصوص الأساسية.

---

## 6. نظام المسافات

### 6.1 فلسفة المسافات

> **"نظام 4px baseline. كل مسافة مضاعف لـ 4px. التزام صارم."**

### 6.2 وحدات المسافات (Spacing Scale)

| الاسم | القيمة | الاستخدام |
|------|--------|----------|
| `space-0` | 0 | لا مسافة |
| `space-px` | 1px | حدود دقيقة |
| `space-0.5` | 2px | فجوات دقيقة جداً |
| `space-1` | 4px | فجوات صغيرة (icons داخل نص) |
| `space-2` | 8px | فجوات داخل العناصر |
| `space-3` | 12px | فجوات بين العناصر المرتبطة |
| `space-4` | 16px | المسافة الافتراضية بين العناصر |
| `space-5` | 20px | فجوات بين البطاقات |
| `space-6` | 24px | فجوات بين الأقسام |
| `space-8` | 32px | فجوات كبيرة |
| `space-10` | 40px | padding للبطاقات الكبيرة |
| `space-12` | 48px | padding للـ sections |
| `space-16` | 64px | padding للـ hero sections |
| `space-20` | 80px | فجوات كبيرة جداً |
| `space-24` | 96px | فجوات عمودية بين الـ sections الكبرى |
| `space-32` | 128px | فجوات بين الـ hero والـ content |

### 6.3 قواعد المسافات

#### البطاقات (Cards)
- `padding: 16px` (افتراضي).
- `padding: 24px` (للـ cards الكبيرة).
- `gap: 12px` بين العناصر داخل البطاقة.

#### الأزرار (Buttons)
- `padding: 8px 16px` (افتراضي).
- `padding: 12px 24px` (large).
- `padding: 4px 8px` (small).
- `gap: 8px` بين الأيقونة والنص.

#### النماذج (Forms)
- `gap: 16px` بين الحقول.
- `padding: 12px 16px` للحقول.
- `margin-bottom: 4px` بين الـ label والحقل.

#### القوائم (Lists)
- `padding: 12px 16px` لكل عنصر.
- `gap: 4px` بين العناصر.

### 6.4 الـ CSS Variables

```css
:root {
  --s-0: 0;
  --s-px: 1px;
  --s-0.5: 2px;
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;
  --s-10: 40px;
  --s-12: 48px;
  --s-16: 64px;
  --s-20: 80px;
  --s-24: 96px;
  --s-32: 128px;
}
```

---

## 7. نظام الأحجام

### 7.1 فلسفة الأحجام

> **"أحجام متّسقة، نسب ذهبية، أحجام touch-friendly للجوال."**

### 7.2 الأحجام الأساسية

#### أزرار اللمس (Touch Targets)
| الحجم | الأبعاد | الاستخدام |
|------|---------|----------|
| **Touch SM** | 32x32px | أزرار صغيرة (icon only) |
| **Touch MD** | 40x40px | أزرار متوسطة (افتراضي للموبايل) |
| **Touch LG** | 48x48px | أزرار رئيسية على الموبايل |
| **Touch XL** | 56x56px | أزرار FAB |

> **ملاحظة**: الحد الأدنى لأحجام اللمس هو 44x44px (Apple HIG) أو 48x48px (Material).

#### الأزرار (Buttons)
| الحجم | الارتفاع | Padding | Font Size |
|------|---------|---------|-----------|
| **XS** | 24px | 4px 8px | 12px |
| **SM** | 32px | 6px 12px | 13px |
| **MD** | 40px | 8px 16px | 14px |
| **LG** | 48px | 12px 24px | 16px |
| **XL** | 56px | 16px 32px | 18px |

#### الحقول (Inputs)
| الحجم | الارتفاع | Padding | Font Size |
|------|---------|---------|-----------|
| **SM** | 32px | 6px 10px | 13px |
| **MD** | 40px | 8px 12px | 14px |
| **LG** | 48px | 10px 16px | 16px |

#### البطاقات (Cards)
| الحجم | Min Width | Max Width | Padding |
|------|-----------|-----------|---------|
| **SM** | 200px | 320px | 12px |
| **MD** | 280px | 480px | 16px |
| **LG** | 400px | 720px | 24px |
| **XL** | 600px | 1080px | 32px |

#### الـ Avatars
| الحجم | الأبعاد | الاستخدام |
|------|---------|----------|
| **XS** | 24x24px | inline في القوائم |
| **SM** | 32x32px | في الـ navbar |
| **MD** | 40x40px | في التعليقات |
| **LG** | 56x56px | في الـ profile |
| **XL** | 96x96px | في صفحة الملف الشخصي |
| **2XL** | 128x128px | في الـ onboarding |

### 7.3 العرض الأقصى للحاويات (Container Max Widths)

| الاسم | العرض | الاستخدام |
|------|------|----------|
| `container-xs` | 480px | نماذج صغيرة |
| `container-sm` | 640px | نماذج |
| `container-md` | 768px | محتوى ضيق |
| `container-lg` | 1024px | محتوى عادي |
| `container-xl` | 1280px | محتوى واسع |
| `container-2xl` | 1440px | dashboards |
| `container-3xl` | 1920px | dashboards كبيرة |
| `container-full` | 100% | full width |

---

## 8. نظام الحواف

### 8.1 نصف القطر (Border Radius)

| الاسم | القيمة | الاستخدام |
|------|--------|----------|
| `radius-none` | 0 | صور، جداول |
| `radius-xs` | 4px | chips صغيرة |
| `radius-sm` | 8px | inputs، buttons صغيرة |
| `radius-md` | 12px | buttons، cards صغيرة |
| `radius-lg` | 16px | cards العادية |
| `radius-xl` | 20px | cards كبيرة |
| `radius-2xl` | 28px | modals |
| `radius-3xl` | 36px | splash، hero |
| `radius-full` | 9999px | pills، avatars، circles |

### 8.2 قواعد الحواف

- ✅ استخدم نفس نصف القطر لكل البطاقات في الصفحة.
- ✅ استخدم `radius-full` للـ avatars والأيقونات الدائرية.
- ✅ استخدم `radius-sm` للحقول (تسهيل الكتابة).
- ❌ لا تخلط أحجام متناقضة (radius-lg و radius-xs في نفس البطاقة).
- ❌ لا تستخدم `radius-none` للبطاقات (تبدو حادة).
- ❌ لا تستخدم `radius-full` للبطاقات الكبيرة (تبدو غريبة).

---

## 9. نظام الـ Z-Index

### 9.1 طبقات الـ Z-Index

| الطبقة | Z-Index | الاستخدام |
|--------|---------|----------|
| `z-base` | 0 | المحتوى الأساسي |
| `z-dropdown` | 1000 | القوائم المنسدلة |
| `z-sticky` | 1100 | الـ sticky headers |
| `z-banner` | 1200 | الـ banners |
| `z-overlay` | 1300 | الـ overlays |
| `z-drawer` | 1400 | الـ drawers |
| `z-modal` | 1500 | الـ modals |
| `z-popover` | 1600 | الـ popovers |
| `z-toast` | 1700 | الـ toasts |
| `z-tooltip` | 1800 | الـ tooltips |
| `z-max` | 9999 | الحالات القصوى |

### 9.2 قواعد الـ Z-Index

- ✅ استخدم الـ variables المعرّفة (لا أرقام عشوائية).
- ✅ احترم الترتيب: tooltip > toast > modal > drawer > overlay > sticky > base.
- ❌ لا تستخدم `z-index: 9999` عشوائياً.
- ❌ لا تستخدم `z-index` سلبياً إلا للحالات الخاصة.

---

## 10. الوضع الليلي

### 10.1 فلسفة الوضع الليلي

> **"الوضع الداكن ليس عكس الفاتح. له شخصية مختلفة — أعمق، أهدأ، أكثر تركيزاً."**

### 10.2 لوحة الألوان في الوضع الداكن

#### الخلفيات
| الاسم | الوضع الفاتح | الوضع الداكن |
|------|--------------|---------------|
| `bg-primary` | `#EEF6FF` | `#0B1220` |
| `bg-medical-white` | `#F8FBFF` | `#0F172A` |
| `bg-surface` | `#FFFFFF` | `#1A2438` |
| `bg-glass` | `rgba(255,255,255,.65)` | `rgba(30,41,59,.65)` |
| `bg-glass-strong` | `rgba(255,255,255,.82)` | `rgba(30,41,59,.82)` |

#### الحدود
| الاسم | الوضع الفاتح | الوضع الداكن |
|------|--------------|---------------|
| `border-light` | `rgba(15,23,42,.08)` | `rgba(255,255,255,.08)` |
| `border-strong` | `rgba(15,23,42,.14)` | `rgba(255,255,255,.14)` |
| `border-glass` | `rgba(255,255,255,.50)` | `rgba(255,255,255,.10)` |

#### النصوص
| الاسم | الوضع الفاتح | الوضع الداكن |
|------|--------------|---------------|
| `text-primary` | `#0F172A` | `#F1F5F9` |
| `text-soft` | `#334155` | `#CBD5E1` |
| `text-muted` | `#64748B` | `#94A3B8` |
| `text-faint` | `#94A3B8` | `#64748B` |

#### الألوان الدلالية
في الوضع الداكن، نزيد إضاءة الألوان الدلالية قليلاً:
- Primary: `#1976D2` → `#42A5F5` (أفتح للمزيد من التباين).
- Success: `#00C853` → `#00E676`.
- Danger: `#FF5252` → `#FF8A80`.
- Warning: `#FFB300` → `#FFCA28`.

### 10.3 آلية التبديل

```css
/* الافتراضي: يتبع تفضيل النظام */
@media (prefers-color-scheme: dark) {
  :root { /* dark mode variables */ }
}

/* تجاوز المستخدم */
[data-theme="light"] { /* light variables */ }
[data-theme="dark"] { /* dark variables */ }
```

### 10.4 قواعد الوضع الليلي

- ✅ تباين ≥ 4.5:1 في كلا الوضعين.
- ✅ لا تستخدم الأسود الخالص (`#000000`) للخلفيات.
- ✅ استخدم كحلي عميق (`#0B1220`) بدلاً من الأسود.
- ✅ قلّل حجم الظلال في الوضع الداكن.
- ✅ تجنّب الأبيض الخالص للنصوص (استخدم `#F1F5F9`).
- ❌ لا تنسَ الـ borders (تختفي في الداكن).
- ❌ لا تستخدم تدرجات فاتحة في الداكن.
- ❌ لا تنسَ الـ SVG icons (تحتاج `fill="currentColor"`).

---

## 11. متغيرات CSS

### 11.1 ملف الـ CSS Variables الكامل

سيتم إنشاؤه في Phase 6 (Design System). هنا نظرة شاملة:

```css
:root {
  /* ========== COLORS ========== */
  /* Primary (Medical Blue) */
  --c-primary-50: #E3F2FD;
  --c-primary-100: #BBDEFB;
  --c-primary-200: #90CAF9;
  --c-primary-300: #64B5F6;
  --c-primary-400: #42A5F5;
  --c-primary-500: #2196F3;
  --c-primary-600: #1E88E5;
  --c-primary-700: #1976D2; /* main */
  --c-primary-800: #1565C0;
  --c-primary-900: #0D47A1;
  
  /* Accent (Cyan) */
  --c-accent-50: #E0F7FA;
  --c-accent-100: #B2EBF2;
  --c-accent-200: #80DEEA;
  --c-accent-300: #4DD0E1;
  --c-accent-400: #26C6DA;
  --c-accent-500: #00BCD4; /* main */
  --c-accent-600: #00ACC1;
  --c-accent-700: #0097A7;
  --c-accent-800: #00838F;
  --c-accent-900: #006064;
  
  /* Success (Green) */
  --c-success-50: #E8F5E9;
  --c-success-500: #00C853; /* main */
  --c-success-700: #009C40;
  --c-success-900: #006828;
  
  /* Danger (Red) */
  --c-danger-50: #FFEBEE;
  --c-danger-500: #FF5252; /* main */
  --c-danger-700: #C62828;
  --c-danger-900: #8E0000;
  
  /* Warning (Amber) */
  --c-warning-50: #FFF8E1;
  --c-warning-500: #FFB300; /* main */
  --c-warning-700: #FF8F00;
  --c-warning-900: #FF3D00;
  
  /* Info (Light Blue) */
  --c-info-50: #E1F5FE;
  --c-info-500: #03A9F4; /* main */
  --c-info-700: #0288D1;
  --c-info-900: #01579B;
  
  /* Neutral (Slate) */
  --c-neutral-50: #F8FAFC;
  --c-neutral-100: #F1F5F9;
  --c-neutral-200: #E2E8F0;
  --c-neutral-300: #CBD5E1;
  --c-neutral-400: #94A3B8;
  --c-neutral-500: #64748B;
  --c-neutral-600: #475569;
  --c-neutral-700: #334155;
  --c-neutral-800: #1E293B;
  --c-neutral-900: #0F172A;
  
  /* System */
  --c-bg: #EEF6FF;
  --c-medical-white: #F8FBFF;
  --c-surface: #FFFFFF;
  --c-glass: rgba(255, 255, 255, 0.65);
  --c-glass-strong: rgba(255, 255, 255, 0.82);
  --c-overlay: rgba(15, 23, 42, 0.50);
  
  /* Text */
  --c-text: #0F172A;
  --c-text-soft: #334155;
  --c-text-muted: #64748B;
  --c-text-faint: #94A3B8;
  --c-text-brand: #1976D2;
  --c-text-on-primary: #FFFFFF;
  
  /* Borders */
  --c-border: rgba(15, 23, 42, 0.08);
  --c-border-strong: rgba(15, 23, 42, 0.14);
  --c-border-glass: rgba(255, 255, 255, 0.50);
  
  /* ========== TYPOGRAPHY ========== */
  --font-arabic: 'Cairo', 'Tajawal', 'Noto Sans Arabic', system-ui, sans-serif;
  --font-latin: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  --font-sans: var(--font-arabic), var(--font-latin);
  
  /* ========== SPACING ========== */
  --s-0: 0;
  --s-px: 1px;
  --s-0.5: 2px;
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;
  --s-10: 40px;
  --s-12: 48px;
  --s-16: 64px;
  --s-20: 80px;
  --s-24: 96px;
  --s-32: 128px;
  
  /* ========== RADIUS ========== */
  --r-none: 0;
  --r-xs: 4px;
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-xl: 20px;
  --r-2xl: 28px;
  --r-3xl: 36px;
  --r-full: 9999px;
  
  /* ========== SHADOWS ========== */
  --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-sm: 0 2px 4px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 8px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04);
  --shadow-lg: 0 8px 16px rgba(15, 23, 42, 0.08), 0 4px 8px rgba(15, 23, 42, 0.04);
  --shadow-xl: 0 12px 24px rgba(15, 23, 42, 0.10), 0 8px 16px rgba(15, 23, 42, 0.06);
  --shadow-2xl: 0 20px 40px rgba(15, 23, 42, 0.12), 0 12px 24px rgba(15, 23, 42, 0.08);
  --shadow-glass: 0 8px 32px rgba(25, 118, 210, 0.10);
  --shadow-glow-primary: 0 0 0 4px rgba(25, 118, 210, 0.15);
  --shadow-glow-accent: 0 0 0 4px rgba(0, 188, 212, 0.15);
  --shadow-inner: inset 0 2px 4px rgba(15, 23, 42, 0.06);
  
  /* ========== GRADIENTS ========== */
  --grad-primary: linear-gradient(135deg, #1976D2 0%, #00BCD4 100%);
  --grad-dawn: linear-gradient(180deg, #1565C0 0%, #42A5F5 50%, #EEF6FF 100%);
  --grad-glass: linear-gradient(135deg, rgba(255,255,255,.65) 0%, rgba(255,255,255,.45) 100%);
  --grad-success: linear-gradient(135deg, #00C853 0%, #00E676 100%);
  --grad-celebration: linear-gradient(135deg, #00BCD4 0%, #00C853 100%);
  --grad-warning: linear-gradient(135deg, #FFB300 0%, #FFCA28 100%);
  --grad-danger: linear-gradient(135deg, #FF5252 0%, #FF8A80 100%);
  
  /* ========== Z-INDEX ========== */
  --z-base: 0;
  --z-dropdown: 1000;
  --z-sticky: 1100;
  --z-banner: 1200;
  --z-overlay: 1300;
  --z-drawer: 1400;
  --z-modal: 1500;
  --z-popover: 1600;
  --z-toast: 1700;
  --z-tooltip: 1800;
  --z-max: 9999;
  
  /* ========== TRANSITIONS ========== */
  --ease-in-out: cubic-bezier(.4, 0, .2, 1);
  --ease-out: cubic-bezier(0, 0, .2, 1);
  --ease-in: cubic-bezier(.4, 0, 1, 1);
  --ease-spring: cubic-bezier(.5, 1.5, .5, 1);
  
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
}

/* ========== DARK MODE ========== */
[data-theme="dark"] {
  --c-bg: #0B1220;
  --c-medical-white: #0F172A;
  --c-surface: #1A2438;
  --c-glass: rgba(30, 41, 59, 0.65);
  --c-glass-strong: rgba(30, 41, 59, 0.82);
  
  --c-text: #F1F5F9;
  --c-text-soft: #CBD5E1;
  --c-text-muted: #94A3B8;
  --c-text-faint: #64748B;
  
  --c-border: rgba(255, 255, 255, 0.08);
  --c-border-strong: rgba(255, 255, 255, 0.14);
  --c-border-glass: rgba(255, 255, 255, 0.10);
  
  --c-primary-700: #42A5F5; /* أفتح للتباين */
  --c-success-500: #00E676;
  --c-danger-500: #FF8A80;
  --c-warning-500: #FFCA28;
  
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.30), 0 1px 2px rgba(0, 0, 0, 0.20);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.40), 0 2px 4px rgba(0, 0, 0, 0.30);
  --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.50), 0 4px 8px rgba(0, 0, 0, 0.40);
}
```

---

## 12. إعدادات Tailwind

سيتم إنشاء `tailwind.config.ts` الكامل في Phase 6 (Design System). هنا الإطار العام:

```typescript
// tailwind.config.ts (إطار)
import type { Config } from 'tailwindcss';

export default {
  content: ['./apps/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#E3F2FD', /* ... */ 900: '#0D47A1' },
        accent: { 50: '#E0F7FA', /* ... */ 900: '#006064' },
        success: { 50: '#E8F5E9', /* ... */ 900: '#006828' },
        danger: { 50: '#FFEBEE', /* ... */ 900: '#8E0000' },
        warning: { 50: '#FFF8E1', /* ... */ 900: '#FF3D00' },
        info: { 50: '#E1F5FE', /* ... */ 900: '#01579B' },
        neutral: { 50: '#F8FAFC', /* ... */ 900: '#0F172A' },
      },
      fontFamily: {
        sans: ['Cairo', 'Inter', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'Tajawal', 'sans-serif'],
        latin: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: { /* 4px baseline */ },
      borderRadius: { /* from --r-* */ },
      boxShadow: { /* from --shadow-* */ },
      backgroundImage: { /* from --grad-* */ },
      zIndex: { /* from --z-* */ },
      transitionTimingFunction: { /* from --ease-* */ },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 13. ملخص الهوية البصرية

### 13.1 الجوهر

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   الألوان:                                              │
│   • Primary: #1976D2 (Medical Blue)                   │
│   • Accent:  #00BCD4 (Cyan)                            │
│   • Success: #00C853 (Green)                           │
│   • Danger:  #FF5252 (Red)                             │
│   • Warning: #FFB300 (Amber)                           │
│   • Info:    #03A9F4 (Light Blue)                      │
│   • Text:    #0F172A (Slate 900)                       │
│   • BG:      #EEF6FF (Light) / #0B1220 (Dark)         │
│                                                         │
│   الخطوط:                                               │
│   • Cairo (عربي) — 9 أوزان                             │
│   • Inter (إنجليزي) — 6 أوزان                          │
│   • JetBrains Mono (كود) — 3 أوزان                     │
│                                                         │
│   الأيقونات: Lucide + مخصص                              │
│   النمط: Glassmorphism + Medical Precision             │
│   المسافات: 4px baseline                                │
│   الحواف: 4-36px                                        │
│   الظلال: 6 مستويات + glow                              │
│   التدرجات: 8 تدرجات                                    │
│   الـ Z-Index: 11 طبقة                                  │
│   الوضع الليلي: مدعوم كاملاً                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 13.2 الالتزامات

- ✅ كل لون له استخدام محدد ولا يجوز الخروج عنه.
- ✅ كل خط له دوره ولا يجوز استبداله.
- ✅ كل مسافة من نظام 4px ولا يجوز استخدام قيم عشوائية.
- ✅ كل ظل من المستويات المعتمدة ولا يجوز إضافة مستويات.
- ✅ كل تدرّج من القائمة المعتمدة.
- ✅ الوضع الليلي يجب أن يعمل لكل مكوّن جديد.

---

## 14. الخطوة التالية

الانتقال إلى **Phase 6: Design System** لتحويل هذه الهوية إلى مكوّنات React قابلة لإعادة الاستخدام:
- Buttons (5 أنواع × 5 أحجام).
- Inputs (8 أنواع).
- Cards (4 أنواع).
- Dialogs (3 أنواع).
- Tables.
- Forms.
- Navbar + Sidebar.
- Empty States + Loading States + Error States.

**المخرجات المتوقعة من Phase 6**:
- `docs/DESIGN_SYSTEM.md` — نظام التصميم الكامل
- `docs/UI_COMPONENTS.md` — فهرس المكوّنات
- `packages/ui/` — مكتبة React (سيبدأ التنفيذ بعد اعتماد Phase 12)

---

**نهاية تقرير Phase 5: Visual Identity**
