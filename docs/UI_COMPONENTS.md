# UI_COMPONENTS.md — فهرس مكوّنات واجهة المستخدم

> **مرجع سريع لكل مكوّنات الـ Design System**. لكل مكوّن: الاسم، الوصف، الـ props، مثال الاستخدام، ومكان التنفيذ.

**المرحلة**: Phase 6
**الحالة**: ✅ Completed
**تاريخ الإنجاز**: 2026-07-30

---

## جدول المحتويات

1. [Primitives (المكوّنات الأساسية)](#1-primitives)
2. [Inputs (حقول الإدخال)](#2-inputs)
3. [Buttons (الأزرار)](#3-buttons)
4. [Cards (البطاقات)](#4-cards)
5. [Overlays (الطبقات الفوقية)](#5-overlays)
6. [Navigation (التنقّل)](#6-navigation)
7. [Data Display (عرض البيانات)](#7-data-display)
8. [Feedback (التغذية الراجعة)](#8-feedback)
9. [Forms (النماذج)](#9-forms)
10. [Layouts (التخطيطات)](#10-layouts)
11. [Patterns (الأنماط المركّبة)](#11-patterns)
12. [Icons (الأيقونات)](#12-icons)
13. [قواعد التسمية والاستيراد](#13-قواعد-التسمية-والاستيراد)

---

## 1. Primitives

المكوّنات الأساسية التي تُبنى عليها باقي المكوّنات.

### 1.1 Box
- **الغرض**: حاوية عامة (div مع className).
- **الـ props**: `as`, `className`, `children`, + كل HTML attributes.
- **المسار**: `packages/ui/src/primitives/Box/`
- **مثال**:
```tsx
<Box as="section" className="p-4 bg-surface rounded-lg">
  محتوى
</Box>
```

### 1.2 Stack
- **الغرض**: ترتيب العناصر عمودياً أو أفقيّاً مع gap.
- **الـ props**: `direction`, `gap`, `align`, `justify`, `wrap`.
- **المسار**: `packages/ui/src/primitives/Stack/`
- **مثال**:
```tsx
<Stack direction="column" gap="md">
  <div>عنصر 1</div>
  <div>عنصر 2</div>
</Stack>
```

### 1.3 Text
- **الغرض**: عرض نص بتنسيقات متعدّدة.
- **الـ props**: `variant`, `size`, `weight`, `color`, `align`, `truncate`, `clamp`.
- **المسار**: `packages/ui/src/primitives/Text/`
- **مثال**:
```tsx
<Text variant="h1" color="brand">عنوان رئيسي</Text>
<Text variant="body" color="muted">نص ثانوي</Text>
```

### 1.4 Icon
- **الغرض**: عرض أيقونة من Lucide أو مخصّصة.
- **الـ props**: `size`, `tone`, `className`, + كل SVG props.
- **المسار**: `packages/ui/src/primitives/Icon/`
- **مثال**:
```tsx
<Icon as={Home} size="md" tone="primary" />
```

### 1.5 Container
- **الغرض**: حاوية بعرض محدود لتوسيط المحتوى.
- **الـ props**: `size` (xs/sm/md/lg/xl/2xl/3xl/full), `padding`.
- **المسار**: `packages/ui/src/primitives/Container/`
- **مثال**:
```tsx
<Container size="lg">
  <h1>الصفحة</h1>
</Container>
```

### 1.6 Grid
- **الغرض**: شبكة responsive لترتيب العناصر.
- **الـ props**: `cols` (responsive), `gap`, `rows`.
- **المسار**: `packages/ui/src/primitives/Grid/`
- **مثال**:
```tsx
<Grid cols={{ base: 1, md: 2, lg: 3 }} gap="md">
  <Card>1</Card>
  <Card>2</Card>
  <Card>3</Card>
</Grid>
```

---

## 2. Inputs

### 2.1 Input
- **الغرض**: حقل إدخال نص (text, email, password, tel, number, search).
- **الـ props**: `size`, `error`, `success`, `leftIcon`, `rightIcon`, `hint`.
- **المسار**: `packages/ui/src/components/Input/`
- **مثال**:
```tsx
<Input
  type="email"
  placeholder="example@domain.com"
  leftIcon={<Mail />}
  error={!!errors.email}
/>
```

### 2.2 Textarea
- **الغرض**: حقل نص متعدّد الأسطر.
- **الـ props**: `size`, `error`, `rows`, `autoResize`, `maxLength`.
- **المسار**: `packages/ui/src/components/Textarea/`
- **مثال**:
```tsx
<Textarea
  placeholder="اكتب الشرح هنا..."
  rows={5}
  maxLength={1000}
/>
```

### 2.3 Select
- **الغرض**: قائمة منسدلة للاختيار.
- **الـ props**: `size`, `error`, `placeholder`, `options`, `multiple`, `searchable`.
- **المسار**: `packages/ui/src/components/Select/`
- **مثال**:
```tsx
<Select
  placeholder="اختر الجامعة"
  options={[
    { value: 'homs', label: 'جامعة حمص' },
    { value: 'aleppo', label: 'جامعة حلب' },
  ]}
/>
```

### 2.4 Checkbox
- **الغرض**: اختيار متعدد (checkbox).
- **الـ props**: `checked`, `label`, `description`, `error`, `indeterminate`.
- **المسار**: `packages/ui/src/components/Checkbox/`
- **مثال**:
```tsx
<Checkbox
  checked={remember}
  onCheckedChange={setRemember}
  label="تذكّرني"
  description="احفظ الجلسة لمدة 30 يوم"
/>
```

### 2.5 Radio / RadioGroup
- **الغرض**: اختيار واحد من متعدد.
- **الـ props**: `value`, `defaultValue`, `onValueChange`, `orientation`.
- **المسار**: `packages/ui/src/components/Radio/`
- **مثال**:
```tsx
<RadioGroup defaultValue="male">
  <Radio value="male" label="ذكر" />
  <Radio value="female" label="أنثى" />
</RadioGroup>
```

### 2.6 Switch
- **الغرض**: تبديل on/off.
- **الـ props**: `checked`, `onCheckedChange`, `label`, `description`, `disabled`.
- **المسار**: `packages/ui/src/components/Switch/`
- **مثال**:
```tsx
<Switch
  checked={notifications}
  onCheckedChange={setNotifications}
  label="تفعيل الإشعارات"
/>
```

### 2.7 DatePicker
- **الغرض**: اختيار تاريخ.
- **الـ props**: `value`, `onChange`, `mode` (single/range), `locale`, `min`, `max`.
- **المسار**: `packages/ui/src/components/DatePicker/`
- **مثال**:
```tsx
<DatePicker
  value={date}
  onChange={setDate}
  locale="ar"
  mode="single"
/>
```

### 2.8 FileUpload
- **الغرض**: رفع ملف واحد أو متعدد مع drag & drop.
- **الـ props**: `accept`, `maxSize`, `multiple`, `onFilesChange`, `maxFiles`.
- **المسار**: `packages/ui/src/components/FileUpload/`
- **مثال**:
```tsx
<FileUpload
  accept="image/*,application/pdf"
  maxSize={100 * 1024 * 1024}
  multiple
  onFilesChange={handleFiles}
/>
```

### 2.9 Slider
- **الغرض**: اختيار قيمة من نطاق.
- **الـ props**: `value`, `onValueChange`, `min`, `max`, `step`.
- **المسار**: `packages/ui/src/components/Slider/`
- **مثال**:
```tsx
<Slider
  value={volume}
  onValueChange={setVolume}
  min={0}
  max={100}
  step={5}
/>
```

### 2.10 CodeInput
- **الغرض**: إدخال كود تفعيل (6 خانات منفصلة).
- **الـ props**: `length`, `value`, `onChange`, `onComplete`.
- **المسار**: `packages/ui/src/components/CodeInput/`
- **مثال**:
```tsx
<CodeInput
  length={6}
  value={code}
  onChange={setCode}
  onComplete={(code) => activate(code)}
/>
```

### 2.11 OTPInput
- **الغرض**: إدخال OTP عبر SMS.
- **الـ props**: `length`, `value`, `onChange`, `autoFocus`, `disabled`.
- **المسار**: `packages/ui/src/components/OTPInput/`
- **مثال**:
```tsx
<OTPInput
  length={4}
  value={otp}
  onChange={setOtp}
/>
```

### 2.12 SearchInput
- **الغرض**: حقل بحث مع أيقونة وزر مسح.
- **الـ props**: `value`, `onChange`, `placeholder`, `onClear`.
- **المسار**: `packages/ui/src/components/SearchInput/`
- **مثال**:
```tsx
<SearchInput
  value={query}
  onChange={setQuery}
  placeholder="ابحث في الأسئلة..."
/>
```

### 2.13 Rating
- **الغرض**: تقييم بالنجوم.
- **الـ props**: `value`, `onChange`, `max`, `size`, `readOnly`.
- **المسار**: `packages/ui/src/components/Rating/`
- **مثال**:
```tsx
<Rating
  value={3}
  onChange={setRating}
  max={5}
/>
```

### 2.14 ColorPicker
- **الغرض**: اختيار لون (للمدير).
- **الـ props**: `value`, `onChange`, `preset`.
- **المسار**: `packages/ui/src/components/ColorPicker/`

---

## 3. Buttons

### 3.1 Button
- **الغرض**: زر تفاعلي.
- **الـ props**: `variant`, `size`, `fullWidth`, `loading`, `icon`, `iconPosition`, `disabled`.
- **المسار**: `packages/ui/src/components/Button/`
- **الـ variants**: `primary`, `secondary`, `ghost`, `danger`, `success`, `glass`, `link`.
- **الـ sizes**: `xs`, `sm`, `md` (default), `lg`, `xl`.
- **مثال**:
```tsx
<Button variant="primary" size="md" icon={<Save />} loading={isSaving}>
  حفظ
</Button>
```

### 3.2 IconButton
- **الغرض**: زر أيقونة فقط (بلا نص).
- **الـ props**: `icon`, `aria-label`, `variant`, `size`, `shape` (circle/square).
- **المسار**: `packages/ui/src/components/IconButton/`
- **مثال**:
```tsx
<IconButton
  icon={<Close />}
  aria-label="إغلاق"
  variant="ghost"
  size="md"
/>
```

### 3.3 ButtonGroup
- **الغرض**: مجموعة أزرار متّصلة.
- **الـ props**: `orientation`, `size`.
- **المسار**: `packages/ui/src/components/ButtonGroup/`
- **مثال**:
```tsx
<ButtonGroup>
  <Button variant="secondary">يسار</Button>
  <Button variant="secondary">وسط</Button>
  <Button variant="secondary">يمين</Button>
</ButtonGroup>
```

### 3.4 FloatingActionButton (FAB)
- **الغرض**: زر عائم للإجراء الرئيسي على الموبايل.
- **الـ props**: `icon`, `label`, `position`, `onClick`.
- **المسار**: `packages/ui/src/components/FAB/`
- **مثال**:
```tsx
<FAB
  icon={<Plus />}
  label="إضافة سؤال"
  position="bottom-end"
  onClick={openAddDialog}
/>
```

### 3.5 ToggleGroup
- **الغرض**: مجموعة أزرار قابلة للتبديل (مثل: bold/italic/underline).
- **الـ props**: `type` (single/multiple), `value`, `onValueChange`.
- **المسار**: `packages/ui/src/components/ToggleGroup/`

---

## 4. Cards

### 4.1 Card
- **الغرض**: حاوية محتوى بحدود وظل.
- **الـ props**: `variant`, `interactive`, `tone`, `padding`.
- **المسار**: `packages/ui/src/components/Card/`
- **الـ variants**: `content`, `stat`, `glass`, `profile`.
- **مثال**:
```tsx
<Card variant="content" interactive>
  <CardHeader>
    <CardTitle>عنوان</CardTitle>
  </CardHeader>
  <CardContent>محتوى</CardContent>
</Card>
```

### 4.2 CardHeader / CardBody / CardFooter
- **الغرض**: أجزاء البطاقة.
- **المسار**: `packages/ui/src/components/Card/`
- **مثال**:见 Card.

### 4.3 StatCard
- **الغرض**: بطاقة إحصائية.
- **الـ props**: `icon`, `label`, `value`, `trend`, `tone`.
- **المسار**: `packages/ui/src/components/StatCard/`
- **مثال**:
```tsx
<StatCard
  icon={<BookOpen />}
  label="إجمالي الأسئلة"
  value="1,247"
  trend={{ value: 12, direction: 'up' }}
  tone="primary"
/>
```

### 4.4 ProfileCard
- **الغرض**: بطاقة ملف شخصي.
- **الـ props**: `avatar`, `name`, `role`, `stats`, `actions`.
- **المسار**: `packages/ui/src/components/ProfileCard/`

### 4.5 QuestionCard
- **الغرض**: بطاقة سؤال في القائمة.
- **الـ props**: `question`, `onSelect`, `onFavorite`, `onReport`.
- **المسار**: `apps/student-web/src/features/questions/` (خاص بالـ app).

### 4.6 ContentCard
- **الغرض**: بطاقة محتوى عام (مادة، محاضرة، اختبار).
- **الـ props**: `title`, `description`, `meta`, `progress`, `action`, `image`.
- **المسار**: `packages/ui/src/components/ContentCard/`

---

## 5. Overlays

### 5.1 Dialog / Modal
- **الغرض**: نافذة منبثقة.
- **الـ props**: `open`, `onOpenChange`, `size`, `children`.
- **المسار**: `packages/ui/src/components/Dialog/`
- **الـ sizes**: `sm`, `md`, `lg`, `xl`, `full`.
- **مثال**:
```tsx
<Dialog open={open} onOpenChange={setOpen} size="md">
  <DialogContent>
    <DialogHeader>
      <DialogTitle>عنوان</DialogTitle>
      <DialogDescription>وصف</DialogDescription>
    </DialogHeader>
    <DialogBody>محتوى</DialogBody>
    <DialogFooter>
      <Button variant="secondary">إلغاء</Button>
      <Button variant="primary">تأكيد</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 5.2 Drawer
- **الغرض**: لوحة جانبية تنزلق من الحافة.
- **الـ props**: `open`, `onOpenChange`, `side` (start/end/top/bottom), `size`.
- **المسار**: `packages/ui/src/components/Drawer/`
- **مثال**:
```tsx
<Drawer open={open} onOpenChange={setOpen} side="end" size="md">
  <DrawerContent>...</DrawerContent>
</Drawer>
```

### 5.3 ConfirmDialog
- **الغرض**: تأكيد إجراء.
- **الـ props**: `open`, `onClose`, `title`, `description`, `confirmText`, `cancelText`, `variant`, `onConfirm`.
- **المسار**: `packages/ui/src/components/ConfirmDialog/`
- **مثال**:
```tsx
<ConfirmDialog
  open={open}
  onClose={setOpen}
  title="حذف السؤال؟"
  description="لا يمكن التراجع عن هذا الإجراء."
  confirmText="حذف"
  variant="danger"
  onConfirm={handleDelete}
/>
```

### 5.4 AlertDialog
- **الغرض**: تنبيه لا يمكن تجاهله.
- **المسار**: `packages/ui/src/components/AlertDialog/`

### 5.5 Popover
- **الغرض**: نافذة صغيرة فوق عنصر.
- **الـ props**: `trigger`, `content`, `side`, `align`.
- **المسار**: `packages/ui/src/components/Popover/`

### 5.6 Tooltip
- **الغرض**: تلميح صغير عند hover.
- **الـ props**: `content`, `side`, `align`, `delay`.
- **المسار**: `packages/ui/src/components/Tooltip/`
- **مثال**:
```tsx
<Tooltip content="حفظ التغييرات" side="top">
  <Button>...</Button>
</Tooltip>
```

### 5.7 HoverCard
- **الغرض**: بطاقة معلومات عند hover.
- **المسار**: `packages/ui/src/components/HoverCard/`

### 5.8 ContextMenu
- **الغرض**: قائمة سياق (right-click).
- **المسار**: `packages/ui/src/components/ContextMenu/`

### 5.9 DropdownMenu
- **الغرض**: قائمة منسدلة من زر.
- **الـ props**: `trigger`, `items`, `align`.
- **المسار**: `packages/ui/src/components/DropdownMenu/`
- **مثال**:
```tsx
<DropdownMenu
  trigger={<IconButton icon={<MoreVertical />} />}
  items={[
    { label: 'تعديل', icon: <Edit />, onClick: editItem },
    { label: 'حذف', icon: <Trash />, onClick: deleteItem, variant: 'danger' },
  ]}
/>
```

---

## 6. Navigation

### 6.1 Navbar
- **الغرض**: شريط علوي ثابت.
- **الـ props**: `left`, `center`, `right`.
- **المسار**: `packages/ui/src/layouts/Navbar/`
- **مثال**:
```tsx
<Navbar>
  <NavbarLeft><Logo /></NavbarLeft>
  <NavbarCenter><SearchBar /></NavbarCenter>
  <NavbarRight><ProfileMenu /></NavbarRight>
</Navbar>
```

### 6.2 Sidebar
- **الغرض**: شريط جانبي للتنقّل.
- **الـ props**: `collapsible`, `sections`.
- **المسار**: `packages/ui/src/layouts/Sidebar/`
- **مثال**:
```tsx
<Sidebar>
  <SidebarSection label="التنقّل">
    <SidebarItem icon={<Home />} active>الرئيسية</SidebarItem>
    <SidebarItem icon={<Star />} badge="5">المفضلة</SidebarItem>
  </SidebarSection>
</Sidebar>
```

### 6.3 Breadcrumbs
- **الغرض**: مسار التنقّل.
- **الـ props**: `items`.
- **المسار**: `packages/ui/src/components/Breadcrumbs/`
- **مثال**:
```tsx
<Breadcrumbs
  items={[
    { label: 'الرئيسية', href: '/' },
    { label: 'كلية الطب', href: '/college/1' },
    { label: 'الباطنة', current: true },
  ]}
/>
```

### 6.4 Tabs
- **الغرض**: تبويبات.
- **الـ props**: `defaultValue`, `value`, `onValueChange`, `orientation`.
- **المسار**: `packages/ui/src/components/Tabs/`
- **مثال**:
```tsx
<Tabs defaultValue="questions">
  <TabsList>
    <TabsTrigger value="questions">الأسئلة</TabsTrigger>
    <TabsTrigger value="library">المكتبة</TabsTrigger>
  </TabsList>
  <TabsContent value="questions">...</TabsContent>
  <TabsContent value="library">...</TabsContent>
</Tabs>
```

### 6.5 Pagination
- **الغرض**: ترقيم الصفحات.
- **الـ props**: `currentPage`, `totalPages`, `onPageChange`.
- **المسار**: `packages/ui/src/components/Pagination/`

### 6.6 CommandPalette
- **الغرض**: لوحة أوامر (Ctrl+K).
- **الـ props**: `commands`, `open`, `onOpenChange`.
- **المسار**: `packages/ui/src/components/CommandPalette/`
- **مثال**:
```tsx
<CommandPalette
  commands={[
    { id: 'home', title: 'الرئيسية', icon: <Home />, action: () => navigate('/') },
    { id: 'search', title: 'البحث', icon: <Search />, action: () => navigate('/search') },
  ]}
/>
```

### 6.7 Stepper
- **الغرض**: عرض خطوات (في الـ wizard).
- **الـ props**: `steps`, `currentStep`.
- **المسار**: `packages/ui/src/components/Stepper/`

### 6.8 BottomNav (Mobile)
- **الغرض**: شريط تنقّل سفلي للموبايل.
- **المسار**: `packages/ui/src/layouts/BottomNav/`

---

## 7. Data Display

### 7.1 Table / DataTable
- **الغرض**: جدول بيانات متقدّم.
- **الـ props**: `data`, `columns`, `searchable`, `pagination`, `selectable`, `emptyState`.
- **المسار**: `packages/ui/src/components/DataTable/`
- **مثال**:
```tsx
<DataTable
  data={users}
  columns={[
    { id: 'name', header: 'الاسم' },
    { id: 'email', header: 'البريد', sortable: true },
  ]}
  searchable
  pagination={{ pageSize: 10 }}
/>
```

### 7.2 Badge
- **الغرض**: شارة صغيرة.
- **الـ props**: `variant`, `size`, `shape`, `dot`, `icon`.
- **المسار**: `packages/ui/src/components/Badge/`
- **مثال**:
```tsx
<Badge variant="success" dot>متصل</Badge>
```

### 7.3 Avatar
- **الغرض**: صورة المستخدم.
- **الـ props**: `src`, `name`, `size`, `shape`.
- **المسار**: `packages/ui/src/components/Avatar/`
- **مثال**:
```tsx
<Avatar src="/user.jpg" name="أحمد" size="md" />
```

### 7.4 Chip
- **الغرض**: بطاقة صغيرة قابلة للإزالة (فلتر).
- **الـ props**: `label`, `onRemove`, `selected`.
- **المسار**: `packages/ui/src/components/Chip/`

### 7.5 Tag
- **الغرض**: وسم تصنيف.
- **الـ props**: `label`, `color`, `onClick`.
- **المسار**: `packages/ui/src/components/Tag/`

### 7.6 List
- **الغرض**: قائمة عناصر.
- **الـ props**: `items`, `renderItem`.
- **المسار**: `packages/ui/src/components/List/`

### 7.7 DescriptionList
- **الغرض**: قائمة وصف (key-value).
- **المسار**: `packages/ui/src/components/DescriptionList/`

### 7.8 Tree
- **الغرض**: عرض شجري (للهيكل الأكاديمي).
- **الـ props**: `data`, `renderNode`, `collapsible`.
- **المسار**: `packages/ui/src/components/Tree/`
- **مثال**:
```tsx
<Tree
  data={academicHierarchy}
  renderNode={(node) => <AcademicNode node={node} />}
/>
```

### 7.9 Timeline
- **الغرض**: عرض زمني للأحداث.
- **المسار**: `packages/ui/src/components/Timeline/`

### 7.10 Code Block
- **الغرض**: عرض كود برمجي.
- **الـ props**: `code`, `language`, `showLineNumbers`, `copyable`.
- **المسار**: `packages/ui/src/components/CodeBlock/`

### 7.11 JSON Viewer
- **الغرض**: عرض JSON بشكل جميل.
- **المسار**: `packages/ui/src/components/JsonViewer/`

### 7.12 Divider
- **الغرض**: فاصل أفقي/عمودي.
- **الـ props**: `orientation`, `label`, `dashed`.
- **المسار**: `packages/ui/src/components/Divider/`

---

## 8. Feedback

### 8.1 Toast
- **الغرض**: إشعار عابر.
- **الـ API**: `useToast()` hook.
- **المسار**: `packages/ui/src/components/Toast/`
- **مثال**:
```tsx
const toast = useToast();
toast.success('تم الحفظ!');
toast.error('حدث خطأ', { action: { label: 'إعادة', onClick: retry } });
```

### 8.2 Alert
- **الغرض**: رسالة تنبيه ثابتة داخل الصفحة.
- **الـ props**: `variant`, `title`, `description`, `action`, `icon`, `onClose`.
- **المسار**: `packages/ui/src/components/Alert/`
- **مثال**:
```tsx
<Alert variant="warning" title="اشتراك منتهٍ" onClose={dismiss}>
  تجديد الاشتراك خلال 3 أيام للمتابعة.
</Alert>
```

### 8.3 Progress
- **الغرض**: شريط تقدّم.
- **الـ props**: `value`, `max`, `variant`, `size`, `label`.
- **المسار**: `packages/ui/src/components/Progress/`
- **مثال**:
```tsx
<Progress value={65} variant="primary" label="تقدّمك" />
```

### 8.4 Spinner
- **الغرض**: مؤشر تحميل دائري.
- **الـ props**: `size`, `tone`.
- **المسار**: `packages/ui/src/components/Spinner/`

### 8.5 Skeleton
- **الغرض**: هيكل عظمي للتحميل.
- **الـ props**: `className`, `variant`.
- **المسار**: `packages/ui/src/components/Skeleton/`
- **مثال**:
```tsx
{isLoading ? <SkeletonCard /> : <Content />}
```

### 8.6 LoadingOverlay
- **الغرض**: غطاء تحميل فوق الصفحة.
- **الـ props**: `loading`, `message`, `children`.
- **المسار**: `packages/ui/src/components/LoadingOverlay/`

### 8.7 EmptyState
- **الغرض**: حالة فارغة.
- **الـ props**: `icon`, `title`, `description`, `action`, `tone`.
- **المسار**: `packages/ui/src/patterns/EmptyState/`
- **مثال**:
```tsx
<EmptyState
  icon={<BookX />}
  title="لا توجد أسئلة"
  action={<Button>إضافة</Button>}
/>
```

### 8.8 ErrorState
- **الغرض**: حالة خطأ مع retry.
- **الـ props**: `title`, `description`, `onRetry`, `error`.
- **المسار**: `packages/ui/src/patterns/ErrorState/`

### 8.9 NotificationBadge
- **الغرض**: شارة عدد الإشعارات.
- **الـ props**: `count`, `max`, `tone`.
- **المسار**: `packages/ui/src/components/NotificationBadge/`

---

## 9. Forms

### 9.1 FormField
- **الغرض**: غلاف لحقل مع label + error.
- **الـ props**: `label`, `required`, `description`, `error`, `children`.
- **المسار**: `packages/ui/src/patterns/FormField/`
- **مثال**:
```tsx
<FormField label="البريد" required error={errors.email?.message}>
  <Input type="email" {...register('email')} />
</FormField>
```

### 9.2 Form
- **الغرض**: غلاف نموذج + submit handling.
- **الـ props**: `onSubmit`, `defaultValues`, `resolver`.
- **المسار**: `packages/ui/src/components/Form/`

### 9.3 FormWizard
- **الغرض**: نموذج متعدّد الخطوات.
- **الـ props**: `steps`, `onComplete`, `currentStep`.
- **المسار**: `packages/ui/src/components/FormWizard/`

### 9.4 FormSection
- **الغرض**: قسم داخل النموذج.
- **المسار**: `packages/ui/src/components/FormSection/`

### 9.5 FilterBar
- **الغرض**: شريط فلترة.
- **المسار**: `packages/ui/src/components/FilterBar/`

### 9.6 SearchFilters
- **الغرض**: فلاتر بحث متقدّمة.
- **المسار**: `packages/ui/src/components/SearchFilters/`

---

## 10. Layouts

### 10.1 AppShell
- **الغرض**: الهيكل العام للصفحة (Navbar + Sidebar + Content + Footer).
- **الـ props**: `navbar`, `sidebar`, `footer`, `children`.
- **المسار**: `packages/ui/src/layouts/AppShell/`
- **مثال**:
```tsx
<AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
  {pageContent}
</AppShell>
```

### 10.2 PageHeader
- **الغرض**: ترويسة الصفحة (title + actions + breadcrumb).
- **المسار**: `packages/ui/src/layouts/PageHeader/`
- **مثال**:
```tsx
<PageHeader
  title="إدارة الأسئلة"
  description="إضافة وتعديل وحذف الأسئلة"
  breadcrumb={<Breadcrumbs items={...} />}
  actions={<Button>إضافة سؤال</Button>}
/>
```

### 10.3 Section
- **الغرض**: قسم في الصفحة.
- **المسار**: `packages/ui/src/layouts/Section/`

### 10.4 SplitLayout
- **الغرض**: تخطيط بعمودين (master-detail).
- **المسار**: `packages/ui/src/layouts/SplitLayout/`

### 10.5 Footer
- **الغرض**: تذييل الصفحة.
- **المسار**: `packages/ui/src/layouts/Footer/`

---

## 11. Patterns

### 11.1 EmptyState
- انظر 8.7.

### 11.2 LoadingState
- **الغرض**: حالة تحميل كاملة.
- **المسار**: `packages/ui/src/patterns/LoadingState/`

### 11.3 ErrorState
- انظر 8.8.

### 11.4 ErrorPage (404, 500, 403, 503)
- **الغرض**: صفحة خطأ كاملة.
- **المسار**: `packages/ui/src/patterns/ErrorPage/`

### 11.5 DataTable
- انظر 7.1.

### 11.6 SearchEmpty
- **الغرض**: حالة "لا نتائج بحث".
- **المسار**: `packages/ui/src/patterns/SearchEmpty/`

### 11.7 PermissionDenied
- **الغرض**: حالة عدم الصلاحية.
- **المسار**: `packages/ui/src/patterns/PermissionDenied/`

### 11.8 OfflineBanner
- **الغرض**: تنبيه "أنت غير متصل".
- **المسار**: `packages/ui/src/patterns/OfflineBanner/`

### 11.9 SecurityAlert
- **الغرض**: تنبيه أمني حرج.
- **المسار**: `packages/ui/src/patterns/SecurityAlert/`

### 11.10 Watermark
- **الغرض**: علامة مائية على المحتوى المحمي.
- **المسار**: `packages/ui/src/patterns/Watermark/`

---

## 12. Icons

### 12.1 Icon (Lucide wrapper)
- **الغرض**: عرض أيقونة من Lucide.
- **المسار**: `packages/ui/src/primitives/Icon/`
- **مثال**:
```tsx
<Icon as={Home} size="md" tone="primary" />
// أو مباشرة:
<Home size={20} className="text-primary-700" />
```

### 12.2 Medical Icons (مخصّصة)
- **MedicalShield**: درع طبي.
- **ECGPulse**: نبضة قلب.
- **Stethoscope**: سماعة طبيب.
- **Syringe**: محقن.
- **Brain**: دماغ.
- **Heart**: قلب.
- **Lungs**: رئتان.
- **Bone**: عظم.
- **DNA**: حمض نووي.
- **Microscope**: مجهر.
- **Pill**: حبة دواء.
- **Thermometer**: ترمومتر.
- **Bandage**: ضماد.
- **Tooth**: سن.
- **Eye**: عين.
- **Ear**: أذن.
- **Hand**: يد.
- **Foot**: قدم.

**المسار**: `packages/ui/src/icons/medical.tsx`

### 12.3 Custom App Icons
أيقونات خاصة بالـ CMS:
- **LogoMark**: شعار المنصة.
- **LogoFull**: الاسم + الشعار.
- **QuestionType**: أيقونة نوع السؤال.
- **SubscriptionCode**: أيقونة كود الاشتراك.
- **ExamTimer**: أيقونة المؤقت.

**المسار**: `packages/ui/src/icons/brand.tsx`

---

## 13. قواعد التسمية والاستيراد

### 13.1 قواعد تسمية الملفات

| النوع | القاعدة | مثال |
|------|---------|------|
| Component file | PascalCase.tsx | `Button.tsx` |
| Component folder | PascalCase/ | `Button/` |
| Index file | index.ts | `Button/index.ts` |
| Variants file | variants.ts | `Button/variants.ts` |
| Types file | types.ts | `Button/types.ts` |
| Test file | Button.test.tsx | `Button/Button.test.tsx` |
| Story file | Button.stories.tsx | `Button/Button.stories.tsx` |
| Documentation | Button.mdx | `Button/Button.mdx` |

### 13.2 بنية مجلد المكوّن

```
Button/
├── Button.tsx          # المكوّن الرئيسي
├── Button.test.tsx     # اختبارات
├── Button.stories.tsx  # Storybook stories
├── Button.mdx          # توثيق
├── variants.ts         # CVA variants
├── types.ts            # TypeScript types
└── index.ts            # تصدير
```

### 13.3 الاستيراد

```tsx
// ✅ صحيح - من نقطة التصدير الرئيسية
import { Button, Input, Card } from '@cms/ui';

// ❌ خطأ - استيراد مباشر من ملف
import { Button } from '@cms/ui/components/Button/Button';
```

### 13.4 إعداد package alias

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@cms/ui": ["./packages/ui/src/index.ts"],
      "@cms/ui/*": ["./packages/ui/src/*"]
    }
  }
}
```

```tsx
// vite.config.ts
resolve: {
  alias: {
    '@cms/ui': path.resolve(__dirname, './packages/ui/src/index.ts'),
  },
}
```

### 13.5 الـ Barrel Exports

```typescript
// packages/ui/src/index.ts
export * from './primitives/Box';
export * from './primitives/Stack';
export * from './primitives/Text';
export * from './primitives/Icon';
export * from './primitives/Container';
export * from './primitives/Grid';

export * from './components/Button';
export * from './components/Input';
export * from './components/Textarea';
export * from './components/Select';
export * from './components/Checkbox';
export * from './components/Radio';
export * from './components/Switch';
export * from './components/Card';
export * from './components/Dialog';
export * from './components/Drawer';
export * from './components/ConfirmDialog';
export * from './components/DataTable';
export * from './components/Badge';
export * from './components/Avatar';
export * from './components/Tabs';
export * from './components/Breadcrumbs';
export * from './components/Pagination';
export * from './components/Toast';
export * from './components/Alert';
export * from './components/Progress';
export * from './components/Spinner';
export * from './components/Skeleton';
export * from './components/EmptyState';
export * from './components/ErrorPage';
export * from './components/DropdownMenu';
export * from './components/Popover';
export * from './components/Tooltip';
export * from './components/CommandPalette';

export * from './patterns/FormField';
export * from './patterns/FormWizard';
export * from './patterns/DataTable';

export * from './layouts/AppShell';
export * from './layouts/Navbar';
export * from './layouts/Sidebar';
export * from './layouts/PageHeader';
export * from './layouts/Footer';

export * from './icons/medical';
export * from './icons/brand';

export * from './theme/ThemeProvider';
export * from './utils/cn';
export * from './utils/animations';
```

---

## 14. إحصائيات المكوّنات

### 14.1 التوزيع حسب الفئة

| الفئة | العدد | النسبة |
|------|------|--------|
| Primitives | 6 | 9% |
| Inputs | 14 | 21% |
| Buttons | 5 | 7% |
| Cards | 6 | 9% |
| Overlays | 9 | 13% |
| Navigation | 8 | 12% |
| Data Display | 12 | 18% |
| Feedback | 9 | 13% |
| Forms | 6 | 9% |
| Layouts | 5 | 7% |
| Patterns | 10 | 15% |
| Icons | 30+ | — |

> ملاحظة: بعض المكوّنات تظهر في أكثر من فئة (مثلاً: EmptyState في Feedback و Patterns).

### 14.2 إجمالي المكوّنات

- **إجمالي المكوّنات**: ~90+ مكوّن
- **Primitives**: 6
- **Components**: 60+
- **Patterns**: 10
- **Layouts**: 5
- **Icons**: 30+ (Lucide) + 18 (medical) + 5 (brand)

### 14.3 أولوية التنفيذ

#### P0 (Critical - Phase 16 Foundation)
- Button, Input, Card, Dialog, Text, Icon, Container, Stack
- FormField, AppShell, Navbar, Sidebar
- Badge, Avatar, Toast, Progress, Spinner, Skeleton
- EmptyState, ErrorPage

#### P1 (High - Phase 16-20)
- Textarea, Select, Checkbox, Radio, Switch
- Tabs, Breadcrumbs, Pagination
- Alert, LoadingOverlay
- DataTable (basic version)

#### P2 (Medium - Phase 20-24)
- FileUpload, CodeInput, OTPInput, SearchInput
- DropdownMenu, Popover, Tooltip
- CommandPalette
- DataTable (full version)

#### P3 (Low - Phase 24+)
- DatePicker, Slider, Rating, ColorPicker
- Tree, Timeline, CodeBlock, JSON Viewer
- HoverCard, ContextMenu
- Stepper, BottomNav

---

## 15. الالتزامات النهائية

### 15.1 لكل مكوّن

- ✅ TypeScript types كاملة.
- ✅ Storybook story.
- ✅ Unit test (Vitest + Testing Library).
- ✅ Accessibility test (axe-core).
- ✅ Visual regression test (Chromatic).
- ✅ توثيق MDX.
- ✅ دعم RTL.
- ✅ دعم Dark Mode.
- ✅ Responsive (Mobile-first).
- ✅ Reduced motion support.

### 15.2 للنظام ككل

- ✅ Single source of truth (Design Tokens).
- ✅ Semantic tokens (لا ألوان خام).
- ✅ Versioned releases (Semantic Versioning).
- ✅ Changelog لكل إصدار.
- ✅ Deprecation policy (إشعار قبل الحذف).
- ✅ Migration guide للتحديثات الكبرى.

---

## 16. الخطوة التالية

الانتقال إلى **Phase 7: User Flows** لرسم تدفقات المستخدم الـ 12 قبل أي تنفيذ برمجي.

**المخرجات المتوقعة من Phase 7**:
- `docs/USER_FLOWS.md` — 12+ user flow مفصّل
- Mermaid diagrams لكل flow
- Journey maps

---

**نهاية ملف UI_COMPONENTS.md**
