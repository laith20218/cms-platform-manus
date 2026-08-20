# DESIGN_SYSTEM.md — Phase 6: Design System

> **نظام التصميم الكامل**. يحوّل الهوية البصرية (Phase 5) إلى مكوّنات React قابلة للتنفيذ والاستخدام المتكرّر.

**المرحلة**: Phase 6
**الحالة**: ✅ Completed
**تاريخ الإنجاز**: 2026-07-30

---

## جدول المحتويات

1. [مقدمة النظام](#1-مقدمة-النظام)
2. [مبادئ المكوّنات (Component Principles)](#2-مبادئ-المكوّنات)
3. [نظام الأزرار (Buttons)](#3-نظام-الأزرار)
4. [نظام الحقول (Inputs & Forms)](#4-نظام-الحقول)
5. [نظام البطاقات (Cards)](#5-نظام-البطاقات)
6. [نظام الحوارات (Dialogs & Modals)](#6-نظام-الحوارات)
7. [نظام الجداول (Tables)](#7-نظام-الجداول)
8. [نظام التنقل (Navbar & Sidebar)](#8-نظام-التنقل)
9. [نظام النماذج (Forms)](#9-نظام-النماذج)
10. [نظام الطباعة (Typography System)](#10-نظام-الطباعة)
11. [نظام المسافات والشبكة (Spacing & Grid)](#11-نظام-المسافات-والشبكة)
12. [نقاط التوقف (Breakpoints)](#12-نقاط-التوقف)
13. [نظام الحركة (Animation)](#13-نظام-الحركة)
14. [نظام الأيقونات (Icons)](#14-نظام-الأيقونات)
15. [نظام الشارات (Badges)](#15-نظام-الشارات)
16. [نظام الإشعارات (Toasts)](#16-نظام-الإشعارات)
17. [الحالات الفارغة (Empty States)](#17-الحالات-الفارغة)
18. [حالات التحميل (Loading States)](#18-حالات-التحميل)
19. [صفحات الأخطاء (Error Pages)](#19-صفحات-الأخطاء)
20. [نظام الألوان الدلالية (Semantic Colors)](#20-نظام-الألوان-الدلالية)
21. [مواصفات الـ Token System](#21-مواصفات-الـ-token-system)

---

## 1. مقدمة النظام

### 1.1 ما هو الـ Design System؟

الـ Design System ليس مجرد مكتبة مكونات، بل هو **مصدر الحقيقة الموحّد** لكل القرارات التصميمية في المشروع. يتكون من:

1. **Design Tokens** — متغيرات CSS تُعرّف الألوان، الخطوط، المسافات، إلخ.
2. **Components** — مكوّنات React قابلة لإعادة الاستخدام.
3. **Patterns** — أنماط ترکیبية معتمدة (مثل نموذج + تتحقق + رسالة خطأ).
4. **Guidelines** — قواعد استخدام كل مكوّن.
5. **Documentation** — توثيق لكل مكوّن مع أمثلة.

### 1.2 الهدف

- **الاتساق**: نفس المكوّن يبدو ويتصرف بنفس الطريقة في كل مكان.
- **الكفاءة**: لا يعيد المطور كتابة CSS لكل زر.
- **الجودة**: مكوّن تم اختباره + استخدام آمن + وصولية مضمونة.
- **التوثيق**: أي مطور جديد يفهم النظام في ساعة.

### 1.3 التقنيات المعتمدة

| التقنية | الإصدار | الغرض |
|---------|---------|------|
| React | 19.x | مكتبة الواجهة |
| TypeScript | 5.x | لغة الكتابة |
| Tailwind CSS | 4.x | إطار التنسيق |
| Radix UI | latest | primitives للـ dialogs, dropdowns, etc. (يدعم RTL) |
| Lucide React | latest | الأيقونات |
| Framer Motion | latest | الحركة |
| React Hook Form | 7.x | إدارة النماذج |
| Zod | 3.x | التحقق من البيانات |
| class-variance-authority | latest | إدارة variants |
| clsx + tailwind-merge | latest | دمج classes |

### 1.4 بنية المكتبة (Monorepo)

```
packages/ui/
├── src/
│   ├── tokens/              # Design tokens (CSS variables)
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   ├── shadows.ts
│   │   └── index.ts
│   │
│   ├── primitives/          # مكوّنات أساسية بلا منطق
│   │   ├── Box/
│   │   ├── Stack/
│   │   ├── Text/
│   │   └── Icon/
│   │
│   ├── components/          # المكوّنات الجاهزة
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Select/
│   │   ├── Card/
│   │   ├── Dialog/
│   │   ├── Table/
│   │   ├── Badge/
│   │   ├── Toast/
│   │   └── ...
│   │
│   ├── patterns/            # أنماط مركّبة
│   │   ├── FormField/
│   │   ├── DataTable/
│   │   ├── EmptyState/
│   │   ├── LoadingState/
│   │   └── ErrorState/
│   │
│   ├── layouts/             # تخطيطات أساسية
│   │   ├── AppShell/
│   │   ├── Navbar/
│   │   ├── Sidebar/
│   │   └── Footer/
│   │
│   ├── theme/               # إدارة الثيم
│   │   ├── ThemeProvider.tsx
│   │   ├── dark-mode.ts
│   │   └── rtl.ts
│   │
│   ├── utils/               # أدوات مساعدة
│   │   ├── cn.ts            # clsx + tailwind-merge
│   │   ├── variants.ts      # CVA helpers
│   │   └── a11y.ts          # accessibility helpers
│   │
│   └── index.ts             # نقطة التصدير الرئيسية
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 2. مبادئ المكوّنات

### 2.1 المبادئ الثمانية

#### CP1: التكوين (Composition)
- المكوّنات صغيرة ومركّبة (مثل Lego).
- مثال: `Card` يتكوّن من `CardHeader + CardBody + CardFooter`.
- لا مكوّنات ضخمة بـ props كثيرة.

#### CP2: التوقع (Predictability)
- نفس الـ prop يعطي نفس النتيجة في كل مكان.
- أسماء props متّسقة (`size`, `variant`, `disabled`, `loading`).
- لا مفاجآت.

#### CP3: الوصولية الافتراضية (A11y by Default)
- كل مكوّن قابل للوصول منذ البداية.
- لا يحتاج المطور لإضافة `aria-*` يدوياً (إلا للحالات الخاصة).
- دعم لوحة المفاتيح كامل.

#### CP4: التصميم الاستجابي (Responsive by Default)
- كل مكوّن يعمل على Mobile + Tablet + Desktop.
- لا حاجة لإضافة classes responsive يدوياً.
- الـ size يضبط تلقائياً حسب نقطة التوقف.

#### CP5: دعم RTL افتراضياً
- كل مكوّن يدعم RTL.
- لا استخدام `ml-*` أو `mr-*` (استخدم `ms-*` و `me-*`).
- الأيقونات الاتجاهية تتبدّل تلقائياً.

#### CP6: الثيم (Themable)
- كل القيم من Design Tokens.
- لا hardcode للألوان أو الأحجام.
- تبديل Light/Dark فوري.

#### CP7: التحكم بالنوع (TypeScript-First)
- كل props موثّقة بـ TypeScript.
- autocomplete كامل في الـ IDE.
- أخطاء في وقت الترجمة لا وقت التشغيل.

#### CP8: قابلية الاختبار (Testable)
- كل مكوّن له اختبار وحدة.
- اختبار visual عبر Storybook.
- اختبار وصولية عبر axe-core.

### 2.2 API Conventions

#### أسماء الـ props المتّسقة

| Prop | النوع | الاستخدام |
|------|------|-----------|
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | الحجم |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| ...` | النوع البصري |
| `tone` | `'default' \| 'success' \| 'danger' \| 'warning' \| 'info'` | النبرة الدلالية |
| `fullWidth` | `boolean` | يأخذ عرض كامل |
| `disabled` | `boolean` | معطّل |
| `loading` | `boolean` | حالة تحميل |
| `icon` | `ReactNode` | أيقونة |
| `iconPosition` | `'start' \| 'end'` | مكان الأيقونة |
| `as` | `ElementType` | تغيير العنصر الأساسي |
| `id`, `className`, `style` | inherited | معرّفات |
| `aria-*` | inherited | وصولية |
| `data-*` | inherited | بيانات |

#### ترتيب الـ props (للقراءة)
```tsx
<Component
  // 1. الحالة الأساسية
  size="md"
  variant="primary"
  
  // 2. المحتوى
  label="..."
  icon={...}
  
  // 3. السلوك
  onClick={...}
  disabled={false}
  loading={false}
  
  // 4. التخطيط
  fullWidth={false}
  
  // 5. عام
  id="..."
  className="..."
  data-testid="..."
/>
```

### 2.3 قواعد الـ className

- استخدام `cn()` helper (clsx + tailwind-merge).
- لا template literals يدوية.
- استخدام `cva` للـ variants.

```tsx
// ✅ صحيح
import { cn } from '@/utils/cn';
<div className={cn('base-class', condition && 'active', className)} />

// ❌ خطأ
<div className={`base-class ${condition ? 'active' : ''} ${className}`} />
```

---

## 3. نظام الأزرار

### 3.1 الأنواع (Variants)

#### V1: Primary (الأساسي)
- **الاستخدام**: الإجراء الرئيسي في الصفحة (1-2 فقط).
- **المظهر**: خلفية Primary 700، نص أبيض، ظل خفيف.
- **Hover**: Primary 600 + ظل أعمق.
- **Active**: Primary 800.

```tsx
<Button variant="primary">تفعيل الاشتراك</Button>
```

#### V2: Secondary (الثانوي)
- **الاستخدام**: إجراءات ثانوية (إلغاء، إغلاق).
- **المظهر**: خلفية شفافة، حد Primary 700، نص Primary 700.
- **Hover**: خلفية Primary 50.

```tsx
<Button variant="secondary">إلغاء</Button>
```

#### V3: Ghost (الشفاف)
- **الاستخدام**: إجراءات خفيفة (تصفية، ترتيب).
- **المظهر**: خلفية شفافة، نص Primary 700.
- **Hover**: خلفية Primary 50.

```tsx
<Button variant="ghost">تصفية</Button>
```

#### V4: Danger (الخطر)
- **الاستخدام**: إجراءات مدمّرة (حذف، إلغاء اشتراك).
- **المظهر**: خلفية Danger 500، نص أبيض.
- **Hover**: Danger 600.

```tsx
<Button variant="danger">حذف نهائي</Button>
```

#### V5: Success (النجاح)
- **الاستخدام**: تأكيد إجراء ناجح.
- **المظهر**: خلفية Success 500، نص أبيض.
- **Hover**: Success 600.

```tsx
<Button variant="success">تأكيد الحفظ</Button>
```

#### V6: Glass (الزجاجي)
- **الاستخدام**: على الخلفيات الملوّنة (hero sections).
- **المظهر**: خلفية زجاجية (rgba + blur)، حد زجاجي، نص Primary 700.

```tsx
<Button variant="glass">متابعة الدراسة</Button>
```

#### V7: Link (رابط)
- **الاستخدام**: تنقّل بلا إجراء.
- **المظهر**: نص Primary 700 + underline عند hover.

```tsx
<Button variant="link">نسيت كلمة المرور؟</Button>
```

### 3.2 الأحجام (Sizes)

| الحجم | الارتفاع | Padding X | Font Size | Icon Size | Gap |
|------|---------|-----------|-----------|-----------|-----|
| `xs` | 24px | 8px | 12px | 14px | 4px |
| `sm` | 32px | 12px | 13px | 16px | 6px |
| `md` (default) | 40px | 16px | 14px | 20px | 8px |
| `lg` | 48px | 24px | 16px | 20px | 8px |
| `xl` | 56px | 32px | 18px | 24px | 12px |

### 3.3 الحالات (States)

| الحالة | الوصف |
|------|------|
| **Default** | الحالة الطبيعية |
| **Hover** | مرور الفأرة — تغيير خفيف في اللون + ظل |
| **Active** | الضغط — scale(0.98) |
| **Focus** | التركيز — glow ring (0 0 0 4px rgba) |
| **Disabled** | معطّل — opacity 0.5 + cursor not-allowed |
| **Loading** | تحميل — spinner + نص مخفي + معطّل |

### 3.4 الأيقونات

```tsx
// أيقونة في البداية (افتراضي في RTL: اليمين)
<Button icon={<Play />} iconPosition="start">متابعة</Button>

// أيقونة في النهاية (افتراضي في RTL: اليسار)
<Button icon={<ArrowRight />} iconPosition="end">التالي</Button>

// زر أيقونة فقط (icon button)
<Button icon={<Close />} aria-label="إغلاق" />
```

### 3.5 تطبيق CVA (Class Variance Authority)

```typescript
// packages/ui/src/components/Button/variants.ts
import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  // base
  [
    'inline-flex items-center justify-center gap-2',
    'font-sans font-medium rounded-md',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-4',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.98]',
    'whitespace-nowrap select-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary-700 text-white',
          'shadow-md hover:bg-primary-600 hover:shadow-lg',
          'active:bg-primary-800',
          'focus-visible:ring-primary-400/30',
        ],
        secondary: [
          'bg-transparent text-primary-700 border border-primary-700',
          'hover:bg-primary-50',
          'active:bg-primary-100',
          'focus-visible:ring-primary-400/30',
        ],
        ghost: [
          'bg-transparent text-primary-700',
          'hover:bg-primary-50',
          'active:bg-primary-100',
          'focus-visible:ring-primary-400/30',
        ],
        danger: [
          'bg-danger-500 text-white',
          'shadow-md hover:bg-danger-600 hover:shadow-lg',
          'active:bg-danger-700',
          'focus-visible:ring-danger-400/30',
        ],
        success: [
          'bg-success-500 text-white',
          'shadow-md hover:bg-success-600 hover:shadow-lg',
          'active:bg-success-700',
          'focus-visible:ring-success-400/30',
        ],
        glass: [
          'bg-glass border border-glass text-primary-700 backdrop-blur-xl',
          'shadow-glass hover:bg-glass-strong',
          'focus-visible:ring-primary-400/30',
        ],
        link: [
          'bg-transparent text-primary-700 underline-offset-4',
          'hover:underline',
          'focus-visible:ring-primary-400/30',
        ],
      },
      size: {
        xs: 'h-6 px-2 text-xs gap-1',
        sm: 'h-8 px-3 text-sm gap-1.5',
        md: 'h-10 px-4 text-sm gap-2',
        lg: 'h-12 px-6 text-base gap-2',
        xl: 'h-14 px-8 text-lg gap-3',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);
```

### 3.6 تنفيذ المكوّن

```typescript
// packages/ui/src/components/Button/Button.tsx
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { buttonVariants } from './variants';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'glass' | 'link';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      icon,
      iconPosition = 'start',
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <Loader2 className="animate-spin" size={size === 'xs' ? 14 : 16} />
        )}
        {!loading && icon && iconPosition === 'start' && icon}
        {children}
        {!loading && icon && iconPosition === 'end' && icon}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

### 3.7 قواعد الاستخدام

#### ✅ افع
- استخدم `primary` للإجراء الرئيسي فقط (1-2 في الصفحة).
- استخدم `secondary` أو `ghost` للإجراءات الثانوية.
- استخدم `danger` فقط للإجراءات المدمّرة + مع تأكيد.
- ادمج أيقونة + نص دائماً للإجراءات المهمة.
- أضف `aria-label` للأزرار بلا نص.

#### ❌ لا تفعل
- لا تستخدم أكثر من زر `primary` في نفس القسم.
- لا تستخدم `danger` لإجراءات غير مدمّرة.
- لا تضع أيقونة بلا نص بلا `aria-label`.
- لا تستخدم `xs` للجوال (أصغر من 32px = لا يمكن لمسه).
- لا تخلط أحجام مختلفة في نفس الصف.

---

## 4. نظام الحقول

### 4.1 الأنواع المدعومة

| النوع | المكوّن | الاستخدام |
|------|--------|----------|
| **Text** | `<Input type="text" />` | نص عادي |
| **Password** | `<Input type="password" />` | كلمات المرور (مع toggle) |
| **Email** | `<Input type="email" />` | بريد إلكتروني |
| **Phone** | `<Input type="tel" />` | رقم هاتف (مع prefix) |
| **Number** | `<Input type="number" />` | أرقام |
| **Search** | `<Input type="search" />` | بحث |
| **Textarea** | `<Textarea />` | نص متعدد الأسطر |
| **Select** | `<Select />` | اختيار من قائمة |
| **Checkbox** | `<Checkbox />` | اختيار متعدد |
| **Radio** | `<Radio />` | اختيار واحد |
| **Switch** | `<Switch />` | تبديل on/off |
| **Date Picker** | `<DatePicker />` | تاريخ |
| **File Upload** | `<FileUpload />` | رفع ملف |
| **Slider** | `<Slider />` | قيمة من نطاق |
| **Code Input** | `<CodeInput />` | كود تفعيل (6 خانات) |

### 4.2 الأحجام

| الحجم | الارتفاع | Padding | Font Size | Icon Size |
|------|---------|---------|-----------|-----------|
| `sm` | 32px | 6px 12px | 13px | 16px |
| `md` (default) | 40px | 8px 12px | 14px | 20px |
| `lg` | 48px | 10px 16px | 16px | 20px |

### 4.3 الحالات

| الحالة | الوصف | المظهر |
|------|------|--------|
| **Default** | الطبيعي | border-light, bg-surface |
| **Hover** | مرور الفأرة | border-strong |
| **Focus** | التركيز | border-primary-400 + ring |
| **Disabled** | معطّل | opacity 0.5 + bg-muted |
| **Read-only** | قراءة فقط | bg-muted + cursor default |
| **Error** | خطأ تحقق | border-danger-500 + ring danger |
| **Success** | نجاح تحقق | border-success-500 + checkmark |

### 4.4 تركيبة الحقل الكاملة

```tsx
<FormField>
  <FormFieldLabel required>البريد الإلكتروني</FormFieldLabel>
  <FormFieldDescription>سنرسل لك تأكيداً على هذا البريد</FormFieldDescription>
  <Input
    type="email"
    placeholder="example@domain.com"
    leftIcon={<Mail />}
    error={!!errors.email}
  />
  <FormFieldError>{errors.email?.message}</FormFieldError>
</FormField>
```

### 4.5 تنفيذ Input

```typescript
// packages/ui/src/components/Input/Input.tsx
import { forwardRef } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  success?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  hint?: string;
}

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-3 text-sm',
  lg: 'h-12 px-4 text-base',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      error = false,
      success = false,
      leftIcon,
      rightIcon,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-text-muted">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          disabled={disabled}
          aria-invalid={error}
          className={cn(
            'w-full rounded-md border bg-surface text-text transition-all duration-200',
            'placeholder:text-text-faint',
            'focus:outline-none focus:ring-4 focus:ring-primary-400/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            sizes[size],
            leftIcon && 'ps-10',
            rightIcon && 'pe-10',
            error
              ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-400/20'
              : success
              ? 'border-success-500 focus:border-success-500 focus:ring-success-400/20'
              : 'border-border-strong focus:border-primary-400',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 end-0 flex items-center pe-3 text-text-muted">
            {rightIcon}
          </div>
        )}
        {error && !rightIcon && (
          <AlertCircle className="absolute end-3 top-1/2 -translate-y-1/2 text-danger-500" size={20} />
        )}
        {success && !rightIcon && (
          <CheckCircle2 className="absolute end-3 top-1/2 -translate-y-1/2 text-success-500" size={20} />
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
```

### 4.6 مكون FormField

```typescript
// packages/ui/src/patterns/FormField/FormField.tsx
import { cn } from '@/utils/cn';

interface FormFieldProps {
  label?: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  required,
  description,
  error,
  children,
  className,
}: FormFieldProps) {
  const fieldId = useId();
  
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-text-soft">
          {label}
          {required && <span className="text-danger-500 ms-1">*</span>}
        </label>
      )}
      {description && (
        <p className="text-xs text-text-muted">{description}</p>
      )}
      <div id={fieldId}>
        {React.cloneElement(children, { id: fieldId, 'aria-describedby': error ? `${fieldId}-error` : undefined })}
      </div>
      {error && (
        <p id={`${fieldId}-error`} className="text-xs text-danger-500 flex items-center gap-1">
          <AlertCircle size={14} />
          {error}
        </p>
      )}
    </div>
  );
}
```

### 4.7 Select (قائمة منسدلة)

```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="اختر الجامعة" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="homs">جامعة حمص</SelectItem>
    <SelectItem value="aleppo">جامعة حلب</SelectItem>
    <SelectItem value="damascus">جامعة دمشق</SelectItem>
  </SelectContent>
</Select>
```

### 4.8 Checkbox & Radio

```tsx
// Checkbox
<Checkbox checked={true} label="تذكّرني" />

// Radio Group
<RadioGroup defaultValue="male">
  <Radio value="male" label="ذكر" />
  <Radio value="female" label="أنثى" />
</RadioGroup>

// Switch
<Switch checked={true} onCheckedChange={setNotifications} label="تفعيل الإشعارات" />
```

### 4.9 Code Input (لكود التفعيل)

```tsx
<CodeInput
  length={6}
  value={code}
  onChange={setCode}
  onComplete={(code) => activate(code)}
/>
```

**المظهر**: 6 خانات منفصلة، كل خانة مربّعة، تتحرك تلقائياً بينها عند الكتابة، تدعم paste.

### 4.10 File Upload

```tsx
<FileUpload
  accept="image/*,application/pdf"
  maxSize={100 * 1024 * 1024} // 100MB
  multiple
  onFilesChange={handleFiles}
/>
```

**المظهر**: منطقة منقّطة + drag & drop + قائمة بالملفات المرفوعة + شريط تقدّم.

---

## 5. نظام البطاقات

### 5.1 الأنواع

#### C1: ContentCard (بطاقة محتوى)
- **الاستخدام**: عرض مادة، محاضرة، اختبار.
- **المحتوى**: title, description, meta (count, progress), action.
- **الحالة**: default, hover, active, locked.

```tsx
<Card variant="content" interactive>
  <CardHeader>
    <Badge variant="primary">محاضرة 1</Badge>
    <CardTitle>مقدمة في الرثوية</CardTitle>
    <CardDescription>أساسيات المفاصل والأنسجة الضامة</CardDescription>
  </CardHeader>
  <CardContent>
    <Progress value={65} />
    <CardMeta>
      <span>32 سؤال</span>
      <span>65% مكتمل</span>
    </CardMeta>
  </CardContent>
  <CardFooter>
    <Button variant="primary" size="sm" icon={<Play />} fullWidth>
      متابعة
    </Button>
  </CardFooter>
</Card>
```

#### C2: StatCard (بطاقة إحصائية)
- **الاستخدام**: عرض رقم/إحصائية.
- **المحتوى**: icon, label, value, trend.

```tsx
<Card variant="stat" tone="primary">
  <StatIcon><BookOpen /></StatIcon>
  <StatLabel>إجمالي الأسئلة</StatLabel>
  <StatValue>1,247</StatValue>
  <StatTrend value={+12} />
</Card>
```

#### C3: GlassCard (بطاقة زجاجية)
- **الاستخدام**: في الـ hero sections، الإحصائيات الكبيرة.
- **المظهر**: backdrop-blur + شفافية.

```tsx
<Card variant="glass">
  <h2>أهلاً بك، أحمد!</h2>
  <p>تقدّمت 5% هذا الأسبوع. واصل العمل!</p>
</Card>
```

#### C4: ProfileCard (بطاقة ملف)
- **الاستخدام**: عرض معلومات مستخدم.
- **المحتوى**: avatar, name, role, stats, actions.

```tsx
<Card variant="profile">
  <ProfileAvatar size="lg" src="..." />
  <ProfileName>أحمد العبد الله</ProfileName>
  <ProfileRole>السنة الثالثة - طب</ProfileRole>
  <ProfileStats>
    <Stat label="أسئلة مجابة" value="342" />
    <Stat label="نسبة الصواب" value="78%" />
    <Stat label="ترتيبك" value="#12" />
  </ProfileStats>
  <Button variant="primary" fullWidth>عرض الملف الكامل</Button>
</Card>
```

### 5.2 البنية التركيبية

```tsx
<Card>
  <CardHeader>
    <CardTitle>...</CardTitle>
    <CardDescription>...</CardDescription>
    <CardAction>...</CardAction> {/* يظهر في النهاية */}
  </CardHeader>
  <CardImage>...</CardImage> {/* اختياري */}
  <CardContent>...</CardContent>
  <CardFooter>
    <CardFooterAction>...</CardFooterAction>
  </CardFooter>
</Card>
```

### 5.3 تنفيذ Card

```typescript
// packages/ui/src/components/Card/Card.tsx
import { cva } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const cardVariants = cva(
  'rounded-lg overflow-hidden transition-all duration-300',
  {
    variants: {
      variant: {
        content: 'bg-surface border border-border shadow-sm',
        stat: 'bg-surface border border-border p-5',
        glass: 'bg-glass border border-glass backdrop-blur-xl shadow-glass',
        profile: 'bg-surface border border-border shadow-md p-6 text-center',
      },
      interactive: {
        true: 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5',
        false: '',
      },
      tone: {
        default: '',
        primary: 'border-l-4 border-l-primary-700',
        success: 'border-l-4 border-l-success-500',
        danger: 'border-l-4 border-l-danger-500',
        warning: 'border-l-4 border-l-warning-500',
      },
    },
    defaultVariants: {
      variant: 'content',
      interactive: false,
      tone: 'default',
    },
  }
);

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'content' | 'stat' | 'glass' | 'profile';
  interactive?: boolean;
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warning';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant, interactive, tone, className, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, interactive, tone }), className)} {...props} />
  )
);
```

---

## 6. نظام الحوارات

### 6.1 الأنواع

#### D1: Modal (نافذة منبثقة)
- **الاستخدام**: إجراء مهم يتطلب انتباهاً (تأكيد حذف، إنشاء، تعديل).
- **الحجم**: `sm` (400px), `md` (500px), `lg` (700px), `xl` (900px), `full` (95vw).
- **السلوك**: 
  - تظهر بـ fade + scale.
  - خلفية معتمة (rgba(15,23,42,.50)).
  - تُغلق بـ ESC أو النقر خارجها.
  - trap focus داخلها.

```tsx
<Dialog open={isOpen} onOpenChange={setOpen} size="md">
  <DialogTrigger asChild>
    <Button>فتح</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>تأكيد الحذف</DialogTitle>
      <DialogDescription>
        هل أنت متأكد من حذف هذا السؤال؟ لا يمكن التراجع.
      </DialogDescription>
    </DialogHeader>
    <DialogBody>
      {/* محتوى */}
    </DialogBody>
    <DialogFooter>
      <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
      <Button variant="danger" onClick={handleDelete}>حذف نهائي</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### D2: Drawer (لوحة جانبية)
- **الاستخدام**: عرض تفاصيل أو نموذج طويل دون مغادرة الصفحة.
- **الاتجاه**: `start` (يمين في RTL), `end` (يسار في RTL), `top`, `bottom`.
- **العرض**: `sm` (320px), `md` (420px), `lg` (560px).

```tsx
<Drawer open={isOpen} onOpenChange={setOpen} side="end" size="md">
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>تفاصيل السؤال</DrawerTitle>
    </DrawerHeader>
    <DrawerBody>
      {/* محتوى طويل */}
    </DrawerBody>
  </DrawerContent>
</Drawer>
```

#### D3: Confirm Dialog (تأكيد سريع)
- **الاستخدام**: تأكيد إجراء بسيط.
- **المظهر**: modal صغير، عنوان + وصف + زرين.

```tsx
<ConfirmDialog
  open={isOpen}
  onClose={setOpen}
  title="تسجيل الخروج"
  description="هل تريد تسجيل الخروج؟"
  confirmText="خروج"
  cancelText="إلغاء"
  variant="danger"
  onConfirm={handleLogout}
/>
```

#### D4: AlertDialog (تنبيه حرج)
- **الاستخدام**: تنبيه لا يمكن تجاهله (مخالفة أمنية).
- **المظهر**: modal صغير، لا يُغلق بالنقر خارجها.

#### D5: Toast (إشعار عابر)
- انظر قسم 16.

### 6.2 التنفيذ (مع Radix UI)

```typescript
// packages/ui/src/components/Dialog/Dialog.tsx
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
};

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: keyof typeof sizes;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, size = 'md', children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-overlay bg-overlay backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <RadixDialog.Content
          className={cn(
            'fixed start-1/2 top-1/2 z-modal -translate-x-1/2 -translate-y-1/2',
            'w-full rounded-2xl bg-surface p-6 shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            sizes[size]
          )}
        >
          {children}
          <RadixDialog.Close className="absolute end-4 top-4 rounded-md p-1 text-text-muted hover:bg-muted hover:text-text transition-colors">
            <X size={20} />
            <span className="sr-only">إغلاق</span>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
```

### 6.3 قواعد الحوارات

#### ✅ افع
- استخدم `Dialog` للإجراءات المهمة.
- استخدم `Drawer` للنماذج الطويلة أو التفاصيل.
- استخدم `ConfirmDialog` للتأكيدات السريعة.
- أضف `DialogTitle` دائماً (للوصولية).
- ركّز على الزر الأساسي عند الفتح.

#### ❌ لا تفعل
- لا تستخدم `Dialog` لمحتوى طويل (استخدم صفحة منفصلة).
- لا تضع أكثر من زر `primary` في الـ footer.
- لا تنسَ `onOpenChange` (للإغلاق بـ ESC).
- لا تفتح dialog داخل dialog (إلا للـ ConfirmDialog).

---

## 7. نظام الجداول

### 7.1 DataTable المتقدّم

```tsx
<DataTable
  data={users}
  columns={[
    { id: 'name', header: 'الاسم', cell: (row) => <UserCell user={row} /> },
    { id: 'email', header: 'البريد', sortable: true },
    { id: 'role', header: 'الدور', cell: (row) => <Badge>{row.role}</Badge> },
    { id: 'createdAt', header: 'تاريخ التسجيل', sortable: true, type: 'date' },
    { id: 'actions', header: 'إجراءات', cell: (row) => <ActionMenu /> },
  ]}
  searchable
  searchPlaceholder="ابحث بالاسم أو البريد..."
  pagination={{ pageSize: 10 }}
  selectable
  onSelectionChange={handleSelect}
  emptyState={<EmptyState title="لا يوجد مستخدمون" />}
  loading={isLoading}
/>
```

### 7.2 الميزات

| الميزة | الوصف |
|--------|------|
| **Sorting** | ترتيب حسب عمود (نقر على الـ header) |
| **Filtering** | فلترة عبر search box + filters جانبية |
| **Pagination** | ترقيم الصفحات (10/25/50/100 لكل صفحة) |
| **Selection** | اختيار صفوف متعددة (checkbox) |
| **Inline Edit** | تعديل خلية مباشرة (اختياري) |
| **Row Actions** | قائمة إجراءات لكل صف |
| **Empty State** | حالة فارغة مخصّصة |
| **Loading State** | skeleton أثناء التحميل |
| **Error State** | رسالة خطأ + retry |
| **Responsive** | يتحول لبطاقات على الموبايل |
| **Export** | تصدير CSV/Excel (للمدير) |
| **Density** | compact / comfortable / cozy |

### 7.3 التنفيذ (مع TanStack Table)

```typescript
// packages/ui/src/components/DataTable/DataTable.tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';

export function DataTable<T>({ data, columns, ...props }: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <DataTableToolbar table={table} {...props} />
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th key={header.id} className="px-4 py-3 text-start text-sm font-medium text-text-soft">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-3 text-sm text-text">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      <DataTablePagination table={table} />
    </div>
  );
}
```

### 7.4 التجاوب

على الموبايل (< 768px)، الجدول يتحوّل لبطاقات:

```
بدلاً من:
| الاسم | البريد | الدور |
| أحمد | a@b.c | طالب |

يصبح:
┌────────────────────┐
│ أحمد                │
│ a@b.c               │
│ [Badge: طالب]       │
└────────────────────┘
```

---

## 8. نظام التنقل

### 8.1 AppShell (الهيكل العام)

```tsx
<AppShell
  navbar={<Navbar />}
  sidebar={<Sidebar />}
  footer={<Footer />}
>
  {children}
</AppShell>
```

**المظهر**:
- Navbar علوي ثابت (height: 64px).
- Sidebar جانبي (width: 280px desktop, drawer على mobile).
- المحتوى في الوسط.
- Footer سفلي (اختياري).

### 8.2 Navbar

```tsx
<Navbar>
  <NavbarLeft>
    <NavbarMenuToggle /> {/* mobile only */}
    <NavbarLogo />
  </NavbarLeft>
  
  <NavbarCenter>
    <NavbarSearch />
  </NavbarCenter>
  
  <NavbarRight>
    <NavbarThemeToggle />
    <NavbarNotifications />
    <NavbarProfile />
  </NavbarRight>
</Navbar>
```

**المظهر**:
- خلفية زجاجية (`bg-glass backdrop-blur-xl`).
- ارتفاع 64px.
- ظل خفيف سفلي.
- ثابت في الأعلى (sticky).

**العناصر**:
- **Logo**: شعار + اسم المنصة.
- **Search**: بحث سريع (Ctrl+K).
- **Theme Toggle**: أيقونة قمر/شمس.
- **Notifications**: جرس + badge عدد.
- **Profile**: avatar + dropdown.

### 8.3 Sidebar

```tsx
<Sidebar>
  <SidebarSection label="التنقّل">
    <SidebarItem icon={<Home />} active>لوحة التحكم</SidebarItem>
    <SidebarItem icon={<LayoutGrid />} badge="13">التصنيفات</SidebarItem>
    <SidebarItem icon={<Star />} badge="5">المفضلة</SidebarItem>
    <SidebarItem icon={<Search />}>البحث</SidebarItem>
    <SidebarItem icon={<Trophy />}>الإنجازات</SidebarItem>
  </SidebarSection>
  
  <SidebarSection label="التصنيفات">
    <SidebarItem icon={<Book />}>محاضرة 1</SidebarItem>
    <SidebarItem icon={<Book />}>محاضرة 2</SidebarItem>
  </SidebarSection>
  
  <SidebarFooter>
    <SidebarMiniStats />
  </SidebarFooter>
</Sidebar>
```

**المظهر**:
- خلفية `bg-surface` (فاتح) أو `bg-neutral-900` (داكن).
- عرض 280px (desktop), drawer (mobile).
- ظل خفيف على الحافة.
- قابل للطي (collapsed) لـ 72px.

**العناصر**:
- **Section**: مجموعة عناصر مع label.
- **Item**: عنصر تنقّل (icon + text + optional badge).
- **Active**: خلفية `bg-primary-50` + border-right primary.
- **Mini Stats**: إحصائيات صغيرة في الأسفل.

### 8.4 Breadcrumbs

```tsx
<Breadcrumbs>
  <BreadcrumbItem>الرئيسية</BreadcrumbItem>
  <BreadcrumbItem>كلية الطب</BreadcrumbItem>
  <BreadcrumbItem>السنة الثالثة</BreadcrumbItem>
  <BreadcrumbItem current>الباطنة</BreadcrumbItem>
</Breadcrumbs>
```

**المظهر**: نصوص صغيرة + أيقونة فاصل (ChevronLeft في RTL).

### 8.5 Tabs

```tsx
<Tabs defaultValue="questions">
  <TabsList>
    <TabsTrigger value="questions">الأسئلة</TabsTrigger>
    <TabsTrigger value="library">المكتبة</TabsTrigger>
    <TabsTrigger value="exams">الاختبارات</TabsTrigger>
  </TabsList>
  <TabsContent value="questions">...</TabsContent>
  <TabsContent value="library">...</TabsContent>
  <TabsContent value="exams">...</TabsContent>
</Tabs>
```

### 8.6 Command Palette (Ctrl+K)

```tsx
<CommandPalette
  commands={[
    { id: 'go-home', title: 'الذهاب للرئيسية', icon: <Home />, action: () => navigate('/') },
    { id: 'search', title: 'البحث في الأسئلة', icon: <Search />, action: () => navigate('/search') },
    { id: 'theme', title: 'تبديل الوضع الليلي', icon: <Moon />, action: toggleTheme },
  ]}
/>
```

**المظهر**: Modal في الوسط، input في الأعلى، قائمة نتائج، اختصارات لوحة المفاتيح.

---

## 9. نظام النماذج

### 9.1 الأنواع

#### F1: Simple Form
- نموذج بسيط عمودي.

```tsx
<Form>
  <FormField label="الاسم" required>
    <Input placeholder="الاسم الكامل" />
  </FormField>
  <FormField label="البريد" required>
    <Input type="email" />
  </FormField>
  <Button type="submit" fullWidth>إرسال</Button>
</Form>
```

#### F2: Two-Column Form
- نموذج بعمودين (للـ desktop).

#### F3: Multi-Step Form (Wizard)
- نموذج متعدّد الخطوات.

```tsx
<FormWizard
  steps={[
    { title: 'البيانات', component: <Step1 /> },
    { title: 'الاشتراك', component: <Step2 /> },
    { title: 'التأكيد', component: <Step3 /> },
  ]}
  onComplete={handleSubmit}
/>
```

#### F4: Inline Form
- نموذج أفقي (مثل البحث + فلتر).

### 9.2 التحقق (Validation)

```tsx
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  name: z.string().min(3, 'الاسم قصير جداً'),
  email: z.string().email('بريد غير صحيح'),
  phone: z.string().regex(/^09\d{8}$/, 'رقم غير صحيح'),
});

type FormData = z.infer<typeof schema>;

function MyForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  
  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <FormField label="الاسم" required error={errors.name?.message}>
        <Input {...register('name')} error={!!errors.name} />
      </FormField>
      {/* ... */}
      <Button type="submit" loading={isSubmitting}>إرسال</Button>
    </Form>
  );
}
```

### 9.3 قواعد النماذج

- ✅ التحقق في الـ client (Zod) + الـ server.
- ✅ عرض الأخطاء تحت كل حقل.
- ✅ تعطيل زر الإرسال أثناء التحميل.
- ✅ إظهار `loading` state.
- ✅ رسائل خطأ بالعربية واضحة.
- ✅ حفظ المسودة تلقائياً (للنماذج الطويلة).
- ❌ لا تمنع الإرسال بعد المحاولة الأولى (دع المستخدم يصحّح).
- ❌ لا تضع أكثر من 7 حقول في نفس الصفحة (قسّمها).

---

## 10. نظام الطباعة

### 10.1 المكوّنات

```tsx
// عناوين
<Display>Hero text</Display>           {/* 64px */}
<H1>عنوان الصفحة</H1>                  {/* 48px */}
<H2>عنوان قسم</H2>                     {/* 36px */}
<H3>عنوان فرعي</H3>                    {/* 28px */}
<H4>عنوان بطاقة</H4>                   {/* 22px */}
<H5>عنوان صغير</H5>                    {/* 18px */}
<H6>label</H6>                         {/* 16px */}

// نصوص
<Text size="lg">نص كبير</Text>          {/* 18px */}
<Text>نص أساسي</Text>                  {/* 16px */}
<Text size="sm">نص صغير</Text>          {/* 14px */}
<Caption>caption</Caption>             {/* 12px */}
<Overline>OVERLINE</Overline>          {/* 11px uppercase */}

// تنسيق
<Text weight="bold">عريض</Text>
<Text weight="medium">متوسط</Text>
<Text align="center">مركز</Text>
<Text truncate>نص طويل سيُقص...</Text>
<Text clamp={2}>نص طويل مع max 2 lines</Text>

// ألوان
<Text color="primary">نص أزرق</Text>
<Text color="muted">نص خافت</Text>
<Text color="danger">نص أحمر</Text>
```

### 10.2 تنفيذ Text

```typescript
// packages/ui/src/primitives/Text/Text.tsx
import { cva } from 'class-variance-authority';

const textVariants = cva('', {
  variants: {
    variant: {
      display: 'text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight',
      h1: 'text-3xl md:text-4xl lg:text-5xl font-bold leading-tight',
      h2: 'text-2xl md:text-3xl lg:text-4xl font-bold leading-snug',
      h3: 'text-xl md:text-2xl lg:text-3xl font-semibold leading-snug',
      h4: 'text-lg md:text-xl lg:text-2xl font-semibold',
      h5: 'text-base md:text-lg font-semibold',
      h6: 'text-sm md:text-base font-semibold',
      body: 'text-sm md:text-base leading-relaxed',
      bodyLg: 'text-base md:text-lg leading-relaxed',
      bodySm: 'text-xs md:text-sm leading-relaxed',
      caption: 'text-xs leading-normal',
      overline: 'text-xs font-semibold uppercase tracking-wider',
      code: 'font-mono text-sm',
    },
    color: {
      default: 'text-text',
      soft: 'text-text-soft',
      muted: 'text-text-muted',
      faint: 'text-text-faint',
      brand: 'text-primary-700',
      success: 'text-success-700',
      danger: 'text-danger-700',
      warning: 'text-warning-700',
      onPrimary: 'text-white',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
      extrabold: 'font-extrabold',
    },
    align: {
      start: 'text-start',
      center: 'text-center',
      end: 'text-end',
      justify: 'text-justify',
    },
  },
  defaultVariants: {
    variant: 'body',
    color: 'default',
    weight: 'normal',
    align: 'start',
  },
});
```

---

## 11. نظام المسافات والشبكة

### 11.1 Grid System

```tsx
<Grid cols={3} gap="md">
  <GridCol>عنصر 1</GridCol>
  <GridCol>عنصر 2</GridCol>
  <GridCol>عنصر 3</GridCol>
</Grid>

// متجاوب
<Grid cols={{ base: 1, md: 2, lg: 3 }} gap={{ base: 'sm', md: 'md' }}>
  ...
</Grid>
```

### 11.2 Stack (عمودي/أفقي)

```tsx
<Stack direction="column" gap="md">
  <div>عنصر 1</div>
  <div>عنصر 2</div>
</Stack>

<Stack direction="row" gap="sm" align="center">
  <Icon />
  <Text>عنوان</Text>
</Stack>
```

### 11.3 Container

```tsx
<Container size="lg">
  {/* محتوى بعرض 1024px */}
</Container>

<Container size="full" padding="md">
  {/* محتوى بعرض كامل */}
</Container>
```

### 11.4 المسافات

استخدام الـ tokens: `gap="xs" | "sm" | "md" | "lg" | "xl" | "2xl"` (المعادلة: 4px | 8px | 12px | 16px | 24px | 32px).

---

## 12. نقاط التوقف

### 12.1 النقاط المعتمدة

| الاسم | الحد الأدنى | الاستخدام |
|------|------------|----------|
| `xs` | 360px | هواتف صغيرة |
| `sm` | 640px | هواتف كبيرة |
| `md` | 768px | تابلت عمودي |
| `lg` | 1024px | تابلت أفقي / لابتوب صغير |
| `xl` | 1280px | لابتوب |
| `2xl` | 1440px | desktop |
| `3xl` | 1920px | شاشات كبيرة |

### 12.2 Mobile-First

```css
/* الافتراضي: Mobile */
.card { padding: 12px; }

/* ≥ 768px */
@media (min-width: 768px) {
  .card { padding: 16px; }
}

/* ≥ 1024px */
@media (min-width: 1024px) {
  .card { padding: 24px; }
}
```

### 12.3 Tailwind Syntax

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
  ...
</div>
```

---

## 13. نظام الحركة

### 13.1 الانتقالات (Transitions)

```css
.transition-fast { transition: all 150ms cubic-bezier(.4, 0, .2, 1); }
.transition-normal { transition: all 250ms cubic-bezier(.4, 0, .2, 1); }
.transition-slow { transition: all 400ms cubic-bezier(.4, 0, .2, 1); }
```

### 13.2 الـ Animations (Framer Motion)

```typescript
// packages/ui/src/utils/animations.ts
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.25, ease: 'easeOut' },
};

export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3, ease: 'easeOut' },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

// صفحة كاملة
export const pageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3, ease: 'easeOut' },
};
```

### 13.3 الاستخدام

```tsx
import { motion } from 'framer-motion';
import { fadeIn, staggerContainer, staggerItem } from '@/utils/animations';

function Page() {
  return (
    <motion.div {...fadeIn}>
      <motion.ul {...staggerContainer}>
        {items.map(item => (
          <motion.li key={item.id} {...staggerItem}>
            {item.name}
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}
```

### 13.4 احترام prefers-reduced-motion

```typescript
// packages/ui/src/utils/animations.ts
export const respectsReducedMotion = () => 
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const motionConfig = {
  // إذا فضّل المستخدم تقليل الحركة، استخدم duration: 0
  transition: respectsReducedMotion() ? { duration: 0 } : undefined,
};
```

---

## 14. نظام الأيقونات

### 14.1 المكتبة المعتمدة

**Lucide React** لكل الأيقونات العامة + أيقونات طبية مخصّصة لـ CMS.

### 14.2 Icon Component

```typescript
// packages/ui/src/primitives/Icon/Icon.tsx
import { LucideProps } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface IconProps extends LucideProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'muted';
}

const sizeMap = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

const toneMap = {
  default: 'text-text',
  primary: 'text-primary-700',
  success: 'text-success-500',
  danger: 'text-danger-500',
  warning: 'text-warning-500',
  info: 'text-info-500',
  muted: 'text-text-muted',
};

export function Icon({ size = 'md', tone = 'default', className, ...props }: IconProps) {
  // Lucide components take size as number
  return <LucideIcon size={sizeMap[size]} className={cn(toneMap[tone], className)} {...props} />;
}
```

### 14.3 الأيقونات الطبية المخصّصة

```typescript
// packages/ui/src/icons/medical.tsx
import { SVGProps } from 'react';

export const MedicalShield = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z" />
    <path d="M12 8v6M9 11h6" />
  </svg>
);

export const ECGPulse = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 12h4l2-6 4 12 2-6h8" />
  </svg>
);
```

---

## 15. نظام الشارات

### 15.1 الأنواع

```tsx
<Badge>افتراضي</Badge>
<Badge variant="primary">مادة جديدة</Badge>
<Badge variant="success">مكتمل</Badge>
<Badge variant="danger">منتهي</Badge>
<Badge variant="warning">قيد الانتظار</Badge>
<Badge variant="info">جديد</Badge>
<Badge variant="glass">Featured</Badge>
```

### 15.2 الأحجام

| الحجم | الارتفاع | Font Size |
|------|---------|-----------|
| `sm` | 20px | 11px |
| `md` (default) | 24px | 12px |
| `lg` | 28px | 13px |

### 15.3 الأشكال

```tsx
<Badge shape="pill">حبّة</Badge>      {/* rounded-full */}
<Badge shape="rounded">مدوّر</Badge>  {/* rounded-md */}
<Badge shape="square">مربّع</Badge>   {/* rounded-none */}
```

### 15.4 مع نقطة

```tsx
<Badge dot variant="success">متصل</Badge>
<Badge dot variant="danger">غير متصل</Badge>
```

### 15.5 مع أيقونة

```tsx
<Badge icon={<Check />} variant="success">تمّ</Badge>
```

### 15.6 تنفيذ

```typescript
const badgeVariants = cva(
  'inline-flex items-center gap-1 font-medium rounded-md whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-neutral-100 text-neutral-700',
        primary: 'bg-primary-50 text-primary-700',
        success: 'bg-success-50 text-success-700',
        danger: 'bg-danger-50 text-danger-700',
        warning: 'bg-warning-50 text-warning-700',
        info: 'bg-info-50 text-info-700',
        glass: 'bg-glass text-primary-700 backdrop-blur-md',
      },
      size: {
        sm: 'h-5 px-2 text-xs',
        md: 'h-6 px-2.5 text-xs',
        lg: 'h-7 px-3 text-sm',
      },
      shape: {
        pill: 'rounded-full',
        rounded: 'rounded-md',
        square: 'rounded-none',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      shape: 'rounded',
    },
  }
);
```

---

## 16. نظام الإشعارات

### 16.1 Toast (إشعار عابر)

```tsx
import { useToast } from '@/components/Toast';

function MyComponent() {
  const toast = useToast();
  
  return (
    <Button onClick={() => toast.success('تم الحفظ بنجاح!')}>
      حفظ
    </Button>
  );
}
```

### 16.2 الأنواع

| النوع | اللون | الأيقونة | الاستخدام |
|------|------|---------|----------|
| `success` | أخضر | CheckCircle2 | نجاح |
| `error` | أحمر | XCircle | خطأ |
| `warning` | كهرماني | AlertTriangle | تحذير |
| `info` | أزرق | Info | معلومة |
| `loading` | أزرق | Loader2 (spinner) | تحميل |

### 16.3 المواضع

- **top-start** (افتراضي في RTL): أعلى-يمين.
- `top-center`: أعلى-وسط.
- `top-end`: أعلى-يسار.
- `bottom-start`: أسفل-يمين.
- `bottom-center`: أسفل-وسط.

### 16.4 المدة

| النوع | المدة |
|------|------|
| success | 3 ثوانٍ |
| error | 5 ثوانٍ (أطول لإعطاء وقت القراءة) |
| warning | 4 ثوانٍ |
| info | 3 ثوانٍ |
| loading | حتى إغلاق يدوي |

### 16.5 مع إجراء

```tsx
toast.success('تم الحذف', {
  action: {
    label: 'تراجع',
    onClick: undoDelete,
  },
  duration: 5000,
});
```

### 16.6 التنفيذ (مع Sonner)

```typescript
// packages/ui/src/components/Toast/Toast.tsx
import { Toaster, toast } from 'sonner';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-start"  // أعلى-يمين في RTL
        dir="rtl"
        toastOptions={{
          style: {
            background: 'var(--c-surface)',
            color: 'var(--c-text)',
            border: '1px solid var(--c-border)',
            borderRadius: '12px',
            fontFamily: 'var(--font-arabic)',
          },
        }}
      />
    </>
  );
}

export { toast };
```

---

## 17. الحالات الفارغة

### 17.1 EmptyState

```tsx
<EmptyState
  icon={<BookX />}
  title="لا توجد أسئلة بعد"
  description="ابدأ بإضافة أول سؤال للمادة"
  action={
    <Button variant="primary" icon={<Plus />}>
      إضافة سؤال
    </Button>
  }
/>
```

### 17.2 الأنواع

#### E1: No Data
- **الاستخدام**: لا توجد بيانات بعد.
- **العناصر**: icon + title + description + action.

#### E2: No Results
- **الاستخدام**: البحث لم يرجع نتائج.
- **العناصر**: icon + title + description + action (مسح الفلاتر).

#### E3: Error
- **الاستخدام**: خطأ في التحميل.
- **العناصر**: icon + title + description + action (إعادة المحاولة).

#### E4: Locked
- **الاستخدام**: محتوى مقفل (اشتراك منتهٍ).
- **العناصر**: icon (قفل) + title + description + action (تجديد).

#### E5: Coming Soon
- **الاستخدام**: ميزة قادمة.
- **العناصر**: icon + title + description.

### 17.3 التنفيذ

```typescript
// packages/ui/src/patterns/EmptyState/EmptyState.tsx
import { cn } from '@/utils/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'error' | 'warning' | 'info';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  tone = 'default',
}: EmptyStateProps) {
  const sizes = {
    sm: { icon: 32, title: 'text-base', desc: 'text-sm' },
    md: { icon: 48, title: 'text-lg', desc: 'text-sm' },
    lg: { icon: 64, title: 'text-xl', desc: 'text-base' },
  };
  
  const tones = {
    default: 'text-text-muted',
    error: 'text-danger-500',
    warning: 'text-warning-500',
    info: 'text-info-500',
  };
  
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      {icon && (
        <div className={cn('mb-4', tones[tone])} style={{ fontSize: sizes[size].icon }}>
          {icon}
        </div>
      )}
      <h3 className={cn(sizes[size].title, 'font-semibold text-text mb-2')}>
        {title}
      </h3>
      {description && (
        <p className={cn(sizes[size].desc, 'text-text-muted max-w-md')}>
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
```

---

## 18. حالات التحميل

### 18.1 Skeleton (الهيكل العظمي)

```tsx
<SkeletonCard />
<SkeletonTable rows={5} />
<SkeletonText lines={3} />
```

### 18.2 أنواع الـ Skeleton

```tsx
// عنصر واحد
<Skeleton className="h-4 w-32" />

// نص متعدد الأسطر
<SkeletonText lines={3} />

// بطاقة
<SkeletonCard />

// صف جدول
<SkeletonRow columns={4} />

// جدول كامل
<SkeletonTable rows={10} columns={4} />

// صفحة كاملة
<SkeletonPage />
```

### 18.3 Spinner

```tsx
<Spinner size="sm" />
<Spinner size="md" />
<Spinner size="lg" />

// مع نص
<LoadingState message="جاري التحميل..." />

// ملء الشاشة
<FullScreenLoader message="جاري المعالجة..." />
```

### 18.4 Progress Bar

```tsx
<Progress value={65} max={100} />

// مع لون
<Progress value={65} variant="success" />

// مع حجم
<Progress value={65} size="sm" />

// مع تسمية
<Progress value={65} label="تقدّمك" />
```

### 18.5 تنفيذ Skeleton

```typescript
// packages/ui/src/components/Skeleton/Skeleton.tsx
import { cn } from '@/utils/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800', className)}
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
```

### 18.6 قواعد التحميل

- ✅ استخدم `Skeleton` للقوائم والبطاقات (يعطي إحساساً بالبنية).
- ✅ استخدم `Spinner` للأزرار والإجراءات القصيرة.
- ✅ استخدم `FullScreenLoader` للعمليات الطويلة (إنشاء، رفع).
- ✅ اعرض شيئاً خلال التحميل (لا صفحة فارغة).
- ❌ لا تستخدم نص "جاري التحميل..." وحده (سيئ UX).

---

## 19. صفحات الأخطاء

### 19.1 Error 404 (غير موجود)

```tsx
<ErrorPage
  code="404"
  title="الصفحة غير موجودة"
  description="عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها."
  illustration={<NotFoundIllustration />}
  action={
    <Button variant="primary" icon={<Home />}>
      العودة للرئيسية
    </Button>
  }
/>
```

### 19.2 Error 500 (خطأ الخادم)

```tsx
<ErrorPage
  code="500"
  title="حدث خطأ ما"
  description="حدث خطأ غير متوقع. نعمل على حله. حاول مرة أخرى لاحقاً."
  illustration={<ServerErrorIllustration />}
  action={
    <>
      <Button variant="primary" onClick={reload}>إعادة المحاولة</Button>
      <Button variant="ghost">تواصل معنا</Button>
    </>
  }
/>
```

### 19.3 Error 403 (ممنوع)

```tsx
<ErrorPage
  code="403"
  title="ليس لديك صلاحية"
  description="هذه الصفحة متاحة فقط للمشتركين. فعّل اشتراكك للمتابعة."
  illustration={<LockIllustration />}
  action={
    <Button variant="primary">تفعيل الاشتراك</Button>
  }
/>
```

### 19.4 Error 503 (صيانة)

```tsx
<ErrorPage
  code="503"
  title="نحن في صيانة"
  description="المنصة تحت الصيانة حالياً. سنعود قريباً!"
  illustration={<MaintenanceIllustration />}
/>
```

### 19.5 تنفيذ ErrorPage

```typescript
// packages/ui/src/patterns/ErrorPage/ErrorPage.tsx
export function ErrorPage({
  code,
  title,
  description,
  illustration,
  action,
}: ErrorPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="max-w-lg text-center">
        {illustration && (
          <div className="mb-8 text-primary-700">
            {illustration}
          </div>
        )}
        <div className="text-7xl font-extrabold text-primary-700 mb-4">
          {code}
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">
          {title}
        </h1>
        <p className="text-text-muted mb-8">
          {description}
        </p>
        {action && (
          <div className="flex items-center justify-center gap-3">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 20. نظام الألوان الدلالية

### 20.1 الـ Semantic Tokens

بدلاً من استخدام الألوان الخام (`primary-700`)، نستخدم **Semantic Tokens**:

```css
:root {
  /* Backgrounds */
  --bg-base: var(--c-bg);
  --bg-surface: var(--c-surface);
  --bg-elevated: var(--c-glass-strong);
  --bg-muted: var(--c-neutral-100);
  --bg-inverse: var(--c-neutral-900);
  
  /* Text */
  --text-primary: var(--c-text);
  --text-secondary: var(--c-text-soft);
  --text-muted: var(--c-text-muted);
  --text-faint: var(--c-text-faint);
  --text-inverse: #FFFFFF;
  --text-brand: var(--c-primary-700);
  
  /* Borders */
  --border-default: var(--c-border);
  --border-strong: var(--c-border-strong);
  --border-brand: var(--c-primary-700);
  --border-success: var(--c-success-500);
  --border-danger: var(--c-danger-500);
  
  /* Interactive */
  --interactive-default: var(--c-primary-700);
  --interactive-hover: var(--c-primary-600);
  --interactive-active: var(--c-primary-800);
  --interactive-disabled: var(--c-neutral-300);
  
  /* Feedback */
  --feedback-success-bg: var(--c-success-50);
  --feedback-success-text: var(--c-success-700);
  --feedback-error-bg: var(--c-danger-50);
  --feedback-error-text: var(--c-danger-700);
  --feedback-warning-bg: var(--c-warning-50);
  --feedback-warning-text: var(--c-warning-700);
  --feedback-info-bg: var(--c-info-50);
  --feedback-info-text: var(--c-info-700);
}
```

### 20.2 الفائدة

- عند تبديل الـ theme (Light/Dark)، تتغيّر قيم الـ semantic tokens فقط.
- لا حاجة لإضافة `dark:` classes في كل مكان.
- الكود أنظف وأسهل صيانة.

### 20.3 الاستخدام في Tailwind

```typescript
// tailwind.config.ts
extend: {
  colors: {
    bg: {
      base: 'var(--bg-base)',
      surface: 'var(--bg-surface)',
      elevated: 'var(--bg-elevated)',
      muted: 'var(--bg-muted)',
      inverse: 'var(--bg-inverse)',
    },
    text: {
      DEFAULT: 'var(--text-primary)',
      soft: 'var(--text-secondary)',
      muted: 'var(--text-muted)',
      faint: 'var(--text-faint)',
      inverse: 'var(--text-inverse)',
      brand: 'var(--text-brand)',
    },
    border: {
      DEFAULT: 'var(--border-default)',
      strong: 'var(--border-strong)',
      brand: 'var(--border-brand)',
    },
    interactive: {
      DEFAULT: 'var(--interactive-default)',
      hover: 'var(--interactive-hover)',
      active: 'var(--interactive-active)',
      disabled: 'var(--interactive-disabled)',
    },
  },
}
```

### 20.4 الاستخدام

```tsx
// ✅ استخدام semantic tokens (موصى به)
<button className="bg-interactive hover:bg-interactive-hover text-text-inverse">
  زر
</button>

// ❌ استخدام ألوان خام (غير موصى به)
<button className="bg-primary-700 hover:bg-primary-600 text-white">
  زر
</button>
```

---

## 21. مواصفات الـ Token System

### 21.1 طبقات الـ Tokens

```
Layer 1: Reference Tokens (الألوان الخام)
  ↓
Layer 2: System Tokens (الدلالية)
  ↓
Layer 3: Component Tokens (خاصّة بكل مكوّن)
```

#### Layer 1: Reference Tokens
```css
--color-blue-700: #1976D2;
--color-cyan-500: #00BCD4;
--color-green-500: #00C853;
/* ... */
```

#### Layer 2: System Tokens (Semantic)
```css
--color-brand: var(--color-blue-700);
--color-accent: var(--color-cyan-500);
--color-success: var(--color-green-500);
```

#### Layer 3: Component Tokens
```css
--button-primary-bg: var(--color-brand);
--button-primary-text: var(--color-white);
--button-primary-hover-bg: var(--color-blue-600);

--input-border: var(--border-default);
--input-focus-border: var(--color-brand);
--input-error-border: var(--color-danger);
```

### 21.2 فائدة الطبقات

- **Layer 1**: مرجع ثابت (لا يتغيّر).
- **Layer 2**: يتغيّر حسب الـ theme (Light/Dark).
- **Layer 3**: يتغيّر حسب المكوّن (يمكن تخصيص زر معيّن).

### 21.3 التبديل بين الثيمات

```css
[data-theme="light"] {
  --bg-base: #EEF6FF;
  --text-primary: #0F172A;
  /* ... */
}

[data-theme="dark"] {
  --bg-base: #0B1220;
  --text-primary: #F1F5F9;
  /* ... */
}
```

لا حاجة لتعديل أي مكوّن — كلها تتبع الـ semantic tokens تلقائياً.

---

## 22. الـ Accessibility المدمجة

### 22.1 قواعد كل مكوّن

كل مكوّن في النظام يجب أن يحقّق:

1. **Semantic HTML**: استخدام العناصر الصحيحة (`<button>` للنقر، `<a>` للتنقّل).
2. **ARIA**: إضافة `aria-label`, `aria-describedby`, `aria-invalid` عند الحاجة.
3. **Focus Management**: focus مرئي (`focus-visible:ring`).
4. **Keyboard**: قابل للوصول بالكامل بلوحة المفاتيح.
5. **Color Contrast**: تباين ≥ 4.5:1 (WCAG AA).
6. **Touch Target**: ≥ 44x44px على الجوال.
7. **Reduced Motion**: احترام `prefers-reduced-motion`.
8. **RTL**: دعم RTL كامل.
9. **Screen Reader**: نصوص مخفية للقارئ (`sr-only`).

### 22.2 أمثلة

```tsx
// Button: aria-busy عند التحميل
<button aria-busy={loading} aria-label={label}>

// Input: aria-invalid + aria-describedby
<input aria-invalid={!!error} aria-describedby={errorId} />
<p id={errorId} role="alert">{error}</p>

// Dialog: focus trap
<Dialog role="dialog" aria-modal="true" aria-labelledby={titleId}>
  <h2 id={titleId}>...</h2>
</Dialog>

// Toast: aria-live
<div role="status" aria-live="polite">
  {toast.message}
</div>

// Loading: aria-busy على الحاوية
<div aria-busy={isLoading}>
  {isLoading ? <Skeleton /> : <Content />}
</div>
```

> التفاصيل الكاملة في `docs/ACCESSIBILITY.md`.

---

## 23. الاختبار (Testing)

### 23.1 اختبارات الوحدة

كل مكوّن يجب أن يحقّق:
- ✅ Render بشكل صحيح.
- ✅ استجابة للـ props.
- ✅ استجابة للتفاعلات (click, focus).
- ✅ الوصولية.

```typescript
// Button.test.tsx
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });
  
  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  
  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
  
  it('shows spinner when loading', () => {
    render(<Button loading>Click</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});
```

### 23.2 اختبارات Visual (Storybook)

```typescript
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select' },
    size: { control: 'select' },
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'زر أساسي',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="success">Success</Button>
      <Button variant="glass">Glass</Button>
    </div>
  ),
};
```

### 23.3 اختبارات الوصولية

```bash
# باستخدام axe-core
npx @axe-core/cli http://localhost:3000
```

---

## 24. التوثيق والـ Storybook

### 24.1 إعداد Storybook

سيتم إعداد Storybook في `packages/ui/.storybook/`:

```
.storybook/
├── main.ts          # التهيئة
├── preview.ts       # الـ preview العام
└── theme.ts         # ثيم Storybook (يطابق CMS)
```

### 24.2 الميزات

- **Autodocs**: توثيق تلقائي من TypeScript types.
- **Controls**: تعديل props تفاعلياً.
- **Dark Mode**: تبديل Light/Dark.
- **RTL**: تبديل LTR/RTL.
- **Responsive**: عرض في أحجام مختلفة.

### 24.3 النشر

سيتم نشر Storybook على Vercel عند كل merge للـ main branch: `https://cms-storyboard.vercel.app`.

---

## 25. ملخص المكوّنات

### 25.1 الإحصائيات

| الفئة | العدد |
|------|------|
| **Primitives** | 6 (Box, Stack, Text, Icon, Container, Grid) |
| **Components** | 25+ (Button, Input, Card, Dialog, Table, ...) |
| **Patterns** | 8 (FormField, DataTable, EmptyState, LoadingState, ErrorState, ...) |
| **Layouts** | 4 (AppShell, Navbar, Sidebar, Footer) |
| **Tokens** | 150+ (colors, typography, spacing, shadows, ...) |

### 25.2 قائمة المكوّنات الكاملة

| المكوّن | الحالة | الوثائق |
|--------|------|--------|
| Button | ✅ موصوف | Section 3 |
| Input | ✅ موصوف | Section 4 |
| Textarea | ✅ موصوف | Section 4 |
| Select | ✅ موصوف | Section 4.7 |
| Checkbox | ✅ موصوف | Section 4.8 |
| Radio | ✅ موصوف | Section 4.8 |
| Switch | ✅ موصوف | Section 4.8 |
| DatePicker | ⏳ Phase 16 | TBD |
| FileUpload | ✅ موصوف | Section 4.10 |
| Slider | ⏳ Phase 16 | TBD |
| CodeInput | ✅ موصوف | Section 4.9 |
| Card | ✅ موصوف | Section 5 |
| Dialog | ✅ موصوف | Section 6 |
| Drawer | ✅ موصوف | Section 6 |
| ConfirmDialog | ✅ موصوف | Section 6 |
| Table/DataTable | ✅ موصوف | Section 7 |
| Navbar | ✅ موصوف | Section 8.2 |
| Sidebar | ✅ موصوف | Section 8.3 |
| Breadcrumbs | ✅ موصوف | Section 8.4 |
| Tabs | ✅ موصوف | Section 8.5 |
| CommandPalette | ✅ موصوف | Section 8.6 |
| FormField | ✅ موصوف | Section 4.6 |
| FormWizard | ✅ موصوف | Section 9.1 |
| Text/Typography | ✅ موصوف | Section 10 |
| Grid/Stack/Container | ✅ موصوف | Section 11 |
| Icon | ✅ موصوف | Section 14 |
| Badge | ✅ موصوف | Section 15 |
| Toast | ✅ موصوف | Section 16 |
| EmptyState | ✅ موصوف | Section 17 |
| Skeleton | ✅ موصوف | Section 18 |
| Spinner | ✅ موصوف | Section 18 |
| Progress | ✅ موصوف | Section 18 |
| ErrorPage | ✅ موصوف | Section 19 |

### 25.3 الالتزامات

- ✅ كل مكوّن موثّق بـ TypeScript types.
- ✅ كل مكوّن له Storybook story.
- ✅ كل مكوّن له اختبار وحدة.
- ✅ كل مكوّن يدعم RTL.
- ✅ كل مكوّن يدعم Light/Dark.
- ✅ كل مكوّن متجاوب (Mobile-first).
- ✅ كل مكوّن قابل للوصول (WCAG AA).

---

## 26. الخطوة التالية

الانتقال إلى **Phase 7: User Flows** لرسم تدفقات المستخدم الـ 12:
- تسجيل الدخول والتسجيل.
- تفعيل كود الاشتراك.
- الدخول لمادة وحل اختبار.
- الإبلاغ عن خطأ + المفضلة.
- مشاهدة ملف في المكتبة.
- مشاهدة فيديو يوتيوب مدمج.
- البحث الشامل.
- دخول لوحة الإدارة.
- إنشاء كود اشتراك.
- رفع ملفات المكتبة.
- إرسال إشعارات.
- إدارة الأسئلة.

**المخرجات المتوقعة من Phase 7**:
- `docs/USER_FLOWS.md` — 12+ user flow مفصّل
- مخططات流程 (سيتم إنشاؤها كـ Mermaid diagrams)

---

**نهاية تقرير Phase 6: Design System**
