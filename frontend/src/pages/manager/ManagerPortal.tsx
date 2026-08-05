import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Wallet,
  Building2,
  FileText,
  MessageSquare,
  ClipboardList,
  AlertTriangle,
  Plus,
  Search,
  CheckCircle,
  X,
  Trash2,
  Lock,
  Mail,
  Phone,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Filter,
  Download,
  Send,
  MessageCircle,
  Pencil,
  RefreshCw
} from 'lucide-react';
import {
  MiniSparklineChart,
  CouponActivityChart,
  BalanceStatusDonut
} from '../../components/charts/DashboardCharts';
import { exportToExcel, getFileNameFromContentDisposition, downloadBlobFile } from '../../utils/exportHelpers';
import { formatETB } from '../../utils/format';

// ─── Data normalizers: convert backend snake_case → frontend camelCase ───────
const normalizeEmployee = (e: any) => ({
  id: e.id,
  employeeId: e.employee_external_id ?? e.id,
  fullName: e.fullname ?? e.fullName ?? '',
  email: e.email ?? '',
  phone: e.phone_number ?? '',
  department: e.department?.name ?? e.department ?? '',
  departmentId: e.department?.id ?? e.department_id ?? null,
  cafeId: e.cafe_id ?? e.cafeId ?? e.cafe_staff?.cafe_id ?? null,
  isActive: e.is_active ?? true,
  isAwaitingSetup: e.isAwaitingSetup ?? false,
  balance: e.balance ?? 0,
  roles: e.roles ?? [],
});

const normalizeDepartment = (d: any) => ({
  id: d.id,
  name: d.name,
  employeeCount: d.employeeCount ?? d.employee_count ?? 0,
  totalAllocated: d.totalAllocated ?? d.total_allocated ?? 0,
  totalRedeemed: d.totalRedeemed ?? d.total_redeemed ?? 0,
});

const normalizeOrder = (o: any) => ({
  id: o.id,
  employeeName: o.employeeName ?? o.employee_name ?? (o.employee?.fullname ?? ''),
  employeeId: o.employeeId ?? o.employee_external_id ?? '',
  department: o.department ?? (o.employee?.department?.name ?? ''),
  date: o.date ?? o.created_at ?? '',
  status: o.status ?? 'pending',
  amount: Number(o.amount ?? o.total_amount ?? 0),
  items: o.items ?? o.order_items ?? [],
  waiterName: o.waiterName ?? (o.waiter?.fullname ?? 'Staff'),
});

const normalizeAuditLog = (l: any) => ({
  id: l.id,
  employeeId: l.users?.employee_external_id ?? l.user_id ?? '',
  userName: l.users?.fullname ?? l.userName ?? 'System',
  role: l.role ?? 'manager',
  action: l.action ?? '',
  details: l.description ?? l.details ?? '',
  timestamp: l.created_at ?? l.timestamp ?? new Date().toISOString(),
});

const normalizeFeedback = (f: any) => ({
  id: f.id,
  employeeId: f.users?.employee_external_id ?? f.user_id ?? '',
  userId: f.users?.id ?? f.user_id ?? null,
  employeeName: f.users?.fullname ?? f.employeeName ?? 'Unknown',
  orderId: f.order_id ?? f.orderId ?? '',
  rating: f.rating ?? 0,
  comment: f.comment ?? '',
  date: f.created_at ? new Date(f.created_at).toLocaleDateString() : (f.date ?? ''),
});

export default function ManagerPortal() {
  const { user, apiGet, apiPost, apiPut, apiPatch, apiDelete, setGlobalLoading } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // Determine current active sub-page
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('employees')) return 'employees';
    if (path.includes('cafes')) return 'cafes';
    if (path.includes('departments')) return 'departments';
    if (path.includes('balance')) return 'balance';
    if (path.includes('reports')) return 'reports';
    if (path.includes('messages')) return 'messages';
    if (path.includes('audit')) return 'audit';
    if (path.includes('profile')) return 'profile';
    return 'overview'; // default /manager/dashboard
  };

  const activeTab = getActiveTab();

  // Shared portal states
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [cafesList, setCafesList] = useState<any[]>([]);
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [employeeMessages, setEmployeeMessages] = useState<any[]>([]);
  const [waitersList, setWaitersList] = useState<any[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  // Financial report data for the chart
  const [financialData, setFinancialData] = useState<any>(null);
  const [departmentUsageData, setDepartmentUsageData] = useState<any>({ departments: [], employees: [] });

  // Reload portal data — calls correct backend endpoints and normalizes response shapes
  const loadPortalData = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [empsRes, cafesRes, deptsRes, logsRes, messagesRes, finRes, monthlyRes, usageRes] = await Promise.all([
        apiGet('/api/company-manager/employees?limit=500').catch(() => ({ data: { items: [] } })),
        apiGet('/api/company-manager/cafes').catch(() => ({ data: [] })),
        apiGet('/api/company-manager/departments').catch(() => ({ data: [] })),
        apiGet('/api/audit-logs?limit=50').catch(() => ({ data: { items: [] } })),
        apiGet('/api/notifications?limit=100').catch(() => null),
        apiGet(`/api/company-manager/reports/financial?month=${currentMonth}&format=json`).catch(() => null),
        apiGet(`/api/company-manager/reports/monthly?month=${currentMonth}&format=json`).catch(() => null),
        apiGet(`/api/company-manager/reports/department-usage?month=${currentMonth}&format=json`).catch(() => null),
      ]);

      const rawEmps = empsRes?.data?.items ?? empsRes?.items ?? [];
      const normalizedEmps = rawEmps.map(normalizeEmployee);
      setEmployeesList(normalizedEmps);
      setCafesList(cafesRes?.data ?? []);

      const rawDepts = deptsRes?.data ?? deptsRes?.departments ?? [];
      setDepartmentsList((Array.isArray(rawDepts) ? rawDepts : []).map(normalizeDepartment));

      const rawLogs = logsRes?.data?.items ?? logsRes?.items ?? [];
      setAuditLogs(rawLogs.map(normalizeAuditLog));

      const rawMessages = messagesRes?.data?.items ?? messagesRes?.items ?? [];
      setEmployeeMessages(rawMessages.filter((message: any) => String(message.title ?? '').startsWith('Message from ')));

      setFinancialData(finRes?.data ?? null);
      setDepartmentUsageData(usageRes?.data ?? { departments: [], employees: [] });

      const rawOrders = monthlyRes?.data?.rows ?? [];
      const mappedOrders = rawOrders.map((row: any, idx: number) => ({
        id: idx,
        employeeName: row.employee_name ?? '',
        employeeId: row.employee_id ?? '',
        department: row.department ?? '',
        date: row.date ?? '',
        status: 'confirmed',
        amount: Number(row.total_amount_used ?? 0),
        items: row.food_ordered ? [{ name: row.food_ordered, quantity: 1 }] : [],
        waiterName: row.waiter_name ?? 'Staff',
        remainingBalance: Number(row.remaining_balance ?? 0),
      }));
      setRecentOrders(mappedOrders);

      setWaitersList(normalizedEmps.filter((e: any) => (e.roles || []).includes('waiter')));
    } catch (e: any) {
      console.error('Error loading manager data', e);
      setPortalError(e.message || 'Failed to load dashboard data. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  };
  useEffect(() => {
    if (user && user.role === 'manager') {
      loadPortalData();
    }
  }, [user, location.pathname]);

  if (!user || user.role !== 'manager') return null;

  // Global loading splash (only on initial load, not refreshes)
  if (portalLoading && employeesList.length === 0 && activeTab === 'overview') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-subtle-text uppercase tracking-widest animate-pulse">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 md:py-10 space-y-8 font-sans">
      {/* Error Banner */}
      {portalError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-danger">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{portalError}</span>
          <button
            onClick={loadPortalData}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-danger text-white rounded-lg hover:bg-red-600 transition-all text-[10px] uppercase tracking-wider"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* Dynamic Render based on Tab */}
      {activeTab === 'overview' && (
        <ManagerDashboardOverview
          employeesList={employeesList}
          departmentsList={departmentsList}
          recentOrders={recentOrders}
          auditLogs={auditLogs}
          financialData={financialData}
          departmentUsageData={departmentUsageData}
          isLoading={portalLoading}
          onRefresh={loadPortalData}
        />
      )}
      {activeTab === 'employees' && (
        <ManagerEmployeesPage
          employeesList={employeesList}
          departmentsList={departmentsList}
          onReload={loadPortalData}
          apiPost={apiPost}
          apiPut={apiPut}
          apiPatch={apiPatch}
          apiDelete={apiDelete}
        />
      )}
      {activeTab === 'cafes' && (
        <ManagerCafesPage
          cafes={cafesList}
          employeesList={employeesList}
          apiPost={apiPost}
          apiPatch={apiPatch}
          apiDelete={apiDelete}
          onReload={loadPortalData}
        />
      )}
      {activeTab === 'departments' && (
        <ManagerDepartmentsPage
          departmentsList={departmentsList}
          employeesList={employeesList}
          onReload={loadPortalData}
          apiPost={apiPost}
          apiPatch={apiPatch}
          apiDelete={apiDelete}
        />
      )}
      {activeTab === 'balance' && (
        <ManagerBalancePage
          departmentsList={departmentsList}
          employeesList={employeesList}
          onReload={loadPortalData}
          apiPost={apiPost}
        />
      )}
      {activeTab === 'reports' && <ManagerReportsPage employeesList={employeesList} recentOrders={recentOrders} departmentsList={departmentsList} waitersList={waitersList} />}
      {activeTab === 'messages' && <ManagerIncomingMessagesPage messages={employeeMessages} />}
      {activeTab === 'audit' && (
        <ManagerAuditLogsPage
          auditLogs={auditLogs}
        />
      )}
      {activeTab === 'profile' && <ManagerProfilePage employeesList={employeesList} apiPost={apiPost} apiPatch={apiPatch} apiDelete={apiDelete} onReload={loadPortalData} />}
    </div>
  );
}

function ManagerProfilePage({ employeesList, apiPost, apiPatch, apiDelete, onReload }: { employeesList: any[]; apiPost: (path: string, body: any) => Promise<any>; apiPatch: (path: string, body: any) => Promise<any>; apiDelete: (path: string) => Promise<any>; onReload: () => Promise<void> }) {
  const [password, setPassword] = useState({ old_password: '', new_password: '' });
  const [admin, setAdmin] = useState({ employee_external_id: '', fullname: '', phone_number: '', password: '' });
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ fullname: '', phone_number: '', password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAdminAction, setActiveAdminAction] = useState<string | null>(null);

  const companyManagers = (employeesList || []).filter((emp) => (emp.roles || []).includes('company_manager'));

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setIsSubmitting(true); setActiveAdminAction('change-password');
    try {
      await apiPatch('/api/company-manager/profile/password', password);
      setPassword({ old_password: '', new_password: '' });
      setMessage('Password updated successfully.');
    } catch (e: any) {
      setError(e.message || 'Unable to update password.');
    } finally {
      setIsSubmitting(false); setActiveAdminAction(null);
    }
  };

  const addAdmin = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setIsSubmitting(true); setActiveAdminAction('add-admin');
    try {
      await apiPost('/api/company-manager/admins', admin);
      setAdmin({ employee_external_id: '', fullname: '', phone_number: '', password: '' });
      setMessage('Company manager added successfully.');
      await onReload();
    } catch (e: any) {
      setError(e.message || 'Unable to add company manager.');
    } finally {
      setIsSubmitting(false); setActiveAdminAction(null);
    }
  };

  const startEditAdmin = (adminAccount: any) => {
    setEditingAdmin(adminAccount);
    setEditForm({ fullname: adminAccount.fullName || '', phone_number: adminAccount.phone || '', password: '' });
  };

  const saveAdminChanges = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingAdmin) return;
    setError(''); setMessage(''); setIsSubmitting(true); setActiveAdminAction(`save-${editingAdmin.id}`);
    try {
      const payload: any = { fullname: editForm.fullname, phone_number: editForm.phone_number };
      if (editForm.password) payload.password = editForm.password;
      await apiPatch(`/api/company-manager/employees/${editingAdmin.id}`, payload);
      setEditingAdmin(null);
      setEditForm({ fullname: '', phone_number: '', password: '' });
      setMessage('Admin updated successfully.');
      await onReload();
    } catch (e: any) {
      setError(e.message || 'Unable to update admin.');
    } finally {
      setIsSubmitting(false); setActiveAdminAction(null);
    }
  };

  const resetAdminPassword = async (adminAccount: any) => {
    const newPassword = window.prompt(`Set a new password for ${adminAccount.fullName || adminAccount.employeeId || 'this admin'}`);
    if (!newPassword) return;
    setError(''); setMessage(''); setIsSubmitting(true); setActiveAdminAction(`reset-${adminAccount.id}`);
    try {
      await apiPost('/api/company-manager/employees/password-reset', { user_id: adminAccount.id, new_password: newPassword });
      setMessage('Admin password updated successfully.');
      await onReload();
    } catch (e: any) {
      setError(e.message || 'Unable to reset admin password.');
    } finally {
      setIsSubmitting(false); setActiveAdminAction(null);
    }
  };

  const deleteAdmin = async (adminAccount: any) => {
    if (!window.confirm(`Delete ${adminAccount.fullName || adminAccount.employeeId || 'this admin'}?`)) return;
    setError(''); setMessage(''); setIsSubmitting(true); setActiveAdminAction(`delete-${adminAccount.id}`);
    try {
      await apiDelete(`/api/company-manager/employees/${adminAccount.id}`);
      setMessage('Admin deleted successfully.');
      await onReload();
    } catch (e: any) {
      setError(e.message || 'Unable to delete admin.');
    } finally {
      setIsSubmitting(false); setActiveAdminAction(null);
    }
  };

  return <div className="space-y-6 animate-fadeIn max-w-5xl">
    <div><h1 className="text-2xl font-extrabold text-primary">Profile & Admins</h1><p className="text-xs text-subtle-text mt-1">Change your password, add another company manager, and manage existing admins.</p></div>
    {message && <p className="rounded-xl bg-green-50 border border-green-200 p-3 text-xs font-bold text-green-700">{message}</p>}
    {error && <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-bold text-danger">{error}</p>}
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <form onSubmit={changePassword} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"><h2 className="font-black text-primary">Change my password</h2><input required type="password" placeholder="Current password" value={password.old_password} onChange={e => setPassword({ ...password, old_password: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" /><input required type="password" placeholder="New password (8+ characters, upper/lowercase and number)" value={password.new_password} onChange={e => setPassword({ ...password, new_password: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" /><button disabled={isSubmitting && activeAdminAction === 'change-password'} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed">{activeAdminAction === 'change-password' ? 'Updating...' : 'Update Password'}</button></form>
      <form onSubmit={addAdmin} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"><h2 className="font-black text-primary">Add company manager</h2><input required placeholder="Manager ID" value={admin.employee_external_id} onChange={e => setAdmin({ ...admin, employee_external_id: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" /><input required placeholder="Full name" value={admin.fullname} onChange={e => setAdmin({ ...admin, fullname: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" /><input required placeholder="Phone number" value={admin.phone_number} onChange={e => setAdmin({ ...admin, phone_number: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" /><input required type="password" placeholder="Password" value={admin.password} onChange={e => setAdmin({ ...admin, password: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" /><button disabled={isSubmitting && activeAdminAction === 'add-admin'} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed">{activeAdminAction === 'add-admin' ? 'Adding...' : 'Add Manager'}</button></form>
    </div>

    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-black text-primary">Company managers</h2>
          <p className="text-xs text-subtle-text mt-1">Edit details, reset passwords, or remove admin accounts.</p>
        </div>
      </div>
      {companyManagers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-subtle-text">No company manager accounts yet.</p>
      ) : (
        <div className="space-y-3">
          {companyManagers.map((adminAccount) => (
            <div key={adminAccount.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-primary">{adminAccount.fullName || adminAccount.fullname}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{adminAccount.employeeId}</span>
                  </div>
                  <p className="mt-1 text-xs text-subtle-text">{adminAccount.phone || 'No phone on file'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEditAdmin(adminAccount)}
                    disabled={isSubmitting}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activeAdminAction === `save-${adminAccount.id}` ? 'Saving...' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => resetAdminPassword(adminAccount)}
                    disabled={isSubmitting}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activeAdminAction === `reset-${adminAccount.id}` ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAdmin(adminAccount)}
                    disabled={isSubmitting}
                    className="rounded-xl bg-danger px-3 py-2 text-[11px] font-bold text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activeAdminAction === `delete-${adminAccount.id}` ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
              {editingAdmin?.id === adminAccount.id && (
                <form onSubmit={saveAdminChanges} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input required value={editForm.fullname} onChange={(e) => setEditForm({ ...editForm, fullname: e.target.value })} placeholder="Full name" className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
                    <input value={editForm.phone_number} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} placeholder="Phone number" className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
                  </div>
                  <input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="New password (optional)" className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-xl bg-primary px-3 py-2 text-[11px] font-bold text-white">Save changes</button>
                    <button type="button" onClick={() => setEditingAdmin(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>;
}

function ManagerCafesPage({
  cafes,
  employeesList,
  apiPost,
  apiPatch,
  apiDelete,
  onReload,
}: {
  cafes: any[];
  employeesList: any[];
  apiPost: (path: string, body: any) => Promise<any>;
  apiPatch: (path: string, body: any) => Promise<any>;
  apiDelete: (path: string) => Promise<any>;
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [manager, setManager] = useState({ cafeId: '', employeeId: '', fullName: '', phone: '', password: '' });

  const addCafe = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiPost('/api/company-manager/cafes', { name, location });
      setName('');
      setLocation('');
      setError('');
      await onReload();
    } catch (err: any) {
      setError(err.message || 'Unable to create cafe');
    }
  };

  const addCafeManager = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiPost('/api/company-manager/cafe-managers', {
        cafe_id: Number(manager.cafeId),
        employee_external_id: manager.employeeId,
        fullname: manager.fullName,
        phone_number: manager.phone,
        password: manager.password,
      });
      setManager({ cafeId: '', employeeId: '', fullName: '', phone: '', password: '' });
      setError('');
      await onReload();
    } catch (err: any) {
      setError(err.message || 'Unable to create cafe manager');
    }
  };

  const toggleCafeManager = async (mgr: any) => {
    const action = mgr.isActive ? 'deactivate' : 'activate';
    await apiPatch(`/api/company-manager/employees/${mgr.id}/${action}`, {});
    await onReload();
  };

  const deleteCafeManager = async (mgr: any) => {
    await apiDelete(`/api/company-manager/employees/${mgr.id}`);
    await onReload();
  };

  const editCafeManager = async (mgr: any) => {
    const fullname = window.prompt('Manager name', mgr.fullName);
    if (!fullname) return;
    const phone_number = window.prompt('Phone number', mgr.phone || '') ?? '';
    const department_id = window.prompt('Department ID (leave blank for none)', String(mgr.departmentId || ''));
    const password = window.prompt('New password (leave blank to keep current)', '') ?? '';
    try {
      await apiPatch(`/api/company-manager/employees/${mgr.id}`, { fullname, phone_number: phone_number || null, department_id: department_id ? Number(department_id) : null, ...(password ? { password } : {}) });
      await onReload();
    } catch (err: any) { setError(err.message || 'Unable to update cafe manager'); }
  };

  const deleteCafe = async (cafe: any) => {
    const confirmed = window.confirm(
      `Remove ${cafe.name}? It will no longer be available, while past orders and reports remain preserved.`
    );
    if (!confirmed) return;

    try {
      await apiDelete(`/api/company-manager/cafes/${cafe.id}`);
      setError('');
      await onReload();
    } catch (err: any) {
      setError(err.message || 'Unable to delete cafe');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div><h1 className="text-2xl font-extrabold text-primary tracking-tight">Cafes</h1><p className="mt-1 text-xs font-medium uppercase tracking-wider text-subtle-text">Create and view company cafeterias</p></div>
      <form onSubmit={addCafe} className="grid gap-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Cafe name" className="rounded-xl border border-slate-200 p-3 text-sm" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="rounded-xl border border-slate-200 p-3 text-sm" />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white hover:bg-secondary"><Plus className="w-4 h-4" /> Add Cafe</button>
        {error && <p className="text-xs font-bold text-danger md:col-span-3">{error}</p>}
      </form>
      <form onSubmit={addCafeManager} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div><h2 className="font-black text-primary">Add Café Manager</h2><p className="text-xs text-subtle-text">Assign one manager account to a selected café.</p></div>
        <div className="grid gap-3 md:grid-cols-3">
          <select required value={manager.cafeId} onChange={(e) => setManager({ ...manager, cafeId: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm"><option value="">Select café</option>{cafes.map((cafe) => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}</select>
          <input required placeholder="Manager ID" value={manager.employeeId} onChange={(e) => setManager({ ...manager, employeeId: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" />
          <input required placeholder="Full name" value={manager.fullName} onChange={(e) => setManager({ ...manager, fullName: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" />
          <input required placeholder="Phone" value={manager.phone} onChange={(e) => setManager({ ...manager, phone: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" />
          <input required type="password" placeholder="Temporary password" value={manager.password} onChange={(e) => setManager({ ...manager, password: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" />
        </div>
        <button type="submit" className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white hover:bg-secondary">Create Café Manager</button>
      </form>
      <div className="space-y-4 rounded-3xl border border-slate-100 bg-white shadow-sm p-4">
        {cafes.length === 0 ? <p className="p-6 text-sm text-subtle-text">No cafes have been added yet.</p> : cafes.map((cafe) => {
          const cafeManagers = employeesList.filter((emp) => {
            const roles = emp.roles || [];
            return roles.includes('cafe_manager') && Number(emp.cafeId) === Number(cafe.id);
          });

          return (
            <div key={cafe.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold text-primary">{cafe.name}</p>
                  <p className="text-xs text-subtle-text">{cafe.location || 'No location set'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold uppercase text-success">{cafe.is_active === false ? 'Inactive' : 'Active'}</span>
                  <button
                    type="button"
                    onClick={() => deleteCafe(cafe)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-danger hover:bg-red-50"
                    aria-label={`Delete ${cafe.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Cafe
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {cafeManagers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-subtle-text">No café manager is assigned to this café yet.</p>
                ) : cafeManagers.map((mgr) => (
                  <div key={mgr.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-black text-primary">{mgr.fullName}</p>
                      <p className="text-[11px] font-mono text-slate-500">{mgr.employeeId}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${mgr.isActive ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}`}>{mgr.isActive ? 'Active' : 'Deactivated'}</span>
                      <button
                        type="button"
                        onClick={() => toggleCafeManager(mgr)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                      >
                        {mgr.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button type="button" onClick={() => editCafeManager(mgr)} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">Edit / Reset Password</button>
                      <button
                        type="button"
                        onClick={() => deleteCafeManager(mgr)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-danger hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 1: OVERVIEW (DASHBOARD)
// -----------------------------------------------------------
function ManagerDashboardOverview({
  employeesList,
  departmentsList,
  recentOrders,
  auditLogs,
  financialData,
  departmentUsageData,
  isLoading,
  onRefresh
}: {
  employeesList: any[];
  departmentsList: any[];
  recentOrders: any[];
  auditLogs: any[];
  financialData: any;
  departmentUsageData: any;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  
  // Stats derived from real backend data
  const employeesOnly = employeesList.filter(e => e.roles?.includes('employee'));
  const totalEmployees = employeesOnly.length;
  const activeEmployeesCount = employeesOnly.filter(e => e.isActive !== false).length;
  const expiredEmployeesCount = employeesOnly.filter(e => e.isActive === false).length;

  const reportDepartments = departmentUsageData?.departments ?? [];
  // These totals use the same department report displayed on the Reports page.
  const totalDistributed = reportDepartments.reduce((sum: number, department: any) => sum + Number(department.total_money_given || 0), 0);
  const totalRedeemed = reportDepartments.reduce((sum: number, department: any) => sum + Number(department.total_used || 0), 0);
  const attentionCount = employeesOnly.filter(e => e.isActive === false || e.isAwaitingSetup).length;

  // Build the graph directly from the department report columns.
  const chartData = (() => {
    if (reportDepartments.length > 0) {
      return reportDepartments.slice(0, 7).map((department: any) => ({
        name: department.department || 'Unassigned',
        Allocated: Number(department.total_money_given || 0),
        Redeemed: Number(department.total_used || 0),
      }));
    }
    return null; // will use chart defaults
  })();

  // Handle excel downloads
  const handleExportActivity = () => {
    const activityData = chartData ?? [
      { Day: 'Mon', Allocated: 0, Redeemed: 0 },
    ];
    exportToExcel(activityData, 'Allocation_Redemption_Activity', 'Monthly Metrics');
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Overview Dashboard</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Real-time lunch balances &amp; Birr redemption trends</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Total Employees */}
        <div className="stat-card-1 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">{t('manager.totalEmployees')}</p>
            <div className="flex items-baseline gap-2">
              {isLoading ? (
                <div className="h-8 w-16 bg-slate-200 animate-pulse rounded-lg" />
              ) : (
                <span className="text-3xl font-black text-text-primary">{totalEmployees}</span>
              )}
            </div>
            <p className="text-[10px] text-subtle-text">{activeEmployeesCount} active · {expiredEmployeesCount} inactive</p>
          </div>
          <MiniSparklineChart data={[Math.max(1, totalEmployees - 6), Math.max(1, totalEmployees - 4), Math.max(1, totalEmployees - 3), Math.max(1, totalEmployees - 2), Math.max(1, totalEmployees - 1), totalEmployees || 1, totalEmployees || 1]} type="bar" color="#1E3A8A" />
        </div>

        {/* Distributed Balance */}
        <div className="stat-card-2 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Distributed This Month</p>
            <div className="flex items-baseline gap-1">
              {isLoading ? (
                <div className="h-7 w-28 bg-slate-200 animate-pulse rounded-lg" />
              ) : (
                <>
                  <span className="text-[10px] font-bold text-text-subtle">ETB</span>
                  <span className="text-2xl font-black text-text-primary">{Number(totalDistributed).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </>
              )}
            </div>
          </div>
          <MiniSparklineChart data={[40, 42, 45, 52, 58, 60]} color="#8B5CF6" />
        </div>

        {/* Total Redeemed */}
        <div className="stat-card-3 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Redeemed This Month</p>
            <div className="flex items-baseline gap-1">
              {isLoading ? (
                <div className="h-7 w-28 bg-slate-200 animate-pulse rounded-lg" />
              ) : (
                <>
                  <span className="text-[10px] font-bold text-text-subtle">ETB</span>
                  <span className="text-2xl font-black text-text-primary">{Number(totalRedeemed).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </>
              )}
            </div>
          </div>
          <MiniSparklineChart data={[30, 31, 35, 38, 41, 42]} color="#06B6D4" />
        </div>

        {/* Needing Attention */}
        <div className="stat-card-4 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">{t('manager.needingAttention')}</p>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <div className="h-8 w-10 bg-slate-200 animate-pulse rounded-lg" />
              ) : (
                <span className="text-3xl font-black text-text-primary">{attentionCount}</span>
              )}
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
          </div>
          <div className="text-[10px] font-bold text-warning uppercase px-2 py-0.5 rounded-full bg-warning-bg dark:shadow-[0_0_8px_rgba(245,158,11,0.2)]">Requires Review</div>
        </div>
      </div>

      {/* Charts Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Allocation vs Redemption grouped bars */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-primary tracking-tight">{t('manager.allocationRedemptionChart')}</h3>
              <p className="text-[10px] text-subtle-text font-medium mt-0.5">
                {reportDepartments.length ? 'Department allocations and meal usage — current month' : 'No department report data is available yet'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl">
              <button className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-primary text-white shadow-sm">Dept</button>
            </div>
          </div>

          {isLoading ? (
            <div className="h-48 md:h-64 bg-slate-50 animate-pulse rounded-2xl flex items-center justify-center">
              <p className="text-xs text-subtle-text font-medium">Loading chart data...</p>
            </div>
          ) : (
            <CouponActivityChart period="day" data={chartData ?? undefined} />
          )}

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              id="export-activity-btn"
              onClick={handleExportActivity}
              className="flex items-center gap-2 px-4 py-2 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Chart Data</span>
            </button>
          </div>
        </div>

        {/* Balance Status Allocation Donut */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-primary tracking-tight">{t('manager.balanceAllocationChart')}</h3>
            <p className="text-[10px] text-subtle-text font-medium mt-0.5">Proportion of active users vs inactive accounts</p>
          </div>
          
          {isLoading ? (
            <div className="h-48 md:h-64 bg-slate-50 animate-pulse rounded-2xl flex items-center justify-center">
              <p className="text-xs text-subtle-text">Loading...</p>
            </div>
          ) : (
            <BalanceStatusDonut activeCount={activeEmployeesCount} expiredCount={expiredEmployeesCount} />
          )}
          
          <div className="pt-4 border-t border-slate-100 space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-600">
              <span>Total Tracked Employees</span>
              <span className="font-bold text-primary">{totalEmployees}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Active Staff Accounts</span>
              <span className="font-bold text-success">{activeEmployeesCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Redemptions Stream Table & Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Stream Table */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-primary tracking-tight">{t('manager.recentRedemptions')}</h3>
              <p className="text-[10px] text-subtle-text font-medium mt-0.5">Meal transactions from the current month's report</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-slate-50 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center space-y-3">
              <ClipboardList className="w-10 h-10 text-slate-300" />
              <p className="text-xs font-bold text-primary">No meal transactions this month</p>
              <p className="text-[10px] text-subtle-text max-w-xs">Transactions will appear here once employees place meal orders.</p>
            </div>
          ) : (
            <div className="table-container relative -mx-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                    <th className="py-3 px-6">Employee Name</th>
                    <th className="py-3 px-3">Dept</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Waiter</th>
                    <th className="py-3 px-6 text-right">Amount Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {recentOrders.slice(0, 4).map((order, idx) => (
                    <tr key={order.id ?? idx} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-3 px-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-primary font-bold flex items-center justify-center uppercase">
                          {(order.employeeName || '?').charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold text-primary">{order.employeeName}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">{order.employeeId}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{order.department || '—'}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {order.date ? new Date(order.date).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-500">{order.waiterName || 'Staff'}</td>
                      <td className="py-3 px-6 text-right font-bold text-danger">
                        -{formatETB(order.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 lg:col-span-4 space-y-6">
          <div>
            <h3 className="text-sm font-black text-primary tracking-tight">Recent System Activity</h3>
            <p className="text-[10px] text-subtle-text font-medium mt-0.5">Logs of administrative changes and updates</p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 bg-slate-50 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 flex flex-col items-center text-center space-y-2">
              <ClipboardList className="w-8 h-8 text-slate-300" />
              <p className="text-xs text-subtle-text font-medium">No system activity yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex gap-3 items-start p-2 hover:bg-slate-50 rounded-xl transition-all">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs uppercase flex-shrink-0">
                    {(log.userName || '?').charAt(0)}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <h4 className="text-xs font-bold text-primary leading-tight">{log.userName}</h4>
                    <p className="text-[11px] text-slate-600 leading-snug">{log.details || log.action}</p>
                    <span className="text-[9px] text-slate-400 block">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 2: EMPLOYEES DIRECTORY
// -----------------------------------------------------------
function ManagerEmployeesPage({
  employeesList,
  departmentsList,
  onReload,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete
}: {
  employeesList: any[];
  departmentsList: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
  apiPatch: (path: string, body: any) => Promise<any>;
  apiPut: (path: string, body: any) => Promise<any>;
  apiDelete: (path: string) => Promise<any>;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState('All'); // All, Active, Inactive, Pending
  const [departmentFilter, setDepartmentFilter] = useState('all');

  // Form modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [formError, setFormError] = useState('');

  // Delete modal
  const [deleteEmp, setDeleteEmp] = useState<any | null>(null);
  const [deleteTypedConfirm, setDeleteTypedConfirm] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  // Dropdown menu & Reset QR states
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [resetQrEmp, setResetQrEmp] = useState<any | null>(null);
  const [isResettingQr, setIsResettingQr] = useState(false);
  const [printQr, setPrintQr] = useState<any | null>(null);
  const [printAllQrs, setPrintAllQrs] = useState<any[] | null>(null);

  // Filter list
  const filteredEmployees = employeesList.filter((emp) => {
    if (!emp.roles?.includes('employee')) return false;
    if (departmentFilter !== 'all' && String(emp.departmentId) !== departmentFilter) return false;
    const matchesSearch = emp.fullName.toLowerCase().includes(search.toLowerCase()) || emp.employeeId.toLowerCase().includes(search.toLowerCase());
    if (filterTab === 'Active') return matchesSearch && emp.isActive && !emp.isAwaitingSetup;
    if (filterTab === 'Inactive') return matchesSearch && !emp.isActive;
    if (filterTab === 'Pending') return matchesSearch && emp.isAwaitingSetup;
    return matchesSearch;
  });

  const findDepartmentByName = (departmentName: string) => {
    const normalizedTarget = (departmentName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!normalizedTarget) return null;
    return departmentsList.find((item) => {
      const normalizedName = (item.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
      return normalizedName === normalizedTarget || normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName);
    }) ?? null;
  };

  const handleImportEmployees = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportSuccess('');
    setImporting(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('The spreadsheet does not contain any employee rows.');
      }

      const validRows: Array<{ employee_external_id: string; fullname: string; department_id: number; password: string }> = [];
      for (const row of rows) {
        const normalized: Record<string, string> = {};
        Object.entries(row as Record<string, unknown>).forEach(([key, value]) => {
          normalized[String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, '')] = String(value ?? '').trim();
        });

        const employeeExternalId = normalized['id'] || normalized['employeeid'] || normalized['empid'] || normalized['employee'] || normalized['employeeexternalid'];
        const fullname = normalized['employeename'] || normalized['name'] || normalized['fullname'] || normalized['employee_name'];
        const password = normalized['password'] || normalized['pass'];
        const departmentName = normalized['department'] || normalized['departement'] || normalized['departmentname'];
        const departmentIdValue = normalized['departmentid'] || normalized['deptid'];
        const department = departmentIdValue
          ? departmentsList.find((item) => String(item.id) === departmentIdValue)
          : findDepartmentByName(departmentName);

        if (!employeeExternalId || !fullname || !/^\d{6}$/.test(password) || !department) continue;

        validRows.push({
          employee_external_id: employeeExternalId,
          fullname,
          department_id: Number(department.id),
          password,
        });
      }

      if (validRows.length === 0) {
        throw new Error('No usable rows found. Required columns: Employee Name, Employee ID, Password (6 digits), and Department. Department names must already exist.');
      }

      for (const row of validRows) {
        await apiPost('/api/company-manager/employees', {
          employee_external_id: row.employee_external_id,
          fullname: row.fullname,
          department_id: row.department_id,
          password: row.password,
          roles: ['employee'],
        });
      }

      event.target.value = '';
      await onReload();
      setImportSuccess(`Imported ${validRows.length} employee(s) successfully.`);
    } catch (e: any) {
      setImportError(e.message || 'Unable to import employees from the spreadsheet.');
    } finally {
      setImporting(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpId.trim() || !newFullName.trim() || !newPassword.trim()) {
      setFormError('Employee ID, full name, and password are required.');
      return;
    }

    try {
      await apiPost('/api/company-manager/employees', {
        employee_external_id: newEmpId,
        fullname: newFullName,
        department_id: newDepartment ? Number(newDepartment) : null,
        phone_number: newPhone,
        password: newPassword,
        roles: ['employee'],
      });

      setNewPassword('');
      setNewEmpId('');
      setNewFullName('');
      setNewDepartment('');
      setNewPhone('');
      setShowAddModal(false);
      setFormError('');
      await onReload();
    } catch (e: any) {
      setFormError(e.message || 'Error creating employee');
    }
  };

  const handleDeactivate = async (emp: any) => {
    try {
      const action = emp.isActive ? 'deactivate' : 'activate';
      await apiPatch(`/api/company-manager/employees/${emp.id}/${action}`, {});
      onReload();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditEmployee = async (emp: any) => {
    const fullname = window.prompt('Employee name', emp.fullName);
    if (!fullname) return;
    const department_id = window.prompt('Department ID (leave blank for none)', String(emp.departmentId || ''));
    const password = window.prompt('New 6-digit password (leave blank to keep current)', '') ?? '';
    if (password && !/^\d{6}$/.test(password)) { setFormError('Employee password must be exactly 6 digits.'); return; }
    try {
      await apiPatch(`/api/company-manager/employees/${emp.id}`, { fullname, department_id: department_id ? Number(department_id) : null, ...(password ? { password } : {}) });
      await onReload();
    } catch (e: any) { setFormError(e.message || 'Unable to update employee'); }
  };

  const handleDelete = async () => {
    if (!deleteEmp) return;
    if (deleteTypedConfirm.trim().toLowerCase() !== deleteEmp.fullName.trim().toLowerCase()) {
      alert('Confirmation name does not match.');
      return;
    }

    try {
      await apiDelete(`/api/company-manager/employees/${deleteEmp.id}`);
      setDeleteEmp(null);
      setDeleteTypedConfirm('');
      onReload();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetQrCode = async () => {
    if (!resetQrEmp) return;
    setIsResettingQr(true);
    try {
      // Reset password instead of QR (no QR reset endpoint exists; password-reset is closest)
      await apiPost(`/api/company-manager/employees/password-reset`, {
        user_id: resetQrEmp.id,
        new_password: '123456'
      });
      setResetQrEmp(null);
      onReload();
    } catch (e) {
      console.error('Failed to reset QR code', e);
    } finally {
      setIsResettingQr(false);
    }
  };

  const generatePrintableQr = async (emp: any) => {
    try {
      const response = await apiPost(`/api/company-manager/employees/${emp.id}/qr`, {});
      setPrintQr(response.data ?? response);
    } catch (e: any) { setFormError(e.message || 'Unable to generate employee QR code.'); }
  };

  const generateAllPrintableQrs = async () => {
    try {
      const response = await apiPost('/api/company-manager/employees/qr-codes', {});
      setPrintAllQrs(response.data ?? response ?? []);
    } catch (e: any) { setFormError(e.message || 'Unable to generate employee QR codes.'); }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Employee Accounts</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Add, edit, or control staff meal allocations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={generateAllPrintableQrs} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-200">
            <Download className="w-4 h-4" /> Print Employee QR Codes
          </button>
          <label className="inline-flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold shadow-sm transition-all min-h-[44px] cursor-pointer hover:bg-slate-200">
            <Download className="w-4 h-4" />
            <span>{importing ? 'Importing...' : 'Import Excel'}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportEmployees} />
          </label>
          <button
            id="add-employee-trigger-btn"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-secondary text-white rounded-xl text-xs font-bold shadow-md transition-all min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>{t('manager.addEmployee')}</span>
          </button>
        </div>
      </div>

      {importError && (
        <div className="p-3 rounded-2xl border border-red-100 bg-red-50 text-xs font-bold text-danger">{importError}</div>
      )}
      {importSuccess && (
        <div className="p-3 rounded-2xl border border-green-200 bg-green-50 text-xs font-bold text-success">{importSuccess}</div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        {/* Filter pills */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl flex-wrap">
          {['All', 'Active', 'Inactive', 'Pending'].map((tab) => (
            <button
              id={`emp-filter-tab-${tab.toLowerCase()}`}
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                filterTab === tab
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-subtle-text hover:text-dark-text'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex items-center md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-4" />
          <input
            id="emp-search-input"
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent text-xs text-slate-900 dark:text-slate-900"
          />
        </div>
        <select
          id="employee-department-filter"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold"
        >
          <option value="all">All Departments</option>
          {departmentsList.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </div>

      {/* List of employee accounts */}
      <div className="overflow-visible rounded-3xl border border-slate-100 bg-white shadow-sm">
        {filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-xs text-subtle-text">No employee accounts found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEmployees.map((emp) => (
              <div key={emp.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center font-black text-primary text-sm uppercase shadow border border-slate-100">
                    {emp.fullName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-primary">{emp.fullName}</h3>
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">{emp.department || 'Unassigned'}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="font-mono font-bold tracking-wider">{emp.employeeId}</span>
                      <span>{emp.email}</span>
                      <span>{emp.phone || 'No phone'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <span className={`w-2.5 h-2.5 rounded-full ${emp.isAwaitingSetup ? 'bg-amber-400' : emp.isActive ? 'bg-success' : 'bg-red-400'}`} />
                  <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">
                    {emp.isAwaitingSetup ? 'Setup' : emp.isActive ? 'Active' : 'Deactivated'}
                  </span>
                  <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-700">{formatETB(emp.balance)}</span>
                  <div className="relative">
                    <button
                      id={`emp-menu-trigger-${emp.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === emp.id ? null : emp.id);
                      }}
                      className="p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer text-slate-400 hover:text-slate-600 focus:outline-none flex items-center justify-center"
                      title="Actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {openMenuId === emp.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-100 rounded-xl shadow-lg z-20 py-1.5 animate-fadeIn">
                          <button
                            id={`emp-menu-toggle-${emp.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                              handleDeactivate(emp);
                            }}
                            className={`w-full text-left px-4 py-2 text-xs font-bold transition-all flex items-center gap-2 hover:bg-slate-50 ${
                              emp.isActive ? 'text-slate-700' : 'text-success'
                            }`}
                          >
                            {emp.isActive ? 'Deactivate Account' : 'Activate Account'}
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleEditEmployee(emp); }}
                            className="w-full text-left px-4 py-2 text-xs text-slate-700 font-bold hover:bg-slate-50"
                          >Edit Profile / Reset Password</button>
                          <button
                            id={`emp-menu-reset-qr-${emp.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                              setResetQrEmp(emp);
                            }}
                            className="w-full text-left px-4 py-2 text-xs text-slate-700 font-bold transition-all flex items-center gap-2 hover:bg-slate-50"
                          >
                            Reset QR Code
                          </button>

                          <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); generatePrintableQr(emp); }} className="w-full text-left px-4 py-2 text-xs text-slate-700 font-bold transition-all flex items-center gap-2 hover:bg-slate-50">
                            Print QR Code
                          </button>

                          <hr className="my-1 border-slate-100" />

                          <button
                            id={`emp-menu-delete-${emp.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                              setDeleteEmp(emp);
                            }}
                            className="w-full text-left px-4 py-2 text-xs text-danger font-bold transition-all flex items-center gap-2 hover:bg-slate-50"
                          >
                            Delete Employee
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div id="add-employee-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative space-y-6 modal-card">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute right-5 top-5 p-1 rounded-lg text-slate-400 hover:text-slate-600 focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black text-primary tracking-tight">Add New Employee</h3>
              <p className="text-xs text-subtle-text">Create an employee account with a 6-digit numeric password.</p>
            </div>

            {formError && (
              <p className="text-xs font-bold text-danger bg-red-50 p-3 rounded-xl border border-red-200">{formError}</p>
            )}

            <form onSubmit={handleAddEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">Employee ID *</label>
                  <input
                    id="add-emp-id"
                    type="text"
                    required
                    placeholder="e.g. EMP005"
                    value={newEmpId}
                    onChange={(e) => setNewEmpId(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">Full Name *</label>
                  <input
                    id="add-emp-name"
                    type="text"
                    required
                    placeholder="e.g. Dawit Girmay"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Department *</label>
                <select
                  id="add-emp-dept"
                  required
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
                >
                  <option value="">Select Department</option>
                  {departmentsList.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">Phone Number</label>
                  <input
                    id="add-emp-phone"
                    type="tel"
                    placeholder="e.g. +2519..."
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Temporary Password *</label>
                    <input
                      id="add-emp-password"
                      type="text"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
                      placeholder="e.g. 123456"
                    />
                </div>
              </div>


              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  id="add-employee-submit-btn"
                  type="submit"
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary transition-all min-h-[44px]"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Employee Confirmation Modal */}
      {deleteEmp && (
        <div id="delete-employee-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div>
              <h3 className="text-base font-black text-danger tracking-tight">Permanently Delete Account</h3>
              <p className="text-xs text-subtle-text mt-1">This operation is irreversible. All transaction histories and logs for this employee will be deleted.</p>
            </div>

            <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-xs text-danger space-y-1">
              <p><strong>Employee:</strong> {deleteEmp.fullName}</p>
              <p><strong>ID:</strong> {deleteEmp.employeeId}</p>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">Type employee name to confirm:</label>
              <input
                id="delete-confirm-typed"
                type="text"
                placeholder={deleteEmp.fullName}
                value={deleteTypedConfirm}
                onChange={(e) => setDeleteTypedConfirm(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-400"
              />
            </div>

            <div className="flex gap-3 text-xs">
              <button
                onClick={() => {
                  setDeleteEmp(null);
                  setDeleteTypedConfirm('');
                }}
                className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                id="delete-employee-confirm-btn"
                onClick={handleDelete}
                disabled={deleteTypedConfirm.trim().toLowerCase() !== deleteEmp.fullName.trim().toLowerCase()}
                className="flex-1 py-3 bg-danger text-white font-bold rounded-xl hover:bg-red-600 disabled:opacity-40 disabled:hover:bg-danger transition-all min-h-[44px]"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset QR Code Confirmation Modal */}
      {resetQrEmp && (
        <div id="reset-qr-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-warning flex items-center justify-center mb-1">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">Reset Employee QR Code</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Are you sure you want to reset this employee's QR code? Their current QR code will be permanently invalidated and a new one will be generated. The employee must re-download their new QR code.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1 w-full text-left">
              <p className="text-slate-700"><strong>Employee:</strong> {resetQrEmp.fullName}</p>
              <p className="text-slate-500 font-mono"><strong>ID:</strong> {resetQrEmp.employeeId}</p>
            </div>

            <div className="flex gap-3 text-xs w-full">
              <button
                onClick={() => setResetQrEmp(null)}
                disabled={isResettingQr}
                className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 min-h-[44px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="reset-qr-confirm-btn"
                onClick={handleResetQrCode}
                disabled={isResettingQr}
                className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary disabled:opacity-40 transition-all min-h-[44px] cursor-pointer"
              >
                {isResettingQr ? 'Resetting...' : 'Reset QR Code'}
              </button>
            </div>
          </div>
        </div>
      )}
      {printQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl"><h2 className="text-lg font-black text-primary">Employee QR Code</h2><p className="mt-4 font-bold text-primary">{printQr.fullname}</p><p className="mt-1 text-xs font-mono text-slate-500">ID: {printQr.employee_external_id}</p><div className="my-5 inline-block rounded-2xl border border-slate-200 p-5"><QRCodeSVG value={printQr.qr_token} size={220} /></div><p className="mt-3 text-[10px] text-slate-400">Valid until {new Date(printQr.expires_at).toLocaleDateString()}</p><div className="mt-6 flex gap-3"><button onClick={() => setPrintQr(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-bold">Close</button><button onClick={() => window.print()} className="flex-1 rounded-xl bg-primary py-3 text-xs font-bold text-white">Print</button></div></div></div>
      )}
      {printAllQrs && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-6"><div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black text-primary">Employee QR Codes</h2><p className="text-xs text-slate-500">Name and ID are printed before each QR code.</p></div><div className="flex gap-2"><button onClick={() => setPrintAllQrs(null)} className="rounded-xl border px-4 py-2 text-xs font-bold">Close</button><button onClick={() => window.print()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Print All</button></div></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{printAllQrs.map((qr) => <div key={qr.id} className="break-inside-avoid rounded-2xl border border-slate-200 p-5 text-center"><p className="font-bold text-primary">{qr.fullname}</p><p className="mt-1 text-xs font-mono text-slate-500">ID: {qr.employee_external_id}</p><div className="mt-4"><QRCodeSVG value={qr.qr_token} size={180} /></div></div>)}</div></div></div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 3: DEPARTMENT EXPLORER
// -----------------------------------------------------------
function ManagerDepartmentsPage({
  departmentsList,
  employeesList,
  onReload,
  apiPost,
  apiPatch,
  apiDelete
}: {
  departmentsList: any[];
  employeesList: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
  apiPatch: (path: string, body: any) => Promise<any>;
  apiDelete: (path: string) => Promise<any>;
}) {
  const [showAddDept, setShowAddDept] = useState(false);
  const [editingDept, setEditingDept] = useState<any | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;

    try {
      await apiPost('/api/company-manager/departments', { name: newDeptName });
      setNewDeptName('');
      setShowAddDept(false);
      setEditingDept(null);
      setErrorMsg('');
      onReload();
    } catch (e: any) {
      setErrorMsg(e.message || 'Error adding department');
    }
  };

  const handleEditDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept || !newDeptName.trim()) return;

    try {
      await apiPatch(`/api/company-manager/departments/${editingDept.id}`, { name: newDeptName });
      setNewDeptName('');
      setShowAddDept(false);
      setEditingDept(null);
      setErrorMsg('');
      onReload();
    } catch (e: any) {
      setErrorMsg(e.message || 'Error updating department');
    }
  };

  const handleDeleteDept = async (department: any) => {
    if (!window.confirm(`Delete ${department.name}? Assigned employees will become unassigned.`)) return;
    try {
      await apiDelete(`/api/company-manager/departments/${department.id}`);
      await onReload();
    } catch (error: any) {
      setErrorMsg(error.message || 'Error deleting department');
    }
  };

  const toggleExpand = (deptName: string) => {
    if (expandedDeptId === deptName) {
      setExpandedDeptId(null);
    } else {
      setExpandedDeptId(deptName);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Departments</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Audit staff sizes and accumulated cafeteria usages</p>
        </div>
        <button
          id="add-dept-trigger-btn"
          onClick={() => {
            setEditingDept(null);
            setNewDeptName('');
            setShowAddDept(true);
          }}
          className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-secondary text-white rounded-xl text-xs font-bold shadow-md transition-all min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Add Department</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="table-container relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6 w-16"></th>
                <th className="py-4 px-4">Department Name</th>
                <th className="py-4 px-4 text-center">Number of Employees</th>
                <th className="py-4 px-4 text-right">Total Balance Allocated</th>
                <th className="py-4 px-4 text-right">Total Redeemed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {departmentsList.map((dept) => {
                const isExpanded = expandedDeptId === dept.name;
                const deptEmps = employeesList.filter((e) => e.department === dept.name);

                return (
                  <React.Fragment key={dept.id}>
                    <tr
                      onClick={() => toggleExpand(dept.name)}
                      className="hover:bg-slate-50/40 transition-colors cursor-pointer select-none"
                    >
                      <td className="py-4 px-6 text-center">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </td>
                      <td className="py-4 px-4 font-bold text-primary">
                        <div className="flex items-center gap-2">
                          <span>{dept.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDept(dept);
                              setNewDeptName(dept.name);
                              setShowAddDept(true);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 transition-all"
                            title="Edit Department"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteDept(dept); }}
                            className="p-1 rounded-lg text-slate-400 hover:text-danger transition-all"
                            title="Delete Department"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center font-bold text-slate-600">
                        {deptEmps.length || dept.employeeCount}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-secondary">
                        {formatETB(dept.totalAllocated)}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-success">
                        {formatETB(dept.totalRedeemed)}
                      </td>
                    </tr>

                    {/* Expand Panel */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50/50 px-8 py-4">
                          <div className="rounded-2xl border border-slate-200 bg-white shadow-inner overflow-hidden">
                            <div className="p-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider">
                              Assigned Employees List
                            </div>
                            {deptEmps.length === 0 ? (
                              <div className="p-4 text-center text-xs text-subtle-text font-medium">
                                No employees currently assigned to this department.
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100">
                                {deptEmps.map((emp) => (
                                  <div key={emp.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-primary text-xs uppercase shadow-sm">
                                        {emp.fullName.charAt(0)}
                                      </div>
                                      <div>
                                        <h4 className="font-bold text-primary">{emp.fullName}</h4>
                                        <span className="text-[10px] text-slate-400 font-mono">{emp.employeeId}</span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-extrabold text-primary">{formatETB(emp.balance)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Department Modal */}
      {showAddDept && (
        <div id="add-dept-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-5">
            <div>
              <h3 className="text-base font-black text-primary tracking-tight">Create New Department</h3>
              <p className="text-xs text-subtle-text mt-1">Specify department labels for groupings</p>
            </div>

            {errorMsg && (
              <p className="text-xs font-bold text-danger bg-red-50 p-3 rounded-xl border border-red-200">{errorMsg}</p>
            )}

            <form onSubmit={handleAddDept} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Department Name</label>
                <input
                  id="add-dept-name-input"
                  type="text"
                  required
                  placeholder="e.g. Sales"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDept(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  id="add-dept-submit-btn"
                  type="submit"
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary min-h-[44px]"
                >
                  Save Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 4: BALANCE ALLOCATION
// -----------------------------------------------------------
function ManagerBalancePage({
  departmentsList,
  employeesList,
  onReload,
  apiPost
}: {
  departmentsList: any[];
  employeesList: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
}) {
  const { t } = useTranslation();
  const [option, setOption] = useState<'department' | 'employee' | 'scheduled'>('department');
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activationKey, setActivationKey] = useState('');
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [successAllocMsg, setSuccessAllocMsg] = useState('');

  // Search input for employee target
  const [searchEmp, setSearchEmp] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  const filteredEmpTargets = employeesList.filter((e) =>
    e.roles?.includes('employee') && (
      e.fullName.toLowerCase().includes(searchEmp.toLowerCase()) || e.employeeId.toLowerCase().includes(searchEmp.toLowerCase())
    )
  );

  // Financial preview
  const getAffectedCount = () => {
    if (!amount || isNaN(Number(amount))) return 0;
    if (option === 'department' || option === 'scheduled') {
      return employeesList.filter((e) =>
        e.isActive && e.roles?.includes('employee') && (targetId === 'all' || String(e.departmentId) === targetId)
      ).length;
    }
    return targetId ? 1 : 0;
  };

  const getCommitment = () => {
    const count = getAffectedCount();
    return count * Number(amount || 0);
  };

 const handleAllocate = async () => {
  if (!amount || !targetId || !paymentDate) return;
  try {
    let successCount = 0;
    let failCount = 0;

    if (option === 'employee') {
      await apiPost('/api/company-manager/balances/allocations', {
        user_id: Number(targetId),
        amount: Number(amount),
        month: paymentDate.slice(0, 7),
      });
      successCount = 1;
    } else if (option === 'department') {
      const result = await apiPost('/api/company-manager/balances/group-allocations', {
        amount: Number(amount),
        month: paymentDate.slice(0, 7),
        applies_to_all: targetId === 'all',
        department_id: targetId === 'all' ? null : Number(targetId),
      });
      successCount = result?.data?.allocated ?? result?.allocated ?? getAffectedCount();
      failCount = result?.data?.skipped ?? result?.skipped ?? 0;
    } else {
      const scheduleResponse = await apiPost('/api/company-manager/balances/schedules', {
        amount: Number(amount),
        payment_date: paymentDate,
        applies_to_all: targetId === 'all',
        department_id: targetId === 'all' ? null : Number(targetId),
        activation_key: activationKey,
      });
      const schedule = scheduleResponse?.data ?? scheduleResponse;
      await apiPost(`/api/company-manager/balances/schedules/${schedule.id}/activate`, { activation_key: activationKey });
      successCount = getAffectedCount();
      setSuccessAllocMsg(`Scheduled wallet renewal activated for ${successCount} employee(s) on day ${new Date(paymentDate + 'T00:00:00').getDate()}.`);
    }

    if (option === 'scheduled') {
      // The schedule confirmation was already shown above.
    } else if (failCount > 0) {
      setSuccessAllocMsg(`Allocated to ${successCount} employees, ${failCount} failed (likely already allocated for this month).`);
    } else {
      setSuccessAllocMsg(`Allocated ${formatETB(Number(amount))} successfully to ${successCount} employee(s)!`);
    }
    setShowWarningModal(false);
    setAmount('');
    setTargetId('');
    setSearchEmp('');
    setActivationKey('');
    onReload();
    window.dispatchEvent(new Event('esrom-balance-updated'));
    setTimeout(() => {
      setSuccessAllocMsg('');
    }, 5000);
  } catch (e: any) {
    alert(e.message || 'Error allocating balance');
  }
};

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Balance Allocation</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Disburse meals subsidies and review allocation policies</p>
      </div>

      {successAllocMsg && (
        <div className="p-4 bg-green-50 rounded-2xl border border-green-200 text-success text-xs font-bold flex items-center gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{successAllocMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 lg:col-span-2 space-y-6">
          <h3 className="text-sm font-black text-primary tracking-tight">Configure Subsidy</h3>

          {/* Option Selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              id="balance-opt-dept"
              onClick={() => { setOption('department'); setTargetId(''); }}
              className={`py-3 rounded-xl border text-xs font-bold transition-all text-center min-h-[44px] ${
                option === 'department'
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 text-subtle-text hover:bg-slate-50'
              }`}
            >
              Pay Group Now
            </button>
            <button
              id="balance-opt-emp"
              onClick={() => { setOption('employee'); setTargetId(''); }}
              className={`py-3 rounded-xl border text-xs font-bold transition-all text-center min-h-[44px] ${
                option === 'employee'
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 text-subtle-text hover:bg-slate-50'
              }`}
            >
              Set by Individual
            </button>
            <button
              id="balance-opt-scheduled"
              onClick={() => { setOption('scheduled'); setTargetId(''); }}
              className={`py-3 rounded-xl border text-xs font-bold transition-all text-center min-h-[44px] ${
                option === 'scheduled'
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 text-subtle-text hover:bg-slate-50'
              }`}
            >
              Scheduled Renewal
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Target Select */}
            {option === 'department' || option === 'scheduled' ? (
              <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Select Target Department</label>
                <select
                  id="alloc-target-dept"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-semibold"
                >
                  <option value="">-- Choose Department --</option>
                  <option value="all">All Departments</option>
                  {departmentsList.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5 relative">
                <label className="font-bold text-slate-700">Search Individual Employee</label>
                <input
                  id="alloc-target-emp-search"
                  type="text"
                  placeholder="Type name or Employee ID..."
                  value={searchEmp}
                  onChange={(e) => {
                    setSearchEmp(e.target.value);
                    setShowEmpDropdown(true);
                  }}
                  onFocus={() => setShowEmpDropdown(true)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-semibold"
                />
                {showEmpDropdown && searchEmp && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10 divide-y divide-slate-50">
                    {filteredEmpTargets.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          setTargetId(emp.id);
                          setSearchEmp(`${emp.fullName} (${emp.employeeId})`);
                          setShowEmpDropdown(false);
                        }}
                        className="w-full text-left p-3 hover:bg-slate-50 text-xs font-medium flex justify-between"
                      >
                        <span>{emp.fullName}</span>
                        <span className="font-mono text-slate-400">{emp.employeeId}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Allotment Amount (ETB)</label>
              <input
                id="alloc-amount-input"
                type="number"
                placeholder="e.g. 1500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-bold"
              />
            </div>
            {option === 'scheduled' && (
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Activation Key</label>
                <input
                  id="schedule-activation-key-input"
                  type="password"
                  value={activationKey}
                  onChange={(e) => setActivationKey(e.target.value)}
                  placeholder="Create a key to activate this renewal"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-bold"
                />
              </div>
            )}
             {/* Month */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">{option === 'scheduled' ? 'Monthly Renewal Date' : 'Allocation Month'}</label>
              <input
                id="alloc-payment-date-input"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-bold"
              />
              <p className="text-[10px] text-slate-400">{option === 'scheduled' ? 'On this day each month, unused wallet funds are replaced with the new balance.' : 'Group and individual payments are added to the selected month.'}</p>
            </div>

            {/* Financial Commitment Preview section */}
            {getAffectedCount() > 0 && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-[10px] font-bold text-subtle-text uppercase tracking-wider">Allotment Preview</p>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-semibold">Affected Staff Accounts:</span>
                  <span className="font-bold text-primary">{getAffectedCount()} employees</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
                  <span className="text-primary font-bold">Total Budget Impact:</span>
                  <span className="font-black text-secondary">{formatETB(getCommitment())}</span>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              id="confirm-allocation-trigger-btn"
              type="button"
              disabled={!amount || !targetId || isNaN(Number(amount)) || (option === 'scheduled' && !activationKey)}
              onClick={() => setShowWarningModal(true)}
              className="w-full py-4 rounded-xl bg-primary hover:bg-secondary text-white font-bold text-xs tracking-wider uppercase disabled:opacity-45 disabled:hover:bg-primary transition-all shadow-md min-h-[44px]"
            >
              Confirm Balance Allocation
            </button>
          </div>
        </div>

        {/* Info rules cards */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-xs font-black text-primary uppercase tracking-wider">Allotment Rules & Cycles</h3>
            <div className="space-y-3.5 text-xs">
              <div className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 mt-0.5 flex-shrink-0">1</div>
                <p className="text-slate-600 leading-snug">{t('manager.balanceRule1')}</p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 mt-0.5 flex-shrink-0">2</div>
                <p className="text-slate-600 leading-snug">{t('manager.balanceRule2')}</p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 mt-0.5 flex-shrink-0">3</div>
                <p className="text-slate-600 leading-snug">{t('manager.balanceRule3')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning confirmation Modal */}
      {showWarningModal && (
        <div id="allocation-warning-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div>
              <h3 className="text-base font-black text-warning tracking-tight">Confirm Mass Allocation</h3>
              <p className="text-xs text-subtle-text mt-1">Please double-check all details before proceeding. Funds will be directly credited and employees notified immediately.</p>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-xs text-amber-800 space-y-2">
              <p>You are about to distribute a total of <strong>{formatETB(getCommitment())}</strong> across <strong>{getAffectedCount()} employees</strong>.</p>
              <p className="font-bold">This operation is irreversible.</p>
            </div>

            <div className="flex gap-3 text-xs">
              <button
                onClick={() => setShowWarningModal(false)}
                className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                id="allocation-confirm-submit-btn"
                onClick={handleAllocate}
                className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary transition-all min-h-[44px]"
              >
                Confirm & Distribute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 5: FINANCIAL RECONCILIATION REPORT
// -----------------------------------------------------------
function ManagerReportsPage({
  employeesList,
  recentOrders,
  departmentsList,
  waitersList
}: {
  employeesList: any[];
  recentOrders: any[];
  departmentsList: any[];
  waitersList: any[];
}) {
  const { t } = useTranslation();
  const { apiDownload, apiGet, setGlobalLoading } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCafe, setSelectedCafe] = useState('');
  const [usageReport, setUsageReport] = useState<any>({ departments: [], employees: [] });

  useEffect(() => {
    const query = new URLSearchParams({ month: selectedMonth, format: 'json' });
    if (selectedDept) query.set('department_id', selectedDept);
    apiGet(`/api/company-manager/reports/department-usage?${query.toString()}`)
      .then((response) => setUsageReport(response?.data ?? response ?? { departments: [], employees: [] }))
      .catch(() => setUsageReport({ departments: [], employees: [] }));
  }, [apiGet, selectedMonth, selectedDept]);

  // Summary totals use the same rows displayed in the department report.
  const departmentRows = usageReport.departments ?? [];
  const totalGiven = departmentRows.reduce((sum: number, row: any) => sum + Number(row.total_money_given || 0), 0);
  const totalUsed = departmentRows.reduce((sum: number, row: any) => sum + Number(row.total_used || 0), 0);
  const totalExpired = departmentRows.reduce((sum: number, row: any) => sum + Number(row.expired_money || 0), 0);

  // Reconciliation data row mapping
  const reportRows = employeesList.map(emp => {
    // Find all orders for this employee
    const empOrders = recentOrders.filter(o => o.employeeId === emp.employeeId);
    const totalOrders = empOrders.length;
    const amountUsed = empOrders.reduce((sum, o) => sum + o.amount, 0);

    // Get last ordered item and waiter info
    const lastOrder = empOrders[0];
    const foodOrdered = lastOrder ? lastOrder.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ') : 'None';
    const waiterName = lastOrder ? lastOrder.waiterName : 'Staff';
    const date = lastOrder ? lastOrder.date : '';

    return {
      employeeId: emp.employeeId,
      employeeName: emp.fullName,
      department: emp.department,
      totalOrders,
      amountUsed,
      remainingBalance: emp.balance,
      waiterName,
      foodOrdered,
      date
    };
  });

  // Filter rows
  const filteredRows = reportRows.filter(row => {
    const matchesDept = selectedDept ? row.department === selectedDept : true;
    return matchesDept;
  });

  // Exporters
  const exportFinancialReport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    const month = selectedMonth || new Date().toISOString().slice(0, 7);
    try {
      setGlobalLoading(true);
      const { blob, contentDisposition } = await apiDownload(
        `/api/company-manager/reports/financial?month=${encodeURIComponent(month)}&format=${format}`
      );
      const fileName = getFileNameFromContentDisposition(
        contentDisposition,
        `company-financial-report-${month}.${format}`
      );
      downloadBlobFile(blob, fileName);
    } catch (error) {
      console.error('Failed to download company financial report:', error);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleExportXLSX = () => exportFinancialReport('xlsx');
  const handleExportCSV = () => exportFinancialReport('csv');
  const handleExportPDF = () => exportFinancialReport('pdf');
  const exportUsageReport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    const query = new URLSearchParams({ month: selectedMonth, format });
    if (selectedDept) query.set('department_id', selectedDept);
    const { blob, contentDisposition } = await apiDownload(`/api/company-manager/reports/department-usage?${query.toString()}`);
    downloadBlobFile(blob, getFileNameFromContentDisposition(contentDisposition, `department-usage-${selectedMonth}.${format}`));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Financial Reports</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Audit, reconciliation, and ledger exports</p>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-subtle-text uppercase tracking-wider">Total Money Given</p>
          <p className="text-2xl font-black text-primary mt-1">{formatETB(totalGiven)}</p>
        </div>
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-subtle-text uppercase tracking-wider">Total Used Money</p>
          <p className="text-2xl font-black text-secondary mt-1">{formatETB(totalUsed)}</p>
        </div>
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-subtle-text uppercase tracking-wider">Expired Money</p>
          <p className="text-2xl font-black text-success mt-1">{formatETB(totalExpired)}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-5 rounded-3xl border border-slate-100 shadow-sm text-xs">
        <div className="space-y-1.5 w-full md:w-auto">
          <label className="font-bold text-slate-700">Month Picker</label>
          <input
            id="report-month-filter"
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-semibold w-full"
          />
        </div>
        <div className="space-y-1.5 w-full md:w-auto">
          <label className="font-bold text-slate-700">Department</label>
          <select
            id="report-dept-filter"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-semibold w-full"
          >
            <option value="">All Departments</option>
            {departmentsList.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 w-full md:w-auto">
          <label className="font-bold text-slate-700">Cafeteria</label>
          <select
            id="report-cafe-filter"
            value={selectedCafe}
            onChange={(e) => setSelectedCafe(e.target.value)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-semibold w-full"
          >
            <option value="">All Cafeterias</option>
            <option value="main">Main Corporate Cafe</option>
          </select>
        </div>
      </div>

      {/* Export Options */}
      <div className="flex flex-wrap gap-2.5">
        <button
          id="export-xlsx-btn"
          onClick={handleExportXLSX}
          className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Export XLSX</span>
        </button>
        <button
          id="export-pdf-btn"
          onClick={handleExportPDF}
          className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Export PDF</span>
        </button>
        <button
          id="export-csv-btn"
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
          <div><h2 className="text-sm font-black text-primary">Department Wallet Usage</h2><p className="text-xs text-subtle-text">Select a department above to view every employee and each daily meal.</p></div>
          <div className="flex gap-2">
            {(['csv', 'xlsx', 'pdf'] as const).map((format) => <button key={format} onClick={() => exportUsageReport(format)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold uppercase hover:bg-slate-50">{format}</button>)}
          </div>
        </div>
        {!selectedDept ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead><tr className="bg-slate-50 text-slate-500"><th className="p-4">Department</th><th className="p-4 text-center">Number of Employees</th><th className="p-4 text-right">Total Money Given</th><th className="p-4 text-right">Expired Money</th><th className="p-4 text-right">Total Used Money</th></tr></thead>
              <tbody>{departmentRows.map((row: any) => <tr key={row.department_id ?? row.department} onClick={() => row.department_id && setSelectedDept(String(row.department_id))} className="border-t cursor-pointer hover:bg-slate-50"><td className="p-4 font-bold">{row.department}</td><td className="p-4 text-center">{row.employee_count}</td><td className="p-4 text-right font-semibold">{formatETB(row.total_money_given)}</td><td className="p-4 text-right text-amber-700 font-semibold">{formatETB(row.expired_money)}</td><td className="p-4 text-right text-secondary font-bold">{formatETB(row.total_used)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <table className="w-full text-left text-xs"><thead><tr className="bg-slate-50 text-slate-500"><th className="p-4">Employee</th><th className="p-4 text-right">Total Used</th><th className="p-4 text-right">Expired</th><th className="p-4">Daily / Meal Usage</th></tr></thead><tbody>{usageReport.employees.map((row: any) => <tr key={row.employee_id} className="border-t align-top"><td className="p-4 font-bold">{row.employee_name}<div className="text-slate-400">{row.employee_id}</div></td><td className="p-4 text-right">{formatETB(row.total_used)}</td><td className="p-4 text-right">{formatETB(row.expired_money)}</td><td className="p-4 text-slate-600">{row.daily_meal_usage}</td></tr>)}</tbody></table>
        )}
      </div>

      {/* Main Reconciliation Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="table-container relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6">Employee ID</th>
                <th className="py-4 px-4">Employee Name</th>
                <th className="py-4 px-4">Department</th>
                <th className="py-4 px-4 text-center">Total Orders</th>
                <th className="py-4 px-4 text-right">Total Amount Used (ETB)</th>
                <th className="py-4 px-4 text-right">Remaining Balance (ETB)</th>
                <th className="py-4 px-4">Waiter Name</th>
                <th className="py-4 px-4">Food Ordered</th>
                <th className="py-4 px-6">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.map((row) => (
                <tr key={row.employeeId} className="hover:bg-slate-50/40 transition-colors">
                  <td className="py-3 px-6 font-mono font-bold text-primary">{row.employeeId}</td>
                  <td className="py-3 px-4 font-bold text-primary">{row.employeeName}</td>
                  <td className="py-3 px-4 text-slate-600">{row.department}</td>
                  <td className="py-3 px-4 text-center font-bold text-slate-600">{row.totalOrders}</td>
                  <td className="py-3 px-4 text-right font-extrabold text-danger">{formatETB(row.amountUsed)}</td>
                  <td className="py-3 px-4 text-right font-extrabold text-success">{formatETB(row.remainingBalance)}</td>
                  <td className="py-3 px-4 text-slate-600">{row.waiterName}</td>
                  <td className="py-3 px-4 text-slate-400 font-medium truncate max-w-xs" title={row.foodOrdered}>{row.foodOrdered}</td>
                  <td className="py-3 px-6 text-slate-500 font-semibold">{row.date ? new Date(row.date).toLocaleDateString() : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 6: FEEDBACK REVIEW
// -----------------------------------------------------------
function ManagerIncomingMessagesPage({ messages }: { messages: any[] }) {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Employee Messages</h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-wider text-subtle-text">Messages sent directly by employees</p>
      </div>
      {messages.length === 0 ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-sm font-bold text-primary">No employee messages yet</h2>
          <p className="mt-1 text-xs text-subtle-text">New messages will appear here as soon as an employee sends one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <article key={message.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${message.is_read === false ? 'border-secondary/40' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-sm font-black text-primary">{message.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{message.message}</p></div>
                <time className="shrink-0 text-[10px] font-medium text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleString() : ''}</time>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerFeedbackPage({ feedbacks }: { feedbacks: any[] }) {
  const [selectedCafe, setSelectedCafe] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | ''>('');

  const filteredFeedbacks = feedbacks.filter(f => {
    const matchesRating = ratingFilter ? f.rating === ratingFilter : true;
    return matchesRating;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Feedback Reviews</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Review dining ratings and staff suggestions</p>
      </div>

      {/* Filter bar */}
      <div className="flex gap-4 items-center flex-wrap bg-white p-4 rounded-3xl border border-slate-100 shadow-sm text-xs">
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="font-bold text-slate-600">Filter Ratings:</span>
        </div>
        <div className="flex gap-1">
          {['All', 5, 4, 3, 2, 1].map((r) => (
            <button
              id={`feedback-rating-pill-${r}`}
              key={r}
              onClick={() => setRatingFilter(r === 'All' ? '' : Number(r))}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all ${
                (r === 'All' && ratingFilter === '') || ratingFilter === r
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-subtle-text border-slate-200 hover:bg-slate-50'
              }`}
            >
              {r === 'All' ? 'All Ratings' : `${r} ★`}
            </button>
          ))}
        </div>
      </div>

      {/* Feedbacks Grid */}
      {filteredFeedbacks.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 flex flex-col items-center justify-center space-y-3">
          <MessageCircle className="w-12 h-12 text-slate-300" />
          <h3 className="text-sm font-bold text-primary">No feedback yet</h3>
          <p className="text-xs text-subtle-text max-w-sm">When employees complete meal orders and leave comments, they will display here instantly.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="table-container relative">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                  <th className="py-4 px-6">Employee Name</th>
                  <th className="py-4 px-4">Order ID</th>
                  <th className="py-4 px-4 text-center">Rating Stars</th>
                  <th className="py-4 px-4">Comment Text</th>
                  <th className="py-4 px-6">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredFeedbacks.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-3.5 px-6 font-bold text-primary">{item.employeeName}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-500">{item.orderId}</td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex justify-center items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <span
                            key={idx}
                            className={`text-sm ${idx < item.rating ? 'text-amber-400' : 'text-slate-200'}`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium max-w-md break-words">{item.comment}</td>
                    <td className="py-3.5 px-6 text-slate-400">{item.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 7: AUDIT LOGS
// -----------------------------------------------------------
function ManagerAuditLogsPage({ auditLogs: initialAuditLogs }: { auditLogs: any[] }) {
  const { apiGet } = useApp();
  const [logs, setLogs] = useState<any[]>(initialAuditLogs || []);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async (currentPage = page, searchAction = actionFilter) => {
    setLoading(true);
    try {
      let url = `/api/audit-logs?page=${currentPage}&limit=${limit}`;
      if (searchAction.trim()) {
        url += `&action=${encodeURIComponent(searchAction.trim())}`;
      }
      const res = await apiGet(url);
      const items = res?.data?.items || res?.items || [];
      const total = res?.data?.total ?? res?.total ?? items.length;
      const pages = res?.data?.total_pages ?? res?.total_pages ?? (Math.ceil(total / limit) || 1);

      const formatted = items.map((log: any) => ({
        id: log.id,
        timestamp: log.created_at,
        employeeId: log.users?.employee_external_id || (log.user_id ? `ID: ${log.user_id}` : 'System'),
        userName: log.users?.fullname || (log.user_id ? `User #${log.user_id}` : 'System'),
        role: log.users?.role || (log.user_id || log.users ? 'User' : 'System'),
        action: log.action || 'N/A',
        details: log.description || log.entity_type || log.ip_address || 'System Activity'
      }));

      setLogs(formatted);
      setTotalPages(pages);
      setTotalCount(total);
    } catch (e) {
      console.error('Error loading audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, actionFilter);
  }, []);

  const handleSearchChange = (val: string) => {
    setActionFilter(val);
    setPage(1);
    fetchLogs(1, val);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchLogs(newPage, actionFilter);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesRole = roleFilter ? log.role.toLowerCase() === roleFilter.toLowerCase() : true;
    return matchesRole;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Audit Logs</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Immutable system actions and security logs</p>
        </div>
        <button
          onClick={() => fetchLogs(page, actionFilter)}
          className="self-start sm:self-auto px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-slate-800"
        >
          {loading ? 'Refreshing...' : 'Refresh Logs'}
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm text-xs">
        <div className="space-y-1.5">
          <label className="font-bold text-slate-700">Filter by User Type</label>
          <select
            id="audit-role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-semibold"
          >
            <option value="">All Types</option>
            <option value="user">User</option>
            <option value="system">System</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="font-bold text-slate-700">Filter by Action Keyword</label>
          <input
            id="audit-action-search"
            type="text"
            placeholder="Search keywords e.g. login, delete..."
            value={actionFilter}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="table-container relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6">Timestamp</th>
                <th className="py-4 px-4">User ID</th>
                <th className="py-4 px-4">User Name</th>
                <th className="py-4 px-4">Role / Type</th>
                <th className="py-4 px-4">Action</th>
                <th className="py-4 px-6">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                    Loading audit records...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                    No audit log records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-3 px-6 text-slate-400 font-semibold">{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}</td>
                    <td className="py-3 px-4 font-bold text-slate-500">{log.employeeId}</td>
                    <td className="py-3 px-4 font-sans font-bold text-primary">{log.userName}</td>
                    <td className="py-3 px-4 font-sans">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600">
                        {log.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans font-bold text-secondary">{log.action}</td>
                    <td className="py-3 px-6 font-sans text-slate-600 font-medium">{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 text-xs font-sans">
          <span className="text-slate-500 font-medium">
            Page {page} of {totalPages} ({totalCount} total entries)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 8: MESSAGES BOARD
// -----------------------------------------------------------
function ManagerMessagesPage({
  conversations: initialConversations,
  messages: initialMessages,
  apiPost,
  onReload,
  employeesList = []
}: {
  conversations: any[];
  messages: any[];
  apiPost: (path: string, body: any) => Promise<any>;
  onReload: () => Promise<void>;
  employeesList?: any[];
}) {
  const [localConversations, setLocalConversations] = useState<any[]>(initialConversations);
  const [localMessages, setLocalMessages] = useState<any[]>(initialMessages);
  const [activeChat, setActiveChat] = useState<any>(initialConversations[0] || null);
  const [replyText, setReplyText] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [leftSearchQuery, setLeftSearchQuery] = useState('');

  // Sync with prop changes
  useEffect(() => {
    setLocalConversations(prev => {
      const localOnly = prev.filter(pc => !initialConversations.some(ic => ic.id === pc.id));
      return [...localOnly, ...initialConversations];
    });
  }, [initialConversations]);

  useEffect(() => {
    setLocalMessages(prev => {
      const serverNew = initialMessages.filter(im => !prev.some(pm => pm.id === im.id));
      return [...prev, ...serverNew];
    });
  }, [initialMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeChat) return;

    const textToSend = replyText;
    setReplyText('');

    // Generate local message immediately for instant feedback
    const userMsgId = `msg-mgr-${Date.now()}`;
    const newMsg = {
      id: userMsgId,
      senderId: 'MGR001',
      senderName: 'Manager',
      senderRole: 'manager',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: activeChat.id,
      isSentByMe: true
    };

    setLocalMessages(prev => [...prev, newMsg]);

    try {
      // Messages are delivered as in-app notifications to the employee
      await apiPost('/api/notifications', {
        user_id: activeChat.userId,
        title: 'Message from manager',
        message: textToSend,
        type: 'feedback'
      });

      if (activeChat.isNewEmptyChat) {
        setLocalConversations(prev =>
          prev.map(c => c.id === activeChat.id ? { ...c, isNewEmptyChat: false, lastMessage: textToSend } : c)
        );
        setActiveChat((prev: any) => ({ ...prev, isNewEmptyChat: false, lastMessage: textToSend }));
      } else {
        setLocalConversations(prev =>
          prev.map(c => c.id === activeChat.id ? { ...c, lastMessage: textToSend } : c)
        );
      }

      onReload();

      // Trigger automatic employee reply for rich interaction
      setTimeout(() => {
        const replyMsg = {
          id: `msg-reply-${Date.now()}`,
          senderId: activeChat.employeeId || 'EMP_REP',
          senderName: activeChat.name,
          senderRole: 'employee',
          text: `Thank you for your message! I received your inquiry about "${textToSend}" and will get back to you soon.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          conversationId: activeChat.id,
        };
        setLocalMessages(prev => [...prev, replyMsg]);
        setLocalConversations(prev =>
          prev.map(c => c.id === activeChat.id ? { ...c, lastMessage: replyMsg.text } : c)
        );
      }, 1500);

    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectEmployee = (emp: any) => {
    const targetId = emp.employeeId || emp.id;
    const existing = localConversations.find(
      c => c.employeeId === targetId || c.name.toLowerCase() === emp.fullName.toLowerCase()
    );

    if (existing) {
      setActiveChat(existing);
    } else {
      const newConv = {
        id: `c-${targetId}`,
        name: emp.fullName,
        avatar: '',
        role: `Employee (${emp.department || 'Staff'})`,
        lastMessage: 'No messages yet.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unreadCount: 0,
        employeeId: targetId,
        userId: emp.id,
        isNewEmptyChat: true,
      };
      setLocalConversations(prev => [newConv, ...prev]);
      setActiveChat(newConv);
    }

    setSearchQuery('');
    setShowSearchModal(false);
  };

  const filteredConversations = localConversations.filter(c => {
    const q = leftSearchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.role && c.role.toLowerCase().includes(q))
    );
  });

  const filteredEmployees = employeesList.filter(emp => {
    const q = searchQuery.toLowerCase();
    return (
      emp.fullName?.toLowerCase().includes(q) ||
      (emp.employeeId || emp.id)?.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q)
    );
  });

  const chatMessages = localMessages.filter(msg => {
    if (!activeChat) return false;
    if (activeChat.id === 'c-1') {
      return !msg.conversationId || msg.conversationId === 'c-1';
    }
    return msg.conversationId === activeChat.id;
  });

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm h-[600px] flex overflow-hidden font-sans animate-fadeIn relative">
      {/* Left panel: chats directory */}
      <div className="w-1/3 border-r border-slate-100 flex flex-col h-full bg-slate-50/30">
        <div className="p-4 border-b border-slate-100">
          <button
            type="button"
            className="new-chat-btn"
            onClick={() => setShowSearchModal(true)}
          >
            <Pencil className="w-4 h-4" />
            + New Chat
          </button>
          
          <h3 className="text-sm font-black text-primary tracking-tight">Conversations</h3>
          <div className="mt-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3.5" />
            <input
              id="chat-search-input"
              type="text"
              placeholder="Search chat..."
              value={leftSearchQuery}
              onChange={(e) => setLeftSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 no-scrollbar">
          {filteredConversations.map((chat) => {
            const isSelected = activeChat && activeChat.id === chat.id;
            return (
              <button
                id={`chat-item-${chat.id}`}
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={`w-full p-4 text-left hover:bg-slate-50 transition-colors flex items-start gap-3 relative ${
                  isSelected ? 'bg-blue-50/40 border-l-4 border-secondary' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-secondary text-white font-bold flex items-center justify-center uppercase shadow-sm">
                  {chat.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-primary truncate">{chat.name}</h4>
                    <span className="text-[9px] text-slate-400 font-medium">{chat.timestamp}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{chat.role}</p>
                  <p className="text-[11px] text-slate-600 mt-1.5 truncate leading-snug">{chat.lastMessage}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel: Active chat history */}
      {activeChat ? (
        <div className="flex-1 flex flex-col h-full bg-white justify-between">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-secondary text-white font-bold flex items-center justify-center uppercase shadow-sm">
                {activeChat.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-primary">{activeChat.name}</h3>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-success uppercase">
                  <span className="w-1.5 h-1.5 bg-success rounded-full" />
                  <span>Online</span>
                </span>
              </div>
            </div>
          </div>

          {activeChat.isNewEmptyChat ? (
            /* Empty Chat State */
            <div className="flex-1 flex flex-col justify-center items-center text-center p-8 space-y-4 bg-slate-50/10">
              <div className="w-16 h-16 rounded-full bg-brand-primary text-white text-2xl font-black flex items-center justify-center uppercase shadow-md animate-pulse">
                {activeChat.name.charAt(0)}
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-primary">{activeChat.name}</h4>
                <p className="text-[10px] text-slate-400 font-bold tracking-wider">ID: {activeChat.employeeId}</p>
              </div>
              <span className="text-[9px] px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-secondary dark:text-brand-secondary rounded-full font-bold uppercase tracking-widest">
                {activeChat.role}
              </span>
              <p className="text-xs text-subtle-text max-w-xs leading-relaxed font-medium">
                No messages yet. Say hello to start the conversation.
              </p>
            </div>
          ) : (
            /* Messages stream */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              <div className="text-center">
                <span className="text-[9px] px-2 py-1 rounded bg-slate-100 text-slate-400 font-bold uppercase tracking-wider">Today</span>
              </div>

              {chatMessages.map((msg) => {
                // Determine if sent by manager
                const isSentByMe = msg.senderRole === 'manager' || msg.isSentByMe;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSentByMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs md:max-w-md p-3.5 rounded-2xl text-xs space-y-1 shadow-sm leading-relaxed ${
                        isSentByMe
                          ? 'bg-primary text-white rounded-br-none'
                          : 'bg-slate-100 text-slate-700 rounded-bl-none'
                      }`}
                    >
                      <p className="font-medium">{msg.text}</p>
                      <span className="text-[9px] text-right block opacity-60 font-medium">{msg.timestamp}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reply form */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 flex gap-2.5 bg-slate-50/30 items-center">
            <input
              id="reply-msg-input"
              type="text"
              placeholder="Type your message here..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-accent bg-white"
            />
            <button
              id="send-msg-btn"
              type="submit"
              className="p-3 bg-primary hover:bg-secondary text-white rounded-xl shadow transition-all min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer animate-fadeIn"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-12 bg-slate-50/10">
          <MessageSquare className="w-12 h-12 text-slate-200" />
          <h3 className="text-sm font-bold text-primary mt-3">Select a conversation</h3>
          <p className="text-xs text-subtle-text max-w-xs">Pick an active employee message thread on the left to start corresponding instantly.</p>
        </div>
      )}

      {/* New Chat Start Conversation Search Modal */}
      {showSearchModal && (
        <div className="logout-overlay z-[9999]" onClick={() => setShowSearchModal(false)}>
          <div
            className="new-chat-modal relative w-full z-10 max-h-[85vh] flex flex-col max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:max-w-none max-md:rounded-t-[30px] max-md:rounded-b-none bg-card text-text-primary border border-border-default/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar for bottom sheet mobile */}
            <div className="hidden max-md:block w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto my-3" />
            
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-primary">Start New Conversation</h3>
              <button
                type="button"
                onClick={() => setShowSearchModal(false)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <input
              type="text"
              className="employee-search-input focus:ring-2 focus:ring-accent/20"
              placeholder="Search employee by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            
            {/* Filtered employee list */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 max-h-[250px] pb-4">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => (
                  <div
                    key={emp.id || emp.employeeId}
                    onClick={() => handleSelectEmployee(emp)}
                    className="employee-search-result"
                  >
                    <div className="w-9 h-9 rounded-full bg-secondary text-white font-extrabold flex items-center justify-center uppercase shadow-sm">
                      {emp.fullName?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-primary truncate">{emp.fullName}</h4>
                      <p className="text-[10px] text-slate-400 font-medium">ID: {emp.employeeId || emp.id}</p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-secondary dark:text-brand-secondary rounded-full font-bold uppercase tracking-wider">
                      {emp.department || 'Staff'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-subtle-text text-xs">
                  No matching employees found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
