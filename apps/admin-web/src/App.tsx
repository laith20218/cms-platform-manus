/** غرفة القيادة المؤسسية: navy authority, ivory work surface, teal clinical signal.
 *  Navigation grouped by domain; status indicator verifies API health;
 *  skeleton loading + trend chips on the overview dashboard. */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CircleAlert,
  FileText,
  KeyRound,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  ShieldOff,
  Sun,
  UsersRound,
  X,
} from 'lucide-react';
import { API_BASE_URL, apiRequest, ApiError, type AdminRecord, type AdminUser, type PagedResult, type RoleRecord, login } from './lib/api';
import { AcademicCenter } from './components/AcademicCenter';
import { AdminsCenter, DialogLayer } from './components/AdminsCenter';
import { AuditCenter } from './components/AuditCenter';
import { CodesCenter } from './components/CodesCenter';
import { ReportsCenter } from './components/ReportsCenter';
import { RolesCenter } from './components/RolesCenter';
import { StudentsCenter } from './components/StudentsCenter';
import { QuestionsCenter } from './components/QuestionsCenter';
import { ExamsCenter } from './components/ExamsCenter';
import { LibraryCenter } from './components/LibraryCenter';
import { SettingsCenter } from './components/SettingsCenter';

const BRAND_MARK = '/brand/cms-admin-mark.png';
const FULL_LOGO = '/brand/cms-cliver-medical-student-logo.jpg';
const OPERATIONS_IMAGE = '/brand/cms-admin-login-hero.jpg';

type Locale = 'ar' | 'en';
type Theme = 'light' | 'dark';
type View = 'admins' | 'roles' | 'audit' | 'overview' | 'academic' | 'codes' | 'students' | 'questions' | 'exams' | 'library' | 'reports' | 'settings';
type Dialog =
  | { kind: 'create-admin' }
  | { kind: 'edit-admin'; admin: AdminRecord }
  | { kind: 'reset-password'; admin: AdminRecord }
  | { kind: 'delete-admin'; admin: AdminRecord }
  | { kind: 'create-role' }
  | null;
type ApiStatus = 'healthy' | 'degraded' | 'unknown';
type Trend = 'up' | 'down' | 'flat' | 'none';

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

const initialAdminForm = {
  fullName: '', email: '', password: '', phone: '', roleId: '',
  // P1-04: academic scope fields (cascading selectors)
  scopeUniversityId: '', scopeCollegeId: '', scopeYearId: '', scopeSubjectId: '',
};

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('cms-admin-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
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
  const [apiStatus, setApiStatus] = useState<ApiStatus>('unknown');

  const isSuperAdmin = user?.role === 'super_admin';
  const isArabic = locale === 'ar';

  const copy = isArabic
    ? {
        title: 'لوحة تحكم منصة CMS', loginTitle: 'دخول إلى لوحة الإدارة', loginDescription: 'أدر المحتوى والاختبارات والصلاحيات ضمن نطاقك الأكاديمي.', signIn: 'دخول آمن', email: 'البريد الإلكتروني', password: 'كلمة المرور', systemReady: 'قناة الإدارة مؤمّنة', overview: 'لوحة القيادة', admins: 'المدراء', roles: 'الأدوار والصلاحيات', signOut: 'تسجيل الخروج', connected: 'الخدمة تعمل', command: 'مركز القيادة المؤسسي لإدارة المنصة الأكاديمية.', commandSub: 'راجع الصلاحيات قبل نشر التغيير، ثم تابع الإدارة ضمن نطاقك الأكاديمي.', adminList: 'قائمة المدراء', addAdmin: 'إضافة مدير', addRole: 'إنشاء دور', search: 'ابحث بالاسم أو البريد أو الهاتف', clear: 'إزالة التصفية', active: 'مفعّل', disabled: 'معطّل', all: 'الكل', role: 'الدور', scope: 'النطاق الأكاديمي', status: 'الحالة', lastLogin: 'آخر دخول', created: 'تاريخ الإنشاء', actions: 'إجراءات', edit: 'تعديل', reset: 'إعادة تعيين كلمة المرور', delete: 'حذف نهائي', view: 'عرض التفاصيل', deactivate: 'تعطيل الحساب', activate: 'تفعيل الحساب', noAdmins: 'لا توجد نتائج مطابقة.', newAdmin: 'إضافة مدير جديد', updateAdmin: 'تعديل بيانات المدير', fullName: 'الاسم الكامل', phone: 'رقم الهاتف (اختياري)', save: 'حفظ التغيير', cancel: 'إلغاء', initialPassword: 'كلمة المرور الأولية', passwordReminder: 'يجب تذكير المدير بتغيير كلمة المرور الأولية عند الدخول، دون حجب اللوحة.', resetTitle: 'إعادة تعيين كلمة المرور', newPassword: 'كلمة المرور الجديدة', deleteTitle: 'تأكيد الحذف النهائي', deleteText: 'هذا الإجراء دائم. أدخل كلمة مرور المدير العام الحالية للتأكيد.', currentPassword: 'كلمة مرور المدير العام الحالية', deleteConfirm: 'حذف المدير نهائيًا', rolesTitle: 'أدوار الوصول', roleName: 'الاسم التقني', roleNameAr: 'الاسم العربي', description: 'الوصف', system: 'نظامي', custom: 'مخصص', adminsCount: 'عدد المدراء', permissions: 'الصلاحيات', create: 'إنشاء', noRoles: 'لا توجد أدوار بعد.', scopeLabel: 'حسب النطاق المعيّن', limited: 'الوصول مقيّد بالدور والنطاق', dataError: 'تعذر تحميل بيانات الإدارة.', apiLabel: 'بيئة الإنتاج', welcome: 'Cliver Medical Student', tagline: 'Study smart...Not study hard', profile: 'المشغّل الحالي', language: 'English', initialNote: 'تم إنشاء المدير. شارك كلمة المرور الأولية عبر قناة آمنة، وذكّره بتغييرها عند أول دخول.', darkMode: 'الوضع الليلي', lightMode: 'الوضع النهاري', toggleTheme: 'تبديل المظهر', heroLine1: 'إدارة أكاديمية', heroLine2: 'بدقة مؤسسية.', heroBody: 'راجع الصلاحيات قبل نشر أي تغيير. هذه قناة التشغيل المؤسسية للتعليم الطبي.', securityNote: 'لا تُحفظ بيانات الدخول في المتصفح. ينتهي الوصول عند تسجيل الخروج.', statsLoading: 'جارٍ تحميل المؤشرات…', statsError: 'تعذّر تحميل المؤشرات.', statStudents: 'إجمالي الطلاب', statActiveToday: 'نشط اليوم', statQuestions: 'الأسئلة المنشورة', statCodes: 'أكواد نشطة', statSubs: 'اشتراكات فعّالة', statFiles: 'ملفات المكتبة', statExams: 'اختبارات منشورة', statReports: 'بلاغات معلّقة', statRevenue: 'إيراد الشهر', welcomeShort: 'مرحبًا بك', welcomeAdmin: 'لوحة المشغّل', welcomeBody: 'لا تتوفر مؤشرات تشغيلية لهذا الحساب. تواصل مع المدير العام لترقية الصلاحيات أو لربط نطاق أكاديمي.'
      }
    : {
        title: 'CMS Administration Console', loginTitle: 'Sign in to the administration console', loginDescription: 'Manage content, exams, and permissions within your academic scope.', signIn: 'Secure sign in', email: 'Email address', password: 'Password', systemReady: 'Administration channel secured', overview: 'Command center', admins: 'Administrators', roles: 'Roles & permissions', signOut: 'Sign out', connected: 'Operational', command: 'Institutional command center for academic platform management.', commandSub: 'Review access before publishing a change, then manage within your academic scope.', adminList: 'Administrator directory', addAdmin: 'Add administrator', addRole: 'Create role', search: 'Search name, email or phone', clear: 'Clear filters', active: 'Active', disabled: 'Disabled', all: 'All', role: 'Role', scope: 'Academic scope', status: 'Status', lastLogin: 'Last login', created: 'Created', actions: 'Actions', edit: 'Edit', reset: 'Reset password', delete: 'Permanent delete', view: 'View details', deactivate: 'Disable account', activate: 'Enable account', noAdmins: 'No matching administrators.', newAdmin: 'Add administrator', updateAdmin: 'Edit administrator', fullName: 'Full name', phone: 'Phone (optional)', save: 'Save changes', cancel: 'Cancel', initialPassword: 'Initial password', passwordReminder: 'Remind this administrator to change the initial password at first sign-in; do not block their console.', resetTitle: 'Reset password', newPassword: 'New password', deleteTitle: 'Confirm permanent deletion', deleteText: 'This action is permanent. Enter the current super-administrator password to confirm.', currentPassword: 'Current super-administrator password', deleteConfirm: 'Delete administrator permanently', rolesTitle: 'Access roles', roleName: 'Technical name', roleNameAr: 'Arabic name', description: 'Description', system: 'System', custom: 'Custom', adminsCount: 'Administrators', permissions: 'Permissions', create: 'Create', noRoles: 'No roles available yet.', scopeLabel: 'By assigned scope', limited: 'Access is limited by your role and academic scope', dataError: 'Could not load administration data.', apiLabel: 'Production environment', welcome: 'Cliver Medical Student', tagline: 'Study smart...Not study hard', profile: 'Current operator', language: 'العربية', initialNote: 'Administrator created. Share the initial password through a secure channel and remind them to change it on first sign-in.', darkMode: 'Dark mode', lightMode: 'Light mode', toggleTheme: 'Toggle theme', heroLine1: 'Academic operations,', heroLine2: 'institutional precision.', heroBody: 'Review access before publishing any change. This is the institutional operations channel for medical education.', securityNote: 'Credentials are not stored in the browser. Access ends when you sign out.', statsLoading: 'Loading metrics…', statsError: 'Could not load metrics.', statStudents: 'Total students', statActiveToday: 'Active today', statQuestions: 'Published questions', statCodes: 'Active codes', statSubs: 'Active subscriptions', statFiles: 'Library files', statExams: 'Published exams', statReports: 'Pending reports', statRevenue: 'Monthly revenue', welcomeShort: 'Welcome', welcomeAdmin: 'Operator console', welcomeBody: 'No operational metrics are available for this account. Contact the super-administrator to upgrade your scope or assign an academic range.'
      };

  // Apply theme to <html data-theme="…">.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Restore session on first load (credentials never persisted across sessions).
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

  // Truthful service-health probe (replaces the always-green "live" pill).
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/health`)
      .then((response) => { if (!cancelled) setApiStatus(response.ok ? 'healthy' : 'degraded'); })
      .catch(() => { if (!cancelled) setApiStatus('degraded'); });
    return () => { cancelled = true; };
  }, []);

  // Persist sidebar collapse state to localStorage.
  useEffect(() => {
    try { localStorage.setItem('cms-admin-sidebar-collapsed', String(sidebarCollapsed)); } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  // Keyboard shortcut: Ctrl/Cmd + K opens command palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setOperatorMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Fetch real unread notification count when authenticated.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiRequest<{ count: number }>('/api/v1/notifications/unread-count', token)
      .then((data) => { if (!cancelled && typeof data?.count === 'number') setUnreadCount(data.count); })
      .catch(() => { /* silent — notifications are non-critical */ });
    return () => { cancelled = true; };
  }, [token]);

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
    setAdminForm({
      fullName: admin.fullName, email: admin.email, password: '', phone: admin.phone ?? '', roleId: admin.roleId,
      // P1-04: load existing scope from admin record
      scopeUniversityId: admin.scopeUniversityId ?? '',
      scopeCollegeId: admin.scopeCollegeId ?? '',
      scopeYearId: admin.scopeYearId ?? '',
      scopeSubjectId: admin.scopeSubjectId ?? '',
    });
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
        // P1-04: pass actual scope from adminForm (was always null before)
        scopeUniversityId: adminForm.scopeUniversityId || null,
        scopeCollegeId: adminForm.scopeCollegeId || null,
        scopeYearId: adminForm.scopeYearId || null,
        scopeSubjectId: adminForm.scopeSubjectId || null,
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
            <h1>{copy.heroLine1}<br />{copy.heroLine2}</h1>
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--cms-text-muted)', fontSize: 'var(--cms-text-2xs)', fontWeight: 600, padding: 0, margin: '0 0 var(--cms-space-4)', cursor: 'pointer' }}
            >
              <Languages size={16} />{copy.language}
            </button>
            <img src={FULL_LOGO} alt={copy.welcome} style={{ width: 56, height: 56, borderRadius: 'var(--cms-radius-md)', objectFit: 'cover', marginBottom: 'var(--cms-space-5)', boxShadow: 'var(--cms-shadow-sm)' }} />
            <span style={{ display: 'block', fontSize: 'var(--cms-text-2xs)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cms-text-muted)', fontWeight: 600, marginBottom: 'var(--cms-space-2)' }}>{copy.apiLabel} / A-01</span>
            <h2>{copy.loginTitle}</h2>
            <p className="login-desc">{copy.loginDescription}</p>
            <form onSubmit={signIn}>
              <label>{copy.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="admin@university.edu" /></label>
              <label>{copy.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="••••••••••••" /></label>
              {loginError && <p className="login-error"><CircleAlert size={16} />{loginError}</p>}
              <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowUpRight size={18} />}{copy.signIn}</button>
            </form>
            <div className="login-meta">
              <ShieldCheck size={16} style={{ flexShrink: 0 }} />
              <span>{copy.securityNote}</span>
            </div>
          </div>
        </motion.section>
        <Toaster richColors position="top-center" />
      </main>
    );
  }

  type NavItem = { key: View; label: string; icon: typeof LayoutDashboard; superOnly?: boolean };
  const navGroups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: isArabic ? 'التشغيل اليومي' : 'Daily Operations',
      items: [
        { key: 'overview', label: copy.overview, icon: LayoutDashboard },
      ],
    },
    {
      label: isArabic ? 'المحتوى الأكاديمي' : 'Academic Content',
      items: [
        { key: 'academic', label: isArabic ? 'البنية الأكاديمية' : 'Academic Structure', icon: Building2 },
        { key: 'questions', label: isArabic ? 'بنك الأسئلة' : 'Question Bank', icon: BookOpenCheck },
        { key: 'exams', label: isArabic ? 'الاختبارات' : 'Exams', icon: ClipboardCheck },
        { key: 'library', label: isArabic ? 'المكتبة والملفات' : 'Library & Files', icon: FileText },
      ],
    },
    {
      label: isArabic ? 'المستخدمون والوصول' : 'Users & Access',
      items: [
        { key: 'students', label: isArabic ? 'الطلاب' : 'Students', icon: UsersRound },
        { key: 'codes', label: isArabic ? 'رموز الوصول' : 'Access Codes', icon: KeyRound },
      ],
    },
    {
      label: isArabic ? 'القياس والتدقيق' : 'Measurement & Audit',
      items: [
        { key: 'reports', label: isArabic ? 'التقارير والتحليلات' : 'Reports & Analytics', icon: BarChart3, superOnly: true },
        { key: 'admins', label: copy.admins, icon: UsersRound, superOnly: true },
        { key: 'roles', label: copy.roles, icon: KeyRound, superOnly: true },
        { key: 'audit', label: isArabic ? 'السجل الأمني' : 'Security Audit', icon: ShieldCheck, superOnly: true },
        { key: 'settings', label: isArabic ? 'إعدادات النظام' : 'System Settings', icon: Settings, superOnly: true },
      ],
    },
  ];

  const isManagementView = view === 'admins' || view === 'roles' || view === 'audit' || view === 'reports' || view === 'settings';
  const viewTitle = view === 'admins' ? copy.adminList
    : view === 'roles' ? copy.rolesTitle
    : view === 'audit' ? (isArabic ? 'السجل الأمني' : 'Security Audit')
    : view === 'reports' ? (isArabic ? 'التقارير والتحليلات' : 'Reports & Analytics')
    : view === 'settings' ? (isArabic ? 'إعدادات النظام' : 'System Settings')
    : view === 'students' ? (isArabic ? 'الطلاب' : 'Students')
    : view === 'academic' ? (isArabic ? 'البنية الأكاديمية' : 'Academic Structure')
    : view === 'questions' ? (isArabic ? 'بنك الأسئلة' : 'Question Bank')
    : view === 'exams' ? (isArabic ? 'الاختبارات' : 'Exams')
    : view === 'library' ? (isArabic ? 'المكتبة والملفات' : 'Library & Files')
    : view === 'codes' ? (isArabic ? 'رموز الوصول' : 'Access Codes')
    : copy.overview;
  const statusLabel = apiStatus === 'healthy' ? (isArabic ? 'الخدمة تعمل' : 'Operational')
    : apiStatus === 'degraded' ? (isArabic ? 'أداء متدنٍ' : 'Degraded')
    : (isArabic ? 'غير متحقق' : 'Unknown');
  const SepIcon = isArabic ? ChevronRight : ChevronLeft;

  return (
    <main className="admin-shell" dir={isArabic ? 'rtl' : 'ltr'}>
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="side-brand">
          <img src={BRAND_MARK} alt="CMS" />
          {!sidebarCollapsed && <span>CMS <i>CONTROL</i></span>}
          <button className="menu-close" aria-label={isArabic ? 'إغلاق القائمة' : 'Close navigation'} onClick={() => setMobileNavOpen(false)} style={{ display: mobileNavOpen ? 'flex' : 'none' }}>
            <X size={20} />
          </button>
        </div>
        <nav>
          {navGroups.map((group) => {
            const visible = group.items.filter((item) => !item.superOnly || isSuperAdmin);
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="nav-group">
                {!sidebarCollapsed && <div className="nav-group-label">{group.label}</div>}
                {visible.map((item) => (
                  <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => { setView(item.key); setMobileNavOpen(false); }} title={sidebarCollapsed ? item.label : undefined}>
                    <item.icon size={19} />
                    {!sidebarCollapsed && item.label}
                    {!sidebarCollapsed && view === item.key && <b />}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="side-bottom">
          <div className="operator" onClick={() => setOperatorMenuOpen(!operatorMenuOpen)} style={{ cursor: 'pointer' }}>
            <div>{user.fullName?.[0] ?? 'C'}</div>
            {!sidebarCollapsed && (
              <span>
                <strong>{user.fullName}</strong>
                <small>{user.role}</small>
              </span>
            )}
          </div>
          {operatorMenuOpen && (
            <div className="operator-menu" style={{ position: 'absolute', bottom: '100%', insetInlineStart: 0, right: 0, background: 'var(--cms-ink-800)', borderRadius: 'var(--cms-radius-md)', boxShadow: 'var(--cms-shadow-lg)', padding: '4px', margin: '4px', zIndex: 100 }}>
              <button className="side-action" onClick={toggleTheme} aria-label={copy.toggleTheme}>
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                {theme === 'light' ? copy.darkMode : copy.lightMode}
              </button>
              <button className="side-action danger" onClick={signOut}>
                <LogOut size={17} />{copy.signOut}
              </button>
            </div>
          )}
          {!operatorMenuOpen && !sidebarCollapsed && (
            <>
              <button className="side-action" onClick={toggleTheme} aria-label={copy.toggleTheme}>
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                {theme === 'light' ? copy.darkMode : copy.lightMode}
              </button>
              <button className="side-action danger" onClick={signOut}>
                <LogOut size={17} />{copy.signOut}
              </button>
            </>
          )}
        </div>
      </aside>
      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <section className={`workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="topbar">
          <button className="menu-toggle" aria-label={isArabic ? 'فتح القائمة' : 'Open navigation'} onClick={() => setMobileNavOpen(true)}>
            <Menu />
          </button>
          <button className="menu-toggle collapse-toggle" aria-label={isArabic ? 'طي القائمة' : 'Toggle sidebar'} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ display: 'flex' }}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="breadcrumb">
            <span className="crumb">{isArabic ? 'الإدارة' : 'Admin'}</span>
            <SepIcon className="sep" size={14} />
            <span className="crumb">{viewTitle}</span>
          </div>
          <div className="top-actions">
            <button className="lang-btn" onClick={() => setCommandPaletteOpen(true)} aria-label={isArabic ? 'بحث سريع' : 'Command palette'} title="Ctrl+K">
              <Search size={15} />
              <span style={{ fontSize: '11px', opacity: 0.6 }}>⌘K</span>
            </button>
            <div className={`status-indicator ${apiStatus === 'healthy' ? '' : apiStatus === 'degraded' ? 'degraded' : 'unknown'}`} title={statusLabel}>
              <span className="dot" />
              {statusLabel}
            </div>
            <button className="lang-btn" onClick={() => setLocale(isArabic ? 'en' : 'ar')} aria-label={copy.toggleTheme}>
              <Languages size={16} />{copy.language}
            </button>
            <button className="icon-btn" aria-label={copy.toggleTheme} onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button className="icon-btn" aria-label={isArabic ? 'التنبيهات' : 'Notifications'}>
              <Bell size={19} />
              {unreadCount > 0 && <span className="dot">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
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
                <AdminsCenter
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
                <RolesCenter
                  copy={copy}
                  isArabic={isArabic}
                  token={token}
                  roles={roles}
                  busy={busy}
                  loading={loadingData}
                  onCreate={() => setDialog({ kind: 'create-role' })}
                  onStatus={setRoleStatus}
                  onDelete={deleteRole}
                  onError={reportError}
                  onNotice={notify}
                />
              )}
              {view === 'audit' && isSuperAdmin && (
                <AuditCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
              )}
              {view === 'reports' && isSuperAdmin && (
                <ReportsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
              )}
              {view === 'settings' && isSuperAdmin && (
                <SettingsCenter token={token} isArabic={isArabic} isSuperAdmin={isSuperAdmin} onError={reportError} onNotice={notify} />
              )}
              {isManagementView && !isSuperAdmin && (
                <section className="notice" role="status">
                  <ShieldOff size={20} />
                  <span>{copy.limited}</span>
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
          token={token}
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
      {commandPaletteOpen && (
        <div className="sidebar-backdrop" style={{ zIndex: 60 }} onClick={() => setCommandPaletteOpen(false)} />
      )}
      {commandPaletteOpen && (
        <div style={{ position: 'fixed', top: '20%', insetInlineStart: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '480px', background: 'var(--cms-surface)', borderRadius: 'var(--cms-radius-lg)', boxShadow: 'var(--cms-shadow-xl)', zIndex: 70, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--cms-line)' }}>
            <Search size={18} style={{ color: 'var(--cms-text-muted)' }} />
            <input
              type="text"
              autoFocus
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              placeholder={isArabic ? 'ابحث في القائمة...' : 'Search navigation...'}
              style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--cms-text)', fontSize: '14px', outline: 'none' }}
            />
            <kbd style={{ fontSize: '10px', color: 'var(--cms-text-muted)', border: '1px solid var(--cms-line)', borderRadius: '4px', padding: '2px 6px' }}>ESC</kbd>
          </div>
          <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '4px' }}>
            {navGroups.flatMap((group) => group.items.filter((item) => !item.superOnly || isSuperAdmin))
              .filter((item) => {
                if (!commandQuery) return true;
                const q = commandQuery.toLowerCase();
                return item.key.toLowerCase().includes(q) || item.label.toLowerCase().includes(q);
              })
              .map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setView(item.key); setCommandPaletteOpen(false); setCommandQuery(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: 'var(--cms-radius-sm)', background: view === item.key ? 'var(--cms-teal-50)' : 'transparent', color: view === item.key ? 'var(--cms-teal-700)' : 'var(--cms-text)', fontSize: '14px', fontWeight: 500, textAlign: 'start', cursor: 'pointer' }}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              ))}
            {commandQuery && navGroups.flatMap((g) => g.items).filter((item) => (!item.superOnly || isSuperAdmin) && (item.key.toLowerCase().includes(commandQuery.toLowerCase()) || item.label.toLowerCase().includes(commandQuery.toLowerCase()))).length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--cms-text-muted)', fontSize: '13px' }}>{isArabic ? 'لا توجد نتائج' : 'No results'}</div>
            )}
          </div>
        </div>
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
        <section className="overview-hero" style={{ backgroundImage: `linear-gradient(135deg, rgba(8,26,38,0.92), rgba(16,47,69,0.96)), url(${OPERATIONS_IMAGE})` }}>
          <div className="hero-content">
            <h2>{copy.welcomeAdmin}</h2>
            <p>{copy.welcomeBody}</p>
          </div>
        </section>
        <section className="stat-grid">
          {([
            { key: 'students' as View, label: isArabic ? 'الطلاب' : 'Students', tint: 'rgba(18,135,125,0.12)', icon: UsersRound },
            { key: 'questions' as View, label: isArabic ? 'بنك الأسئلة' : 'Question Bank', tint: 'rgba(76,184,174,0.14)', icon: BookOpenCheck },
            { key: 'library' as View, label: isArabic ? 'المكتبة والملفات' : 'Library & Files', tint: 'rgba(163,108,31,0.12)', icon: FileText },
            { key: 'exams' as View, label: isArabic ? 'الاختبارات' : 'Exams', tint: 'rgba(53,113,138,0.12)', icon: ClipboardCheck },
          ]).map((card) => (
            <article key={card.key} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate(card.key)}>
              <div className="stat-icon" style={{ background: card.tint, color: 'var(--cms-teal-700)' }}>
                <card.icon size={20} />
              </div>
              <div className="stat-label">{card.label}</div>
              <div className="stat-value" style={{ fontSize: 'var(--cms-text-sm)', fontWeight: 500, color: 'var(--cms-text-soft)' }}>{isArabic ? 'افتح المركز' : 'Open center'}</div>
            </article>
          ))}
        </section>
      </>
    );
  }

  const cards: Array<{ label: string; value: string; tint: string; iconColor: string; icon: typeof Activity; trend: Trend; trendLabel: string }> = [
    { label: copy.statStudents, value: stats ? String(stats.totalStudents) : '—', tint: 'rgba(18,135,125,0.12)', iconColor: 'var(--cms-teal-700)', icon: UsersRound, trend: 'none', trendLabel: '—' },
    { label: copy.statActiveToday, value: stats ? String(stats.activeStudentsToday) : '—', tint: 'rgba(76,184,174,0.14)', iconColor: 'var(--cms-teal-600)', icon: Activity, trend: 'none', trendLabel: '—' },
    { label: copy.statQuestions, value: stats ? String(stats.totalQuestions) : '—', tint: 'rgba(53,113,138,0.12)', iconColor: 'var(--cms-info)', icon: BookOpenCheck, trend: 'none', trendLabel: '—' },
    { label: copy.statCodes, value: stats ? String(stats.totalActiveCodes) : '—', tint: 'rgba(18,135,125,0.10)', iconColor: 'var(--cms-teal-700)', icon: KeyRound, trend: 'none', trendLabel: '—' },
    { label: copy.statSubs, value: stats ? String(stats.totalActiveSubscriptions) : '—', tint: 'rgba(25,133,102,0.12)', iconColor: 'var(--cms-success)', icon: ClipboardCheck, trend: 'none', trendLabel: '—' },
    { label: copy.statFiles, value: stats ? String(stats.totalLibraryFiles) : '—', tint: 'rgba(163,108,31,0.12)', iconColor: 'var(--cms-warning)', icon: FileText, trend: 'none', trendLabel: '—' },
    { label: copy.statExams, value: stats ? String(stats.totalExams) : '—', tint: 'rgba(53,113,138,0.14)', iconColor: 'var(--cms-info)', icon: ClipboardCheck, trend: 'none', trendLabel: '—' },
    { label: copy.statReports, value: stats ? String(stats.pendingReports) : '—', tint: 'rgba(182,71,61,0.12)', iconColor: 'var(--cms-danger)', icon: CircleAlert, trend: 'none', trendLabel: '—' },
  ];

  // Monthly revenue uses the real change-percent from the API; other metrics show a flat placeholder.
  const revenueTrend: Trend = stats && stats.revenueChangePercent > 0 ? 'up' : stats && stats.revenueChangePercent < 0 ? 'down' : 'flat';
  const revenueTrendLabel = stats ? `${stats.revenueChangePercent > 0 ? '+' : ''}${stats.revenueChangePercent.toFixed(1)}%` : '—';
  cards.push({
    label: copy.statRevenue,
    value: stats ? new Intl.NumberFormat(localeTag, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(stats.monthlyRevenue) : '—',
    tint: 'rgba(25,133,102,0.12)',
    iconColor: 'var(--cms-success)',
    icon: Activity,
    trend: revenueTrend,
    trendLabel: revenueTrendLabel,
  });

  const quickActions: Array<{ key: View; label: string; icon: typeof Activity }> = [
    { key: 'admins', label: isArabic ? 'قائمة المدراء' : 'Administrator directory', icon: UsersRound },
    { key: 'students', label: isArabic ? 'الطلاب' : 'Students', icon: UsersRound },
    { key: 'questions', label: isArabic ? 'بنك الأسئلة' : 'Question Bank', icon: BookOpenCheck },
    { key: 'codes', label: isArabic ? 'رموز الوصول' : 'Access Codes', icon: KeyRound },
  ];

  const TrendIcon = ({ trend }: { trend: Trend }) => {
    if (trend === 'up') return <ArrowUpRight size={12} />;
    if (trend === 'down') return <ArrowDownRight size={12} />;
    if (trend === 'flat') return <Minus size={12} />;
    return null;
  };

  return (
    <>
      <section className="overview-hero" style={{ backgroundImage: `linear-gradient(135deg, rgba(8,26,38,0.92), rgba(16,47,69,0.96)), url(${OPERATIONS_IMAGE})` }}>
        <div className="hero-content">
          <h2>{copy.command}</h2>
          <p>{copy.commandSub}</p>
        </div>
      </section>

      {failed && !stats && (
        <div className="error-banner" role="alert">
          <CircleAlert size={18} />
          <span>{copy.statsError}</span>
        </div>
      )}

      <section className="stat-grid">
        {loading ? (
          Array.from({ length: 9 }).map((_, idx) => (
            <article key={idx} className="stat-card" aria-hidden="true">
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 'var(--cms-radius-sm)', marginBottom: 'var(--cms-space-3)' }} />
              <div className="skeleton skeleton-text sm" style={{ height: 11, textTransform: 'uppercase' }} />
              <div className="skeleton skeleton-text lg" style={{ height: 24 }} />
              <div className="skeleton skeleton-text sm" style={{ height: 10, width: '40%' }} />
            </article>
          ))
        ) : !stats && failed ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--cms-space-12)', color: 'var(--cms-text-muted)', fontSize: 'var(--cms-text-sm)' }}>
            <CircleAlert size={28} style={{ marginBottom: 'var(--cms-space-3)', opacity: 0.5 }} />
            <div>{copy.statsError}</div>
          </div>
        ) : (
          cards.map((card) => (
            <article key={card.label} className="stat-card">
              <div className="stat-icon" style={{ background: card.tint, color: card.iconColor }}>
                <card.icon size={20} />
              </div>
              <div className="stat-label">{card.label}</div>
              <div className="stat-value">{card.value}</div>
              {card.trend !== 'none' && (
                <div className={`stat-trend ${card.trend}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <TrendIcon trend={card.trend} />
                  {card.trendLabel}
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <section style={{ marginTop: 'var(--cms-space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--cms-space-4)' }}>
        {quickActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => onNavigate(action.key)}
            className="stat-card"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--cms-space-3)', textAlign: 'start', cursor: 'pointer', border: '1px solid var(--cms-line)', background: 'var(--cms-surface)' }}
          >
            <span className="stat-icon" style={{ background: 'rgba(18,135,125,0.10)', color: 'var(--cms-teal-700)', margin: 0, width: 36, height: 36 }}>
              <action.icon size={18} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 'var(--cms-text-sm)', fontWeight: 600, color: 'var(--cms-text)' }}>{action.label}</span>
              <span style={{ fontSize: 'var(--cms-text-2xs)', color: 'var(--cms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isArabic ? 'افتح' : 'Open'}</span>
            </span>
          </button>
        ))}
      </section>

      <p style={{ marginTop: 'var(--cms-space-4)', fontSize: 'var(--cms-text-2xs)', color: 'var(--cms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {isArabic ? 'آخر تحديث' : 'Last updated'}: {updatedLabel}
      </p>
    </>
  );
}

export default App;
