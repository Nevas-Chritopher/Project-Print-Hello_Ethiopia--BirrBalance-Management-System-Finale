import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  UtensilsCrossed,
  Users,
  TrendingUp,
  FileText,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  Pencil,
  Check,
  AlertTriangle,
  Download,
  DollarSign,
  Clock,
  ThumbsUp
} from 'lucide-react';
import {
  MiniSparklineChart,
  DailyOrderVolumeChart,
  FrequentVisitorsChart,
  MostOrderedItemsChart,
  PeakOrderTimesChart
} from '../../components/charts/DashboardCharts';
import { exportToExcel, getFileNameFromContentDisposition, downloadBlobFile } from '../../utils/exportHelpers';

export default function CafePortal() {
  const { user, apiGet, apiPost, apiPostForm, apiPut, apiPatch, apiDelete, apiDownload, setGlobalLoading } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // Determine active tab
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('menu')) return 'menu';
    if (path.includes('orders')) return 'orders';
    if (path.includes('waiters')) return 'waiters';
    if (path.includes('analytics')) return 'analytics';
    if (path.includes('reports')) return 'reports';
    return 'dashboard'; // default
  };

  const activeTab = getActiveTab();

  // Shared state
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [waiters, setWaiters] = useState<any[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);

  const loadCafeData = async () => {
    try {
      const itemsData = await apiGet('/api/cafe/menu');
      setMenuItems(itemsData.data || []);

      const ordsData = await apiGet('/api/cafe/orders?limit=100');
      setOrders((ordsData.data?.items || []).map((o: any) => ({
        id: o.id,
        status: o.status,
        amount: o.total_amount,
        employeeName: o.employee_name,
        waiterName: o.waiter_name,
        date: o.created_at,
        items: (o.items || []).map((i: any) => ({
          itemId: i.menu_item_id,
          name: i.name,
          quantity: i.quantity,
          price: i.unit_price
        }))
      })));

      const waitersData = await apiGet('/api/cafe/waiters');
      setWaiters((waitersData.data || []).map((w: any) => ({
        id: w.id,
        name: w.fullname,
        employeeId: w.employee_external_id,
        totalOrders: w.total_orders,
        avgDeliveryTime: '—',
        flaggedIssues: 0,
        rating: '—'
      })));

      const feeds = await apiGet('/api/cafe/feedback?limit=100');
      setFeedbacks((feeds.data?.items || []).map((f: any) => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        employeeName: f.users?.fullname,
        date: f.created_at
      })));
    } catch (e) {
      console.error('Error loading cafe portal data', e);
    }
  };

  useEffect(() => {
    if (user && user.role === 'cafe') {
      loadCafeData();
    }
  }, [user, location.pathname]);

  if (!user || user.role !== 'cafe') return null;

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 md:py-10 space-y-8 font-sans">
      {activeTab === 'dashboard' && (
        <CafeDashboardOverview
          orders={orders}
          waiters={waiters}
          menuItems={menuItems}
          apiPost={apiPost}
        />
      )}
      {activeTab === 'menu' && (
        <CafeMenuManagement
          menuItems={menuItems}
          onReload={loadCafeData}
          apiPost={apiPost}
          apiPatch={apiPatch}
          apiPostForm={apiPostForm}
          apiPut={apiPut}
          apiDelete={apiDelete}
        />
      )}
      {activeTab === 'orders' && (
        <CafeOrdersList
          orders={orders}
          onReload={loadCafeData}
          apiPut={apiPut}
        />
      )}
      {activeTab === 'waiters' && (
        <CafeWaitersPerformance
          waiters={waiters}
          orders={orders}
          feedbacks={feedbacks}
          apiPost={apiPost}
          apiPatch={apiPatch}
          apiDelete={apiDelete}
          onReload={loadCafeData}
        />
      )}
      {activeTab === 'analytics' && (
        <CafeEmployeeUsageAnalytics />
      )}
      {activeTab === 'reports' && <CafeOperationalReports orders={orders} />}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 1: OVERVIEW DASHBOARD
// -----------------------------------------------------------
function CafeDashboardOverview({
  orders,
  waiters,
  menuItems,
  apiPost,
}: {
  orders: any[];
  waiters: any[];
  menuItems: any[];
  apiPost: (path: string, body: any) => Promise<any>;
}) {
  const { t } = useTranslation();

  // Metrics
  const totalOrdersToday = orders.filter(o => o.status !== 'expired').length;
  const totalRevenue = orders.filter(o => o.status === 'confirmed').reduce((sum, o) => sum + o.amount, 0);
  const activeWaiters = waiters.length;
  const mostOrdered = 'Doro Wot (185)';
  const [qrCodes, setQrCodes] = useState<any[] | null>(null);
  const [qrError, setQrError] = useState('');

  const generateAllQrs = async () => {
    setQrError('');
    try {
      const response = await apiPost('/api/cafe/employee-qr-codes', {});
      setQrCodes(response.data ?? response ?? []);
    } catch (error: any) { setQrError(error.message || 'Unable to generate employee QR codes.'); }
  };

  const handleExportVolume = () => {
    const volumeData = [
      { Day: 'Mon', Orders: 120 },
      { Day: 'Tue', Orders: 145 },
      { Day: 'Wed', Orders: 132 },
      { Day: 'Thu', Orders: 185 },
      { Day: 'Fri', Orders: 210 },
      { Day: 'Sat', Orders: 75 },
      { Day: 'Sun', Orders: 40 },
    ];
    exportToExcel(volumeData, 'Cafe_Daily_Order_Volume', 'Orders stats');
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Café Dashboard</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Live order pipeline, inventory and waiter diagnostics</p>
      </div>

      <div className="flex justify-end"><button onClick={generateAllQrs} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white">Generate & Print All Employee QR Codes</button></div>
      {qrError && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-danger">{qrError}</p>}
      {qrCodes && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-6"><div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black text-primary">Employee QR Codes</h2><p className="text-xs text-slate-500">Each card includes the employee’s name and ID.</p></div><div className="flex gap-2"><button onClick={() => setQrCodes(null)} className="rounded-xl border px-4 py-2 text-xs font-bold">Close</button><button onClick={() => window.print()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Print All</button></div></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{qrCodes.map((qr) => <div key={qr.id} className="break-inside-avoid rounded-2xl border border-slate-200 p-5 text-center"><QRCodeSVG value={qr.qr_token} size={180} /><p className="mt-3 font-bold text-primary">{qr.fullname}</p><p className="mt-1 text-xs font-mono text-slate-500">{qr.employee_external_id}</p></div>)}</div></div></div>}

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Total Orders */}
        <div className="stat-card-1 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Total Orders Today</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-text-primary">{totalOrdersToday}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-badge-bg text-text-sidebar-active dark:bg-brand-primary/20 dark:text-brand-secondary dark:shadow-[0_0_8px_rgba(59,130,246,0.2)]">+8%</span>
            </div>
          </div>
          <MiniSparklineChart data={[15, 18, 20, 22, 28, 31]} type="bar" color="#3B82F6" />
        </div>

        {/* Revenue */}
        <div className="stat-card-2 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Total Revenue This Month</p>
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-bold text-text-subtle">ETB</span>
              <span className="text-2xl font-black text-text-primary">{totalRevenue.toLocaleString()}</span>
            </div>
          </div>
          <MiniSparklineChart data={[30, 34, 40, 48, 52, 60]} color="#8B5CF6" />
        </div>

        {/* Most Ordered Item */}
        <div className="stat-card-3 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Most Ordered Item</p>
            <p className="text-sm font-extrabold text-text-primary">{mostOrdered}</p>
          </div>
          <div className="p-2 bg-info-bg rounded-2xl">
            <UtensilsCrossed className="w-5 h-5 text-info" />
          </div>
        </div>

        {/* Active Waiters */}
        <div className="stat-card-4 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Active Waiters</p>
            <p className="text-3xl font-black text-text-primary">{activeWaiters}</p>
          </div>
          <div className="p-2 bg-success-bg rounded-2xl">
            <Users className="w-5 h-5 text-success" />
          </div>
        </div>
      </div>

      {/* Bar Chart section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-primary tracking-tight">Daily Order Volume</h3>
              <p className="text-[10px] text-subtle-text font-medium mt-0.5">Summary of kitchen order counts filled throughout the week</p>
            </div>
          </div>

          <DailyOrderVolumeChart />

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              id="export-daily-vol-btn"
              onClick={handleExportVolume}
              className="flex items-center gap-2 px-4 py-2 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Order Data</span>
            </button>
          </div>
        </div>

        {/* Live Waiters Performance List */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
          <div>
            <h3 className="text-sm font-black text-primary tracking-tight">Staff Efficiency Stats</h3>
            <p className="text-[10px] text-subtle-text font-medium mt-0.5">Average wait and ratings per cashier waiter</p>
          </div>

          <div className="space-y-4">
            {waiters.map((w) => (
              <div key={w.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-2xl transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-primary font-bold flex items-center justify-center uppercase shadow-sm">
                    {w.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-primary">{w.name}</h4>
                    <p className="text-[10px] text-slate-400">Rating: {w.rating} ★</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-extrabold text-slate-600 block">{w.totalOrders} Orders</span>
                  <span className="text-[9px] text-slate-400">Avg {w.avgDeliveryTime}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orders table */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
        <div>
          <h3 className="text-sm font-black text-primary tracking-tight">Recent Orders</h3>
          <p className="text-[10px] text-subtle-text font-medium mt-0.5">Live status and waiter assignments for incoming lunch tickets</p>
        </div>

        <div className="table-container relative -mx-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                <th className="py-3 px-6">Order ID</th>
                <th className="py-3 px-3">Employee Name</th>
                <th className="py-3 px-3">Items Ordered</th>
                <th className="py-3 px-3 text-right">Amount</th>
                <th className="py-3 px-3 text-center">Waiter Name</th>
                <th className="py-3 px-6 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {orders.slice(0, 5).map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="py-3 px-6 font-mono font-bold text-primary">{order.id}</td>
                  <td className="py-3 px-3 font-bold text-primary">{order.employeeName}</td>
                  <td className="py-3 px-3 text-slate-500 font-medium max-w-xs truncate">
                    {order.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ')}
                  </td>
                  <td className="py-3 px-3 text-right font-extrabold text-primary">ETB {order.amount}</td>
                  <td className="py-3 px-3 text-center text-slate-600 font-semibold">{order.waiterName}</td>
                  <td className="py-3 px-6 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      order.status === 'confirmed' ? 'bg-green-50 text-success' : order.status === 'ready' ? 'bg-blue-50 text-ready' : 'bg-amber-50 text-warning'
                    }`}>
                      {order.status}
                    </span>
                  </td>
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
// SUB-PAGE 2: MENU MANAGEMENT
// -----------------------------------------------------------
function CafeMenuManagement({
  menuItems,
  onReload,
  apiPost,
  apiPatch,
  apiPostForm,
  apiPut,
  apiDelete
}: {
  menuItems: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
  apiPatch: (path: string, body: any) => Promise<any>;
  apiPostForm: (path: string, formData: FormData) => Promise<any>;
  apiPut: (path: string, body: any) => Promise<any>;
  apiDelete: (path: string) => Promise<any>;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<'Food' | 'Beverage' | 'Snack'>('Food');
  const [image, setImage] = useState<File | null>(null);
  const [photo, setPhoto] = useState("");
  const [formError, setFormError] = useState('');
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // Delete handlers
  const [deleteItem, setDeleteItem] = useState<any | null>(null);

  const handleImportMenu = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImporting(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('The uploaded file does not contain any rows.');
      }

      for (const row of rows) {
        const normalized: Record<string, string> = {};
        Object.entries(row as Record<string, unknown>).forEach(([key, value]) => {
          normalized[String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, '')] = String(value ?? '').trim();
        });

        const nameValue = normalized['foodname'] || normalized['name'] || normalized['itemname'] || normalized['dishname'];
        const priceValue = normalized['price'] || normalized['unitprice'] || normalized['amount'];
        if (!nameValue || !priceValue) continue;

        const formData = new FormData();
        formData.append('name', nameValue);
        formData.append('description', '');
        formData.append('price', String(priceValue));
        formData.append('is_available', 'true');
        await apiPostForm('/api/cafe/menu', formData);
      }

      event.target.value = '';
      await onReload();
    } catch (e: any) {
      setImportError(e.message || 'Unable to import menu items from the spreadsheet.');
    } finally {
      setImporting(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price || !category) {
      setFormError('Item name, category, and price are required.');
      return;
    }

    try {
      const formData = new FormData();

      formData.append('name', name);
      formData.append('description', description);
      formData.append('price', price);
      formData.append('is_available', 'true');

      if (image) {
        formData.append('image', image);
      }

      await apiPostForm('/api/cafe/menu', formData);

      setName('');
      setDescription('');
      setPrice('');
      setCategory('Food');
      setImage(null);
      setShowAddModal(false);
      setFormError('');
      await onReload();
    } catch (e: any) {
      setFormError(e.message || 'Error creating menu item');
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!editingItem) return;

  try {
    await apiPut(`/api/cafe/menu/${editingItem.id}`, {
      name,
      description,
      price: Number(price),
      category,
    });

    setEditingItem(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory("Food");
    setPhoto("");
    setShowAddModal(false);
    setFormError("");

    onReload();
  } catch (e: any) {
    setFormError(e.message || 'Error updating menu item');
  }
};
  const handleToggleAvailable = async (item: any) => {
  try {
    await apiPut(`/api/cafe/menu/${item.id}/availability`, {
      is_available: !item.is_available,
    });

    onReload();
  } catch (e) {
    console.error(e);
  }
};

  const handleDeleteItem = async () => {
    if (!deleteItem) return;
    try {
      await apiDelete(`/api/cafe/menu/${deleteItem.id}`);
      setDeleteItem(null);
      onReload();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Menu Management</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Configure cafe meals, pricing, and availability triggers</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold shadow-sm transition-all min-h-[44px] cursor-pointer hover:bg-slate-200">
            <Download className="w-4 h-4" />
            <span>{importing ? 'Importing...' : 'Import Excel'}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportMenu} />
          </label>
          <button
            id="add-menu-trigger-btn"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-secondary text-white rounded-xl text-xs font-bold shadow-md transition-all min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>{editingItem ? 'Edit Menu Item' : 'Add Menu Item'}</span>
          </button>
        </div>
      </div>

      {importError && (
        <div className="p-3 rounded-2xl border border-red-100 bg-red-50 text-xs font-bold text-danger">{importError}</div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-subtle-text">
              <tr>
                <th className="p-4">Item</th>
                <th className="p-4">Description</th>
                <th className="p-4 text-right">Price</th>
                <th className="p-4 text-center">Availability</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {menuItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-xl bg-slate-100">
                        <img src={item.photo || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'} alt={item.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div>
                        <p className="font-black text-primary">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.category || 'Food'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-slate-600 max-w-md">{item.description || 'No description provided.'}</td>
                  <td className="p-4 text-right font-black text-secondary">ETB {item.price}</td>
                  <td className="p-4 text-center">
                    <button
                      id={`menu-toggle-avail-${item.id}`}
                      onClick={() => handleToggleAvailable(item)}
                      className={`w-10 h-6 rounded-full p-0.5 transition-colors focus:outline-none ${item.is_available ? 'bg-success' : 'bg-slate-200'}`}
                    >
                      <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${item.is_available ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setName(item.name);
                          setDescription(item.description || '');
                          setPrice(item.price.toString());
                          setCategory(item.category || 'Food');
                          setPhoto(item.image_url || '');
                          setShowAddModal(true);
                        }}
                        className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 transition-all"
                        title="Edit Item"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        id={`menu-delete-trigger-${item.id}`}
                        onClick={() => setDeleteItem(item)}
                        className="p-2 border border-slate-200 hover:border-red-200 rounded-lg text-slate-400 hover:text-danger transition-all"
                        title="Permanently Delete Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      {(showAddModal || editingItem) && (
        <div id="add-menu-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative space-y-6 modal-card">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute right-5 top-5 p-1 rounded-lg text-slate-400 hover:text-slate-600 focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black text-primary tracking-tight">Add New Dish</h3>
              <p className="text-xs text-subtle-text">Create foods or beverages in the cafeteria database</p>
            </div>

            {formError && (
              <p className="text-xs font-bold text-danger bg-red-50 p-3 rounded-xl border border-red-200">{formError}</p>
            )}

            <form
                onSubmit={editingItem ? handleEditItem : handleAddItem}
                className="space-y-4 text-xs"
            >
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Dish Name *</label>
                <input
                  id="add-menu-name"
                  type="text"
                  required
                  placeholder="e.g. Kitfo Special"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Description</label>
                <textarea
                  id="add-menu-desc"
                  placeholder="e.g. Finely chopped raw beef mixed with mitmita and niter kibeh..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">Price (ETB) *</label>
                  <input
                    id="add-menu-price"
                    type="number"
                    required
                    placeholder="e.g. 250"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">Category *</label>
                  <select
                    id="add-menu-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  >
                    <option value="Food">Food</option>
                    <option value="Beverage">Beverage</option>
                    <option value="Snack">Snack</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Photo URL</label>
                <input
                  id="add-menu-photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImage(e.target.files?.[0] || null)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  id="add-menu-submit-btn"
                  type="submit"
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary min-h-[44px]"
                >
                  {editingItem ? "Update Dish" : "Save Dish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteItem && (
        <div id="delete-menu-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-5">
            <div>
              <h3 className="text-base font-black text-danger tracking-tight">Permanently Delete Dish?</h3>
              <p className="text-xs text-subtle-text mt-1">Are you sure you want to delete <strong>{deleteItem.name}</strong> from the active cafeteria menus? This cannot be undone.</p>
            </div>

            <div className="flex gap-3 text-xs">
              <button
                onClick={() => setDeleteItem(null)}
                className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                id="delete-menu-confirm-btn"
                onClick={handleDeleteItem}
                className="flex-1 py-3 bg-danger text-white font-bold rounded-xl hover:bg-red-600 min-h-[44px]"
              >
                Delete Dish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 3: LIVE ACTIVE ORDERS PIPELINE
// -----------------------------------------------------------
function CafeOrdersList({
  orders,
  onReload,
  apiPut
}: {
  orders: any[];
  onReload: () => Promise<void>;
  apiPut: (path: string, body: any) => Promise<any>;
}) {
  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    try {
      await apiPut(`/api/orders/${orderId}/status`, { status: nextStatus });
      onReload();
    } catch (e) {
      console.error(e);
    }
  };

  // Café managers can review orders, but order progress is handled by the
  // ordering workflow rather than this dashboard.
  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Orders</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">View café orders and their current status</p>
      </div>
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-subtle-text"><tr><th className="p-4">Order</th><th className="p-4">Employee</th><th className="p-4">Items</th><th className="p-4">Amount</th><th className="p-4">Status</th></tr></thead><tbody>{orders.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-subtle-text">No orders yet.</td></tr> : orders.map((order) => <tr key={order.id} className="border-t border-slate-100"><td className="p-4 font-mono text-slate-500">{order.id}</td><td className="p-4 font-bold text-primary">{order.employeeName}</td><td className="p-4 text-slate-600">{order.items.map((item: any) => `${item.name} ×${item.quantity}`).join(', ')}</td><td className="p-4 font-bold">ETB {order.amount}</td><td className="p-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{order.status}</span></td></tr>)}</tbody></table></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Kitchen Orders</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Monitor live order statuses and handle prep pipelines</p>
      </div>

      {/* Pipeline grids */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pending Stage */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-black text-primary uppercase tracking-wider">Queue / Pending</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
              {orders.filter(o => o.status === 'pending').length}
            </span>
          </div>

          <div className="space-y-3">
            {orders.filter(o => o.status === 'pending').map(o => (
              <div key={o.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-xs text-primary">{o.employeeName}</h4>
                    <span className="text-[9px] text-slate-400 font-mono">{o.id}</span>
                  </div>
                  <span className="text-[10px] font-black text-secondary">ETB {o.amount}</span>
                </div>
                <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl space-y-0.5 font-semibold">
                  {o.items.map((i: any) => (
                    <p key={i.itemId}>&bull; {i.name} (x{i.quantity})</p>
                  ))}
                </div>
                <button
                  id={`btn-prep-${o.id}`}
                  onClick={() => handleUpdateStatus(o.id, 'ready')}
                  className="w-full text-center py-2 bg-primary hover:bg-secondary text-white font-bold rounded-lg text-[10px] uppercase shadow-sm transition-all"
                >
                  Mark as Ready / Out for delivery
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Ready Stage */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-black text-primary uppercase tracking-wider">Ready for Delivery</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-ready text-[10px] font-bold">
              {orders.filter(o => o.status === 'ready').length}
            </span>
          </div>

          <div className="space-y-3">
            {orders.filter(o => o.status === 'ready').map(o => (
              <div key={o.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-xs text-primary">{o.employeeName}</h4>
                    <span className="text-[9px] text-slate-400 font-mono">{o.id}</span>
                  </div>
                  <span className="text-[10px] font-black text-secondary">ETB {o.amount}</span>
                </div>
                <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl space-y-0.5 font-semibold">
                  {o.items.map((i: any) => (
                    <p key={i.itemId}>&bull; {i.name} (x{i.quantity})</p>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    id={`btn-confirm-${o.id}`}
                    onClick={() => handleUpdateStatus(o.id, 'confirmed')}
                    className="flex-1 text-center py-2 bg-success text-white font-bold rounded-lg text-[10px] uppercase shadow-sm transition-all"
                  >
                    Delivered
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Confirmed / Delivered Stage */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-black text-primary uppercase tracking-wider">Delivered / Confirmed</span>
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-success text-[10px] font-bold">
              {orders.filter(o => o.status === 'confirmed').length}
            </span>
          </div>

          <div className="space-y-3">
            {orders.filter(o => o.status === 'confirmed').slice(0, 4).map(o => (
              <div key={o.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2 opacity-80">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-xs text-primary">{o.employeeName}</h4>
                    <span className="text-[9px] text-slate-400 font-mono">{o.id}</span>
                  </div>
                  <span className="text-[10px] font-black text-success">ETB {o.amount}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span>Completed</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 4: WAITER PERFORMANCE VIEW
// -----------------------------------------------------------
function CafeWaitersPerformance({
  waiters,
  orders,
  feedbacks,
  apiPost,
  apiPatch,
  apiDelete,
  onReload,
}: {
  waiters: any[];
  orders: any[];
  feedbacks: any[];
  apiPost: (path: string, body: any) => Promise<any>;
  apiPatch: (path: string, body: any) => Promise<any>;
  apiDelete: (path: string) => Promise<any>;
  onReload: () => Promise<void>;
}) {
  const [expandedWaiterId, setExpandedWaiterId] = useState<string | null>(null);
  const [showAddWaiter, setShowAddWaiter] = useState(false);
  const [formError, setFormError] = useState('');
  const [waiter, setWaiter] = useState({ employeeId: '', fullName: '', phone: '', password: '' });

  const addWaiter = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiPost('/api/cafe/waiters', {
        employee_external_id: waiter.employeeId,
        fullname: waiter.fullName,
        phone_number: waiter.phone,
        password: waiter.password,
      });
      setFormError('');
      setShowAddWaiter(false);
      await onReload();
    } catch (error: any) {
      setFormError(error.message || 'Unable to create waiter');
    }
  };

  const deleteWaiter = async (waiterToDelete: any) => {
    if (!window.confirm(`Delete waiter ${waiterToDelete.name}?`)) return;
    try {
      await apiDelete(`/api/cafe/waiters/${waiterToDelete.id}`);
      await onReload();
    } catch (error: any) {
      setFormError(error.message || 'Unable to delete waiter');
    }
  };

  const editWaiter = async (waiterToEdit: any) => {
    const employee_external_id = window.prompt('Waiter username / ID', waiterToEdit.employeeId || '');
    if (!employee_external_id) return;
    const fullname = window.prompt('Waiter name', waiterToEdit.name);
    if (!fullname) return;
    const department_id = window.prompt('Department ID (leave blank for none)', '') ?? '';
    const password = window.prompt('New password (leave blank to keep current)', '') ?? '';
    try { await apiPatch(`/api/cafe/waiters/${waiterToEdit.id}`, { employee_external_id, fullname, department_id: department_id ? Number(department_id) : null, ...(password ? { password } : {}) }); await onReload(); }
    catch (error: any) { setFormError(error.message || 'Unable to update waiter'); }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Waiter Efficiency</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Track average speeds, flags, and service quality</p>
        </div>
        <button onClick={() => setShowAddWaiter(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-secondary">
          <Plus className="w-4 h-4" /> Add Waiter
        </button>
      </div>

      {showAddWaiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={addWaiter} className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-lg font-black text-primary">Add Waiter</h2><button type="button" onClick={() => setShowAddWaiter(false)} className="p-1 text-slate-500"><X className="w-5 h-5" /></button></div>
            {formError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-danger">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Waiter ID" value={waiter.employeeId} onChange={(e) => setWaiter({ ...waiter, employeeId: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" />
              <input required placeholder="Full name" value={waiter.fullName} onChange={(e) => setWaiter({ ...waiter, fullName: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" />
              <input required placeholder="Phone number" value={waiter.phone} onChange={(e) => setWaiter({ ...waiter, phone: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" />
            </div>
            <input required type="password" placeholder="Temporary password" value={waiter.password} onChange={(e) => setWaiter({ ...waiter, password: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAddWaiter(false)} className="rounded-xl border px-4 py-2 text-xs font-bold">Cancel</button><button type="submit" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Create Waiter</button></div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="table-container relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6 w-16"></th>
                <th className="py-4 px-4">Waiter Name</th>
                <th className="py-4 px-4">Username / ID</th>
                <th className="py-4 px-4 text-center">Total Orders Handled</th>
                <th className="py-4 px-4 text-center">Average Delivery Time</th>
                <th className="py-4 px-4 text-center">Flagged Issues Count</th>
                <th className="py-4 px-4 text-center">Performance Rating</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {waiters.map((w) => {
                const isExpanded = expandedWaiterId === w.id;
                // Gather waiter orders
                const waiterOrders = orders.filter(o => o.waiterName === w.name);

                return (
                  <React.Fragment key={w.id}>
                    <tr
                      onClick={() => setExpandedWaiterId(isExpanded ? null : w.id)}
                      className="hover:bg-slate-50/40 cursor-pointer select-none"
                    >
                      <td className="py-4 px-6 text-center">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </td>
                      <td className="py-4 px-4 font-bold text-primary flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-primary font-bold flex items-center justify-center uppercase shadow-sm">
                          {w.name.charAt(0)}
                        </div>
                        <span>{w.name}</span>
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-500">{w.employeeId || '—'}</td>
                      <td className="py-4 px-4 text-center font-bold text-slate-600">{w.totalOrders}</td>
                      <td className="py-4 px-4 text-center font-medium text-slate-600">{w.avgDeliveryTime}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.flaggedIssues > 0 ? 'bg-red-50 text-danger' : 'bg-green-50 text-success'
                        }`}>
                          {w.flaggedIssues} issues
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center text-amber-500 font-bold">{w.rating} ★</td>
                      <td className="py-4 px-6 text-right">
                        <button onClick={(event) => { event.stopPropagation(); editWaiter(w); }} className="rounded-lg p-2 text-primary hover:bg-slate-50" title="Edit waiter">Edit</button>
                        <button onClick={(event) => { event.stopPropagation(); deleteWaiter(w); }} className="rounded-lg p-2 text-danger hover:bg-red-50" title="Delete waiter">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>

                    {/* Expands details */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/30 px-8 py-4">
                          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-inner space-y-4">
                            <h4 className="text-[10px] font-bold text-subtle-text uppercase tracking-wider border-b pb-2">Completed Logs by {w.name}</h4>
                            {waiterOrders.length === 0 ? (
                              <p className="text-xs text-subtle-text">No orders logged in this active session yet.</p>
                            ) : (
                              <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar text-xs">
                                {waiterOrders.map(o => (
                                  <div key={o.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg">
                                    <span className="font-mono font-bold text-slate-500">{o.id}</span>
                                    <span className="font-bold text-primary">{o.employeeName}</span>
                                    <span className="font-bold text-secondary">ETB {o.amount}</span>
                                    <span className="text-slate-400 font-medium">{new Date(o.date).toLocaleTimeString()}</span>
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
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 5: EMPLOYEE USAGE ANALYTICS
// -----------------------------------------------------------
function CafeEmployeeUsageAnalytics() {
  const { apiGet } = useApp();

  const [dateRange, setDateRange] = useState('2026-06');
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const res = await apiGet(`/api/cafe/analytics?month=${dateRange}`);
        setAnalytics(res.data);
      } catch (err) {
        console.error(err);
      }
    };

    loadAnalytics();
  }, [dateRange]);

  const handleExportVisitors = () => {
  exportToExcel(
    analytics?.employee_usage || [],
    "Cafe_Top_Visitors",
    "Visitors"
  );
};

  const handleExportItems = () => {
  exportToExcel(
    analytics?.popular_menu_items || [],
    "Cafe_Top_Items",
    "Items"
  );
};

  const handleExportHours = () => {
  exportToExcel(
    analytics?.peak_ordering_hours || [],
    "Cafe_Peak_Hours",
    "Hours"
  );
};

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Usage Analytics</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Review dining spikes, top visitors, and top foods</p>
        </div>
        <div className="text-xs font-bold text-slate-700">
          <input
            id="analytics-month-picker"
            type="month"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Visitor Stats */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Most Frequent Employee Visitors</h3>
          <FrequentVisitorsChart
              data={analytics?.employee_usage || []} 
          />
          <button
            id="export-visitors-btn"
            onClick={handleExportVisitors}
            className="w-full text-center py-2.5 border border-primary text-primary hover:bg-slate-50 text-[10px] font-bold uppercase rounded-xl transition-all"
          >
            Export Visitor Data
          </button>
        </div>

        {/* Food items stats */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Most Ordered Menu Items</h3>
          <MostOrderedItemsChart
            data={analytics?.popular_menu_items || []}
          />
          <button
            id="export-items-btn"
            onClick={handleExportItems}
            className="w-full text-center py-2.5 border border-primary text-primary hover:bg-slate-50 text-[10px] font-bold uppercase rounded-xl transition-all"
          >
            Export Item Data
          </button>
        </div>

        {/* Peak Hours line */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 md:col-span-2">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Peak Dining Times by Hour</h3>
          <PeakOrderTimesChart
           data={analytics?.peak_ordering_hours || []}
          />
          <button
            id="export-hours-btn"
            onClick={handleExportHours}
            className="w-full text-center py-2.5 border border-primary text-primary hover:bg-slate-50 text-[10px] font-bold uppercase rounded-xl transition-all"
          >
            Export Hours Data
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 6: OPERATIONAL REPORTS
// -----------------------------------------------------------
function CafeOperationalReports({ orders }: { orders: any[] }) {
  const { apiDownload, apiGet, setGlobalLoading } = useApp();
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [usageReport, setUsageReport] = useState<any>({ departments: [] });
  const [selectedDepartment, setSelectedDepartment] = useState('');

  useEffect(() => {
    const query = new URLSearchParams({ month: reportMonth, format: 'json' });
    if (selectedDepartment) query.set('department_id', selectedDepartment);
    apiGet(`/api/cafe/reports/department-usage?${query.toString()}`)
      .then((response) => setUsageReport(response?.data ?? response ?? { departments: [] }))
      .catch(() => setUsageReport({ departments: [], employees: [] }));
  }, [apiGet, reportMonth, selectedDepartment]);

  const reportOrders = orders
    .filter(o => o.status === 'confirmed')
    .filter(o => {
      if (!reportMonth) return true;
      const orderMonth = new Date(o.date).toISOString().slice(0, 7);
      return orderMonth === reportMonth;
    });
  const totalRevenue = reportOrders.reduce((sum, o) => sum + o.amount, 0);

  const exportOperationalReport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    const month = reportMonth || new Date().toISOString().slice(0, 7);
    try {
      setGlobalLoading(true);
      const { blob, contentDisposition } = await apiDownload(
        `/api/cafe/reports/operational?month=${encodeURIComponent(month)}&format=${format}`
      );
      const fileName = getFileNameFromContentDisposition(
        contentDisposition,
        `cafe-operational-report-${month}.${format}`
      );
      downloadBlobFile(blob, fileName);
    } catch (error) {
      console.error('Failed to download cafe operational report:', error);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleExportXLSX = () => exportOperationalReport('xlsx');
  const handleExportCSV = () => exportOperationalReport('csv');
  const handleExportPDF = () => exportOperationalReport('pdf');
  const exportUsageReport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    const query = new URLSearchParams({ month: reportMonth, format });
    if (selectedDepartment) query.set('department_id', selectedDepartment);
    const { blob, contentDisposition } = await apiDownload(`/api/cafe/reports/department-usage?${query.toString()}`);
    downloadBlobFile(blob, getFileNameFromContentDisposition(contentDisposition, `cafe-department-usage-${reportMonth}.${format}`));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Operational Reports</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Audit ledger logs and cafeteria sales summaries</p>
      </div>

      {/* Date Pickers */}
      <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-5 rounded-3xl border border-slate-100 shadow-sm text-xs">
        <div className="space-y-1.5 w-full md:w-auto">
          <label className="font-bold text-slate-700">Report Month</label>
          <input
            id="ops-report-month"
            type="month"
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent font-semibold w-full"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100"><div><h2 className="text-sm font-black text-primary">Department Usage</h2><p className="text-xs text-subtle-text">Click a department for employee meal-by-meal usage.</p></div><div className="flex gap-2">{(['csv', 'xlsx', 'pdf'] as const).map((format) => <button key={format} onClick={() => exportUsageReport(format)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold uppercase hover:bg-slate-50">{format}</button>)}</div></div>
        {!selectedDepartment ? <table className="w-full text-left text-xs"><thead><tr className="bg-slate-50 text-slate-500"><th className="p-4">Department</th><th className="p-4">Employees</th><th className="p-4 text-right">Used</th><th className="p-4 text-right">Expired</th></tr></thead><tbody>{usageReport.departments?.map((row: any) => <tr key={row.department_id ?? row.department} onClick={() => row.department_id && setSelectedDepartment(String(row.department_id))} className="border-t cursor-pointer hover:bg-slate-50"><td className="p-4 font-bold">{row.department}</td><td className="p-4">{row.employee_count}</td><td className="p-4 text-right">ETB {row.total_used}</td><td className="p-4 text-right">ETB {row.expired_money}</td></tr>)}</tbody></table> : <table className="w-full text-left text-xs"><thead><tr className="bg-slate-50 text-slate-500"><th className="p-4">Employee</th><th className="p-4 text-right">Total Used</th><th className="p-4">Daily / Meal Usage</th></tr></thead><tbody>{usageReport.employees?.map((row: any) => <tr key={row.employee_id} className="border-t align-top"><td className="p-4 font-bold">{row.employee_name}<div className="text-slate-400">{row.employee_id}</div></td><td className="p-4 text-right">ETB {row.total_used}</td><td className="p-4 text-slate-600">{row.daily_meal_usage}</td></tr>)}</tbody></table>}
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-subtle-text uppercase tracking-wider">Total Sales count</p>
          <p className="text-2xl font-black text-primary mt-1">{reportOrders.length} orders</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-subtle-text uppercase tracking-wider">Accumulated Sales Value</p>
          <p className="text-2xl font-black text-secondary mt-1">ETB {totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Export row */}
      <div className="flex flex-wrap gap-2.5">
        <button
          id="ops-export-xlsx-btn"
          onClick={handleExportXLSX}
          className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Export XLSX</span>
        </button>
        <button
          id="ops-export-pdf-btn"
          onClick={handleExportPDF}
          className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Export PDF</span>
        </button>
        <button
          id="ops-export-csv-btn"
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Sales table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="table-container relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6">Order ID</th>
                <th className="py-4 px-4">Employee Name</th>
                <th className="py-4 px-4">Items</th>
                <th className="py-4 px-4 text-right">Amount</th>
                <th className="py-4 px-4 text-center">Waiter Name</th>
                <th className="py-4 px-6">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {reportOrders.map(o => (
                <tr key={o.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="py-3 px-6 font-mono font-bold text-primary">{o.id}</td>
                  <td className="py-3 px-4 font-bold text-primary">{o.employeeName}</td>
                  <td className="py-3 px-4 text-slate-500 font-semibold truncate max-w-xs">{o.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ')}</td>
                  <td className="py-3 px-4 text-right font-black text-primary">ETB {o.amount}</td>
                  <td className="py-3 px-4 text-center text-slate-600 font-bold">{o.waiterName}</td>
                  <td className="py-3 px-6 text-slate-400 font-semibold">{new Date(o.date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
