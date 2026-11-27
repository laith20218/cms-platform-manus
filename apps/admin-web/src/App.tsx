/** غرفة القيادة المؤسسية: navy authority, ivory work surface, teal clinical signal.
 *  Navigation grouped by domain; status indicator verifies API health;
 *  skeleton loading + trend chips on the overview dashboard. */
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell, History,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  CircleAlert,
  FileText,
  GraduationCap,
  KeyRound,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Minus,
  Moon,
  PackageX,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sun,
  UsersRound,
  X,
} from 'lucide-react';
import { API_BASE_URL, apiRequest, ApiError, type AdminRecord, type AdminUser, type PagedResult, type RoleRecord, login, refreshAccessToken } from './lib/api';
import { Breadcrumbs, ConfirmDialog, ErrorState } from '@cms/ui';
// PR-2 — command palette (ARIA combobox surface) + the real 404 view + URL query state.
import { CommandPalette, type CommandPaletteItem } from './components/CommandPalette';
import { NotFoundView } from './components/NotFoundView';
import { useQueryState, useClearQueryParams } from './lib/useQueryState';
// PR-3 — the shell copy and every remaining inline shell ternary now resolve
// through the shared dictionary (lib/dictionary → lib/shellCopy).
import { apiErrorHumanMessage, t, localeOf } from './lib/dictionary';
import { buildShellCopy } from './lib/shellCopy';
import { UiPermissionsProvider } from './hooks/useUiPermissions';
import { useUiPermissions } from './hooks/uiPermissionsContext';
import { useUiPermissionsBundle } from './hooks/useUiPermissionsBundle';
import { createCanFunction } from './lib/uiPermissions';
import { AcademicCenter } from './components/AcademicCenter';
import { AdminsCenter, DialogLayer } from './components/AdminsCenter';
import { TwoFactorCard } from './components/TwoFactorCard';
import { DashboardFeeds } from './components/DashboardFeeds';
import { ActivityMonitor } from './components/ActivityMonitor';
import { AuditCenter } from './components/AuditCenter';
import { SecurityCenter } from './components/SecurityCenter';
// PR-9 — read-only provider monitoring dashboard (super-only, rides view:audit).
import { ServersCenter } from './components/ServersCenter';
import { CodesCenter } from './components/CodesCenter';
// Wave 4 (Owner decision 2026-11-23) — offline package ledger visibility + revocation.
import { OfflineCenter } from './components/OfflineCenter';
import { ReportsCenter } from './components/ReportsCenter';
import { RolesCenter, RoleDeleteConflictBanner } from './components/RolesCenter';
import { StudentsCenter } from './components/StudentsCenter';
import { QuestionsCenter } from './components/QuestionsCenter';
import { ExamsCenter } from './components/ExamsCenter';
// W14.3 Phase C (D1): exam-course bundles screen. Cosmetically gated by the EXAM
// management keys — the backend reuses exam verbs for ExamCourse policies, so the
// UI-permission registry stays at v2 with zero drift (see ExamCoursesCenter header).
import { ExamCoursesCenter } from './components/ExamCoursesCenter';
import { LibraryCenter } from './components/LibraryCenter';
import { SettingsCenter } from './components/SettingsCenter';
// W16.5 — admin editor for the site content pages (Terms / Privacy / Contact).
import { ContentCenter } from './components/ContentCenter';
import { NotificationCompose } from './components/NotificationCompose';
import { SentNotificationsDialog } from './components/SentNotificationsDialog';

const BRAND_MARK = '/brand/cms-admin-mark.png';
const FULL_LOGO = '/brand/cms-cliver-medical-student-logo.jpg';
const OPERATIONS_IMAGE = '/brand/cms-admin-login-hero.jpg';

type Locale = 'ar' | 'en';
type Theme = 'light' | 'dark';
type View = 'admins' | 'roles' | 'audit' | 'overview' | 'academic' | 'codes' | 'students' | 'questions' | 'exams' | 'exam-courses' | 'library' | 'reports' | 'settings' | 'content' | 'offline' | 'security' | 'servers' | 'not-found';

// D-26 (Command Center P1) — every view is a real URL: browser back/forward
// and page refresh work, and views are directly shareable. BrowserRouter is
// already mounted in main.tsx and vercel.json rewrites every non-asset path
// to index.html, so no deploy change is needed.
// PR-2 — unknown paths now resolve to the dedicated 404 view (NotFoundView)
// instead of silently landing on the overview screen.
type RoutableView = Exclude<View, 'not-found'>;
const VIEW_PATHS: Record<RoutableView, string> = {
  overview: '/',
  admins: '/admins',
  roles: '/roles',
  audit: '/audit',
  academic: '/academic',
  codes: '/codes',
  students: '/students',
  questions: '/questions',
  exams: '/exams',
  'exam-courses': '/exam-courses',
  library: '/library',
  reports: '/reports',
  settings: '/settings',
  content: '/content',
  offline: '/offline',
  security: '/security',
  servers: '/servers',
};
const PATH_VIEWS = new Map<string, View>(
  (Object.entries(VIEW_PATHS) as [RoutableView, string][]).map(([view, path]) => [path, view]),
);

// PR-2 — admins-filter URL parameters (module constant: one list shared by
// the per-param hooks and the atomic clear below).
const ADMINS_FILTER_PARAMS = ['q', 'role', 'status'] as const;

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
  // PR-2 — 2FA login challenge: the backend answers TWO_FACTOR_REQUIRED after
  // the password is verified (AdminHandlers.HandleLoginAsync); the operator
  // then submits the authenticator code on the same form. 2FA is never
  // weakened — the step only appears when the backend demands it.
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  // D-26: view state is DERIVED from the URL (source of truth = location bar).
  // setView keeps the historical signature so nav items, the command palette,
  // cross-center navigation and the login redirect all work unchanged.
  const location = useLocation();
  const navigate = useNavigate();
  const view: View = PATH_VIEWS.get(location.pathname) ?? 'not-found';
  const setView = useCallback((next: View) => {
    // 'not-found' is derived state, never a navigation target.
    if (next === 'not-found') return;
    navigate(VIEW_PATHS[next]);
  }, [navigate]);
  // A view change is a fresh page arrival: start at the top (matches a reload).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('cms-admin-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [notificationComposeOpen, setNotificationComposeOpen] = useState(false);
  // W-coverage (row 26): sent notifications ledger + delivery stats (super-admin).
  const [sentNotificationsOpen, setSentNotificationsOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [totalAdmins, setTotalAdmins] = useState(0);
  const [loadingData, setLoadingData] = useState(false);
  // PR-2 — the admins-center filters live in the URL query string (?q=…&role=…&status=…)
  // so refresh, deep links, back/forward and shared links restore the exact list
  // state (same pattern as the W14.3 D4 academic context). Writes use history
  // replace; navigating to another view drops the params (fresh page arrival).
  const queryState = useQueryState('q', '');
  const roleState = useQueryState('role', '');
  const statusState = useQueryState('status', 'all', ['all', 'active', 'disabled']);
  const clearAdminsFilters = useClearQueryParams(ADMINS_FILTER_PARAMS);
  const query = queryState.value;
  const roleFilter = roleState.value;
  const statusFilter = statusState.value;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [adminForm, setAdminForm] = useState(initialAdminForm);
  const [roleForm, setRoleForm] = useState({ name: '', nameAr: '', description: '' });
  const [apiStatus, setApiStatus] = useState<ApiStatus>('unknown');

  const isSuperAdmin = user?.role === 'super_admin';
  const isArabic = locale === 'ar';

  // Push 3 / Track 3: the advanced UI permissions state. The hook is called
  // unconditionally (top of App) — can() fails open while loading/on error because
  // the cosmetic layer must never lock an administrator out (backend RBAC is the
  // real gate; see lib/uiPermissions.ts).
  const uiPermissionsState = useUiPermissionsBundle(token, isSuperAdmin);
  const can = createCanFunction(uiPermissionsState.phase === 'ready' ? uiPermissionsState.bundle : null);

  // PR-3 — the shell copy is built from the shared dictionary
  // (lib/dictionary → lib/shellCopy). The legacy inline bilingual ternary
  // (~120 keys × 2 locales) is gone; the byte-identity is pinned by
  // src/test/shell-copy.test.ts. Key names are unchanged so the copy-drilled
  // consumers (AdminsCenter, RolesCenter, DialogLayer, Overview, palette
  // labels) are untouched.
  const copy = useMemo(() => buildShellCopy(locale), [locale]);

  // Apply theme to <html data-theme="…">.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Restore session on first load (credentials never persisted across sessions).
  // FIX-1: Also restore refreshToken so we can refresh when accessToken expires.
  useEffect(() => {
    const savedUser = sessionStorage.getItem('cms-admin-user');
    const savedToken = sessionStorage.getItem('cms-admin-token');
    const savedRefresh = sessionStorage.getItem('cms-admin-refresh');
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser) as AdminUser);
        setToken(savedToken);
      } catch {
        sessionStorage.removeItem('cms-admin-user');
        sessionStorage.removeItem('cms-admin-token');
        sessionStorage.removeItem('cms-admin-refresh');
      }
    }
    // If we have a refreshToken but the accessToken might be expired,
    // try to refresh on load
    if (savedRefresh && savedToken) {
      refreshAccessToken(savedRefresh).then((newToken) => {
        if (newToken) {
          setToken(newToken);
          sessionStorage.setItem('cms-admin-token', newToken);
        }
      });
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

  // PR-2 — operator menu a11y: closes on outside interaction (pointerdown
  // outside the sidebar footer) and restores focus to the trigger when the
  // menu items unmount (Escape / outside click / post-action close).
  const operatorButtonRef = useRef<HTMLButtonElement | null>(null);
  const sideBottomRef = useRef<HTMLDivElement | null>(null);
  const operatorMenuWasOpenRef = useRef(false);

  useEffect(() => {
    if (!operatorMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const container = sideBottomRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) {
        setOperatorMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [operatorMenuOpen]);

  useEffect(() => {
    const wasOpen = operatorMenuWasOpenRef.current;
    operatorMenuWasOpenRef.current = operatorMenuOpen;
    if (wasOpen && !operatorMenuOpen) {
      const active = document.activeElement;
      const inFooter = active instanceof Node && sideBottomRef.current?.contains(active);
      if (!inFooter) operatorButtonRef.current?.focus();
    }
  }, [operatorMenuOpen]);

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
  // PR-7 — admin/role lifecycle failures resolve through the shared error-code
  // map (LAST_SUPER_ADMIN, SETTING_VALUE_INVALID, ROLE_DISABLED, ROLE_HAS_ADMINS, …)
  // so both locales render the bilingual mapping instead of the raw detail text.
  const reportApiError = (error: unknown) => reportError(apiErrorHumanMessage(error, locale).human);

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }

  const scopeText = (admin: AdminRecord) => {
    if (admin.roleName === 'super_admin') return t(locale, 'scope.entire');
    if (admin.scopeSubjectId) return t(locale, 'scope.subject');
    if (admin.scopeYearId) return t(locale, 'scope.year');
    if (admin.scopeCollegeId) return t(locale, 'scope.college');
    if (admin.scopeUniversityId) return t(locale, 'scope.university');
    return t(locale, 'scope.unassigned');
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
      // PR-2: on the 2FA step the code rides along; on the credentials step
      // it is omitted so the backend can demand the challenge when enabled.
      const result = await login(email, password, twoFactorRequired ? otp : undefined);
      sessionStorage.setItem('cms-admin-user', JSON.stringify(result.user));
      sessionStorage.setItem('cms-admin-token', result.accessToken);
      // FIX-1: Store refreshToken for session refresh
      sessionStorage.setItem('cms-admin-refresh', result.refreshToken);
      setUser(result.user);
      setToken(result.accessToken);
      setPassword('');
      setOtp('');
      setTwoFactorRequired(false);
      // PR-2 — post-login route restoration: the login screen renders over
      // the deep-linked URL, so after authentication the operator returns to
      // the intended location. Unauthorized deep links are still blocked by
      // the per-view can()/superOnly gates (LimitedNotice), and the backend
      // RBAC remains the real enforcement — this is navigation only.
      const intendedPath = location.pathname !== '/' ? location.pathname + location.search : '';
      if (intendedPath) navigate(intendedPath);
      else setView(result.user.role === 'super_admin' ? 'admins' : 'overview');
      toast.success(t(locale, 'shell.welcomeToast', { name: result.user.fullName }));
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'TWO_FACTOR_REQUIRED') {
        // Password accepted; the backend demands the 2FA challenge — advance
        // to the OTP step without surfacing an error.
        setTwoFactorRequired(true);
        setOtp('');
        setLoginError('');
      } else {
        setLoginError(error instanceof Error ? error.message : t(locale, 'login.errorGeneric'));
      }
    } finally {
      setBusy(false);
    }
  }

  /** PR-2 — leave the 2FA step and correct the credentials (wrong account). */
  function backToCredentials() {
    setTwoFactorRequired(false);
    setOtp('');
    setLoginError('');
  }

  // W4 (admin-ui): the last native window.confirm surfaces on admins/roles
  // (debt D-01/D-02) — replaced by the shared ConfirmDialog. Targets hold the
  // pending action; the request fires only on confirm.
  const [adminStatusTarget, setAdminStatusTarget] = useState<{ admin: AdminRecord; isActive: boolean } | null>(null);
  const [roleStatusTarget, setRoleStatusTarget] = useState<{ role: RoleRecord; isActive: boolean } | null>(null);
  const [roleDeleteTarget, setRoleDeleteTarget] = useState<RoleRecord | null>(null);
  // PR-7 — a refused role deletion keeps the confirm dialog open with an
  // INLINE conflict banner (ROLE_HAS_ADMINS carries the live admin count;
  // SYSTEM_ROLE_DELETE_FORBIDDEN and others resolve through the code map).
  const [roleDeleteFailure, setRoleDeleteFailure] = useState<{ errorCode?: string; human: string } | null>(null);

  function signOut() {
    sessionStorage.removeItem('cms-admin-user');
    sessionStorage.removeItem('cms-admin-token');
    sessionStorage.removeItem('cms-admin-refresh');
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
        notify(t(locale, 'admins.savedToast'));
      }
      setDialog(null);
      await fetchManagementData();
    } catch (error) {
      reportApiError(error);
    } finally {
      setBusy(false);
    }
  }

  async function setAccountStatus(admin: AdminRecord, isActive: boolean) {
    if (!token) return;
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/admins/${admin.id}/status`, token, { method: 'POST', body: JSON.stringify({ isActive }) });
      notify(isActive ? t(locale, 'admins.enabledToast') : t(locale, 'admins.disabledToast'));
      setAdminStatusTarget(null);
      await fetchManagementData();
    } catch (error) {
      reportApiError(error);
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
      notify(t(locale, 'admins.passwordResetToast'));
      setDialog(null);
    } catch (error) {
      reportApiError(error);
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
      notify(t(locale, 'admins.deletedToast'));
      setDialog(null);
      await fetchManagementData();
    } catch (error) {
      reportApiError(error);
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
      notify(t(locale, 'roles.createdEmptyToast'));
      setDialog(null);
      setRoleForm({ name: '', nameAr: '', description: '' });
      await fetchManagementData();
    } catch (error) {
      reportApiError(error);
    } finally {
      setBusy(false);
    }
  }

  async function setRoleStatus(role: RoleRecord, isActive: boolean) {
    if (!token) return;
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/roles/${role.id}/status`, token, { method: 'POST', body: JSON.stringify({ isActive }) });
      notify(isActive ? t(locale, 'roles.enabledToast') : t(locale, 'roles.disabledToast'));
      setRoleStatusTarget(null);
      await fetchManagementData();
    } catch (error) {
      reportApiError(error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role: RoleRecord) {
    if (!token) return;
    setBusy(true);
    try {
      await apiRequest<void>(`/api/v1/admin/roles/${role.id}`, token, { method: 'DELETE' });
      notify(t(locale, 'roles.deletedToast'));
      setRoleDeleteTarget(null);
      setRoleDeleteFailure(null);
      await fetchManagementData();
    } catch (error) {
      // PR-7 — the confirm dialog stays open with an INLINE conflict banner
      // (not only a toast): ROLE_HAS_ADMINS renders the live admin count;
      // SYSTEM_ROLE_DELETE_FORBIDDEN and other codes render the mapped message.
      const resolved = apiErrorHumanMessage(error, locale);
      const errorCode = (error as { errorCode?: string } | null | undefined)?.errorCode;
      setRoleDeleteFailure({ errorCode, human: resolved.human });
      reportError(resolved.human);
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
              {/* PR-2 — the password field hides during the 2FA step (its value is
                  retained for the re-submit); the OTP field takes its place. */}
              {!twoFactorRequired && (
                <label>{copy.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="••••••••••••" /></label>
              )}
              {twoFactorRequired && (
                <>
                  <label>{copy.otpLabel}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={8}
                      autoFocus
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/[^0-9]/g, ''))}
                      required
                      placeholder="••••••"
                      data-testid="two-factor-input"
                    />
                  </label>
                  <p className="login-meta" style={{ margin: '0 0 var(--cms-space-3)' }}>
                    <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                    <span>{copy.otpHint}</span>
                  </p>
                </>
              )}
              {loginError && <p className="login-error"><CircleAlert size={16} />{loginError}</p>}
              <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowUpRight size={18} />}{copy.signIn}</button>
              {twoFactorRequired && (
                <button
                  type="button"
                  onClick={backToCredentials}
                  disabled={busy}
                  data-testid="two-factor-back"
                  style={{ display: 'block', margin: 'var(--cms-space-2) auto 0', background: 'transparent', border: 'none', color: 'var(--cms-text-muted)', fontSize: 'var(--cms-text-2xs)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {copy.backToCredentials}
                </button>
              )}
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

  // gateKey: registry key consulted instead of `view:{key}` — used by views that
  // share another domain's registry entry (exam-courses rides view:exams, W14.3).
  type NavItem = { key: View; label: string; icon: typeof LayoutDashboard; superOnly?: boolean; gateKey?: string };
  const navGroups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: t(locale, 'navGroups.daily'),
      items: [
        { key: 'overview', label: copy.overview, icon: LayoutDashboard },
      ],
    },
    {
      label: t(locale, 'navGroups.content'),
      items: [
        { key: 'academic', label: t(locale, 'nav.academic'), icon: Building2 },
        { key: 'questions', label: t(locale, 'nav.questions'), icon: BookOpenCheck },
        { key: 'exams', label: t(locale, 'nav.exams'), icon: ClipboardCheck },
        { key: 'exam-courses', label: t(locale, 'nav.examCourses'), icon: GraduationCap, gateKey: 'view:exams' },
        { key: 'library', label: t(locale, 'nav.library'), icon: FileText },
      ],
    },
    {
      label: t(locale, 'navGroups.access'),
      items: [
        { key: 'students', label: t(locale, 'nav.students'), icon: UsersRound },
        { key: 'codes', label: t(locale, 'nav.codes'), icon: KeyRound },
      ],
    },
    {
      label: t(locale, 'navGroups.audit'),
      items: [
        { key: 'reports', label: t(locale, 'nav.reports'), icon: BarChart3, superOnly: true },
        { key: 'admins', label: copy.admins, icon: UsersRound, superOnly: true },
        { key: 'roles', label: copy.roles, icon: KeyRound, superOnly: true },
        { key: 'audit', label: t(locale, 'nav.auditLog'), icon: ShieldCheck, superOnly: true },
        // PR-6 — Security Center: super-only, gated by the existing audit view
        // key (mirrors /offline; no new registry permission key).
        { key: 'security', label: t(locale, 'nav.security'), icon: ShieldAlert, superOnly: true, gateKey: 'view:audit' },
        // PR-9 — Servers Dashboard: read-only provider monitoring, super-only,
        // riding the same audit view key as /security and /offline.
        { key: 'servers', label: t(locale, 'nav.servers'), icon: Server, superOnly: true, gateKey: 'view:audit' },
        // Wave 4 (Owner decision 2026-11-23): offline package ledger + revocation.
        { key: 'offline', label: t(locale, 'nav.offline'), icon: PackageX, superOnly: true },
        { key: 'settings', label: t(locale, 'nav.settings'), icon: Settings, superOnly: true },
        { key: 'content', label: t(locale, 'nav.content'), icon: ScrollText, superOnly: true },
      ],
    },
  ];

  // PR-2 — permission-filtered palette items. App owns authorization (can() +
  // superOnly, same rule as the sidebar); the CommandPalette owns presentation.
  const commandPaletteItems: CommandPaletteItem[] = navGroups.flatMap((group) => group.items
    .filter((item) => (!item.superOnly || isSuperAdmin) && can(item.gateKey ?? `view:${item.key}`))
    .map((item) => ({ key: item.key, label: item.label, icon: item.icon, group: group.label })));

  const viewTitle = view === 'not-found' ? copy.notFoundTitle
    : view === 'admins' ? copy.adminList
    : view === 'roles' ? copy.rolesTitle
    : view === 'offline' ? t(locale, 'nav.offline')
    : view === 'audit' ? t(locale, 'nav.auditLog')
    : view === 'security' ? t(locale, 'nav.security')
    : view === 'servers' ? t(locale, 'nav.servers')
    : view === 'reports' ? t(locale, 'nav.reports')
    : view === 'settings' ? t(locale, 'nav.settings')
    : view === 'content' ? t(locale, 'nav.content')
    : view === 'students' ? t(locale, 'nav.students')
    : view === 'academic' ? t(locale, 'nav.academic')
    : view === 'questions' ? t(locale, 'nav.questions')
    : view === 'exams' ? t(locale, 'nav.exams')
    : view === 'exam-courses' ? t(locale, 'nav.examCourses')
    : view === 'library' ? t(locale, 'nav.library')
    : view === 'codes' ? t(locale, 'nav.codes')
    : copy.overview;
  const statusLabel = apiStatus === 'healthy' ? t(locale, 'shell.statusHealthyShort')
    : apiStatus === 'degraded' ? t(locale, 'topbar.statusDegraded')
    : t(locale, 'shell.statusNotChecked');

  return (
    <UiPermissionsProvider value={uiPermissionsState}>
    <main className="admin-shell" dir={isArabic ? 'rtl' : 'ltr'}>
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="side-brand">
          <img src={BRAND_MARK} alt="CMS" />
          {!sidebarCollapsed && <span>CMS <i>CONTROL</i></span>}
          <button className="menu-close" aria-label={t(locale, 'shell.closeNav')} onClick={() => setMobileNavOpen(false)} style={{ display: mobileNavOpen ? 'flex' : 'none' }}>
            <X size={20} />
          </button>
        </div>
        <nav>
          {navGroups.map((group) => {
            // Push 3: view keys AND with superOnly — custom roles never see super-only
            // views regardless of keys; everyone else needs their view key.
            const visible = group.items.filter((item) => (!item.superOnly || isSuperAdmin) && can(item.gateKey ?? `view:${item.key}`));
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
        <div className="side-bottom" ref={sideBottomRef}>
          {/* PR-2 — real button (keyboard reachable) with menu semantics + focus management. */}
          <button
            type="button"
            ref={operatorButtonRef}
            className="operator"
            onClick={() => setOperatorMenuOpen(!operatorMenuOpen)}
            aria-haspopup="menu"
            aria-expanded={operatorMenuOpen}
            aria-label={t(locale, 'shell.operatorMenuWith', { name: user.fullName })}
            data-testid="operator-menu-trigger"
            style={{ cursor: 'pointer', background: 'transparent', border: 'none', width: '100%', textAlign: 'start', font: 'inherit' }}
          >
            <div>{user.fullName?.[0] ?? 'C'}</div>
            {!sidebarCollapsed && (
              <span>
                <strong>{user.fullName}</strong>
                <small>{user.role}</small>
              </span>
            )}
          </button>
          {operatorMenuOpen && (
            <div
              className="operator-menu"
              role="menu"
              aria-label={t(locale, 'shell.operatorMenu')}
              data-testid="operator-menu"
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                event.preventDefault();
                const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
                if (items.length === 0) return;
                const currentIndex = items.findIndex((item) => item === document.activeElement);
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                const next = items[(currentIndex + delta + items.length) % items.length] ?? items[0];
                next.focus();
              }}
              style={{ position: 'absolute', bottom: '100%', insetInlineStart: 0, right: 0, background: 'var(--cms-ink-800)', borderRadius: 'var(--cms-radius-md)', boxShadow: 'var(--cms-shadow-lg)', padding: '4px', margin: '4px', zIndex: 100 }}
            >
              <button
                role="menuitem"
                className="side-action"
                onClick={() => { toggleTheme(); setOperatorMenuOpen(false); }}
                aria-label={copy.toggleTheme}
              >
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                {theme === 'light' ? copy.darkMode : copy.lightMode}
              </button>
              <button
                role="menuitem"
                className="side-action danger"
                onClick={signOut}
              >
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
          <button className="menu-toggle" aria-label={t(locale, 'shell.openNav')} onClick={() => setMobileNavOpen(true)}>
            <Menu />
          </button>
          <button className="menu-toggle collapse-toggle" aria-label={t(locale, 'shell.toggleSidebar')} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ display: 'flex' }}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {/* PR-2 — the hand-rolled topbar breadcrumb replaced by the shared primitive. */}
          <Breadcrumbs
            items={[{ label: t(locale, 'shell.adminCrumb') }, { label: viewTitle }]}
            navLabel={copy.breadcrumbNav}
            dir={isArabic ? 'rtl' : 'ltr'}
            testId="topbar-breadcrumbs"
          />
          <div className="top-actions">
            <button
              className="lang-btn"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label={t(locale, 'topbar.openPalette')}
              aria-haspopup="dialog"
              aria-expanded={commandPaletteOpen}
              aria-keyshortcuts="Control+K"
              title="Ctrl+K"
              data-testid="command-palette-trigger"
            >
              <Search size={15} />
              {/* W14.3 §13: opacity 0.6 → soft token — the hint failed contrast (2.68:1). */}
              <span style={{ fontSize: '11px', color: 'var(--cms-text-soft)' }}>⌘K</span>
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
            {/* Push 3: compose bell gated by btn:overview.compose-notification. */}
            {can('btn:overview.compose-notification') && (
              <button className="icon-btn" aria-label={t(locale, 'topbar.notifications')} onClick={() => setNotificationComposeOpen(true)} title={t(locale, 'topbar.composeNotification')}>
                <Bell size={19} />
                {unreadCount > 0 && <span className="dot">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
            )}
            {/* W-coverage (row 26): sent ledger — super-admin only (API scope). */}
            {isSuperAdmin && (
              <button
                className="icon-btn"
                aria-label={t(locale, 'topbar.sentNotifications')}
                onClick={() => setSentNotificationsOpen(true)}
                title={t(locale, 'topbar.sentNotifications')}
                data-testid="open-sent-notifications"
              >
                <History size={19} />
              </button>
            )}
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
              {view === 'overview' && (can('view:overview')
                ? (
                  <>
                    <Overview copy={copy} isArabic={isArabic} isSuperAdmin={isSuperAdmin} token={token} onNavigate={setView} />
                    {/* W4: 2FA self-service — visible to every operator (API gates by role, not by UI permission). */}
                    <TwoFactorCard token={token} isArabic={isArabic} adminName={user?.fullName} onError={reportError} onNotice={notify} />
                  </>
                )
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'students' && (can('view:students')
                ? <StudentsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'academic' && (can('view:academic')
                ? <AcademicCenter token={token} isSuperAdmin={isSuperAdmin} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'questions' && (can('view:questions')
                ? <QuestionsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'exams' && (can('view:exams')
                ? <ExamsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} onNavigateToQuestions={() => setView('questions')} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'exam-courses' && (can('view:exams')
                ? <ExamCoursesCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'library' && (can('view:library')
                ? <LibraryCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'codes' && (can('view:codes')
                ? <CodesCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {/* PR-2 — super-only views: unauthorized deep links now render the
                  LimitedNotice fallback instead of an empty content area. The
                  backend RBAC remains the real gate; this is honest UX, not
                  authorization. */}
              {view === 'admins' && (isSuperAdmin && can('view:admins')
                ? (
                  <AdminsCenter
                    copy={copy}
                    isArabic={isArabic}
                    token={token}
                    admins={admins}
                    roles={roles}
                    total={totalAdmins}
                    query={query}
                    roleFilter={roleFilter}
                    statusFilter={statusFilter}
                    busy={busy}
                    loading={loadingData}
                    scopeText={scopeText}
                    setQuery={queryState.setValue}
                    setRoleFilter={roleState.setValue}
                    setStatusFilter={statusState.setValue}
                    clearFilters={clearAdminsFilters}
                    onCreate={openCreateAdmin}
                    onEdit={openEditAdmin}
                    onReset={(admin) => setDialog({ kind: 'reset-password', admin })}
                    onDelete={(admin) => setDialog({ kind: 'delete-admin', admin })}
                    onStatus={(admin, isActive) => setAdminStatusTarget({ admin, isActive })}
                  />
                )
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'roles' && (isSuperAdmin && can('view:roles')
                ? (
                  <RolesCenter
                    copy={copy}
                    isArabic={isArabic}
                    token={token}
                    roles={roles}
                    busy={busy}
                    loading={loadingData}
                    onCreate={() => setDialog({ kind: 'create-role' })}
                    onStatus={(role, isActive) => setRoleStatusTarget({ role, isActive })}
                    onDelete={(role) => { setRoleDeleteTarget(role); setRoleDeleteFailure(null); }}
                    onError={reportError}
                    onNotice={notify}
                  />
                )
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'audit' && (isSuperAdmin && can('view:audit')
                ? <AuditCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'offline' && (isSuperAdmin && can('view:audit')
                ? <OfflineCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {/* PR-6 — Security Center: super-only + existing view:audit gate
                  (same rule as /offline). Backend RBAC remains the real boundary. */}
              {view === 'security' && (isSuperAdmin && can('view:audit')
                ? <SecurityCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {/* PR-9 — Servers Dashboard: super-only + existing view:audit gate
                  (same rule as /security). READ-ONLY by design; backend RBAC
                  remains the real boundary. */}
              {view === 'servers' && (isSuperAdmin && can('view:audit')
                ? <ServersCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'reports' && (isSuperAdmin && can('view:reports')
                ? <ReportsCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {view === 'settings' && (isSuperAdmin && can('view:settings')
                ? <SettingsCenter token={token} isArabic={isArabic} isSuperAdmin={isSuperAdmin} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {/* W16.5 — admin-managed site content pages. super_admin only (legal texts):
                  no new UI-permission registry key; the API enforces the role. */}
              {view === 'content' && (isSuperAdmin
                ? <ContentCenter token={token} isArabic={isArabic} onError={reportError} onNotice={notify} />
                : <LimitedNotice copy={copy} isArabic={isArabic} />)}
              {/* PR-2 — the real 404 view: unknown paths no longer resolve to overview. */}
              {view === 'not-found' && (
                <NotFoundView
                  requestedPath={location.pathname}
                  isArabic={isArabic}
                  onReturnHome={() => setView('overview')}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
      {/* ===== W4: shared confirm gates for admin/role status + role delete
          (replaces the last window.confirm surfaces, debt D-01/D-02). The
          super-admin password gate on admin delete is untouched (DialogLayer). ===== */}
      <ConfirmDialog
        open={adminStatusTarget !== null}
        onOpenChange={(next) => { if (!next) setAdminStatusTarget(null); }}
        title={adminStatusTarget?.isActive
          ? t(locale, 'admins.enableTitle')
          : t(locale, 'admins.disableTitle')}
        description={adminStatusTarget
          ? (adminStatusTarget.isActive
            ? t(locale, 'admins.enableDescription', { name: adminStatusTarget.admin.fullName })
            : t(locale, 'admins.disableDescription', { name: adminStatusTarget.admin.fullName }))
          : undefined}
        confirmLabel={adminStatusTarget?.isActive ? copy.activate : copy.deactivate}
        cancelLabel={t(locale, 'common.cancel')}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (adminStatusTarget) void setAccountStatus(adminStatusTarget.admin, adminStatusTarget.isActive); }}
        testId="admin-status-confirm"
      />
      <ConfirmDialog
        open={roleStatusTarget !== null}
        onOpenChange={(next) => { if (!next) setRoleStatusTarget(null); }}
        title={roleStatusTarget?.isActive
          ? t(locale, 'roles.enableTitle')
          : t(locale, 'roles.disableTitle')}
        description={roleStatusTarget
          ? (roleStatusTarget.isActive
            ? t(locale, 'roles.enableDescription', { name: roleStatusTarget.role.nameAr ?? roleStatusTarget.role.name })
            : t(locale, 'roles.disableDescription', { name: roleStatusTarget.role.nameAr ?? roleStatusTarget.role.name }))
          : undefined}
        confirmLabel={roleStatusTarget?.isActive ? copy.activate : copy.deactivate}
        cancelLabel={t(locale, 'common.cancel')}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (roleStatusTarget) void setRoleStatus(roleStatusTarget.role, roleStatusTarget.isActive); }}
        testId="role-status-confirm"
      />
      <ConfirmDialog
        open={roleDeleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRoleDeleteTarget(null);
            setRoleDeleteFailure(null);
          }
        }}
        title={t(locale, 'roles.deleteTitle')}
        description={roleDeleteTarget
          ? t(locale, 'roles.deleteDescription', { name: roleDeleteTarget.nameAr ?? roleDeleteTarget.name })
          : undefined}
        confirmLabel={copy.delete}
        cancelLabel={t(locale, 'common.cancel')}
        variant="danger"
        requireAcknowledge={{ label: t(locale, 'roles.deleteAck') }}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (roleDeleteTarget) void deleteRole(roleDeleteTarget); }}
        testId="role-delete-confirm"
      >
        {/* PR-7 — INLINE conflict banner (kept visible inside the open dialog):
            ROLE_HAS_ADMINS renders the live admin count from the card; other
            refusals (SYSTEM_ROLE_DELETE_FORBIDDEN, …) render the mapped message. */}
        {roleDeleteFailure && (
          <RoleDeleteConflictBanner
            errorCode={roleDeleteFailure.errorCode}
            humanMessage={roleDeleteFailure.human}
            adminCount={roleDeleteTarget?.adminCount ?? 0}
            isArabic={isArabic}
          />
        )}
      </ConfirmDialog>
      {dialog && (
        <DialogLayer          copy={copy}
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
      {sentNotificationsOpen && (
        <SentNotificationsDialog
          token={token}
          isArabic={isArabic}
          onClose={() => setSentNotificationsOpen(false)}
          onError={reportError}
        />
      )}
      {notificationComposeOpen && (
        <NotificationCompose
          token={token}
          isArabic={isArabic}
          onClose={() => setNotificationComposeOpen(false)}
          onError={reportError}
          onNotice={notify}
        />
      )}
      {/* PR-2 — the command palette is now the accessible CommandPalette
          component (dialog + combobox semantics, arrow-key navigation, focus
          restore, RTL-safe centering). Items are pre-filtered by permission. */}
      {commandPaletteOpen && (
        <CommandPalette
          items={commandPaletteItems}
          activeKey={view}
          onSelect={(key) => setView(key as View)}
          onClose={() => setCommandPaletteOpen(false)}
          labels={{
            dialogLabel: copy.paletteTitle,
            placeholder: copy.palettePlaceholder,
            noResults: copy.paletteNoResults,
            openHint: copy.paletteOpenHint,
          }}
          isArabic={isArabic}
        />
      )}
      <Toaster richColors position="top-center" />
    </main>
    </UiPermissionsProvider>
  );
}

type OverviewProps = { copy: Record<string, string>; isArabic: boolean; isSuperAdmin: boolean; token: string; onNavigate: (view: View) => void };

/** Push 3: fallback shown when the active view's key is not granted to this admin. */
function LimitedNotice({ copy, isArabic }: { copy: Record<string, string>; isArabic: boolean }) {
  return (
    <section className="notice" role="status" dir={isArabic ? 'rtl' : 'ltr'}>
      <ShieldOff size={20} />
      <span>{copy.limited}</span>
    </section>
  );
}

function Overview({ copy, isArabic, isSuperAdmin, token, onNavigate }: OverviewProps) {
  // PR-3 — the Overview subcomponent resolves its locale from the isArabic
  // prop (the dictionary is the string source; copy remains prop-drilled).
  const locale = localeOf(isArabic);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // PR-2 — the selected overview tab lives in the URL (?tab=metrics|activity):
  // refresh and shared links restore the exact section. Whitelisted, so a
  // hand-edited value falls back to the default tab.
  const overviewTabState = useQueryState('tab', 'metrics', ['metrics', 'activity']);
  const overviewTab = overviewTabState.value as 'metrics' | 'activity';
  const setOverviewTab = overviewTabState.setValue;
  // Push 3: the cosmetic layer for the overview tabs (activity stays super-only AND).
  const { can } = useUiPermissions();

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
            { key: 'students' as View, label: t(locale, 'nav.students'), tint: 'rgba(18,135,125,0.12)', icon: UsersRound },
            { key: 'questions' as View, label: t(locale, 'nav.questions'), tint: 'rgba(76,184,174,0.14)', icon: BookOpenCheck },
            { key: 'library' as View, label: t(locale, 'nav.library'), tint: 'rgba(163,108,31,0.12)', icon: FileText },
            { key: 'exams' as View, label: t(locale, 'nav.exams'), tint: 'rgba(53,113,138,0.12)', icon: ClipboardCheck },
          ]).map((card) => (
            <article key={card.key} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate(card.key)}>
              <div className="stat-icon" style={{ background: card.tint, color: 'var(--cms-teal-700)' }}>
                <card.icon size={20} />
              </div>
              <div className="stat-label">{card.label}</div>
              <div className="stat-value" style={{ fontSize: 'var(--cms-text-sm)', fontWeight: 500, color: 'var(--cms-text-soft)' }}>{t(locale, 'dashboard.openCenter')}</div>
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
  // D-26 note: the router can paint one intermediate render between sign-in state updates and
  // the navigation commit, so a partial/garbage payload must not crash the card grid.
  const revenueChange = typeof stats?.revenueChangePercent === 'number' ? stats.revenueChangePercent : null;
  const revenueTrend: Trend = revenueChange !== null && revenueChange > 0 ? 'up' : revenueChange !== null && revenueChange < 0 ? 'down' : 'flat';
  const revenueTrendLabel = revenueChange !== null ? `${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%` : '—';
  cards.push({
    label: copy.statRevenue,
    value: typeof stats?.monthlyRevenue === 'number'
      ? new Intl.NumberFormat(localeTag, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(stats.monthlyRevenue)
      : '—',
    tint: 'rgba(25,133,102,0.12)',
    iconColor: 'var(--cms-success)',
    icon: Activity,
    trend: revenueTrend,
    trendLabel: revenueTrendLabel,
  });

  const quickActions: Array<{ key: View; label: string; icon: typeof Activity }> = [
    { key: 'admins', label: t(locale, 'admins.list'), icon: UsersRound },
    { key: 'students', label: t(locale, 'nav.students'), icon: UsersRound },
    { key: 'questions', label: t(locale, 'nav.questions'), icon: BookOpenCheck },
    { key: 'codes', label: t(locale, 'nav.codes'), icon: KeyRound },
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

      {/* Push 2 / Track 2: tab switch between metrics and the activity monitor (super-admin only).
          Push 3: each tab additionally gated by its tab key (activity stays super-only AND). */}
      {isSuperAdmin && (can('tab:overview.metrics') || can('tab:overview.activity')) && (
        <div className="flex gap-2" role="tablist" aria-label={t(locale, 'dashboard.sectionsA11y')} dir={isArabic ? 'rtl' : 'ltr'}>
          {can('tab:overview.metrics') && (
            <button
              type="button"
              role="tab"
              aria-selected={overviewTab === 'metrics'}
              onClick={() => setOverviewTab('metrics')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${overviewTab === 'metrics' ? 'text-white' : ''}`}
              style={overviewTab === 'metrics'
                ? { background: 'var(--cms-teal-700)', borderColor: 'var(--cms-teal-700)' }
                : { borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              {t(locale, 'dashboard.metricsTab')}
            </button>
          )}
          {can('tab:overview.activity') && (
            <button
              type="button"
              role="tab"
              aria-selected={overviewTab === 'activity'}
              onClick={() => setOverviewTab('activity')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${overviewTab === 'activity' ? 'text-white' : ''}`}
              style={overviewTab === 'activity'
                ? { background: 'var(--cms-teal-700)', borderColor: 'var(--cms-teal-700)' }
                : { borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              {t(locale, 'dashboard.activityTab')}
            </button>
          )}
        </div>
      )}

      {isSuperAdmin && overviewTab === 'activity' && (
        <ActivityMonitor token={token} isArabic={isArabic} onError={message => toast.error(message)} />
      )}

      {(!isSuperAdmin || overviewTab === 'metrics') && (
        <>
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
          // PR-2 — standardized failure surface from @cms/ui (role=alert inside).
          <ErrorState
            title={copy.statsError}
            dir={isArabic ? 'rtl' : 'ltr'}
            testId="overview-stats-error"
            style={{ gridColumn: '1 / -1' }}
          />
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
              <span style={{ fontSize: 'var(--cms-text-2xs)', color: 'var(--cms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t(locale, 'dashboard.open')}</span>
            </span>
          </button>
        ))}
      </section>

      {/* W-coverage (row 4): the three SuperAdmin dashboard feeds (recent-activity,
          top-subjects, reports/summary) — previously no UI. */}
      {isSuperAdmin && (
        <DashboardFeeds token={token} isArabic={isArabic} />
      )}

      <p style={{ marginTop: 'var(--cms-space-4)', fontSize: 'var(--cms-text-2xs)', color: 'var(--cms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {t(locale, 'dashboard.lastUpdated')}: {updatedLabel}
      </p>
        </>
      )}
    </>
  );
}

export default App;
