# RESPONSIVE_GUIDE.md — دليل التصميم المتجاوب

> **مرجع شامل لتصميم منصة CMS لتعمل بسلاسة على جميع الأجهزة** (هواتف، تابلت، حواسيب، شاشات كبيرة).

**المرحلة**: Phase 6 (مقدّماً من Phase 11)
**الحالة**: ✅ Completed
**تاريخ الإنجاز**: 2026-07-30

---

## جدول المحتويات

1. [مقدمة عن التصميم المتجاوب](#1-مقدمة)
2. [الأجهزة المستهدفة](#2-الأجهزة-المستهدفة)
3. [نقاط التوقف (Breakpoints)](#3-نقاط-التوقف)
4. [Mobile-First Approach](#4-mobile-first-approach)
5. [نظام الشبكة (Grid System)](#5-نظام-الشبكة)
6. [التخطيطات حسب الجهاز](#6-التخطيطات-حسب-الجهاز)
7. [التنقّل حسب الجهاز](#7-التنقّل-حسب-الجهاز)
8. [الطباعة المتجاوبة](#8-الطباعة-المتجاوبة)
9. [الصور والوسائط](#9-الصور-والوسائط)
10. [النماذج المتجاوبة](#10-النماذج-المتجاوبة)
11. [الجداول المتجاوبة](#11-الجداول-المتجاوبة)
12. [الأداء على الأجهزة الضعيفة](#12-الأداء-على-الأجهزة-الضعيفة)
13. [PWA و Responsive](#13-pwa-و-responsive)
14. [قائمة فحص التجاوب](#14-قائمة-فحص-التجاوب)

---

## 1. مقدمة

### 1.1 ما هو التصميم المتجاوب؟

التصميم المتجاوب (Responsive Web Design - RWD) هو منهجية تصميم تجعل الواجهة تتكيّف مع:
- **حجم الشاشة** (320px - 1920px+).
- **اتجاه الجهاز** (عمودي/أفقي).
- **نوع الجهاز** (لمس/فأرة).
- **كثافة البكسل** (1x, 2x, 3x).
- **سرعة الشبكة** (3G/4G/WiFi).

### 1.2 المبادئ الثلاثة

1. **Fluid Grids**: شبكات نسبية لا ثابتة.
2. **Fluid Images**: صور تتكيّف مع الحاوية.
3. **Media Queries**: تنسيقات مختلفة حسب الجهاز.

### 1.3 لماذا مهم لـ CMS؟

- **70% من الطلاب** سيستخدمون الهواتف.
- **الجوال هو الجهاز الأساسي** في سوريا.
- **الإنترنت محدود** → يجب أن يكون سريعاً.
- **الشاشات صغيرة** → يجب أن يكون واضحاً.

---

## 2. الأجهزة المستهدفة

### 2.1 الهواتف (Mobile)

| الجهاز | العرض | النسبة | الأولوية |
|--------|------|--------|---------|
| iPhone SE | 320px | نادر | منخفضة |
| iPhone 12/13/14 | 390px | شائع | عالية |
| iPhone 14 Pro Max | 430px | شائع | عالية |
| Samsung Galaxy S22 | 360px | شائع | عالية |
| Samsung Galaxy S23 Ultra | 412px | شائع | عالية |
| Xiaomi Redmi Note | 393px | شائع | متوسطة |
| هواتف صغيرة (أندرويد قديم) | 360px | متوسط | متوسطة |

**الحد الأدنى المطلوب**: 360px.

### 2.2 التابلت (Tablet)

| الجهاز | العرض (عمودي) | العرض (أفقي) | النسبة |
|--------|---------------|---------------|--------|
| iPad Mini | 768px | 1024px | شائع |
| iPad | 810px | 1080px | شائع |
| iPad Air | 820px | 1180px | متوسط |
| iPad Pro 11" | 834px | 1194px | متوسط |
| iPad Pro 12.9" | 1024px | 1366px | نادر |
| Samsung Galaxy Tab | 800px | 1280px | متوسط |
| Android Tab (عام) | 768px | 1024px | متوسط |

### 2.3 الحواسيب (Desktop)

| الجهاز | العرض | النسبة |
|--------|------|--------|
| Laptop صغير | 1024px | شائع |
| Laptop عادي | 1280px | شائع جداً |
| Laptop كبير | 1440px | شائع |
| Desktop Full HD | 1920px | شائع |
| Desktop 2K | 2560px | نادر |
| Desktop 4K | 3840px | نادر جداً |

### 2.4 الأجهزة القابلة للطي (Foldable)

- Samsung Galaxy Fold: 280px (مطوي) / 768px (مفتوح).
- Microsoft Surface Duo: 540px / 1080px.

> ملاحظة: هذه الأجهزة نادرة في سوريا، لكن تصميمنا يدعمها افتراضياً عبر Responsive.

---

## 3. نقاط التوقف

### 3.1 نقاط التوقف المعتمدة

نستخدم نظام Tailwind 4 القياسي (متوافق مع أجهزة 2024+):

| الاسم | الحد الأدنى | الوصف |
|------|------------|--------|
| `xs` (افتراضي) | 0px | جميع الأجهزة (Mobile-first) |
| `sm` | 640px | هواتف كبيرة / تابلت صغير عمودي |
| `md` | 768px | تابلت عمودي |
| `lg` | 1024px | تابلت أفقي / لابتوب صغير |
| `xl` | 1280px | لابتوب |
| `2xl` | 1536px | لابتوب كبير / desktop |
| `3xl` | 1920px | شاشات كبيرة (custom) |

### 3.2 القاعدة الأساسية

```css
/* Mobile-first: اكتب للجوال أولاً، ثم وسّع */

.card {
  /* افتراضي (mobile) */
  padding: 12px;
  border-radius: 12px;
}

@media (min-width: 768px) {
  .card {
    padding: 16px;
    border-radius: 16px;
  }
}

@media (min-width: 1024px) {
  .card {
    padding: 24px;
    border-radius: 20px;
  }
}
```

### 3.3 في Tailwind

```tsx
// Mobile-first syntax
<div className="
  p-3                  /* mobile */
  md:p-4               /* ≥ 768px */
  lg:p-6               /* ≥ 1024px */
  rounded-xl
  md:rounded-2xl
  lg:rounded-3xl
">
  محتوى
</div>
```

### 3.4 قواعد الاستخدام

#### ✅ افع
- اكتب CSS للجوال أولاً.
- أضف `min-width` queries للتوسعة.
- استخدم `max-width` queries فقط للحالات الخاصة (مثلاً تقييد العرض على الشاشات الكبيرة).

#### ❌ لا تفعل
- لا تستخدم `max-width` كقاعدة (يصعب الصيانة).
- لا تستخدم `device-width` (مهمل، استخدم `min-width`).
- لا تستخدم نقاط توقف غير قياسية (مثلاً 850px).

### 3.5 نقاط توقف مخصّصة

يمكن إضافة نقطة `3xl` لشاشات 4K:

```typescript
// tailwind.config.ts
export default {
  theme: {
    screens: {
      'xs': '0px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
  },
};
```

---

## 4. Mobile-First Approach

### 4.1 ما هو Mobile-First؟

تصميم وتطوير للجوال أولاً، ثم التوسعة للأجهزة الأكبر.

### 4.2 لماذا Mobile-First؟

1. **الجوال هو الأصعب**: شاشة صغيرة، لمس، إنترنت بطيء.
2. **إذا نجح على الجوال، ينجح على الأكبر** (العكس غير صحيح).
3. **70% من المستخدمين** على الجوال.
4. **Google يفضّل Mobile-first indexing** (SEO).

### 4.3 كيفية التطبيق

#### الخطوة 1: صمّم للجوال
```
- ما المحتوى الأساسي؟
- ما الإجراءات الأساسية؟
- ما التخطيط الأبسط؟
```

#### الخطوة 2: أضف للتابلت
```
- استفد من العرض الإضافي.
- اعرض المزيد في كل صف.
- أضف sidebar إذا لزم.
```

#### الخطوة 3: حسّن للـ Desktop
```
- تخطيط متعدّد الأعمدة.
- اختصارات لوحة المفاتيح.
- hover effects.
```

### 4.4 مثال: صفحة الأسئلة

```tsx
// Mobile-first
<div className="
  grid
  grid-cols-1               /* mobile: عمود واحد */
  md:grid-cols-2            /* tablet: عمودان */
  lg:grid-cols-3            /* desktop: 3 أعمدة */
  gap-3 md:gap-4 lg:gap-6
">
  {questions.map(q => <QuestionCard key={q.id} question={q} />)}
</div>
```

---

## 5. نظام الشبكة

### 5.1 الشبكة الأساسية (12-Column)

نستخدم شبكة 12-عمود على الـ Desktop:

```tsx
<Grid cols={12} gap="md">
  <GridCol span={{ base: 12, md: 6, lg: 4 }}>
    {/* عمود على الموبايل، نصف على التابلت، ثلث على الديسكتوب */}
  </GridCol>
</Grid>
```

### 5.2 الأنماط الشائعة

#### Pattern 1: Single Column (Mobile) → 2 Columns (Tablet) → 3 Columns (Desktop)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(...)}
</div>
```

#### Pattern 2: Sidebar + Content
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
  <Sidebar className="hidden lg:block" />
  <main>{children}</main>
</div>
```

#### Pattern 3: Master-Detail
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <MasterList />
  <DetailPanel />
</div>
```

#### Pattern 4: Card Grid (Stat Cards)
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
  {stats.map(stat => <StatCard key={stat.id} {...stat} />)}
</div>
```

#### Pattern 5: Form Layout
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <FormField label="الاسم الأول" />
  <FormField label="الاسم الأخير" />
  <FormField label="البريد" className="md:col-span-2" />
</div>
```

### 5.3 الأحجام النسبية

```tsx
// ✅ استخدم fr units
<div className="grid grid-cols-[1fr_2fr_1fr]">
  ...
</div>

// ✅ أو Tailwind arbitrary values
<div className="grid grid-cols-[1fr_2fr] lg:grid-cols-[280px_1fr_280px]">
  ...
</div>
```

### 5.4 Container Widths

```tsx
<Container size="md">  {/* 768px - forms */}
<Container size="lg">  {/* 1024px - articles */}
<Container size="xl">  {/* 1280px - dashboards */}
<Container size="2xl"> {/* 1536px - large dashboards */}
```

```typescript
// tailwind.config.ts
container: {
  center: true,
  padding: {
    DEFAULT: '1rem',     // 16px mobile
    sm: '1.5rem',        // 24px
    lg: '2rem',          // 32px
    xl: '3rem',          // 48px
  },
  screens: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
},
```

---

## 6. التخطيطات حسب الجهاز

### 6.1 AppShell - Mobile

```
┌─────────────────────┐
│ Navbar (64px)        │  ← شريط علوي + زر قائمة
├─────────────────────┤
│                     │
│   المحتوى الرئيسي    │  ← بعرض كامل
│                     │
│                     │
├─────────────────────┤
│ Bottom Nav (56px)    │  ← تنقّل سفلي (5 عناصر)
└─────────────────────┘
```

**السلوك**:
- Sidebar يتحول لـ Drawer (تنزلق من اليمين).
- Navbar يبقى ثابت.
- إضافة Bottom Navigation للتنقّل السريع.

### 6.2 AppShell - Tablet

```
┌─────────────────────┐
│ Navbar (64px)        │
├──────────┬──────────┤
│ Sidebar  │           │
│ (240px)  │  المحتوى  │
│ قابل     │           │
│ للطي     │           │
└──────────┴──────────┘
```

**السلوك**:
- Sidebar ظاهر افتراضياً.
- قابل للطي لـ 72px (icons only).
- لا Bottom Nav (يستخدم Sidebar).

### 6.3 AppShell - Desktop

```
┌─────────────────────────────────────────┐
│ Navbar (64px)                            │
├──────────┬──────────────────────────────┤
│ Sidebar  │                              │
│ (280px)  │  المحتوى                      │
│ ثابت     │  (Container max-width: 1280)  │
│          │                              │
└──────────┴──────────────────────────────┘
```

**السلوك**:
- Sidebar ثابت بعرض 280px.
- المحتوى بحد أقصى 1280px (للقراءة المريحة).
- على شاشات 2K+، يضاف هامش أكبر.

### 6.4 تنفيذ AppShell

```tsx
// packages/ui/src/layouts/AppShell/AppShell.tsx
export function AppShell({ navbar, sidebar, footer, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg">
      {/* Navbar - ثابت في الأعلى */}
      <div className="sticky top-0 z-sticky">
        {navbar}
      </div>
      
      <div className="flex">
        {/* Sidebar - مخفي على mobile */}
        <aside className="hidden lg:block w-[280px] sticky top-16 h-[calc(100vh-4rem)]">
          {sidebar}
        </aside>
        
        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <Container size="xl" padding="lg">
            {children}
          </Container>
        </main>
      </div>
      
      {/* Bottom Nav - mobile only */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-sticky">
        <BottomNav />
      </nav>
      
      {/* Footer */}
      {footer && <footer className="mt-12">{footer}</footer>}
      
      {/* Mobile Sidebar Drawer */}
      <Drawer side="start" size="sm" open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        {sidebar}
      </Drawer>
    </div>
  );
}
```

---

## 7. التنقّل حسب الجهاز

### 7.1 Navbar

#### Mobile (320-1023px)
```
┌─────────────────────────────────────────┐
│ [☰]  [Logo]  ............  [🔔] [👤]   │
└─────────────────────────────────────────┘
```

- زر قائمة (☰) على اليمين.
- شعار في الوسط أو اليمين.
- إشعارات + ملف شخصي على اليسار.
- لا بحث (يفتح صفحة منفصلة).

#### Tablet (768-1023px)
```
┌─────────────────────────────────────────┐
│ [☰]  [Logo]  [Search]  [🔔] [👤]       │
└─────────────────────────────────────────┘
```

- زر قائمة على اليمين.
- بحث في الوسط (مدمج).
- إشعارات + ملف على اليسار.

#### Desktop (≥ 1024px)
```
┌─────────────────────────────────────────────────────────┐
│ [Logo]  [Search ............]  [⌨️] [🌙] [🔔] [👤]   │
└─────────────────────────────────────────────────────────┘
```

- لا زر قائمة (Sidebar دائم).
- بحث أكبر.
- اختصارات لوحة المفاتيح.
- مبدّل الوضع الليلي.

### 7.2 Sidebar

#### Mobile
- مخفي افتراضياً.
- يفتح كـ Drawer (تنزلق من اليمين).
- يغطّي كامل الشاشة أو 80% منها.
- خلفية معتمة.

#### Tablet
- قابل للطي.
- افتراضياً: 240px.
- عند الطي: 72px (أيقونات فقط).

#### Desktop
- ثابت بعرض 280px.
- قابل للطي (مع حفظ التفضيل).

### 7.3 Bottom Navigation (Mobile)

شريط سفلي للموبايل يحتوي 5 عناصر:

```
┌─────────────────────────────────────────┐
│  🏠      📚      ⭐      🔍      👤   │
│ الرئيسية  التصنيفات  المفضلة  البحث  حسابي│
└─────────────────────────────────────────┘
```

**المواصفات**:
- ارتفاع: 56px + safe-area-inset-bottom.
- 5 عناصر كحد أقصى.
- كل عنصر: أيقونة + نص صغير.
- العنصر النشط: لون Primary + نقطة.

### 7.4 Tabs

- **Mobile**: Tabs قابلة للتمرير الأفقي (scroll-snap).
- **Tablet/Desktop**: Tabs تأخذ كامل العرض.

```tsx
<Tabs className="overflow-x-auto md:overflow-visible">
  <TabsList className="flex md:grid md:grid-cols-3">
    <TabsTrigger>الأسئلة</TabsTrigger>
    <TabsTrigger>المكتبة</TabsTrigger>
    <TabsTrigger>الاختبارات</TabsTrigger>
  </TabsList>
</Tabs>
```

---

## 8. الطباعة المتجاوبة

### 8.1 الهرم الطباعي المتجاوب

| المستوى | Mobile | Tablet | Desktop | Large |
|--------|--------|--------|---------|-------|
| Display | 32px | 40px | 56px | 64px |
| H1 | 26px | 32px | 48px | 56px |
| H2 | 22px | 28px | 36px | 44px |
| H3 | 18px | 22px | 28px | 32px |
| H4 | 16px | 18px | 22px | 24px |
| H5 | 15px | 16px | 18px | 20px |
| Body | 14px | 15px | 16px | 18px |
| Body Sm | 13px | 13px | 14px | 14px |
| Caption | 12px | 12px | 12px | 12px |

### 8.2 تطبيق Tailwind

```tsx
<h1 className="text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-bold">
  عنوان الصفحة
</h1>

<p className="text-sm md:text-base lg:text-lg">
  نص أساسي
</p>
```

### 8.3 خط القارئ (Reading Width)

النص الطويل يجب ألا يتجاوز 65 حرفاً لكل سطر:

```css
.article {
  max-width: 65ch;  /* ch = متوسط عرض الحرف */
  margin: 0 auto;
}
```

```tsx
<article className="max-w-[65ch] mx-auto">
  {content}
</article>
```

### 8.4 ارتفاع السطر (Line Height)

```css
.article p {
  line-height: 1.7;  /* للنصوص الطويلة */
}

.heading {
  line-height: 1.2;  /* للعناوين */
}
```

### 8.5 أحجام اللمس (Touch Targets)

على الجوال، الحد الأدنى لأي عنصر تفاعلي هو 44x44px (Apple HIG) أو 48x48px (Material):

```tsx
// ✅ على الموبايل، زر بـ 48px
<Button size="md" className="min-h-[48px] md:min-h-0">
  اضغط
</Button>

// ✅ أيقونة قابلة للنقر
<button className="p-3 -m-1">  /* padding إضافي للوصول لـ 44px */
  <Icon size={20} />
</button>
```

---

## 9. الصور والوسائط

### 9.1 الصور المتجاوبة

#### استخدام `<picture>` لمصادر متعدّدة

```tsx
<picture>
  <source media="(max-width: 640px)" srcSet="/img/mobile.webp" />
  <source media="(max-width: 1024px)" srcSet="/img/tablet.webp" />
  <img src="/img/desktop.webp" alt="وصف" />
</picture>
```

#### استخدام `srcset` للأحجام المختلفة

```tsx
<img
  src="/img/medium.jpg"
  srcSet="
    /img/small.jpg 480w,
    /img/medium.jpg 768w,
    /img/large.jpg 1200w,
    /img/xlarge.jpg 1920w
  "
  sizes="
    (max-width: 640px) 100vw,
    (max-width: 1024px) 50vw,
    33vw
  "
  alt="وصف"
/>
```

#### تنفيذ مكوّن Image

```tsx
// packages/ui/src/components/Image/Image.tsx
interface ImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;  // for above-the-fold
  className?: string;
}

export function Image({ src, alt, width, height, priority, className }: ImageProps) {
  return (
    <NextImage  // أو <img> مع loading="lazy"
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      className={cn('object-cover', className)}
    />
  );
}
```

### 9.2 الفيديو المتجاوب

```tsx
// فيديو يستجيب للحاوية
<div className="relative w-full" style={{ aspectRatio: '16/9' }}>
  <video
    className="absolute inset-0 w-full h-full"
    controls
    poster="/poster.jpg"
  >
    <source src="/video.mp4" type="video/mp4" />
    <track kind="captions" srcLang="ar" src="/captions.vtt" />
  </video>
</div>
```

### 9.3 صور الخلفية

```css
.hero {
  background-image: url('/hero-mobile.jpg');
}

@media (min-width: 768px) {
  .hero {
    background-image: url('/hero-tablet.jpg');
  }
}

@media (min-width: 1024px) {
  .hero {
    background-image: url('/hero-desktop.jpg');
  }
}
```

### 9.4 Aspect Ratios

```tsx
// صورة 16:9
<div className="aspect-video">
  <img className="w-full h-full object-cover" />
</div>

// صورة 1:1 (مربعة)
<div className="aspect-square">
  <img className="w-full h-full object-cover" />
</div>

// صورة 4:3
<div className="aspect-[4/3]">
  <img className="w-full h-full object-cover" />
</div>
```

### 9.5 Lazy Loading

```tsx
// افتراضي للصور تحت الـ fold
<img loading="lazy" decoding="async" />

// للصور فوق الـ fold (مهم للأداء)
<img loading="eager" fetchPriority="high" />
```

---

## 10. النماذج المتجاوبة

### 10.1 Layout

#### Mobile (عمود واحد)
```tsx
<form className="space-y-4">
  <FormField label="الاسم" />
  <FormField label="البريد" />
  <FormField label="الهاتف" />
  <Button fullWidth>إرسال</Button>
</form>
```

#### Tablet/Desktop (عمودان)
```tsx
<form className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <FormField label="الاسم الأول" />
  <FormField label="الاسم الأخير" />
  <FormField label="البريد" className="md:col-span-2" />
  <FormField label="الهاتف" />
  <FormField label="المدينة" />
  <div className="md:col-span-2">
    <Button>إرسال</Button>
  </div>
</form>
```

### 10.2 أحجام الحقول

```tsx
<Input
  className="
    h-12              /* mobile: 48px للّمسه */
    md:h-10           /* desktop: 40px */
    text-base         /* mobile: 16px لمنع التكبير في iOS */
    md:text-sm        /* desktop: 14px */
  "
/>
```

> **مهم**: على iOS، إذا كان حجم الخط < 16px، يكبر المتصفح الصفحة عند التركيز. لذلك نستخدم `text-base` (16px) على الموبايل.

### 10.3 لوحة المفاتيح الافتراضية

```tsx
<Input
  type="email"           /* يفتح @ في الكيبورد */
  inputMode="email"
  autoComplete="email"
  autoCapitalize="none"
/>

<Input
  type="tel"             /* يفتح كيبورد أرقام */
  inputMode="tel"
  autoComplete="tel"
/>

<Input
  type="search"
  enterKeyHint="search"
/>
```

### 10.4 زر الإرسال

على الموبايل، يجب أن يكون زر الإرسال:
- بعرض كامل (`fullWidth`).
- بارتفاع ≥ 48px.
- في أسفل النموذج.
- مثبّت أسفل الشاشة (للنماذج الطويلة).

```tsx
<div className="sticky bottom-0 bg-surface/95 backdrop-blur-md p-4 -mx-4 -mb-4">
  <Button type="submit" fullWidth size="lg">
    إرسال
  </Button>
</div>
```

### 10.5 Validation على الموبايل

- ✅ تحقق فوري عند `blur` (لا على كل ضغطة).
- ✅ عرض الأخطاء أسفل الحقل.
- ✅ ملخص الأخطاء في الأعلى (للنماذج الطويلة).
- ❌ لا تعطّل زر الإرسال قبل المحاولة الأولى.

---

## 11. الجداول المتجاوبة

### 11.1 المشكلة

الجداول على الموبايل صعبة:
- عرض محدود.
- نصوص تفيض.
- تمرير أفقي مزعج.

### 11.2 الحلول

#### الحل 1: بطاقات بدلاً من جدول (Mobile)

```tsx
// Desktop: جدول
<div className="hidden md:block">
  <DataTable data={data} columns={columns} />
</div>

// Mobile: بطاقات
<div className="md:hidden space-y-3">
  {data.map(item => (
    <Card key={item.id}>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="font-medium">{item.name}</span>
          <Badge>{item.status}</Badge>
        </div>
        <div className="text-sm text-muted">{item.email}</div>
        <div className="text-xs text-muted">{item.createdAt}</div>
      </div>
    </Card>
  ))}
</div>
```

#### الحل 2: جدول قابل للتمرير الأفقي

```tsx
<div className="overflow-x-auto">
  <table className="min-w-[640px]">
    ...
  </table>
</div>
```

#### الحل 3: جدول مع أعمدة قابلة للإخفاء

```tsx
<table>
  <thead>
    <tr>
      <th>الاسم</th>
      <th className="hidden md:table-cell">البريد</th>
      <th className="hidden lg:table-cell">الهاتف</th>
      <th className="hidden lg:table-cell">المدينة</th>
      <th>الحالة</th>
    </tr>
  </thead>
  <tbody>
    {data.map(row => (
      <tr key={row.id}>
        <td>{row.name}</td>
        <td className="hidden md:table-cell">{row.email}</td>
        <td className="hidden lg:table-cell">{row.phone}</td>
        <td className="hidden lg:table-cell">{row.city}</td>
        <td><Badge>{row.status}</Badge></td>
      </tr>
    ))}
  </tbody>
</table>
```

### 11.3 DataTable المتجاوبة

مكوّن `DataTable` الخاص بنا يتعامل مع هذا تلقائياً:

```tsx
<DataTable
  data={data}
  columns={[
    { id: 'name', header: 'الاسم', mobile: 'primary' },        /* يظهر دائماً */
    { id: 'email', header: 'البريد', mobile: 'secondary' },   /* يظهر كبطاقة */
    { id: 'phone', header: 'الهاتف', mobile: 'hidden' },      /* مخفي على mobile */
    { id: 'status', header: 'الحالة', mobile: 'badge' },      /* يظهر كـ badge */
  ]}
  responsiveMode="cards"  /* cards | scroll | hide */
/>
```

---

## 12. الأداء على الأجهزة الضعيفة

### 12.1 المشاكل الشائعة

- **بطء التحميل** على 3G.
- **جهاز ضعيف** (RAM محدود).
- **هاتف قديم** (CPU بطيء).
- **إنترنت محدود** (باقات صغيرة).

### 12.2 الحلول

#### Code Splitting

```tsx
// ✅ Lazy load للصفحات الثانوية
const SettingsPage = lazy(() => import('./SettingsPage'));

// ✅ Lazy load للمكوّنات الكبيرة
const CodeEditor = lazy(() => import('./CodeEditor'));

// استخدام
<Suspense fallback={<Skeleton />}>
  <SettingsPage />
</Suspense>
```

#### Tree Shaking

```tsx
// ✅ استيراد فقط ما تحتاج
import { Button } from '@cms/ui';

// ❌ تجنّب
import * as UI from '@cms/ui';
```

#### Image Optimization

```tsx
// استخدم WebP بدل JPEG/PNG
<img src="/image.webp" alt="..." />

// استخدم AVIF (أحدث)
<picture>
  <source srcSet="/image.avif" type="image/avif" />
  <source srcSet="/image.webp" type="image/webp" />
  <img src="/image.jpg" alt="..." />
</picture>
```

#### Bundle Analysis

```bash
# تحليل حجم الـ bundle
npx vite-bundle-visualizer

# أهداف:
# - Initial bundle < 200KB (gzipped)
# - Per-route chunk < 50KB
```

### 12.3 التحميل التدريجي

```tsx
// 1. Skeleton فوري
{isLoading && <Skeleton />}

// 2. محتوى أساسي
{!isLoading && <MainContent />}

// 3. محتوى ثانوي (lazy)
{!isLoading && (
  <Suspense fallback={null}>
    <SecondaryContent />
  </Suspense>
)}
```

### 12.4 Prefetching

```tsx
// Prefetch للصفحات المتوقّعة
<Link to="/subjects" prefetch="intent">
  المواد
</Link>

// أو يدوياً
useEffect(() => {
  if (userClickedSubjects) {
    import('./SubjectsPage');  // prefetch
  }
}, [userClickedSubjects]);
```

### 12.5 Cache

```tsx
// React Query مع cache طويل
useQuery({
  queryKey: ['universities'],
  queryFn: fetchUniversities,
  staleTime: 1000 * 60 * 60,  /* 1 ساعة */
  cacheTime: 1000 * 60 * 60 * 24,  /* 24 ساعة */
});
```

### 12.6 Service Worker (PWA)

```javascript
// cache-first للملفات الثابتة
// network-first للـ API
// stale-while-revalidate للصور
```

---

## 13. PWA و Responsive

### 13.1 Manifest

```json
// public/manifest.json
{
  "name": "CMS - College Medical System",
  "short_name": "CMS",
  "description": "منصة تعليمية طبية",
  "lang": "ar",
  "dir": "rtl",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#1976D2",
  "background_color": "#EEF6FF",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### 13.2 Safe Areas

```css
/* دعم الـ notch و iPhone X+ */
:root {
  --safe-area-top: env(safe-area-inset-top);
  --safe-area-bottom: env(safe-area-inset-bottom);
  --safe-area-left: env(safe-area-inset-left);
  --safe-area-right: env(safe-area-inset-right);
}

.navbar {
  padding-top: var(--safe-area-top);
}

.bottom-nav {
  padding-bottom: var(--safe-area-bottom);
  height: calc(56px + var(--safe-area-bottom));
}
```

```tsx
<div className="pt-[env(safe-area-inset-top)]">
  ...
</div>
```

### 13.3 Viewport Meta

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### 13.4 Orientation

- ✅ تصميمنا يعمل في الوضعين (عمودي وأفقي).
- ✅ لا إجبار على اتجاه معيّن.
- ✅ على التابلت، يمكن الاستفادة من الوضع الأفقي.

---

## 14. قائمة فحص التجاوب

### 14.1 قبل اعتماد أي صفحة

#### Mobile (360px)
- [ ] لا تمرير أفقي (overflow-x: hidden أو محتوى يتكيّف).
- [ ] الأزرار ≥ 44x44px.
- [ ] النصوص ≥ 14px.
- [ ] الحقول ≥ 48px ارتفاع + 16px خط.
- [ ] الصور lazy-loaded.
- [ ] لا popover/tooltip يخرج من الشاشة.
- [ ] Bottom Nav يظهر.
- [ ] Sidebar يتحول لـ Drawer.

#### Tablet (768px)
- [ ] لا تمرير أفقي.
- [ ] Sidebar ظاهر.
- [ ] الأعمدة تتضاعف (1 → 2).
- [ ] Tabs في صف واحد.
- [ ] الجداول تظهر كاملة (إن أمكن).

#### Desktop (1024px+)
- [ ] لا تمرير أفقي.
- [ ] Sidebar ثابت.
- [ ] المحتوى لا يتجاوز 1280px عرض.
- [ ] Hover effects تعمل.
- [ ] اختصارات الكيبورد تعمل.

#### Large (1920px+)
- [ ] المحتوى لا يتمدّد بشكل مفرط.
- [ ] يبقى مقروء (max-width مناسب).
- [ ] لا فراغات كبيرة.

#### عام
- [ ] اختبار على أجهزة حقيقية (لست فقط DevTools).
- [ ] اختبار على متصفحات مختلفة (Chrome, Firefox, Safari, Edge).
- [ ] اختبار على iOS Safari (له قيود خاصة).
- [ ] اختبار الوضع العمودي والأفقي (تابلت).
- [ ] Lighthouse Performance ≥ 90.
- [ ] Lighthouse Accessibility ≥ 95.

### 14.2 أدوات الاختبار

#### Chrome DevTools
- Device Toolbar (Ctrl+Shift+M).
- Network throttling (3G/4G).
- CPU throttling (4x slowdown).
- Coverage tab (تحليل الـ JS/CSS غير المستخدم).

#### BrowserStack / Sauce Labs
- اختبار على أجهزة حقيقية.
- متصفحات متعدّدة.

#### Lighthouse CI
```bash
npx @lhci/cli autorun --collect.url=http://localhost:3000
```

#### Responsively App
- أداة لعرض الصفحة على عدة شاشات في وقت واحد.

---

## 15. قواعد ذهبية

### 15.1 القاعدة 1: Mobile-First
ابدأ دائماً بتصميم للجوال. وسّع للأكبر لاحقاً.

### 15.2 القاعدة 2: Touch-First
افترض أن المستخدم يستخدم لمساً. صمّم أزراراً وأهدافاً كبيرة.

### 15.3 القاعدة 3: Performance-First
السرعة أهم من الجمال. لا تحمّل ما لا تحتاج.

### 15.4 القاعدة 4: Progressive Enhancement
ابدأ بالأساسي (HTML)، أضف التحسينات (CSS، JS) تدريجياً.

### 15.5 القاعدة 5: Test on Real Devices
DevTools ليست كافية. اختبر على أجهزة حقيقية.

### 15.6 القاعدة 6: Respect the User
احترم وقت المستخدم، بطارية جهازه، وباقة إنترنتثه.

---

## 16. موارد إضافية

### 16.1 توثيق
- MDN Responsive Design: https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design
- web.dev Responsive: https://web.dev/learn/design
- Tailwind CSS Responsive: https://tailwindcss.com/docs/responsive-design

### 16.2 أدوات
- Chrome DevTools: https://developer.chrome.com/docs/devtools/
- Lighthouse: https://developers.google.com/web/tools/lighthouse
- BrowserStack: https://www.browserstack.com/
- Responsively: https://responsively.app/

### 16.3 مكتبات
- Tailwind CSS: https://tailwindcss.com/
- React Responsive: https://github.com/contra/react-responsive
- useMediaQuery hook: https://usehooks-ts.com/react-hook-use-media-query

---

## 17. الخلاصة

التصميم المتجاوب ليس ترفاً، بل **ضرورة** لمنصة مثل CMS. الطلاب سيستخدمون هواتفهم أساساً، وأي تجربة سيئة على الجوال تعني خسارة مستخدمين.

**التزاماتنا**:
1. ✅ Mobile-First في كل قرار تصميمي.
2. ✅ اختبار على أجهزة حقيقية قبل كل إصدار.
3. ✅ أداء ≤ 2.5s على شبكة 4G.
4. ✅ Lighthouse Performance ≥ 90.
5. ✅ دعم PWA الكامل.
6. ✅ دعم RTL في كل مكوّن.

---

**نهاية ملف RESPONSIVE_GUIDE.md**
