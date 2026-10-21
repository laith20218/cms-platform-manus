/** غرفة القيادة السريرية: navy authority, ivory work surface, teal clinical signal, asymmetric command sidebar. */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  CircleAlert,
  Edit3,
  Eye,
  FileText,
  KeyRound,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Sun,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { apiRequest, ApiError, type AdminRecord, type AdminUser, type PagedResult, type RoleRecord, login } from './lib/api';
import { AcademicCenter } from './components/AcademicCenter';
import { CodesCenter } from './components/CodesCenter';
import { StudentsCenter } from './components/StudentsCenter';
import { QuestionsCenter } from './components/QuestionsCenter';
import { ExamsCenter } from './components/ExamsCenter';
import { LibraryCenter } from './components/LibraryCenter';

const BRAND_MARK = '/brand/cms-admin-mark.png';
const FULL_LOGO = '/brand/cms-cliver-medical-student-logo.jpg';
const OPERATIONS_IMAGE = '/brand/cms-admin-login-hero.jpg';

type Locale = 'ar' | 'en';
type Theme = 'light' | 'dark';
type View = 'admins' | 'roles' | 'overview' | 'academic' | 'codes' | 'students' | 'questions' | 'exams' | 'library';
type Dialog =
  | { kind: 'create-admin' }
  | { kind: 'edit-admin'; admin: AdminRecord }
  | { kind: 'reset-password'; admin: AdminRecord }
  | { kind: 'delete-admin'; admin: AdminRecord }
  | { kind: 'create-role' }
  | null;
type ActiveDialog = Exclude<Dialog, null>;

type DashboardStats = {
  totalStudents: number;
  activeStudentsToday: number;
  totalQuestions: number;
  totalActiveCodes: number;
  totalActiveSubscriptions: number;
  totalLibraryFiles: number;
  totalExams: number;
  pendingReports: number;
  monthlyRevenue: number;
  revenueChangePercent: number;
};

const initialAdminForm = { fullName: '', email: '', password: '', phone: '', roleId: '' };

function App() {
  const [locale, setLocale] = useState<Locale>('ar');
  const [theme, setTheme] = useState<Theme>('light');
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [totalAdmins, setTotalAdmins] = useState(0);
  const [loadingData, setLoadingData] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [adminForm, setAdminForm] = useState(initialAdminForm);
  const [roleForm, setRoleForm] = useState({ name: '', nameAr: '', description: '' });

  const isSuperAdmin = user?.role === 'super_admin';
  const isArabic = locale === 'ar';

  const copy = isArabic
    ? {
        title: 'لوحة تحكم منصة CMS', loginTitle: 'لوحة تحكم منصة CMS', loginDescription: 'أهلًا بك في منطقة الإدارة والمسؤولية لتأمين بيئة تفاعلية للطلاب والمدرسين.', signIn: 'تفضّل استلم صلاحياتك', email: 'البريد الإلكتروني', password: 'كلمة المرور', systemReady: 'قناة الإدارة مؤمّنة', overview: 'لوحة القيادة', admins: 'المدراء', roles: 'الأدوار والصلاحيات', signOut: 'تسجيل الخروج', connected: 'النظام متصل', command: 'أهلًا وسهلًا بك في المصنع الذي ينتج أحدث وأنسب وسائل التعليم والتلقين للطلاب.', commandSub: 'راجع الصلاحيات قبل نشر التغيير، ثم تابع الإدارة ضمن نطاقك الأكاديمي.', adminList: 'قائمة المدراء', addAdmin: 'إضافة مدير', addRole: 'إنشاء دور', search: 'ابحث بالاسم أو البريد أو الهاتف', clear: 'إزالة التصفية', active: 'مفعّل', disabled: 'معطّل', all: 'الكل', role: 'الدور', scope: 'النطاق الأكاديمي', status: 'الحالة', lastLogin: 'آخر دخول', created: 'تاريخ الإنشاء', actions: 'إجراءات', edit: 'تعديل', reset: 'إعادة تعيين كلمة المرور', delete: 'حذف نهائي', view: 'عرض التفاصيل', deactivate: 'تعطيل الحساب', activate: 'تفعيل الحساب', noAdmins: 'لا توجد نتائج مطابقة.', newAdmin: 'إضافة مدير جديد', updateAdmin: 'تعديل بيانات المدير', fullName: 'الاسم الكامل', phone: 'رقم الهاتف (اختياري)', save: 'حفظ التغيير', cancel: 'إلغاء', initialPassword: 'كلمة المرور الأولية', passwordReminder: 'يجب تذكير المدير بتغيير كلمة المرور الأولية عند الدخول، دون حجب اللوحة.', resetTitle: 'إعادة تعيين كلمة المرور', newPassword: 'كلمة المرور الجديدة', deleteTitle: 'تأكيد الحذف النهائي', deleteText: 'هذا الإجراء دائم. أدخل كلمة مرور المدير العام الحالية للتأكيد.', currentPassword: 'كلمة مرور المدير العام الحالية', deleteConfirm: 'حذف المدير نهائيًا', rolesTitle: 'أدوار الوصول', roleName: 'الاسم التقني', roleNameAr: 'الاسم العربي', description: 'الوصف', system: 'نظامي', custom: 'مخصص', adminsCount: 'عدد المدراء', permissions: 'الصلاحيات', create: 'إنشاء', noRoles: 'لا توجد أدوار بعد.', scopeLabel: 'حسب النطاق المعيّن', limited: 'الوصول مقيّد بالدور والنطاق', dataError: 'تعذر تحميل بيانات الإدارة.', apiLabel: 'بيئة الإنتاج', welcome: 'Cliver Medical Student', tagline: 'Study smart...Not study hard', profile: 'المشغّل الحالي', language: 'English', initialNote: 'تم إنشاء المدير. شارك كلمة المرور الأولية عبر قناة آمنة، وذكّره بتغييرها عند أول دخول.', darkMode: 'الوضع الليلي', lightMode: 'الوضع النهاري', toggleTheme: 'تبديل المظهر', heroLine1: 'قرار أكاديمي', heroLine2: 'بوضوح سريري.', heroBody: 'راجع الصلاحيات قبل نشر التغيير. هذه قناة التشغيل المؤسسية للتعليم الطبي.', securityNote: 'لا تُحفظ بيانات الدخول في المتصفح. ينتهي الوصول عند تسجيل الخروج.', statsLoading: 'جارٍ تحميل المؤشرات…', statsError: 'تعذّر تحميل المؤشرات.', statStudents: 'إجمالي الطلاب', statActiveToday: 'نشط اليوم', statQuestions: 'الأسئلة المنشورة', statCodes: 'أكواد نشطة', statSubs: 'اشتراكات فعّالة', statFiles: 'ملفات المكتبة', statExams: 'اختبارات منشورة', statReports: 'بلاغات معلّقة', statRevenue: 'إيراد الشهر', welcomeShort: 'مرحبًا بك', welcomeAdmin: 'لوحة المشغّل', welcomeBody: 'لا تتوفر مؤشرات تشغيلية لهذا الحساب. تواصل مع المدير العام لترقية الصلاحيات أو لربط نطاق أكاديمي.'
      }
    : {
        title: 'CMS Administration Console', loginTitle: 'CMS Administration Console', loginDescription: 'Welcome to the accountable administration area for a secure, interactive student and faculty environment.', signIn: 'Receive your access rights', email: 'Email address', password: 'Password', systemReady: 'Administration channel secured', overview: 'Command center', admins: 'Administrators', roles: 'Roles & permissions', signOut: 'Sign out', connected: 'System connected', command: 'Welcome to the workshop that produces the newest and most suitable learning tools for students.', commandSub: 'Review access before publishing a change, then manage within your academic scope.', adminList: 'Administrator directory', addAdmin: 'Add administrator', addRole: 'Create role', search: 'Search name, email or phone', clear: 'Clear filters', active: 'Active', disabled: 'Disabled', all: 'All', role: 'Role', scope: 'Academic scope', status: 'Status', lastLogin: 'Last login', created: 'Created', actions: 'Actions', edit: 'Edit', reset: 'Reset password', delete: 'Permanent delete', view: 'View details', deactivate: 'Disable account', activate: 'Enable account', noAdmins: 'No matching administrators.', newAdmin: 'Add administrator', updateAdmin: 'Edit administrator', fullName: 'Full name', phone: 'Phone (optional)', save: 'Save changes', cancel: 'Cancel', initialPassword: 'Initial password', passwordReminder: 'Remind this administrator to change the initial password at first sign-in; do not block their console.', resetTitle: 'Reset password', newPassword: 'New password', deleteTitle: 'Confirm permanent deletion', deleteText: 'This action is permanent. Enter the current super-administrator password to confirm.', currentPassword: 'Current super-administrator password', deleteConfirm: 'Delete administrator permanently', rolesTitle: 'Access roles', roleName: 'Technical name', roleNameAr: 'Arabic name', description: 'Description', system: 'System', custom: 'Custom', adminsCount: 'Administrators', permissions: 'Permissions', create: 'Create', noRoles: 'No roles available yet.', scopeLabel: 'By assigned scope', limited: 'Access is limited by your role and academic scope', dataError: 'Could not load administration data.', apiLabel: 'Production environment', welcome: 'Cliver Medical Student', tagline: 'Study smart...Not study hard', profile: 'Current operator', language: 'العربية', initialNote: 'Administrator created. Share the initial password through a secure channel and remind them to change it on first sign-in.', darkMode: 'Dark mode', lightMode: 'Light mode', toggleTheme: 'Toggle theme', heroLine1: 'Academic decisions,', heroLine2: 'clinical clarity.', heroBody: 'Review access before publishing a change. This is the institutional operations channel for medical education.', securityNote: 'Credentials are not stored in the browser. Access ends when you sign out.', statsLoading: 'Loading metrics…', statsError: 'Could not load metrics.', statStudents: 'Total students', statActiveToday: 'Active today', statQuestions: 'Published questions', statCodes: 'Active codes', statSubs: 'Active subscriptions', statFiles: 'Library files', statExams: 'Published exams', statReports: 'Pending reports', statRevenue: 'Monthly revenue', welcomeShort: 'Welcome', welcomeAdmin: 'Operator console', welcomeBody: 'No operational metrics are available for this account. Contact the super-administrator to upgrade your scope or assign an academic range.'
      };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const savedUser = sessionStorage.getItem('cms-admin-user');
    const savedToken = sessionStorage.getItem('cms-admin-token');
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser) as AdminUser);
        setToken(savedToken);
      } catch {
        sessionStorage.removeItem('cms-admin-user');
        sessionStorage.removeItem('cms-admin-token');
      }
    }
  }, []);

  const notify = (message: string) => toast.success(message);
  const reportError = (message: string) => toast.error(message);

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }

  const scopeText = (admin: AdminRecord) => {
    if (admin.roleName === 'super_admin') return isArabic ? 'المنصة بالكامل' : 'Entire platform';
    if (admin.scopeSubjectId) return isArabic ? 'مادة محددة' : 'Specific subject';
    if (admin.scopeYearId) return isArabic ? 'سنة محددة' : 'Specific year';
    if (admin.scopeCollegeId) return isArabic ? 'كلية محددة' : 'Specific college';
    if (admin.scopeUniversityId) return isArabic ? 'جامعة محددة' : 'Specific university';
    return isArabic ? 'غير محدد' : 'Unassigned';
  };

  const fetchManagementData = async () => {
    if (!token || !isSuperAdmin) return;
    setLoadingData(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (query.trim()) params.set('search', query.trim());
      if (roleFilter) params.set('roleId', roleFilter);
      if (statusFilter !== 'all') params.set('isActive', String(statusFilter === 'active'));
      const [adminResult, roleResult] = await Promise.all([
        apiRequest<PagedResult<AdminRecord>>(`/api/v1/admin/admins?${params.toString()}`, token),
        apiRequest<RoleRecord[]>('/api/v1/admin/roles', token),
      ]);
      setAdmins(adminResult.items);
      setTotalAdmins(adminResult.total);
      setRoles(roleResult);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) signOut();
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchManagementData(); }, 250);
    return () => window.clearTimeout(timer);
    // Filters intentionally drive server-side search results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperAdmin, query, roleFilter, statusFilter]);

  const selectedRole = useMemo(() => roles.find((role) => role.id === adminForm.roleId), [roles, adminForm.roleId]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError('');
    setBusy(true);
    try {
      const result = await login(email, password);
      sessionStorage.setItem('cms-admin-user', JSON.stringify(result.user));
      sessionStorage.setItem('cms-admin-token', result.accessToken);
      setUser(result.user);
      setToken(result.accessToken);
      setView(result.user.role === 'super_admin' ? 'admins' : 'overview');
      setPassword('');
      toast.success(isArabic ? `أهلًا ${result.user.fullName}` : `Welcome, ${result.user.fullName}`);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'تعذر التحقق من بيانات الدخول.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem('cms-admin-user');
    sessionStorage.removeItem('cms-admin-token');
    setUser(null);
    setToken('');
    setAdmins([]);
    setRoles([]);
    setDialog(null);
    setMobileNavOpen(false);
  }

  function openCreateAdmin() {
    setAdminForm({ ...initialAdminForm, roleId: roles.find((role) => role.isActive)?.id ?? '' });
    setDialog({ kind: 'create-admin' });
  }

  function openEditAdmin(admin: AdminRecord) {
    setAdminForm({ fullName: admin.fullName, email: admin.email, password: '', phone: admin.phone ?? '', roleId: admin.roleId });
    setDialog({ kind: 'edit-admin', admin });
  }

  async function submitAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !dialog || !adminForm.roleId) return;
    setBusy(true);
    try {
      const payload = {
        fullName: adminForm.fullName,
        email: adminForm.email,
        phone: adminForm.phone || null,
        roleId: adminForm.roleId,
        scopeUniversityId: null,
        scopeCollegeId: null,
        scopeYearId: null,
        scopeSubjectId: null,
        ...(dialog.kind === 'create-admin' ? { password: adminForm.password } : {}),
      };
      if (dialog.kind === 'create-admin') {
        await apiRequest<AdminRecord>('/api/v1/admin/admins', token, { method: 'POST', body: JSON.stringify(payload) });
        notify(copy.initialNote);
      } else if (dialog.kind === 'edit-admin') {
        await apiRequest<AdminRecord>(`/api/v1/admin/admins/${dialog.admin.id}`, token, { method: 'PUT', body: JSON.stringify(payload) });
        notify(isArabic ? 'تم حفظ بيانات المدير.' : 'Administrator details saved.');
      }
      setDialog(null);
      await fetchManagementData();
    } catch (error) {
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setBusy(false);
    }
  }

  async function setAccountStatus(admin: AdminRecord, isActive: boolean) {
    if (!token) return;
    const prompt = isActive ? copy.activate : copy.deactivate;
    if (!window.confirm(`${prompt}: ${admin.fullName}?`)) return;
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/admins/${admin.id}/status`, token, { method: 'POST', body: JSON.stringify({ isActive }) });
      notify(isActive ? (isArabic ? 'تم تفعيل الحساب.' : 'Account enabled.') : (isArabic ? 'تم تعطيل الحساب وإبطال جلساته.' : 'Account disabled and sessions revoked.'));
      await fetchManagementData();
    } catch (error) {
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setBusy(false);
    }
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || dialog?.kind !== 'reset-password') return;
    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get('newPassword') ?? '');
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/admins/${dialog.admin.id}/reset-password`, token, { method: 'POST', body: JSON.stringify({ newPassword }) });
      notify(isArabic ? 'تمت إعادة تعيين كلمة المرور وإبطال الجلسات.' : 'Password reset and live sessions revoked.');
      setDialog(null);
    } catch (error) {
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setBusy(false);
    }
  }

  async function submitDeleteAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || dialog?.kind !== 'delete-admin') return;
    const formData = new FormData(event.currentTarget);
    const currentSuperAdminPassword = String(formData.get('currentSuperAdminPassword') ?? '');
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/admins/${dialog.admin.id}`, token, { method: 'DELETE', body: JSON.stringify({ currentSuperAdminPassword }) });
      notify(isArabic ? 'تم الحذف النهائي للمدير.' : 'Administrator permanently deleted.');
      setDialog(null);
      await fetchManagementData();
    } catch (error) {
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setBusy(false);
    }
  }

  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      await apiRequest<RoleRecord>('/api/v1/admin/roles', token, { method: 'POST', body: JSON.stringify(roleForm) });
      notify(isArabic ? 'تم إنشاء الدور فارغًا. أضف الصلاحيات قبل تعيينه.' : 'Role created empty. Add permissions before assigning it.');
      setDialog(null);
      setRoleForm({ name: '', nameAr: '', description: '' });
      await fetchManagementData();
    } catch (error) {
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setBusy(false);
    }
  }

  async function setRoleStatus(role: RoleRecord, isActive: boolean) {
    if (!token || !window.confirm(`${isActive ? copy.activate : copy.deactivate}: ${role.nameAr}?`)) return;
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/roles/${role.id}/status`, token, { method: 'POST', body: JSON.stringify({ isActive }) });
      notify(isActive ? (isArabic ? 'تم تفعيل الدور.' : 'Role enabled.') : (isArabic ? 'تم تعطيل الدور وإبطال جلسات المدراء المعيّنين.' : 'Role disabled and assigned sessions revoked.'));
      await fetchManagementData();
    } catch (error) {
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role: RoleRecord) {
    if (!token || !window.confirm(`${copy.delete}: ${role.nameAr}?`)) return;
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/roles/${role.id}`, token, { method: 'DELETE' });
      notify(isArabic ? 'تم حذف الدور.' : 'Role deleted.');
      await fetchManagementData();
    } catch (error) {
      reportError(error instanceof Error ? error.message : copy.dataError);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <main className="login-shell" dir={isArabic ? 'rtl' : 'ltr'}>
        <motion.section
          className="login-hero"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="hero-content">
            <img src={BRAND_MARK} alt="CMS" />
            <h1>{isArabic ? <>{copy.heroLine1}<br />{copy.heroLine2}</> : <>{copy.heroLine1}<br />{copy.heroLine2}</>}</h1>
            <p>{copy.heroBody}</p>
            <div className="trust-strip"><i />{copy.systemReady}</div>
          </div>
        </motion.section>
        <motion.section
          className="login-form-side"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
        >
          <div className="login-form">
            <button
              type="button"
              onClick={() => setLocale(isArabic ? 'en' : 'ar')}
              aria-label={copy.language}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--c-text-muted)', fontSize: '0.78rem', fontWeight: 600, padding: 0, margin: '0 0 16px', cursor: 'pointer' }}
            >
              <Languages size={16} />{copy.language}
            </button>
            <img src={FULL_LOGO} alt={copy.welcome} style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }} />
            <span style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 6 }}>{copy.apiLabel} / A-01</span>
            <h2>{copy.loginTitle}</h2>
            <p className="login-desc">{copy.loginDescription}</p>
            <form onSubmit={signIn}>
              <label>{copy.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="admin@university.edu" /></label>
              <label>{copy.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="••••••••••••" /></label>
              {loginError && <p className="login-error"><CircleAlert size={16} />{loginError}</p>}
              <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowUpRight size={18} />}{copy.signIn}</button>
            </form>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24, color: 'var(--c-text-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>
              <ShieldCheck size={16} style={{ flexShrink: 0 }} />
              <span>{copy.securityNote}</span>
            </div>
          </div>
        </motion.section>
        <Toaster richColors position="top-center" />
      </main>
    );
  }

  const navItems: Array<{ key: View; label: string; icon: typeof LayoutDashboard; superOnly?: boolean }> = [
    { key: 'overview', label: copy.overview, icon: LayoutDashboard },
    { key: 'students', label: isArabic ? 'الطلاب' : 'Students', icon: UsersRound },
    { key: 'academic', label: isArabic ? 'البنية الأكاديمية' : 'Academic structure', icon: Building2 },
    { key: 'questions', label: isArabic ? 'بنك الأسئلة' : 'Question bank', icon: BookOpenCheck },
    { key: 'exams', label: isArabic ? 'إدارة الاختبارات' : 'Exam management', icon: ClipboardCheck },
    { key: 'library', label: isArabic ? 'مركز المكتبة' : 'Library', icon: FileText },
    { key: 'codes', label: isArabic ? 'رموز الوصول' : 'Access codes', icon: KeyRound },
    { key: 'admins', label: copy.admins, icon: UsersRound, superOnly: true },
    { key: 'roles', label: copy.roles, icon: KeyRound, superOnly: true },
  ];
  const isManagementView = view === 'admins' || view === 'roles';
  const viewTitle = view === 'admins' ? copy.adminList : view === 'roles' ? copy.rolesTitle : view === 'students' ? (isArabic ? 'إدارة الطلاب' : 'Student management') : view === 'academic' ? (isArabic ? 'البنية الأكاديمية' : 'Academic structure') : view === 'questions' ? (isArabic ? 'بنك الأسئلة' : 'Question bank') : view === 'exams' ? (isArabic ? 'إدارة الاختبارات' : 'Exam management') : view === 'library' ? (isArabic ? 'مركز المكتبة' : 'Library') : view === 'codes' ? (isArabic ? 'رموز الوصول' : 'Access codes') : copy.overview;

  return (
    <main className="admin-shell" dir={isArabic ? 'rtl' : 'ltr'}>
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="side-brand">
          <img src={BRAND_MARK} alt="CMS" />
          <span>CMS <i>CONTROL</i></span>
          <button className="menu-toggle" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} style={{ display: mobileNavOpen ? 'flex' : 'none', marginInlineStart: 'auto', background: 'transparent', border: 'none', color: '#fff' }}>
            <X size={20} />
          </button>
        </div>
        <nav>
          {navItems
            .filter((item) => !item.superOnly || isSuperAdmin)
            .map((item) => (
              <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => { setView(item.key); setMobileNavOpen(false); }}>
                <item.icon size={19} />
                {item.label}
                {view === item.key && <b />}
              </button>
            ))}
        </nav>
        <div className="side-bottom">
          <div className="operator">
            <div>{user.fullName?.[0] ?? 'C'}</div>
            <span>
              <strong>{user.fullName}</strong>
              <small>{user.role}</small>
            </span>
          </div>
          <button className="sign-out" onClick={toggleTheme} aria-label={copy.toggleTheme}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            {theme === 'light' ? copy.darkMode : copy.lightMode}
          </button>
          <button className="sign-out" onClick={signOut}>
            <LogOut size={17} />{copy.signOut}
          </button>
        </div>
      </aside>
      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <section className="workspace">
        <header className="topbar">
          <button className="menu-toggle" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
            <Menu />
          </button>
          <div>
            <p className="eyebrow">{isArabic ? 'مركز العمليات' : 'OPERATIONS CENTER'}</p>
            <h1>{viewTitle}</h1>
          </div>
          <div className="top-actions">
            <button className="language-switch" onClick={() => setLocale(isArabic ? 'en' : 'ar')}>
              <Languages size={16} />{copy.language}
            </button>
            <button className="notify" aria-label={copy.toggleTheme} onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button className="notify" aria-label="Notifications">
              <Bell size={19} />
              <b>0</b>
            </button>
            <div className="live"><i />{copy.connected}</div>
          </div>
        </header>
        <div className="content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'overview' && <Overview copy={copy} isArabic={isArabic} isSuperAdmin={isSuperAdmin} token={token} onNavigate={setView} />}
              {view === 'students' && <StudentsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />}
              {view === 'academic' && <AcademicCenter token={token} isSuperAdmin={isSuperAdmin} isArabic={isArabic} onError={reportError} onNotice={notify} />}
              {view === 'questions' && <QuestionsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />}
              {view === 'exams' && <ExamsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />}
              {view === 'library' && <LibraryCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />}
              {view === 'codes' && <CodesCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />}
              {view === 'admins' && isSuperAdmin && (
                <AdminsView
                  copy={copy}
                  isArabic={isArabic}
                  admins={admins}
                  roles={roles}
                  total={totalAdmins}
                  query={query}
                  roleFilter={roleFilter}
                  statusFilter={statusFilter}
                  busy={busy}
                  loading={loadingData}
                  scopeText={scopeText}
                  setQuery={setQuery}
                  setRoleFilter={setRoleFilter}
                  setStatusFilter={setStatusFilter}
                  clearFilters={() => { setQuery(''); setRoleFilter(''); setStatusFilter('all'); }}
                  onCreate={openCreateAdmin}
                  onEdit={openEditAdmin}
                  onReset={(admin) => setDialog({ kind: 'reset-password', admin })}
                  onDelete={(admin) => setDialog({ kind: 'delete-admin', admin })}
                  onStatus={setAccountStatus}
                />
              )}
              {view === 'roles' && isSuperAdmin && (
                <RolesView
                  copy={copy}
                  isArabic={isArabic}
                  roles={roles}
                  busy={busy}
                  loading={loadingData}
                  onCreate={() => setDialog({ kind: 'create-role' })}
                  onStatus={setRoleStatus}
                  onDelete={deleteRole}
                />
              )}
              {isManagementView && !isSuperAdmin && (
                <section className="access-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 24px', textAlign: 'center', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)' }}>
                  <ShieldOff size={28} style={{ color: 'var(--c-text-muted)' }} />
                  <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--c-text)' }}>{isArabic ? 'الوصول غير متاح' : 'Access unavailable'}</h2>
                  <p style={{ margin: 0, color: 'var(--c-text-muted)', fontSize: '0.875rem' }}>{copy.limited}</p>
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
      {dialog && (
        <DialogLayer
          copy={copy}
          isArabic={isArabic}
          dialog={dialog}
          roles={roles}
          adminForm={adminForm}
          selectedRole={selectedRole}
          roleForm={roleForm}
          busy={busy}
          onClose={() => !busy && setDialog(null)}
          onAdminForm={setAdminForm}
          onRoleForm={setRoleForm}
          onSubmitAdmin={submitAdmin}
          onSubmitReset={submitResetPassword}
          onSubmitDelete={submitDeleteAdmin}
          onSubmitRole={submitRole}
        />
      )}
      <Toaster richColors position="top-center" />
    </main>
  );
}

type OverviewProps = { copy: Record<string, string>; isArabic: boolean; isSuperAdmin: boolean; token: string; onNavigate: (view: View) => void };

function Overview({ copy, isArabic, isSuperAdmin, token, onNavigate }: OverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!token || !isSuperAdmin) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiRequest<DashboardStats>('/api/v1/admin/dashboard', token)
      .then((result) => {
        if (cancelled) return;
        setStats(result);
        setUpdatedAt(new Date());
      })
      .catch((error) => {
        if (cancelled) return;
        setFailed(true);
        toast.error(error instanceof Error ? error.message : copy.statsError);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperAdmin]);

  const localeTag = isArabic ? 'ar' : 'en';
  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeStyle: 'short' }).format(updatedAt)
    : '—';

  if (!isSuperAdmin) {
    return (
      <>
        <section className="overview-hero" style={{ backgroundImage: `linear-gradient(135deg, rgba(13,27,42,0.92), rgba(27,45,63,0.96)), url(${OPERATIONS_IMAGE})` }}>
          <div className="hero-content">
            <h2>{copy.welcomeAdmin}</h2>
            <p>{copy.welcomeBody}</p>
          </div>
        </section>
        <section className="stat-grid">
          {([
            { key: 'students' as View, label: isArabic ? 'إدارة الطلاب' : 'Student management', tint: 'rgba(33,150,243,0.12)', icon: UsersRound },
            { key: 'questions' as View, label: isArabic ? 'بنك الأسئلة' : 'Question bank', tint: 'rgba(0,188,212,0.12)', icon: BookOpenCheck },
            { key: 'library' as View, label: isArabic ? 'مركز المكتبة' : 'Library center', tint: 'rgba(255,179,0,0.12)', icon: FileText },
            { key: 'exams' as View, label: isArabic ? 'الاختبارات' : 'Exam management', tint: 'rgba(25,118,210,0.12)', icon: ClipboardCheck },
          ]).map((card) => (
            <article key={card.key} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate(card.key)}>
              <div className="stat-icon" style={{ background: card.tint, color: 'var(--c-text)' }}>
                <card.icon size={20} />
              </div>
              <div className="stat-label">{card.label}</div>
              <div className="stat-value" style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--c-text-soft)' }}>{isArabic ? 'افتح المركز' : 'Open center'}</div>
            </article>
          ))}
        </section>
      </>
    );
  }

  const cards: Array<{ label: string; value: string; tint: string; icon: typeof Activity }> = [
    { label: copy.statStudents, value: stats ? String(stats.totalStudents) : '—', tint: 'rgba(33,150,243,0.12)', icon: UsersRound },
    { label: copy.statActiveToday, value: stats ? String(stats.activeStudentsToday) : '—', tint: 'rgba(0,188,212,0.12)', icon: Activity },
    { label: copy.statQuestions, value: stats ? String(stats.totalQuestions) : '—', tint: 'rgba(25,118,210,0.12)', icon: BookOpenCheck },
    { label: copy.statCodes, value: stats ? String(stats.totalActiveCodes) : '—', tint: 'rgba(0,172,193,0.12)', icon: KeyRound },
    { label: copy.statSubs, value: stats ? String(stats.totalActiveSubscriptions) : '—', tint: 'rgba(0,200,83,0.12)', icon: ClipboardCheck },
    { label: copy.statFiles, value: stats ? String(stats.totalLibraryFiles) : '—', tint: 'rgba(255,179,0,0.12)', icon: FileText },
    { label: copy.statExams, value: stats ? String(stats.totalExams) : '—', tint: 'rgba(25,118,210,0.12)', icon: ClipboardCheck },
    { label: copy.statReports, value: stats ? String(stats.pendingReports) : '—', tint: 'rgba(255,82,82,0.12)', icon: CircleAlert },
  ];

  const quickActions: Array<{ key: View; label: string; icon: typeof Activity }> = [
    { key: 'admins', label: isArabic ? 'قائمة المدراء' : 'Administrator directory', icon: UsersRound },
    { key: 'students', label: isArabic ? 'إدارة الطلاب' : 'Student management', icon: UsersRound },
    { key: 'questions', label: isArabic ? 'بنك الأسئلة' : 'Question bank', icon: BookOpenCheck },
    { key: 'codes', label: isArabic ? 'رموز الوصول' : 'Access codes', icon: KeyRound },
  ];

  return (
    <>
      <section className="overview-hero" style={{ backgroundImage: `linear-gradient(135deg, rgba(13,27,42,0.92), rgba(27,45,63,0.96)), url(${OPERATIONS_IMAGE})` }}>
        <div className="hero-content">
          <h2>{copy.command}</h2>
          <p>{copy.commandSub}</p>
        </div>
      </section>
      <section className="stat-grid">
        {loading ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px', color: 'var(--c-text-muted)', fontSize: '0.875rem' }}>
            <LoaderCircle className="spin" size={20} />{copy.statsLoading}
          </div>
        ) : failed && !stats ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px', color: 'var(--c-text-muted)', fontSize: '0.875rem' }}>{copy.statsError}</div>
        ) : (
          cards.map((card) => (
            <article key={card.label} className="stat-card">
              <div className="stat-icon" style={{ background: card.tint, color: 'var(--c-text)' }}>
                <card.icon size={20} />
              </div>
              <div className="stat-label">{card.label}</div>
              <div className="stat-value">{card.value}</div>
            </article>
          ))
        )}
      </section>
      <section style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {quickActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => onNavigate(action.key)}
            className="stat-card"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'start', cursor: 'pointer', border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}
          >
            <span className="stat-icon" style={{ background: 'rgba(33,150,243,0.12)', color: 'var(--c-primary-700)', margin: 0, width: 36, height: 36 }}>
              <action.icon size={18} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--c-text)' }}>{action.label}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isArabic ? 'افتح' : 'Open'}</span>
            </span>
          </button>
        ))}
      </section>
      <p style={{ marginTop: 16, fontSize: '0.72rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {isArabic ? 'آخر تحديث' : 'Last updated'}: {updatedLabel}
      </p>
    </>
  );
}

function AdminsView(props: {
  copy: Record<string, string>; isArabic: boolean; admins: AdminRecord[]; roles: RoleRecord[]; total: number; query: string; roleFilter: string; statusFilter: string; busy: boolean; loading: boolean; scopeText: (admin: AdminRecord) => string; setQuery: (value: string) => void; setRoleFilter: (value: string) => void; setStatusFilter: (value: string) => void; clearFilters: () => void; onCreate: () => void; onEdit: (admin: AdminRecord) => void; onReset: (admin: AdminRecord) => void; onDelete: (admin: AdminRecord) => void; onStatus: (admin: AdminRecord, active: boolean) => void;
}) {
  const { copy, isArabic, admins, roles, total, query, roleFilter, statusFilter, busy, loading, scopeText, setQuery, setRoleFilter, setStatusFilter, clearFilters, onCreate, onEdit, onReset, onDelete, onStatus } = props;
  const filtersActive = Boolean(query || roleFilter || statusFilter !== 'all');
  return (
    <section className="directory-panel">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{isArabic ? 'الإدارة المركزية' : 'CENTRAL ADMINISTRATION'}</p>
          <h2>{copy.adminList}<small>{total}</small></h2>
        </div>
        <button className="primary-action" onClick={onCreate}><Plus size={18} />{copy.addAdmin}</button>
      </div>
      <div className="filters">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} /></label>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="">{copy.role}: {copy.all}</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{isArabic ? role.nameAr : role.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">{copy.status}: {copy.all}</option>
          <option value="active">{copy.active}</option>
          <option value="disabled">{copy.disabled}</option>
        </select>
        {filtersActive && <button className="clear-filter" onClick={clearFilters}><X size={15} />{copy.clear}</button>}
      </div>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{isArabic ? 'المدير' : 'Administrator'}</th>
              <th>{copy.role}</th>
              <th>{copy.scope}</th>
              <th>{copy.status}</th>
              <th>{copy.lastLogin}</th>
              <th>{copy.created}</th>
              <th><span className="sr-only">{copy.actions}</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل السجل…' : 'Loading directory…'}</div></td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={7}><div className="table-empty"><UsersRound size={22} /><strong>{copy.noAdmins}</strong>{filtersActive && <button onClick={clearFilters}>{copy.clear}</button>}</div></td></tr>
            ) : admins.map((admin) => (
              <tr key={admin.id}>
                <td>
                  <div className="identity">
                    <div className="avatar">{admin.fullName[0]}</div>
                    <span>
                      <strong>{admin.fullName}</strong>
                      <small>{admin.email}</small>
                      {admin.phone && <small>{admin.phone}</small>}
                    </span>
                  </div>
                </td>
                <td><span className="role-tag">{isArabic ? admin.roleNameAr : admin.roleName}</span></td>
                <td>{scopeText(admin)}</td>
                <td><span className={`status-chip ${admin.status === 'active' ? 'active' : 'disabled'}`}>{admin.status === 'active' ? copy.active : copy.disabled}</span></td>
                <td>{admin.lastLogin ? new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(admin.lastLogin)) : '—'}</td>
                <td>{new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(admin.createdAt))}</td>
                <td>
                  <div className="row-actions">
                    <button title={copy.view} onClick={() => onEdit(admin)}><Eye size={16} /></button>
                    <button title={copy.edit} onClick={() => onEdit(admin)}><Edit3 size={16} /></button>
                    <button title={copy.reset} onClick={() => onReset(admin)}><KeyRound size={16} /></button>
                    <button title={admin.status === 'active' ? copy.deactivate : copy.activate} disabled={busy} onClick={() => onStatus(admin, admin.status !== 'active')}>
                      {admin.status === 'active' ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                    </button>
                    <button className="danger" title={copy.delete} onClick={() => onDelete(admin)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RolesView({ copy, isArabic, roles, busy, loading, onCreate, onStatus, onDelete }: { copy: Record<string, string>; isArabic: boolean; roles: RoleRecord[]; busy: boolean; loading: boolean; onCreate: () => void; onStatus: (role: RoleRecord, active: boolean) => void; onDelete: (role: RoleRecord) => void }) {
  return (
    <section className="roles-panel">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{isArabic ? 'سياسة الوصول' : 'ACCESS POLICY'}</p>
          <h2>{copy.rolesTitle}</h2>
        </div>
        <button className="primary-action" onClick={onCreate}><Plus size={18} />{copy.addRole}</button>
      </div>
      <div className="role-grid">
        {loading ? (
          <div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل الأدوار…' : 'Loading roles…'}</div>
        ) : roles.length === 0 ? (
          <div className="table-empty"><KeyRound size={22} /><strong>{copy.noRoles}</strong></div>
        ) : roles.map((role) => (
          <article key={role.id} className={`role-card ${role.isActive ? '' : 'is-disabled'}`}>
            <div className="role-card-top">
              <span className={`role-state ${role.isActive ? 'active' : 'disabled'}`}>{role.isActive ? copy.active : copy.disabled}</span>
              <span className="role-badge">{role.isSystem ? copy.system : copy.custom}</span>
            </div>
            <h3>{isArabic ? role.nameAr : role.name}</h3>
            <code>{role.name}</code>
            <p>{role.description || (isArabic ? 'دور بلا وصف إضافي.' : 'Role without an additional description.')}</p>
            <div className="role-metrics">
              <span><strong>{role.adminCount}</strong>{copy.adminsCount}</span>
              <span><strong>{role.permissionCount}</strong>{copy.permissions}</span>
            </div>
            <div className="role-actions">
              <button onClick={() => onStatus(role, !role.isActive)} disabled={busy || role.name === 'super_admin'}>
                {role.isActive ? <><ShieldOff size={15} />{copy.deactivate}</> : <><ShieldCheck size={15} />{copy.activate}</>}
              </button>
              {!role.isSystem && <button className="danger" onClick={() => onDelete(role)} disabled={busy}><Trash2 size={15} />{copy.delete}</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DialogLayer(props: { copy: Record<string, string>; isArabic: boolean; dialog: ActiveDialog; roles: RoleRecord[]; adminForm: typeof initialAdminForm; selectedRole?: RoleRecord; roleForm: { name: string; nameAr: string; description: string }; busy: boolean; onClose: () => void; onAdminForm: (form: typeof initialAdminForm) => void; onRoleForm: (form: { name: string; nameAr: string; description: string }) => void; onSubmitAdmin: (event: FormEvent<HTMLFormElement>) => void; onSubmitReset: (event: FormEvent<HTMLFormElement>) => void; onSubmitDelete: (event: FormEvent<HTMLFormElement>) => void; onSubmitRole: (event: FormEvent<HTMLFormElement>) => void }) {
  const { copy, isArabic, dialog, roles, adminForm, selectedRole, roleForm, busy, onClose, onAdminForm, onRoleForm, onSubmitAdmin, onSubmitReset, onSubmitDelete, onSubmitRole } = props;
  const title = dialog.kind === 'create-admin' ? copy.newAdmin : dialog.kind === 'edit-admin' ? copy.updateAdmin : dialog.kind === 'reset-password' ? copy.resetTitle : dialog.kind === 'delete-admin' ? copy.deleteTitle : copy.addRole;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <span className="eyebrow">{isArabic ? 'إجراء إداري' : 'ADMINISTRATIVE ACTION'}</span>
            <h2>{title}</h2>
          </div>
          <button aria-label="Close dialog" onClick={onClose} disabled={busy}><X /></button>
        </div>
        {(dialog.kind === 'create-admin' || dialog.kind === 'edit-admin') && (
          <form onSubmit={onSubmitAdmin} className="dialog-form">
            <label>{copy.fullName}<input required value={adminForm.fullName} onChange={(event) => onAdminForm({ ...adminForm, fullName: event.target.value })} /></label>
            <label>{copy.email}<input required type="email" value={adminForm.email} onChange={(event) => onAdminForm({ ...adminForm, email: event.target.value })} /></label>
            <label>{copy.phone}<input value={adminForm.phone} onChange={(event) => onAdminForm({ ...adminForm, phone: event.target.value })} /></label>
            <label>{copy.role}<select required value={adminForm.roleId} onChange={(event) => onAdminForm({ ...adminForm, roleId: event.target.value })}>{roles.filter((role) => role.isActive).map((role) => <option key={role.id} value={role.id}>{isArabic ? role.nameAr : role.name}</option>)}</select></label>
            {dialog.kind === 'create-admin' && (
              <label className="span-all">
                {copy.initialPassword}
                <input required minLength={12} type="password" value={adminForm.password} onChange={(event) => onAdminForm({ ...adminForm, password: event.target.value })} />
                <small>{copy.passwordReminder}</small>
              </label>
            )}
            {selectedRole && selectedRole.name !== 'super_admin' && (
              <p className="scope-note"><LockKeyhole size={16} />{copy.scopeLabel}: {isArabic ? 'سيتم تحديد النطاق الأكاديمي من صفحة التعديل المتقدمة عند ربط دليل الجامعة.' : 'Academic scope will be selected in the extended edit view after the academic directory is connected.'}</p>
            )}
            <div className="dialog-actions">
              <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>{copy.cancel}</button>
              <button type="submit" className="primary-action" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{copy.save}</button>
            </div>
          </form>
        )}
        {dialog.kind === 'reset-password' && (
          <form onSubmit={onSubmitReset} className="dialog-form">
            <p className="dialog-copy">{isArabic ? `سيتم إبطال جميع جلسات ${dialog.admin.fullName} فورًا.` : `All ${dialog.admin.fullName}'s live sessions will be invalidated immediately.`}</p>
            <label>{copy.newPassword}<input required name="newPassword" minLength={12} type="password" autoComplete="new-password" /></label>
            <div className="dialog-actions">
              <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>{copy.cancel}</button>
              <button type="submit" className="primary-action" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{copy.reset}</button>
            </div>
          </form>
        )}
        {dialog.kind === 'delete-admin' && (
          <form onSubmit={onSubmitDelete} className="dialog-form danger-form">
            <p className="dialog-copy">{copy.deleteText}</p>
            <p className="target-name">{dialog.admin.fullName}<span>{dialog.admin.email}</span></p>
            <label>{copy.currentPassword}<input required name="currentSuperAdminPassword" type="password" autoComplete="current-password" /></label>
            <div className="dialog-actions">
              <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>{copy.cancel}</button>
              <button type="submit" className="danger-action" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{copy.deleteConfirm}</button>
            </div>
          </form>
        )}
        {dialog.kind === 'create-role' && (
          <form onSubmit={onSubmitRole} className="dialog-form">
            <label>{copy.roleName}<input required value={roleForm.name} pattern="[A-Za-z0-9_]{3,50}" onChange={(event) => onRoleForm({ ...roleForm, name: event.target.value })} placeholder="content_reviewer" /><small>{isArabic ? 'أحرف وأرقام وشرطة سفلية فقط، من 3 إلى 50 رمزًا.' : 'Letters, numbers and underscores only; 3–50 characters.'}</small></label>
            <label>{copy.roleNameAr}<input required value={roleForm.nameAr} onChange={(event) => onRoleForm({ ...roleForm, nameAr: event.target.value })} /></label>
            <label className="span-all">{copy.description}<textarea value={roleForm.description} onChange={(event) => onRoleForm({ ...roleForm, description: event.target.value })} rows={3} /></label>
            <p className="scope-note"><KeyRound size={16} />{isArabic ? 'ينشأ الدور بلا صلاحيات. أضف الصلاحيات قبل تعيينه لأي مدير.' : 'The role begins with no permissions. Add grants before assigning it.'}</p>
            <div className="dialog-actions">
              <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>{copy.cancel}</button>
              <button type="submit" className="primary-action" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{copy.create}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export default App;
