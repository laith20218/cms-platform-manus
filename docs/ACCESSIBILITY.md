# ACCESSIBILITY.md — دليل الوصولية (Accessibility Guide)

> **مرجع شامل لجعل المنصة قابلة للوصول لكل المستخدمين**، بما في ذلك ذوي الاحتياجات الخاصة. ملتزمون بـ WCAG 2.1 Level AA.

**المرحلة**: Phase 6 (مقدّماً من Phase 11)
**الحالة**: ✅ Completed
**تاريخ الإنجاز**: 2026-07-30

---

## جدول المحتويات

1. [مقدمة عن الوصولية](#1-مقدمة-عن-الوصولية)
2. [معايير WCAG 2.1 AA](#2-معايير-wcag-21-aa)
3. [المبادئ الأربعة (POUR)](#3-المبادئ-الأربعة-pour)
4. [قواعد الترميز الدلالي (Semantic HTML)](#4-قواعد-الترميز-الدلالي)
5. [دعم لوحة المفاتيح (Keyboard Support)](#5-دعم-لوحة-المفاتيح)
6. [إدارة التركيز (Focus Management)](#6-إدارة-التركيز)
7. [قارئ الشاشة (Screen Reader Support)](#7-قارئ-الشاشة)
8. [التباين والألوان (Color & Contrast)](#8-التباين-والألوان)
9. [النصوص البديلة (Alt Text)](#9-النصوص-البديلة)
10. [الوسائط (Media Accessibility)](#10-الوسائط)
11. [النماذج (Forms Accessibility)](#11-النماذج)
12. [التنقّل (Navigation)](#12-التنقّل)
13. [اللغة و RTL](#13-اللغة-و-rtl)
14. [الحركة (Motion)](#14-الحركة)
15. [الاختبار والتحقق](#15-الاختبار-والتحقق)
16. [قائمة فحص الوصولية (Checklist)](#16-قائمة-فحص-الوصولية)

---

## 1. مقدمة عن الوصولية

### 1.1 ما هي الوصولية (Accessibility)؟

الوصولية هي ممارسة تصميم وتطوير منتجات يمكن استخدامها من قبل أكبر عدد ممكن من الناس، بما في ذلك:

- 🦯 **ذوي الإعاقة البصرية** (كفيفون، ضعاف بصر، عمى ألوان).
- 🦻 **ذوي الإعاقة السمعية** (صمم، ضعاف سمع).
- 🦽 **ذوي الإعاقة الحركية** (لا يمكنهم استخدام الفأرة).
- 🧠 **ذوي الإعاقة الإدراكية** (صعوبات تعلم، ADHD، dyslexia).
- 📱 **مستخدمو الأجهزة القديمة أو البطيئة**.
- 🌍 **مستخدمو ظروف بيئية صعبة** (إضاءة سيئة، ضوضاء).

### 1.2 لماذا الوصولية مهمّة لـ CMS؟

1. **التزام أخلاقي**: كل طالب يستحق الوصول للمحتوى التعليمي.
2. **قانوني**: العديد من الدول تتطلب WCAG للمؤسسات التعليمية.
3. **تجربة أفضل للجميع**: نص واضح، ألوان متباينة، تنقّل سلس يفيد كل المستخدمين.
4. **SEO محسّن**: HTML دلالي يحسّن ترتيب البحث.
5. **جودة الكود**: HTML نظيف أسهل في الصيانة.

### 1.3 الالتزام

> **CMS ملتزم بـ WCAG 2.1 Level AA كحد أدنى.**
> 
> كل مكوّن جديد يجب أن يحقّق المعايير قبل الاعتماد.
> 
> أي PR لا يحقّق المعايير يُرفض.

---

## 2. معايير WCAG 2.1 AA

### 2.1 ما هو WCAG؟

**Web Content Accessibility Guidelines (WCAG)** هو معيار دولي طوّره W3C. يتكوّن من:

- **13 إرشاد** موزّعة على 4 مبادئ (POUR).
- **3 مستويات امتثال**: A (أدنى)، AA (متوسط)، AAA (عالي).
- **CMS يستهدف AA** (المستوى المعتمد قانونياً في معظم الدول).

### 2.2 الإرشادات الـ 13

| # | الإرشاد | المستوى |
|---|---------|---------|
| 1.1.1 | Non-text Content (Alt Text) | A |
| 1.2.1 | Audio-only and Video-only | A |
| 1.2.2 | Captions (Live) | A |
| 1.2.3 | Audio Description or Media Alternative | A |
| 1.2.4 | Captions (Live) | AA |
| 1.2.5 | Audio Description (Prerecorded) | AA |
| 1.3.1 | Info and Relationships | A |
| 1.3.2 | Meaningful Sequence | A |
| 1.3.3 | Sensory Characteristics | A |
| 1.3.4 | Orientation | AA |
| 1.3.5 | Identify Input Purpose | AA |
| 1.4.1 | Use of Color | A |
| 1.4.2 | Audio Control | A |
| 1.4.3 | Contrast (Minimum) | AA |
| 1.4.4 | Resize Text | AA |
| 1.4.5 | Images of Text | AA |
| 1.4.10 | Reflow | AA |
| 1.4.11 | Non-text Contrast | AA |
| 1.4.12 | Text Spacing | AA |
| 1.4.13 | Content on Hover or Focus | AA |
| 2.1.1 | Keyboard | A |
| 2.1.2 | No Keyboard Trap | A |
| 2.1.4 | Character Key Shortcuts | A |
| 2.2.1 | Timing Adjustable | A |
| 2.2.2 | Pause, Stop, Hide | A |
| 2.3.1 | Three Flashes or Below | A |
| 2.4.1 | Bypass Blocks | A |
| 2.4.2 | Page Titled | A |
| 2.4.3 | Focus Order | A |
| 2.4.4 | Link Purpose | A |
| 2.4.5 | Multiple Ways | AA |
| 2.4.6 | Headings and Labels | AA |
| 2.4.7 | Focus Visible | AA |
| 2.5.1 | Pointer Gestures | A |
| 2.5.2 | Pointer Cancellation | A |
| 2.5.3 | Label in Name | A |
| 2.5.4 | Motion Actuation | A |
| 3.1.1 | Language of Page | A |
| 3.1.2 | Language of Parts | AA |
| 3.2.1 | On Focus | A |
| 3.2.2 | On Input | A |
| 3.2.3 | Consistent Navigation | AA |
| 3.2.4 | Consistent Identification | AA |
| 3.3.1 | Error Identification | A |
| 3.3.2 | Labels or Instructions | A |
| 3.3.3 | Error Suggestion | AA |
| 3.3.4 | Error Prevention | AA |
| 4.1.1 | Parsing | A |
| 4.1.2 | Name, Role, Value | A |
| 4.1.3 | Status Messages | AA |

---

## 3. المبادئ الأربعة (POUR)

### 3.1 Perceivable (قابل للإدراك)
المحتوى يجب أن يكون قابل للإدراك بواسطة الحواس.

**التطبيق في CMS**:
- كل صورة لها `alt` وصفي.
- كل فيديو له subtitles عربية.
- كل صوت له transcript.
- الألوان لا تحمل معنى وحدها (دائماً + نص أو أيقونة).

### 3.2 Operable (قابل للتشغيل)
الواجهة يجب أن تكون قابلة للتشغيل بأي طريقة إدخال.

**التطبيق في CMS**:
- كل إجراء يمكن تنفيذه بالكيبورد.
- لا فخ للكيبورد (keyboard trap).
- زر "تخطّي للمحتوى" في كل صفحة.
- تركيز مرئي دائماً.

### 3.3 Understandable (مفهوم)
المحتوى والواجهة يجب أن يكونا مفهومين.

**التطبيق في CMS**:
- لغة الصفحة محدّدة (`lang="ar"`).
- لغة بسيطة وواضحة.
- رسائل أخطاء مفيدة.
- تنقّل متّسق بين الصفحات.

### 3.4 Robust (متين)
المحتوى يجب أن يعمل مع التقنيات المساعدة الحالية والمستقبلية.

**التطبيق في CMS**:
- HTML دلالي صحيح.
- ARIA صحيح (لا إفراط في الاستخدام).
- متوافق مع قارئات الشاشة الرئيسية (NVDA, JAWS, VoiceOver).

---

## 4. قواعد الترميز الدلالي

### 4.1 استخدم العناصر الدلالية

```tsx
// ✅ صحيح - عناصر دلالية
<header>
  <nav>
    <ul>
      <li><a href="/">الرئيسية</a></li>
    </ul>
  </nav>
</header>

<main>
  <article>
    <h1>عنوان المقال</h1>
    <section>
      <h2>قسم</h2>
    </section>
  </article>
</main>

<aside>
  <h2>إعلانات</h2>
</aside>

<footer>...</footer>
```

```tsx
// ❌ خطأ - div لكل شيء
<div className="header">
  <div className="nav">
    <div className="link">الرئيسية</div>
  </div>
</div>
```

### 4.2 العناصر الدلالية المتوفّرة

| العنصر | الاستخدام |
|--------|----------|
| `<header>` | ترويسة الصفحة أو القسم |
| `<nav>` | قائمة تنقّل رئيسية |
| `<main>` | المحتوى الرئيسي (مرة واحدة في الصفحة) |
| `<article>` | محتوى مستقل (مقال، سؤال) |
| `<section>` | قسم ذو معنى |
| `<aside>` | محتوى جانبي (sidebar) |
| `<footer>` | تذييل |
| `<figure>` | صورة مع caption |
| `<figcaption>` | caption للـ figure |
| `<time>` | تاريخ أو وقت |
| `<mark>` | نص مميّز |
| `<details>` | تفاصيل قابلة للطي |
| `<summary>` | ملخص للـ details |

### 4.3 هرم العناوين (Heading Hierarchy)

```tsx
<h1>عنوان الصفحة (مرة واحدة)</h1>
  <h2>قسم رئيسي</h2>
    <h3>قسم فرعي</h3>
      <h4>تفصيل</h4>
  <h2>قسم رئيسي آخر</h2>
    <h3>قسم فرعي</h3>
```

**القواعد**:
- ✅ `<h1>` مرة واحدة في الصفحة.
- ✅ لا تقفز مستويات (h2 → h4 خطأ).
- ✅ الترتيب المنطقي يعكس البنية.
- ❌ لا تستخدم العناوين للتجميل فقط (استخدم CSS).

### 4.4 القوائم

```tsx
// قائمة غير مرتّبة
<ul>
  <li>عنصر 1</li>
  <li>عنصر 2</li>
</ul>

// قائمة مرتّبة
<ol>
  <li>الخطوة 1</li>
  <li>الخطوة 2</li>
</ol>

// قائمة تعريف
<dl>
  <dt>المصطلح</dt>
  <dd>التعريف</dd>
</dl>
```

### 4.5 الجداول الدلالية

```tsx
<table>
  <caption>قائمة المستخدمين</caption>
  <thead>
    <tr>
      <th scope="col">الاسم</th>
      <th scope="col">البريد</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">أحمد</th>
      <td>a@b.c</td>
    </tr>
  </tbody>
</table>
```

---

## 5. دعم لوحة المفاتيح

### 5.1 كل إجراء يجب أن يكون قابلاً للوصول بالكيبورد

| الإجراء | المفتاح |
|--------|---------|
| التنقّل بين العناصر | `Tab` |
| التنقّل العكسي | `Shift + Tab` |
| تفعيل زر/رابط | `Enter` أو `Space` |
| فتح/إغلاق Dialog | `Escape` |
| التنقّل في القائمة | `Arrow Up/Down` |
| اختيار من قائمة | `Enter` |
| إغلاق Popover | `Escape` |
| فتح Command Palette | `Ctrl + K` |
| البحث السريع | `/` |
| تخطّي للمحتوى | `Tab` (أول عنصر) |

### 5.2 ترتيب التركيز (Focus Order)

الترتيب يجب أن يتبع الترتيب البصري (في RTL: من اليمين لليسار، من الأعلى للأسفل).

```tsx
// ✅ ترتيب صحيح
<div>
  <input /> {/* 1 */}
  <input /> {/* 2 */}
  <button>إرسال</button> {/* 3 */}
</div>

// ❌ ترتيب خاطئ (tabindex إيجابي)
<input tabIndex={3} />
<input tabIndex={1} />
<button tabIndex={2}>إرسال</button>
```

**القواعد**:
- ✅ استخدم الترتيب الطبيعي للـ DOM.
- ✅ استخدم `tabIndex={0}` فقط لعناصر غير تفاعلية تريد جعلها قابلة للتركيز.
- ❌ لا تستخدم `tabIndex={1, 2, 3...}` (يكسر الترتيب الطبيعي).
- ❌ لا تستخدم `tabIndex={-1}` إلا للعناصر البرمجية (لا يريد المستخدم الوصول لها).

### 5.3 لا فخ للكيبورد (No Keyboard Trap)

عند فتح Dialog، يجب أن يبقى التركيز داخلها. لكن يجب أن يمكن الخروج بـ `Escape`.

```tsx
// Dialog (مع Radix UI - يحل هذا تلقائياً)
<Dialog>
  <DialogContent>
    {/* Focus trap تلقائي */}
    <Button>إغلاق</Button>
  </DialogContent>
</Dialog>
```

### 5.4 Skip Links

زر "تخطّي للمحتوى" يظهر عند أول Tab:

```tsx
<a href="#main-content" className="skip-link">
  تخطّي للمحتوى الرئيسي
</a>

<main id="main-content">
  ...
</main>
```

```css
.skip-link {
  position: absolute;
  top: -100px; /* مخفي */
  /* ... */
}

.skip-link:focus {
  top: 8px; /* يظهر عند التركيز */
  /* ... */
}
```

---

## 6. إدارة التركيز

### 6.1 التركيز المرئي (Focus Visible)

كل عنصر تفاعلي يجب أن يكون له تركيز مرئي:

```css
/* افتراضي - لكل العناصر */
*:focus {
  outline: none;
}

*:focus-visible {
  outline: 2px solid var(--c-primary-500);
  outline-offset: 2px;
  border-radius: 4px;
}

/* بدلاً من outline - ring أجمل */
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.15);
}
```

### 6.2 Focus Ring حسب اللون

```css
.button-primary:focus-visible {
  box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.25);
}

.button-danger:focus-visible {
  box-shadow: 0 0 0 4px rgba(255, 82, 82, 0.25);
}

.input-error:focus-visible {
  box-shadow: 0 0 0 4px rgba(255, 82, 82, 0.15);
}
```

### 6.3 إدارة التركيز في Dialogs

عند فتح Dialog:
1. انقل التركيز للعنصر الأول داخلها.
2. احبس التركيز داخلها (focus trap).
3. عند الإغلاق، أعد التركيز للعنصر الذي فتحها.

```tsx
// Radix UI يفعل هذا تلقائياً
<Dialog>
  <DialogTrigger asChild>
    <Button ref={triggerRef}>فتح</Button>
  </DialogTrigger>
  <DialogContent>
    {/* التركيز ينتقل هنا تلقائياً */}
  </DialogContent>
</Dialog>
// عند الإغلاق، التركيز يعود للـ trigger تلقائياً
```

### 6.4 إدارة التركيز في Route Changes

عند تغيير الصفحة (في React Router):

```tsx
function RouteChangeFocus() {
  const location = useLocation();
  
  useEffect(() => {
    const main = document.getElementById('main-content');
    if (main) {
      main.focus();
      // أعلن التغيير لقارئ الشاشة
      const title = document.title;
      announce(`تم الانتقال لصفحة: ${title}`);
    }
  }, [location.pathname]);
  
  return null;
}
```

---

## 7. قارئ الشاشة

### 7.1 ARIA Basics

#### ARIA Roles
```tsx
// ✅ استخدم فقط عند الحاجة
<div role="navigation">...</div>
<div role="main">...</div>
<div role="banner">...</div>
<div role="contentinfo">...</div>
<div role="search">...</div>
<div role="alert">...</div>
<div role="status">...</div>
<div role="dialog" aria-modal="true">...</div>
<div role="tablist">...</div>
<div role="tab">...</div>
<div role="tabpanel">...</div>
```

**القاعدة الذهبية**: لا تستخدم ARIA إذا كان HTML الدلالي يكفي.

```tsx
// ✅ أفضل
<nav>...</nav>

// ❌ أسوأ
<div role="navigation">...</div>
```

#### ARIA Labels
```tsx
// للعناصر بلا نص مرئي
<button aria-label="إغلاق">
  <X />
</button>

// للعناصر مع نص إضافي لقارئ الشاشة
<button aria-label="حذف السؤال رقم 42">
  <Trash />
  <span>حذف</span>
</button>
```

#### ARIA Describedby
```tsx
<input
  aria-describedby="email-hint"
  id="email"
/>
<p id="email-hint">مثال: example@domain.com</p>
```

#### ARIA Live Regions
```tsx
// لإعلان تغييرات ديناميكية
<div role="status" aria-live="polite">
  تم حفظ التغييرات
</div>

<div role="alert" aria-live="assertive">
  خطأ: لم يتم الحفظ
</div>
```

### 7.2 sr-only Class

لإخفاء نص بصرياً لكن إبقائه لقارئ الشاشة:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

```tsx
<button>
  <X />
  <span className="sr-only">إغلاق</span>
</button>
```

### 7.3 قارئات الشاشة المدعومة

| القارئ | المنصة | الأولوية |
|--------|--------|---------|
| **NVDA** | Windows | عالية (مجاني، شائع) |
| **JAWS** | Windows | متوسطة (مدفوع، شائع) |
| **VoiceOver** | macOS, iOS | عالية (مدمج) |
| **TalkBack** | Android | عالية (مدمج) |
| **Orca** | Linux | منخفضة |

### 7.4 قواعد ARIA

#### ✅ افع
- استخدم HTML الدلالي أولاً.
- أضف `aria-label` للأيقونات بلا نص.
- أضف `aria-describedby` للحقول مع hints.
- استخدم `aria-live` للإشعارات الديناميكية.
- استخدم `aria-expanded` للأكورديون والقوائم.
- استخدم `aria-current="page"` للصفحة الحالية في nav.

#### ❌ لا تفعل
- لا تفرط في ARIA (إذا كان HTML يكفي، لا تستخدمه).
- لا تستخدم `aria-hidden="true"` على العناصر القابلة للتركيز.
- لا تستخدم `role="presentation"` على عناصر تفاعلية.
- لا تنشئ widgets مخصّصة إذا كان هناك HTML يفي بالغرض.
- لا تعتمد على `aria-label` فقط (النص المرئي أفضل).

---

## 8. التباين والألوان

### 8.1 معايير التباين (Contrast Ratio)

| النوع | الحد الأدنى (AA) | الحد الموصى (AAA) |
|------|------------------|-------------------|
| نص عادي (< 18px أو < 14px bold) | 4.5:1 | 7:1 |
| نص كبير (≥ 18px أو ≥ 14px bold) | 3:1 | 4.5:1 |
| عناصر UI (أيقونات، حدود) | 3:1 | — |
| نص على صور | 4.5:1 | — |

### 8.2 التحقق من التباين

استخدم هذه الأدوات:
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Chrome DevTools**: Lighthouse → Accessibility
- **axe DevTools**: إضافة المتصفح
- **Figma Plugin**: Stark

### 8.3 التباين في CMS

#### الوضع الفاتح
| النص | الخلفية | التباين | الحالة |
|------|---------|---------|--------|
| `#0F172A` (Slate 900) | `#FFFFFF` (أبيض) | 16.8:1 | ✅ AAA |
| `#0F172A` (Slate 900) | `#EEF6FF` (BG) | 15.2:1 | ✅ AAA |
| `#334155` (Slate 700) | `#FFFFFF` | 11.5:1 | ✅ AAA |
| `#64748B` (Slate 500) | `#FFFFFF` | 4.7:1 | ✅ AA |
| `#94A3B8` (Slate 400) | `#FFFFFF` | 2.8:1 | ❌ (للنص الكبير فقط) |
| `#1976D2` (Primary 700) | `#FFFFFF` | 5.3:1 | ✅ AA |
| `#FFFFFF` (أبيض) | `#1976D2` (Primary 700) | 5.3:1 | ✅ AA |
| `#00C853` (Success 500) | `#FFFFFF` | 2.8:1 | ❌ (للأيقونات فقط) |

#### الوضع الداكن
| النص | الخلفية | التباين | الحالة |
|------|---------|---------|--------|
| `#F1F5F9` (Slate 100) | `#0B1220` | 16.5:1 | ✅ AAA |
| `#CBD5E1` (Slate 300) | `#0B1220` | 11.8:1 | ✅ AAA |
| `#94A3B8` (Slate 400) | `#0B1220` | 6.4:1 | ✅ AA |
| `#42A5F5` (Primary 400) | `#0B1220` | 6.9:1 | ✅ AA |

### 8.4 قواعد الألوان

#### ✅ افع
- استخدم `text-text` (Slate 900) للنصوص الأساسية.
- استخدم `text-text-soft` (Slate 700) للنصوص الثانوية.
- استخدم `text-text-muted` (Slate 500) للنصوص الخافتة فقط.
- تحقق من التباين لكل combinaison نص/خلفية.
- اختبر في الوضع الفاتح والداكن.

#### ❌ لا تفعل
- لا تستخدم `text-text-faint` (Slate 400) للنصوص الصغيرة.
- لا تستخدم Success/Danger/Warning للنصوص الصغيرة (تباين منخفض).
- لا تعتمد على اللون فقط للدلالة (أضف نصاً أو أيقونة).
- لا تستخدم `text-primary-700` على خلفية فاتحة جداً (تباين منخفض).

### 8.5 عدم الاعتماد على اللون فقط

```tsx
// ❌ خطأ - اللون فقط يدل على الحالة
<div className={status === 'success' ? 'bg-green' : 'bg-red'} />

// ✅ صحيح - اللون + الأيقونة + النص
<div>
  {status === 'success' ? (
    <>
      <CheckCircle className="text-success" />
      <span>تمّ بنجاح</span>
    </>
  ) : (
    <>
      <XCircle className="text-danger" />
      <span>فشل</span>
    </>
  )}
</div>
```

### 8.6 عمى الألوان

تصميمنا يدعم أنواع عمى الألوان الرئيسية:

| النوع | الانتشار | التأثير |
|------|---------|---------|
| Deuteranopia (أعمى أخضر) | 6% ذكور | يخلط أخضر/أحمر |
| Protanopia (أعمى أحمر) | 1% ذكور | يخلط أحمر/أخضر |
| Tritanopia (أعمى أزرق) | 0.01% | يخلط أزرق/أصفر |

**القاعدة**: لا تستخدم الأخضر والأحمر معاً للدلالة على نعم/لا. استخدم الأيقونات (✓/✗) + النص.

---

## 9. النصوص البديلة

### 9.1 قواعد Alt Text

#### ✅ افع
- **وصف موجز**: "طالب يذاكر في المكتبة"
- **محدّد**: "رسم تشريحي للقلب يظهر البطين الأيسر"
- **سياق**: وضّح دور الصورة في المحتوى

#### ❌ لا تفعل
- لا تكرر ما في النص المحيط.
- لا تبدأ بـ "صورة لـ..." (قارئ الشاشة يقولها تلقائياً).
- لا تتجاوز 125 حرفاً (إن طال، استخدم `longdesc`).

### 9.2 أنواع الصور

| النوع | alt |
|------|-----|
| **صورة معلوماتية** | وصف كامل |
| **صورة زخرفية** | `alt=""` (فارغ) أو `aria-hidden="true"` |
| **صورة رابط** | وصف وجهة الرابط |
| **صورة زر** | وصف الإجراء |
| **رسم بياني معقّد** | نص بديل في `<details>` |

```tsx
// معلوماتية
<img src="heart-anatomy.jpg" alt="رسم تشريحي للقلب يظهر الأذينين والبطينين" />

// زخرفية
<img src="decoration.svg" alt="" />

// رابط
<a href="/about">
  <img src="logo.svg" alt="الصفحة الرئيسية" />
</a>

// زر
<button>
  <img src="close.svg" alt="إغلاق" />
</button>

// رسم بياني معقّد
<figure>
  <img src="chart.svg" alt="رسم بياني لتوزيع الأمراض" />
  <figcaption>توزيع الأمراض في 2024</figcaption>
  <details>
    <summary>الوصف الكامل</summary>
    <p>يظهر الرسم البياني...</p>
  </details>
</figure>
```

### 9.3 الأيقونات

- أيقونات **زخرفية** (بجانب نص): `aria-hidden="true"`.
- أيقونات **تفاعلية** (وحدها): `aria-label`.

```tsx
// زخرفية - بجانب نص
<Button>
  <Save aria-hidden="true" />
  <span>حفظ</span>
</Button>

// تفاعلية - وحدها
<IconButton aria-label="حفظ">
  <Save />
</IconButton>
```

---

## 10. الوسائط

### 10.1 الفيديو

#### Subtitles (Captions)
كل فيديو يجب أن يحتوي على:
- **Closed Captions (CC)**: نصوص تظهر/تختفي.
- **Subtitles**: نصوص مدمجة.

```tsx
<video controls>
  <source src="lecture.mp4" type="video/mp4" />
  <track kind="captions" srcLang="ar" src="captions-ar.vtt" label="عربي" default />
  <track kind="descriptions" srcLang="ar" src="descriptions-ar.vtt" label="وصف صوتي" />
</video>
```

#### Audio Description
للفيديوهات التي تحمل معلومات بصرية مهمّة:
- نسخة بصيغة audio description.
- أو نسخة بديلة بنص كامل (transcript).

#### Transcript
كل فيديو/صوت يجب أن يحتوي على:
- transcript نصّي كامل.
- يمكن البحث فيه.
- يمكن تحميله.

### 10.2 الصوت

- لا تشغّل صوتاً تلقائياً عند فتح الصفحة.
- وفر زر كتم/تشغيل واضح.
- وفر تحكماً بمستوى الصوت.

### 10.3 البث المباشر (إذا أُضيف مستقبلاً)
- Subtitles في البث المباشر.
- تأخير 30 ثانية للسماح بالـ captioning.

---

## 11. النماذج

### 11.1 Labels

كل حقل يجب أن يكون له `<label>` مرتبط:

```tsx
// ✅ صحيح
<label htmlFor="email">البريد الإلكتروني</label>
<input id="email" type="email" />

// ✅ أفضل - داخل label
<label>
  البريد الإلكتروني
  <input type="email" />
</label>

// ❌ خطأ - لا label
<input type="email" placeholder="البريد" />
```

### 11.2 Required Fields

```tsx
// ✅ صحيح
<label htmlFor="name">
  الاسم <span aria-hidden="true" className="text-danger">*</span>
  <span className="sr-only">(مطلوب)</span>
</label>
<input id="name" required />

// ✅ أو
<label htmlFor="name">الاسم</label>
<input id="name" required aria-required="true" />
```

### 11.3 Error Identification

```tsx
<label htmlFor="email">البريد الإلكتروني</label>
<input
  id="email"
  type="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'email-error' : 'email-hint'}
/>
{error ? (
  <p id="email-error" role="alert" className="text-danger">
    {error}
  </p>
) : (
  <p id="email-hint" className="text-muted">
    مثال: example@domain.com
  </p>
)}
```

### 11.4 Error Suggestions

عند الخطأ، اعرض الحل المقترح:

```tsx
{error === 'email_invalid' && (
  <p role="alert">
    البريد غير صحيح. تأكد من包含 @ والنطاق (مثال: user@example.com).
  </p>
)}
```

### 11.5 Grouping

اجمع الحقول المرتبطة:

```tsx
<fieldset>
  <legend>الجنس</legend>
  <label><input type="radio" name="gender" value="male" /> ذكر</label>
  <label><input type="radio" name="gender" value="female" /> أنثى</label>
</fieldset>
```

### 11.6 Autofocus

```tsx
// ✅ ضع التركيز على أول حقل عند تحميل النموذج
<input autoFocus />

// ❌ لا تستخدمه في الصفحات التي تحتوي على نموذج + محتوى
```

### 11.7 Error Summary

في النماذج الطويلة، اعرض ملخص الأخطاء في الأعلى:

```tsx
{Object.keys(errors).length > 0 && (
  <div role="alert" className="error-summary">
    <h3>يوجد {Object.keys(errors).length} أخطاء:</h3>
    <ul>
      {Object.entries(errors).map(([field, msg]) => (
        <li>
          <a href={`#${field}`}>{msg}</a>
        </li>
      ))}
    </ul>
  </div>
)}
```

---

## 12. التنقّل

### 12.1 Skip Links

```tsx
<a href="#main" className="skip-link">تخطّي للمحتوى</a>
<a href="#search" className="skip-link">تخطّي للبحث</a>
<a href="#footer" className="skip-link">تخطّي للتذييل</a>
```

### 12.2 Breadcrumbs

```tsx
<nav aria-label="مسار التنقّل">
  <ol>
    <li><a href="/">الرئيسية</a></li>
    <li><a href="/subjects">المواد</a></li>
    <li aria-current="page">الباطنة</li>
  </ol>
</nav>
```

### 12.3 Pagination

```tsx
<nav aria-label="ترقيم الصفحات">
  <ul>
    <li><a href="?page=1" aria-label="الصفحة السابقة">‹</a></li>
    <li><a href="?page=1" aria-current="page" aria-label="الصفحة 1">1</a></li>
    <li><a href="?page=2" aria-label="الصفحة 2">2</a></li>
    <li><a href="?page=3" aria-label="الصفحة التالية">›</a></li>
  </ul>
</nav>
```

### 12.4 Current Page

```tsx
<a href="/dashboard" aria-current="page">لوحة التحكم</a>
```

### 12.5 Multiple Ways

وفّر أكثر من طريقة للوصول للصفحة:
1. **Navbar**: تنقّل رئيسي.
2. **Search**: بحث.
3. **Breadcrumbs**: مسار.
4. **Sitemap**: خريطة موقع (للمدير).

---

## 13. اللغة و RTL

### 13.1 تحديد اللغة

```tsx
<html lang="ar" dir="rtl">
```

### 13.2 تغيير اللغة لأجزاء

```tsx
<p>
  هذا النص بالعربية.
  <span lang="en">This is in English.</span>
</p>
```

### 13.3 RTL Considerations

#### الأيقونات الاتجاهية

في RTL، الأيقونات الاتجاهية تتبدّل تلقائياً:

```tsx
// ✅ استخدم logical properties
<button>
  التالي
  <ArrowLeft className="rtl:rotate-180" /> {/* يصبح ArrowRight */}
</button>

// أو استخدم أيقونات direction-aware
<ArrowRight /> {/* يصبح يسار في RTL تلقائياً مع RTL plugin */}
```

#### المسافات

```css
/* ✅ استخدم logical properties */
margin-inline-start: 16px;  /* بدل margin-right */
margin-inline-end: 16px;    /* بدل margin-left */
padding-inline-start: 16px;
padding-inline-end: 16px;
inset-inline-start: 0;      /* بدل left: 0 */
inset-inline-end: 0;        /* بدل right: 0 */
```

#### Tailwind Logical Properties

```tsx
// ✅ Tailwind 4 يدعم logical properties تلقائياً
<div className="ps-4 pe-4 ms-2 me-2" />

// ❌ تجنّب
<div className="pl-4 pr-4 ml-2 mr-2" />
```

### 13.4 الأرقام

```tsx
// الأرقام الإنجليزية أو العربية؟
// في CMS نستخدم الإنجليزية (للوضوح)
<span dir="ltr">123</span>
```

### 13.5 التواريخ

```tsx
<time datetime="2024-12-25" dir="ltr">
  2024/12/25
</time>
```

---

## 14. الحركة

### 14.1 احترام prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 14.2 في Framer Motion

```tsx
import { MotionConfig } from 'framer-motion';

<MotionConfig reducedMotion="user">
  <App />
</MotionConfig>
```

### 14.3 قواعد الحركة

- ✅ الحركة يجب أن تكون اختيارية.
- ✅ لا حركة تتجاوز 3 ثوانٍ بشكل تلقائي.
- ✅ لا وميض أكثر من 3 مرات في الثانية (تسبب نوبات صرع).
- ✅ وفر زر إيقاف للحركات الطويلة.

### 14.4 Parallax و Auto-play

- لا تستخدم parallax مفرط (يسبب دوار).
- لا تشغّل فيديو تلقائياً مع صوت.
- وفر زر إيقاف لكل حركة مستمرة.

---

## 15. الاختبار والتحقق

### 15.1 الأدوات الآلية

#### axe DevTools
- إضافة Chrome/Firefox.
- يفحص الصفحة ويعطي تقرير.
- متكامل في CI/CD.

```bash
# تثبيت
npm install --save-dev @axe-core/playwright

# في الاختبارات
import { injectAxe, checkA11y } from 'axe-playwright';

test('page is accessible', async ({ page }) => {
  await page.goto('/');
  await injectAxe(page);
  await checkA11y(page);
});
```

#### Lighthouse
- متكامل في Chrome DevTools.
- يعطي درجة وصولية (0-100).
- هدفنا: ≥ 95.

```bash
# CLI
npx lighthouse https://cms.example.com --only-categories=accessibility
```

#### WAVE
- https://wave.webaim.org/
- فحص بصري للوصولية.

### 15.2 الاختبار اليدوي

#### اختبار الكيبورد
1. افتح الصفحة.
2. اضغط Tab بشكل متكرر.
3. تحقق من:
   - ترتيب منطقي.
   - تركيز مرئي واضح.
   - لا فخ.
   - كل إجراء يمكن تنفيذه.

#### اختبار قارئ الشاشة
1. شغّل NVDA (Windows) أو VoiceOver (Mac).
2. تنقّل في الصفحة.
3. تحقق من:
   - العناوين تُقرأ بشكل صحيح.
   - الروابط واضحة.
   - النماذج قابلة للتعبئة.
   - الأخطاء تُعلن.

#### اختبار التباين
1. استخدم WebAIM Contrast Checker.
2. افحص كل combinaison نص/خلفية.
3. تأكد من ≥ 4.5:1 للنصوص.

#### اختبار التكبير
1. كبّر الصفحة لـ 200%.
2. تحقق من:
   - لا تداخل.
   - لا قص نص.
   - التنقّل يعمل.

#### اختبار Reflow
1. اضبط العرض لـ 320px.
2. تحقق من:
   - لا تمرير أفقي.
   - النصوص قابلة للقراءة.
   - الأزرار قابلة للنقر.

### 15.3 اختبار المستخدم

- اجلس مع مستخدمين حقيقيين يستخدمون قارئات الشاشة.
- راقب استخدامهم للمنصة.
- اجمع ملاحظاتهم.
- حسّن بناءً عليها.

### 15.4 CI/CD Pipeline

```yaml
# .github/workflows/accessibility.yml
name: Accessibility Tests

on: [push, pull_request]

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm run test:a11y
      - name: Lighthouse CI
        run: npx @lhci/cli autorun --collect.url=http://localhost:3000
```

---

## 16. قائمة فحص الوصولية

### 16.1 قبل اعتماد أي مكوّن/صفحة

#### HTML الدلالي
- [ ] استخدمت عناصر دلالية (`<nav>`, `<main>`, `<article>`...).
- [ ] هرم العناوين صحيح (h1 → h2 → h3).
- [ ] لا `div` حيث يصلح عنصر دلالي.

#### الكيبورد
- [ ] كل إجراء قابل للوصول بالكيبورد.
- [ ] ترتيب التركيز منطقي.
- [ ] لا فخ للكيبورد.
- [ ] زر "تخطّي للمحتوى" موجود.

#### التركيز
- [ ] تركيز مرئي واضح.
- [ ] Focus trap في Dialogs.
- [ ] إعادة التركيز عند إغلاق Dialog.

#### ARIA
- [ ] `aria-label` للأيقونات بلا نص.
- [ ] `aria-describedby` للحقول مع hints.
- [ ] `aria-live` للإشعارات الديناميكية.
- [ ] لا إفراط في ARIA.

#### التباين
- [ ] تباين النصوص ≥ 4.5:1.
- [ ] تباين العناصر ≥ 3:1.
- [ ] اختبر في Light + Dark.

#### الألوان
- [ ] لا اعتماد على اللون فقط.
- [ ] أضفت أيقونة + نص مع اللون.

#### الصور
- [ ] كل صورة معلوماتية لها `alt` وصفي.
- [ ] الصور الزخرفية `alt=""`.
- [ ] أيقونات تفاعلية لها `aria-label`.

#### النماذج
- [ ] كل حقل له `<label>`.
- [ ] الحقول المطلوبة موسّمة.
- [ ] الأخطاء موصوفة (`aria-invalid`, `aria-describedby`).
- [ ] ملخص الأخطاء في الأعلى (للنماذج الطويلة).

#### الوسائط
- [ ] كل فيديو له subtitles.
- [ ] كل صوت له transcript.
- [ ] لا autoplay مع صوت.

#### اللغة و RTL
- [ ] `<html lang="ar" dir="rtl">`.
- [ ] الأيقونات الاتجاهية تتبدّل في RTL.
- [ ] استخدمت logical properties.

#### الحركة
- [ ] احترام `prefers-reduced-motion`.
- [ ] لا وميض أكثر من 3/ثانية.
- [ ] لا حركة تسبب دوار.

#### الاختبار
- [ ] اجتاز axe DevTools (0 أخطاء).
- [ ] اجتاز Lighthouse (≥ 95).
- [ ] اختبرت بالكيبورد فقط.
- [ ] اختبرت بقارئ الشاشة (NVDA أو VoiceOver).
- [ ] اختبرت التكبير لـ 200%.
- [ ] اختبرت العرض 320px.

### 16.2 تكرار الفحص

- **لكل PR جديد**: قائمة الفحص أعلاه.
- **أسبوعياً**: فحص شامل بـ Lighthouse CI.
- **شهرياً**: اختبار يدوي بقارئ الشاشة.
- **قبل كل إصدار**: اختبار مستخدم حقيقي.

---

## 17. موارد إضافية

### 17.1 توثيق رسمي
- WCAG 2.1: https://www.w3.org/TR/WCAG21/
- ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/
- WebAIM: https://webaim.org/

### 17.2 أدوات
- axe DevTools: https://www.deque.com/axe/devtools
- WAVE: https://wave.webaim.org/
- Lighthouse: https://developers.google.com/web/tools/lighthouse
- Stark (Figma): https://www.figma.com/community/plugin/732603869274864970/Stark
- Contrast Ratio: https://contrast-ratio.com/

### 17.3 قارئات الشاشة
- NVDA (Windows, مجاني): https://www.nvda-project.org/
- VoiceOver (Mac, مدمج): https://www.apple.com/accessibility/vision/
- TalkBack (Android, مدمج): https://support.google.com/accessibility/android/

### 17.4 مجتمعات
- WebAIM Discourse: https://webaim.org/discussion/
- A11y Slack: https://web-a11y.slack.com/

---

## 18. الخلاصة

الوصولية ليست ميزة إضافية، بل **التزام أخلاقي وقانوني**. CMS ملتزم بـ:

1. **WCAG 2.1 AA** كحد أدنى.
2. **اختبار شامل** لكل مكوّن قبل الاعتماد.
3. **تحسين مستمر** بناءً على ملاحظات المستخدمين.
4. **تدريب الفريق** على أفضل الممارسات.

> **"المنصة الجيدة هي منصة تعمل للجميع."**

---

**نهاية ملف ACCESSIBILITY.md**
