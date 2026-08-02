import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import { formatETB } from '../../utils/format';
import jsPDF from 'jspdf';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import EmployeeNotificationsPage from './EmployeeNotificationsPage';
import {
  Wallet,
  QrCode,
  Flame,
  Clock,
  ChevronRight,
  ShoppingBag,
  Plus,
  Minus,
  X,
  CheckCircle,
  AlertTriangle,
  History,
  User as UserIcon,
  LogOut,
  Send,
  Star,
  Search,
  Calendar,
  Download,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
  Printer
} from 'lucide-react';

export default function EmployeePortal() {
  const { user, apiGet, apiPost, apiPut, setGlobalLoading, refreshData, activeCafe } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const handleBalanceUpdate = () => {
      refreshData();
      loadEmployeeData();
    };

    window.addEventListener('esrom-balance-updated', handleBalanceUpdate);
    return () => window.removeEventListener('esrom-balance-updated', handleBalanceUpdate);
  }, [refreshData]);

  // Active sub tab
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('orders') || path.includes('order')) return 'orders';
    if (path.includes('transactions')) return 'transactions';
    if (path.includes('profile')) return 'profile';
    if (path.includes('notifications')) return 'notifications';
    return 'dashboard';
  };

  const activeTab = getActiveTab();

  // States
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [allocationHistory, setAllocationHistory] = useState<any[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);

  const loadEmployeeData = async () => {
  const profileData = apiGet('/api/employee/profile');
  };

  useEffect(() => {
    if (user && user.role === 'employee') {
      loadEmployeeData();
    }
  }, [user, location.pathname]);

  if (!user || user.role !== 'employee') return null;

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 md:py-10 space-y-8 font-sans relative">
      {activeTab === 'dashboard' && (
        <EmployeeDashboard
          user={user}
          myOrders={myOrders}
          onReload={loadEmployeeData}
          allocationHistory={allocationHistory}
        />
      )}
      {activeTab === 'orders' && (
        <EmployeeOrdersPage
          user={user}
          menuItems={menuItems}
          myOrders={myOrders}
          onReload={loadEmployeeData}
          apiPost={apiPost}
          setToast={setToast}
          refreshData={refreshData}
          allocationHistory={allocationHistory}
        />
      )}
      {activeTab === 'profile' && (
        <EmployeeProfilePage
          user={user}
          allocationHistory={allocationHistory}
          apiPut={apiPut}
        />
      )}
      {activeTab === 'transactions' && (
        <EmployeeTransactionsPage
          user={user}
          myOrders={myOrders}
          allocationHistory={allocationHistory}
        />
      )}
      {activeTab === 'notifications' && (
        <EmployeeNotificationsPage />
      )}

      {/* Floating Toast Notification overlay */}
      {toast && (
        <div id="portal-toast" className="fixed bottom-6 right-6 z-55 max-w-md animate-slideIn">
          <div className={`p-4 rounded-2xl shadow-2xl border text-xs font-bold flex items-start gap-3 ${
            toast.type === 'success' 
              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/60 text-success' 
              : toast.type === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 text-warning'
              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/60 text-danger'
          }`}>
            <span className={`w-2 h-2 rounded-full mt-1.5 ${
              toast.type === 'success' ? 'bg-success' : toast.type === 'warning' ? 'bg-warning' : 'bg-danger'
            }`} />
            <div className="flex-1">
              <span>{toast.message}</span>
            </div>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 1: EMPLOYEE DASHBOARD
// -----------------------------------------------------------
function EmployeeDashboard({
  user,
  myOrders,
  onReload,
  allocationHistory
}: {
  user: any;
  myOrders: any[];
  onReload: () => Promise<void>;
  allocationHistory: any[];
}) {
  const { t } = useTranslation();
  const employee = user ? {
    ...user,
    firstName: (user.fullName || user.fullname || '').trim().split(/\s+/)[0] || ''
  } : null;
  const navigate = useNavigate();

  // Dynamic low balance check
  const monthlyAllowance = allocationHistory && allocationHistory.length > 0 ? allocationHistory[0].amount : 1000;
  const isLowBalance = user.balance < (monthlyAllowance * 0.2);

  const downloadPNG = () => {
    const canvas = document.querySelector('#employee-qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `Hello_Ethiopia_QR_${user.employeeId}.png`;
    link.href = url;
    link.click();
  };

  const downloadPDF = () => {
    const canvas = document.querySelector('#employee-qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });

    // Hello_Ethiopia header
    pdf.setFillColor(10, 22, 40);          // dark navy
    pdf.rect(0, 0, 105, 20, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Hello_Ethiopia BirrBalance', 52.5, 13, { align: 'center' });

    // QR code centered
    pdf.addImage(imgData, 'PNG', 22.5, 25, 60, 60);

    // Employee details
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(user.fullname, 52.5, 95, { align: 'center' });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(user.employeeId, 52.5, 102, { align: 'center' });
    pdf.text(user.department, 52.5, 109, { align: 'center' });

    // Footer note
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Present this card at the cafeteria counter', 52.5, 125, { align: 'center' });

    pdf.save(`Hello_Ethiopia_QR_${user.employeeId}.pdf`);
  };

  const downloadSVG = () => {
    const svgElement = document.querySelector('#employee-qr-svg');
    if (!svgElement) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgElement);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `Hello_Ethiopia_QR_${user.employeeId}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printQR = () => {
    const canvas = document.querySelector('#employee-qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const imgData = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Hello_Ethiopia QR Code - ${user.fullname}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
              padding: 40px;
              background: white;
            }
            .header {
              background: #0A1628;
              color: white;
              padding: 12px 32px;
              border-radius: 8px;
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 24px;
            }
            img {
              width: 200px;
              height: 200px;
              border: 1px solid #E2E8F0;
              padding: 8px;
              border-radius: 8px;
            }
            .name {
              font-size: 16px;
              font-weight: bold;
              color: #0F172A;
              margin-top: 16px;
            }
            .details {
              font-size: 13px;
              color: #64748B;
              margin-top: 4px;
            }
            .note {
              font-size: 11px;
              color: #94A3B8;
              margin-top: 20px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="header">Hello_Ethiopia BirrBalance</div>
          <img src="${imgData}" />
          <div class="name">${user.fullname}</div>
          <div class="details">${user.employeeId} · ${user.department}</div>
          <div class="note">Present this card at the cafeteria counter.<br/>Do not share your QR code with others.</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Low balance alert banner */}
      {isLowBalance && (
        <div id="low-balance-alert" className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 text-warning text-xs font-bold flex gap-3 items-start animate-fadeIn shadow-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 animate-bounce" />
          <div className="space-y-1">
            <h4 className="font-black uppercase tracking-wider text-[11px]">Low Balance Alert</h4>
            <p className="font-medium text-slate-700 dark:text-slate-300">Your balance is running low. {formatETB(user.balance)} remaining of your monthly allowance.</p>
          </div>
        </div>
      )}

      {/* Welcome & Balance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Balance & Streak Cards */}
        <div className="lg:col-span-2 space-y-6">
          {/* Welcome heading */}
          <div>
            <h1 className="text-2xl font-extrabold text-primary tracking-tight">
              {t('welcomeBack')}{' '}
              {employee && employee.firstName ? (
                <>{employee.firstName}!</>
              ) : (
                <span className="inline-block h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse align-middle" />
              )}
            </h1>
            <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">{t('scanOrOrder')}</p>
          </div>

          {/* Balance card */}
          <div className="bg-primary text-white rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between h-48 border border-slate-800">
            {/* Ambient subtle glow circles */}
            <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-secondary/25 blur-3xl pointer-events-none" />
            <div className="absolute -left-10 -top-10 w-44 h-44 rounded-full bg-accent/25 blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Birr Balance</span>
                <p className="text-4xl font-black">{formatETB(user.balance)}</p>
              </div>
              <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                <Wallet className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-white/10 pt-4">
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Employee Code</span>
                <p className="text-xs font-mono font-bold tracking-wider">{user.employeeId}</p>
              </div>
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-success text-white font-extrabold uppercase">
                Active Tier
              </span>
            </div>
          </div>

          {/* Daily streak card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-warning flex items-center justify-center">
                <Flame className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-primary">Daily Streak Counter</h3>
                <p className="text-[11px] text-subtle-text font-medium mt-0.5">You dined 5 times in the last 7 days! Keep it up!</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-warning">5 Days</span>
            </div>
          </div>
        </div>

        {/* Permanent QR Code Card */}
        <div className="bg-white dark:bg-[#0A1628] rounded-3xl p-6 border border-border-default shadow-sm dark:shadow-[0_0_15px_rgba(59,130,246,0.15)] dark:border-brand-primary/30 flex flex-col items-center justify-between space-y-4">
          <div className="text-center">
            <h3 className="text-sm font-black text-text-primary dark:text-white tracking-tight">Your Cafeteria QR Code</h3>
            <p className="text-[10px] text-text-subtle dark:text-slate-400 font-medium mt-0.5">Show this to the waiter to pay instantly</p>
          </div>

          {/* QR image block - white background patch so it scans correctly regardless of theme */}
          <div className="p-3 bg-white border border-slate-200 rounded-3xl flex items-center justify-center overflow-hidden shadow-inner">
            <QRCodeCanvas
              id="employee-qr-canvas"
              value={user.encryptedQrToken || ''}
              size={220}
              bgColor="#FFFFFF"
              fgColor="#0A1628"
              level="H"
              includeMargin={true}
              style={{ display: 'block' }}
            />
            <QRCodeSVG
              id="employee-qr-svg"
              value={user.encryptedQrToken || ''}
              size={220}
              level="H"
              bgColor="#FFFFFF"
              fgColor="#0A1628"
              style={{ display: 'none' }}
            />
          </div>

          <div className="text-center">
            <p className="text-sm font-black text-slate-800 dark:text-white">
              {user.employeeId} &middot; {user.fullname}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              {user.department}
            </p>
          </div>

          {/* Download and print action grid */}
          <div className="qr-actions">
            <button className="qr-btn png" onClick={downloadPNG}>
              <Download className="w-4 h-4" /> PNG
            </button>
            <button className="qr-btn pdf" onClick={downloadPDF}>
              <Download className="w-4 h-4" /> PDF
            </button>
            <button className="qr-btn svg" onClick={downloadSVG}>
              <Download className="w-4 h-4" /> SVG
            </button>
            <button className="qr-btn print" onClick={printQR}>
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>

          {/* Info Notes in English and Amharic */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center w-full mt-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              ይህ የእርስዎ ቋሚ የካፍቴሪያ QR ኮድ ነው። ደህንነቱን ጠብቁ እና አያጋሩ።
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
              This is your permanent cafeteria QR code. Keep it secure and do not share it.
            </p>
          </div>
        </div>
      </div>

      {/* Daily menu highlight & Past orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Daily lunch menu highlight */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm lg:col-span-1 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-black text-primary tracking-tight">Today's Special Menu</h3>
            <p className="text-[10px] text-subtle-text font-medium mt-0.5">Chef's daily lunch recommendation</p>
          </div>

          <div className="rounded-2xl overflow-hidden bg-slate-100 h-32 relative">
            <img
              src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop"
              alt="Doro Wot"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="space-y-1 text-xs">
            <h4 className="font-black text-primary">Doro Wot (Spicy Chicken Stew)</h4>
            <p className="text-[11px] text-subtle-text leading-snug">Spicy chicken drumsticks cooked in berbere red sauce with hard-boiled eggs and injera bread.</p>
          </div>

          <button
            id="order-special-btn"
            onClick={() => navigate('/employee/orders', { state: { defaultTab: 'order-now' } })}
            className="w-full text-center py-3 bg-primary hover:bg-secondary text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all min-h-[44px]"
          >
            Order Meal Online
          </button>
        </div>

        {/* Past activities */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-primary tracking-tight">Recent Dining Activities</h3>
              <p className="text-[10px] text-subtle-text font-medium mt-0.5">Review your latest meal Birr redemptions</p>
            </div>
            <button
              onClick={() => navigate('/employee/orders', { state: { defaultTab: 'order-history' } })}
              className="text-[10px] font-black text-secondary hover:text-primary uppercase tracking-wider flex items-center gap-1 focus:outline-none"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {myOrders.slice(0, 3).map((item) => (
              <div key={item.id} className="p-3 hover:bg-slate-50 rounded-2xl border border-slate-50 flex justify-between items-center transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                    <History className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-primary max-w-xs truncate">
                      {item.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ')}
                    </h4>
                    <span className="text-[10px] text-slate-400">{new Date(item.date).toLocaleDateString()} &bull; Main Cafeteria</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-danger block">-{formatETB(item.amount)}</span>
                  <span className={`inline-block text-[9px] font-bold uppercase ${
                    item.status === 'confirmed' ? 'text-success' : 'text-warning'
                  }`}>
                    {item.status}
                  </span>
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
// SUB-PAGE 2: PLACE ORDER PAGE
// -----------------------------------------------------------
function EmployeePlaceOrder({
  user,
  menuItems,
  onReload,
  apiPost,
  setToast,
  refreshData,
  allocationHistory
}: {
  user: any;
  menuItems: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
  setToast: (toast: any) => void;
  refreshData: () => Promise<void>;
  allocationHistory: any[];
}) {
  const [cart, setCart] = useState<{ item: any; quantity: number }[]>([]);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ratings for feedback
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [activeCat, setActiveCat] = useState<'All' | 'Food' | 'Beverage' | 'Snack'>('All');

  // Persistent Active Cafe Selector State
  const [activeCafe, setActiveCafe] = useState<string>(() => {
    return localStorage.getItem('activeCafe') || 'Main Corporate Cafe';
  });

  const handleCafeChange = (cafeName: string) => {
    setActiveCafe(cafeName);
    localStorage.setItem('activeCafe', cafeName);
  };

  const monthlyAllowance = allocationHistory && allocationHistory.length > 0 ? allocationHistory[0].amount : 1000;
  const isLowBalance = user.balance < (monthlyAllowance * 0.2);

  // Filter items
  const filteredItems = menuItems.filter(item => {
    if (activeCat === 'All') return true;
    return item.category === activeCat;
  });

  const getCartTotal = () => {
    return cart.reduce((sum, c) => sum + (Number(c.item.price) * c.quantity), 0);
  };

  const addToCart = (item: any) => {
    setCart((prev) => {
      const idx = prev.findIndex(c => c.item.id === item.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx].quantity += 1;
        return next;
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const updateCartQuantity = (id: string, delta: number) => {
    setCart((prev) => {
      const idx = prev.findIndex(c => c.item.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx].quantity += delta;
      if (next[idx].quantity <= 0) {
        next.splice(idx, 1);
      }
      return next;
    });
  };

  const handleCheckout = async () => {
    const total = getCartTotal();
    if (total > user.balance) {
      setToast({ type: 'error', message: "Overdraft! You don't have enough ETB to pay for this meal tray." });
      return;
    }

    setIsSubmitting(true);
    try {
      const cafeId = cart[0]?.item.cafe_id;
      const res = await apiPost('/api/employee/orders', {
        cafe_id: cafeId,
        items: cart.map(c => ({
          menu_item_id: c.item.id,
          quantity: c.quantity
        }))
      });

      // Clear tray
      setCart([]);

      // Real-time balance refetch in AppContext
      await refreshData();
      await onReload();

      setSuccessOrder({
        id: res.data?.orderUuid || res.data?.orderId,
        amount: res.data?.totalAmount ?? total,
        cafeId
      });

      // Trigger beautiful real-time success toast
      setToast({
        type: 'success',
        message: `${formatETB(total)} deducted. Remaining: ${formatETB(user.balance - total)}`
      });

      // Trigger amber warning toast if balance drops below 20%
      if ((user.balance - total) < (monthlyAllowance * 0.2)) {
        setTimeout(() => {
          setToast({
            type: 'warning',
            message: `Your balance is running low. ${formatETB(user.balance - total)} remaining`
          });
        }, 3000);
      }
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.message || 'Order could not be confirmed. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!successOrder) return;

    try {
      await apiPost('/api/employee/feedback', {
        cafe_id: successOrder.cafeId,
        rating,
        comment: comment.trim() || 'No comment provided'
      });
      setFeedbackSent(true);
      setTimeout(() => {
        setSuccessOrder(null);
        setFeedbackSent(false);
        setComment('');
        setRating(5);
      }, 3000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header and Cafe Selector */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Order Meals</h1>
          <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Browse active food selections, fill your tray and check out</p>
        </div>
        
        {/* Dynamic Cafe Selector dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cafeteria:</span>
          <select
            id="cafe-selector"
            value={activeCafe}
            onChange={(e) => handleCafeChange(e.target.value)}
            className="text-xs font-black text-primary bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-accent dark:text-white shadow-sm cursor-pointer min-h-[44px]"
          >
            <option value="Main Corporate Cafe">🏢 Main Corporate Cafe</option>
            <option value="Annex Building Cafe">🏬 Annex Building Cafe</option>
            <option value="IT Plaza Cafe">💻 IT Plaza Cafe</option>
          </select>
        </div>
      </div>

      {successOrder ? (
        /* Order Complete Receipt and Feedback Trigger Block */
        <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg mx-auto shadow-xl border border-slate-100 space-y-6 text-center text-xs">
          <div className="flex flex-col items-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-green-50 text-success flex items-center justify-center">
              <CheckCircle className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-black text-primary tracking-tight">Order Confirmed!</h3>
            <p className="text-subtle-text">Your lunch ticket has been submitted to the kitchen.</p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-2">
            <p className="text-[10px] font-bold text-subtle-text uppercase">Order Receipt</p>
            <div className="flex justify-between font-mono">
              <span>Order Ticket ID:</span>
              <span className="font-bold text-primary">{successOrder.id}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span>ETB Used:</span>
              <span className="font-bold text-danger">-{formatETB(successOrder.amount)}</span>
            </div>
            <div className="flex justify-between font-mono pt-1.5 border-t">
              <span>Remaining ETB:</span>
              <span className="font-bold text-success">{formatETB(user.balance)}</span>
            </div>
          </div>

          {feedbackSent ? (
            <p className="p-3 bg-green-50 rounded-xl border border-green-100 text-success font-bold text-[11px]">
              Thank you for your rating! Feedback submitted to the cafeteria management.
            </p>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-4 border-t border-slate-100 pt-5 text-left">
              <div>
                <h4 className="font-bold text-primary text-xs">Rate your Dining Experience</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Help us maintain quality at the corporate cafeteria</p>
              </div>

              {/* Star icons rating selection */}
              <div className="flex gap-2 justify-center py-2 bg-slate-50 rounded-2xl">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <button
                    id={`btn-star-select-${idx + 1}`}
                    key={idx}
                    type="button"
                    onClick={() => setRating(idx + 1)}
                    className="focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        idx < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Add an optional comment</label>
                <textarea
                  id="feedback-comment"
                  placeholder="e.g. Delicious doro wot! Perfect spice..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-xs h-16"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSuccessOrder(null)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 min-h-[44px]"
                >
                  Skip Feedback
                </button>
                <button
                  id="feedback-submit-btn"
                  type="submit"
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary min-h-[44px] flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Reviews</span>
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Menu listing (8 columns) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Category tabs */}
            <div className="flex gap-1.5 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm w-max">
              {['All', 'Food', 'Beverage', 'Snack'].map((cat) => (
                <button
                  id={`menu-cat-tab-${cat.toLowerCase()}`}
                  key={cat}
                  onClick={() => setActiveCat(cat as any)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                    activeCat === cat
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-subtle-text hover:text-dark-text'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Dishes grid */}
            <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-6">
              {filteredItems.map((item) => (
                <div key={item.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all">
                  <div className="h-32 bg-slate-100 overflow-hidden relative">
                    <img
                      src={item.photo || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex justify-between items-start gap-1">
                        <h4 className="text-xs font-black text-primary line-clamp-1">{item.name}</h4>
                        <span className="text-[11px] font-black text-secondary flex-shrink-0">{formatETB(item.price)}</span>
                      </div>
                      <p className="text-[10px] text-subtle-text line-clamp-2 leading-relaxed">{item.description}</p>
                    </div>
                    <button
                      id={`btn-add-cart-${item.id}`}
                      onClick={() => addToCart(item)}
                      className="w-full py-2 bg-slate-50 hover:bg-primary border border-slate-100 group-hover:border-primary hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      Add to Tray
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tray checkout Panel (4 columns) */}
          <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-black text-primary tracking-tight">Your Lunch Tray</h3>
              <p className="text-[10px] text-subtle-text font-medium mt-0.5">Items selected for lunch ticket validation</p>
            </div>

            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-300 flex flex-col items-center justify-center space-y-2">
                <ShoppingBag className="w-8 h-8" />
                <p className="text-xs text-subtle-text font-medium">Your lunch tray is empty</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cart list */}
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto no-scrollbar pr-1">
                  {cart.map((c) => (
                    <div key={c.item.id} className="py-3 flex items-center justify-between text-xs">
                      <div className="min-w-0 flex-1">
                        <h5 className="font-bold text-primary truncate">{c.item.name}</h5>
                        <p className="text-[10px] text-slate-400">{formatETB(c.item.price)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          id={`btn-cart-dec-${c.item.id}`}
                          onClick={() => updateCartQuantity(c.item.id, -1)}
                          className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 min-h-[32px] min-w-[32px] flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-extrabold text-primary w-5 text-center">{c.quantity}</span>
                        <button
                          id={`btn-cart-inc-${c.item.id}`}
                          onClick={() => updateCartQuantity(c.item.id, 1)}
                          className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 min-h-[32px] min-w-[32px] flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Subtotals */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-500">
                    <span>Birr Balance:</span>
                    <span className="font-extrabold text-primary">{formatETB(user.balance)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t text-sm">
                    <span className="font-bold text-primary">Basket Total:</span>
                    <span className="font-black text-secondary">{formatETB(getCartTotal())}</span>
                  </div>
                </div>

                {/* Low balance order warning */}
                {isLowBalance && (
                  <div id="low-balance-order-alert" className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/40 text-warning text-[10px] font-bold flex gap-2 items-start">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>Your balance is running low. {formatETB(user.balance)} remaining.</p>
                  </div>
                )}

                {getCartTotal() > user.balance && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-danger text-[10px] font-bold flex gap-2 items-start animate-shake">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>Overdraft detected. Please remove some items from your tray to proceed.</p>
                  </div>
                )}

                <button
                  id="checkout-submit-btn"
                  onClick={handleCheckout}
                  disabled={getCartTotal() > user.balance || isSubmitting}
                  className="w-full py-3.5 bg-primary hover:bg-secondary text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-45 disabled:hover:bg-primary min-h-[44px] flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Confirm Order</span>
                  )}
                </button>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 3: MY ORDERS HISTORY
// -----------------------------------------------------------
function EmployeeOrdersHistory({ myOrders }: { myOrders: any[] }) {
  const [expandedRows, setExpandedRows] = React.useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Order Receipts</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Audit log records of your cafeteria redemptions</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="table-container relative">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-3 text-center md:hidden w-10"></th>
                <th className="py-4 px-6">Order ID</th>
                <th className="py-4 px-4 hidden md:table-cell">Items Summary</th>
                <th className="py-4 px-4 text-right">ETB Used</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-4 hidden md:table-cell">Waiter Name</th>
                <th className="py-4 px-6">Transaction Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myOrders.map(item => {
                const isExpanded = !!expandedRows[item.id];
                return (
                  <React.Fragment key={item.id}>
                    <tr className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-3 px-3 text-center md:hidden">
                        <button
                          onClick={() => toggleRow(item.id)}
                          className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-extrabold text-xs cursor-pointer"
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                      </td>
                      <td className="py-3 px-6 font-mono font-bold text-primary">{item.id}</td>
                      <td className="py-3 px-4 font-semibold text-primary max-w-sm truncate hidden md:table-cell" title={item.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ')}>
                        {item.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ')}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-danger">-{formatETB(item.amount)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          item.status === 'confirmed' ? 'bg-green-50 text-success' : 'bg-amber-50 text-warning'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-semibold hidden md:table-cell">{item.waiterName || 'Staff'}</td>
                      <td className="py-3 px-6 text-slate-400 font-semibold">{new Date(item.date).toLocaleString()}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50 md:hidden">
                        <td colSpan={5} className="py-3 px-6 text-[11px] text-slate-600 space-y-1">
                          <p><strong>Items:</strong> {item.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ')}</p>
                          <p><strong>Server/Waiter:</strong> {item.waiterName || 'Staff'}</p>
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
// SUB-PAGE 4: MY PROFILE / ALLOCATIONS HISTORY
// -----------------------------------------------------------
function EmployeeProfilePage({
  user,
  allocationHistory,
  apiPut
}: {
  user: any;
  allocationHistory: any[];
  apiPut: (path: string, body: any) => Promise<any>;
}) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setPassError('All password fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match.');
      return;
    }

    try {
      await apiPut('/api/employee/password', {
        old_password: oldPassword,
        new_password: newPassword
      });

      setPassSuccess('Password updated successfully!');
      setPassError('');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setPassSuccess('');
      }, 5000);
    } catch (err: any) {
      setPassError(err.message || 'Error updating password.');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn text-xs">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Profile & History</h1>
        <p className="text-xs text-subtle-text font-medium uppercase tracking-wider mt-1">Manage passwords and review subsidy allocation records</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column (Profile overview and Password edit form) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm text-center flex flex-col items-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 border flex items-center justify-center font-black text-primary text-2xl uppercase shadow-sm">
              {user.fullName?.charAt(0) || "?"}
            </div>
            <div>
              <h3 className="text-base font-black text-primary">{user.fullname}</h3>
              <p className="text-[10px] text-slate-400 font-mono font-bold tracking-wider">{user.employeeId}</p>
            </div>
            <div className="text-[11px] text-slate-600 bg-slate-50 py-1.5 px-3.5 rounded-full font-bold">
              {user.department} Department
            </div>
          </div>

          {/* Password update form */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-black text-primary tracking-tight">Security Credentials</h3>
              <p className="text-[10px] text-subtle-text mt-0.5">Verify old passwords before setting a new login key</p>
            </div>

            {passError && (
              <p className="p-3 bg-red-50 rounded-xl border border-red-200 text-danger font-bold">{passError}</p>
            )}

            {passSuccess && (
              <p className="p-3 bg-green-50 rounded-xl border border-green-200 text-success font-bold">{passSuccess}</p>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Current Password</label>
                <input
                  id="profile-old-pass"
                  type="password"
                  required
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">New Password</label>
                <input
                  id="profile-new-pass"
                  type="password"
                  required
                  placeholder="At least 6 characters..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Confirm New Password</label>
                <input
                  id="profile-confirm-pass"
                  type="password"
                  required
                  placeholder="Match new password..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <button
                id="update-password-submit-btn"
                type="submit"
                className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-secondary transition-all min-h-[44px]"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>

        {/* Right column (Allotment history ledger) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-black text-primary tracking-tight">Monthly Birr Allowance History</h3>
            <p className="text-[10px] text-subtle-text font-medium mt-0.5">Corporate credits allocated to your account by month</p>
          </div>

          <div className="divide-y divide-slate-100">
            {allocationHistory.map((alloc) => (
              <div key={alloc.id} className="py-3.5 flex justify-between items-center text-xs">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-primary">{alloc.cycleMonth} Allotment</h4>
                  <span className="text-[10px] text-slate-400 font-medium">Credits issued on {new Date(alloc.date).toLocaleDateString()}</span>
                </div>
                <span className="font-black text-success">{formatETB(alloc.amount)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// -----------------------------------------------------------
// UNIFIED ORDERS PAGE WITH TABS
// -----------------------------------------------------------
function EmployeeOrdersPage({
  user,
  menuItems,
  myOrders,
  onReload,
  apiPost,
  setToast,
  refreshData,
  allocationHistory
}: {
  user: any;
  menuItems: any[];
  myOrders: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
  setToast: (toast: any) => void;
  refreshData: () => Promise<void>;
  allocationHistory: any[];
}) {
  const location = useLocation();
  const [subTab, setSubTab] = useState<'order-now' | 'order-history'>(() => {
    if (location.state && (location.state as any).defaultTab) {
      return (location.state as any).defaultTab;
    }
    return 'order-now';
  });

  useEffect(() => {
    if (location.state && (location.state as any).defaultTab) {
      setSubTab((location.state as any).defaultTab);
    }
  }, [location.state]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Tab bar */}
      <div className="flex border-b border-border-default space-x-6">
        <button
          id="tab-btn-order-now"
          onClick={() => setSubTab('order-now')}
          className={`pb-3 text-sm font-black uppercase tracking-wider transition-all relative ${
            subTab === 'order-now'
              ? 'text-brand-primary dark:text-brand-secondary border-b-2 border-brand-primary dark:border-brand-secondary font-black'
              : 'text-text-subtle hover:text-text-primary'
          }`}
        >
          Order Now
        </button>
        <button
          id="tab-btn-order-history"
          onClick={() => setSubTab('order-history')}
          className={`pb-3 text-sm font-black uppercase tracking-wider transition-all relative ${
            subTab === 'order-history'
              ? 'text-brand-primary dark:text-brand-secondary border-b-2 border-brand-primary dark:border-brand-secondary font-black'
              : 'text-text-subtle hover:text-text-primary'
          }`}
        >
          Order History
        </button>
      </div>

      {subTab === 'order-now' ? (
        <EmployeePlaceOrder
          user={user}
          menuItems={menuItems}
          onReload={onReload}
          apiPost={apiPost}
          setToast={setToast}
          refreshData={refreshData}
          allocationHistory={allocationHistory}
        />
      ) : (
        <EmployeeOrdersHistory
          myOrders={myOrders}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------
// SUB-PAGE 5: EMPLOYEE TRANSACTIONS PAGE (STANDALONE FINANCIAL LEDGER)
// -----------------------------------------------------------
interface Transaction {
  id: string;
  date: string;
  type: 'Credit' | 'Deduction' | 'Expiry';
  description: string;
  orderId: string;
  cafe: string;
  amount: number;
  balanceAfter: number;
  orderDetails?: {
    items: { name: string; quantity: number; price: number }[];
    waiterName: string;
    deliveryConfirmationTime: string;
    totalAmount: number;
  };
}

function EmployeeTransactionsPage({
  user,
  myOrders,
  allocationHistory
}: {
  user: any;
  myOrders: any[];
  allocationHistory: any[];
}) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [cafeFilter, setCafeFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [selectedOrder, setSelectedOrder] = useState<Transaction | null>(null);

  // Memoized transactions calculation
  const allTransactions = React.useMemo(() => {
    // Determine user tier allocation
    const allocation = user.monthlyAllocation || (user.balanceTier === 'Tier 1' ? 5000 : 3000);
    const list: Omit<Transaction, 'balanceAfter'>[] = [];

    // April Allocation & Orders
    list.push({
      id: 'alloc-april',
      date: '2026-04-01T08:00:00.000Z',
      type: 'Credit',
      description: 'Monthly allowance credited',
      orderId: '—',
      cafe: '—',
      amount: allocation,
    });

    list.push({
      id: 'ORD-2026-04-05-1105',
      date: '2026-04-05T12:30:00.000Z',
      type: 'Deduction',
      description: 'Order from Addis Café',
      orderId: '#ORD-2026-04-05-1105',
      cafe: 'Addis Café',
      amount: 320,
      orderDetails: {
        items: [{ name: 'Special Beyaynetu', quantity: 2, price: 160 }],
        waiterName: 'Marta Hailu',
        deliveryConfirmationTime: '12:45 PM',
        totalAmount: 320
      }
    });

    list.push({
      id: 'ORD-2026-04-12-2114',
      date: '2026-04-12T13:15:00.000Z',
      type: 'Deduction',
      description: 'Order from Main Corporate Cafe',
      orderId: '#ORD-2026-04-12-2114',
      cafe: 'Main Corporate Cafe',
      amount: 150,
      orderDetails: {
        items: [{ name: 'Macchiato', quantity: 3, price: 50 }],
        waiterName: 'Abebe Yosef',
        deliveryConfirmationTime: '01:22 PM',
        totalAmount: 150
      }
    });

    list.push({
      id: 'ORD-2026-04-20-0045',
      date: '2026-04-20T19:10:00.000Z',
      type: 'Deduction',
      description: 'Order from Finfine Café',
      orderId: '#ORD-2026-04-20-0045',
      cafe: 'Finfine Café',
      amount: 450,
      orderDetails: {
        items: [{ name: 'Beef Tibs', quantity: 1, price: 450 }],
        waiterName: 'Yonas Kassa',
        deliveryConfirmationTime: '07:30 PM',
        totalAmount: 450
      }
    });

    list.push({
      id: 'ORD-2026-04-28-1502',
      date: '2026-04-28T12:10:00.000Z',
      type: 'Deduction',
      description: 'Order from Sheger Café',
      orderId: '#ORD-2026-04-28-1502',
      cafe: 'Sheger Café',
      amount: 220,
      orderDetails: {
        items: [{ name: 'Shiro Tegabino', quantity: 1, price: 220 }],
        waiterName: 'Marta Hailu',
        deliveryConfirmationTime: '12:25 PM',
        totalAmount: 220
      }
    });

    const aprilSpent = 320 + 150 + 450 + 220;
    const aprilLeft = allocation - aprilSpent;
    if (aprilLeft > 0) {
      list.push({
        id: 'exp-april',
        date: '2026-04-30T23:59:59.000Z',
        type: 'Expiry',
        description: 'Balance expired',
        orderId: '—',
        cafe: '—',
        amount: aprilLeft,
      });
    }

    // May Allocation & Orders
    list.push({
      id: 'alloc-may',
      date: '2026-05-01T08:00:00.000Z',
      type: 'Credit',
      description: 'Monthly allowance credited',
      orderId: '—',
      cafe: '—',
      amount: allocation,
    });

    list.push({
      id: 'ORD-2026-05-03-0985',
      date: '2026-05-03T11:45:00.000Z',
      type: 'Deduction',
      description: 'Order from Main Corporate Cafe',
      orderId: '#ORD-2026-05-03-0985',
      cafe: 'Main Corporate Cafe',
      amount: 190,
      orderDetails: {
        items: [
          { name: 'Pasta with Tomato Sauce', quantity: 1, price: 140 },
          { name: 'Soft Drink', quantity: 1, price: 50 }
        ],
        waiterName: 'Abebe Yosef',
        deliveryConfirmationTime: '11:58 AM',
        totalAmount: 190
      }
    });

    list.push({
      id: 'ORD-2026-05-10-1845',
      date: '2026-05-10T14:20:00.000Z',
      type: 'Deduction',
      description: 'Order from Sheger Café',
      orderId: '#ORD-2026-05-10-1845',
      cafe: 'Sheger Café',
      amount: 350,
      orderDetails: {
        items: [
          { name: 'Chicken Cutlet', quantity: 1, price: 300 },
          { name: 'Black Tea', quantity: 2, price: 25 }
        ],
        waiterName: 'Yonas Kassa',
        deliveryConfirmationTime: '02:40 PM',
        totalAmount: 350
      }
    });

    list.push({
      id: 'ORD-2026-05-18-0422',
      date: '2026-05-18T13:00:00.000Z',
      type: 'Deduction',
      description: 'Order from Addis Café',
      orderId: '#ORD-2026-05-18-0422',
      cafe: 'Addis Café',
      amount: 510,
      orderDetails: {
        items: [
          { name: 'Special Kitfo', quantity: 1, price: 450 },
          { name: 'Sparkling Water', quantity: 1, price: 60 }
        ],
        waiterName: 'Marta Hailu',
        deliveryConfirmationTime: '01:15 PM',
        totalAmount: 510
      }
    });

    list.push({
      id: 'ORD-2026-05-25-1152',
      date: '2026-05-25T12:00:00.000Z',
      type: 'Deduction',
      description: 'Order from Finfine Café',
      orderId: '#ORD-2026-05-25-1152',
      cafe: 'Finfine Café',
      amount: 280,
      orderDetails: {
        items: [{ name: 'Fish Dullet', quantity: 1, price: 280 }],
        waiterName: 'Abebe Yosef',
        deliveryConfirmationTime: '12:18 PM',
        totalAmount: 280
      }
    });

    const maySpent = 190 + 350 + 510 + 280;
    const mayLeft = allocation - maySpent;
    if (mayLeft > 0) {
      list.push({
        id: 'exp-may',
        date: '2026-05-31T23:59:59.000Z',
        type: 'Expiry',
        description: 'Balance expired',
        orderId: '—',
        cafe: '—',
        amount: mayLeft,
      });
    }

    // June Allocation & Orders
    list.push({
      id: 'alloc-june',
      date: '2026-06-01T08:00:00.000Z',
      type: 'Credit',
      description: 'Monthly allowance credited',
      orderId: '—',
      cafe: '—',
      amount: allocation,
    });

    list.push({
      id: 'ORD-2026-06-05-0214',
      date: '2026-06-05T13:05:00.000Z',
      type: 'Deduction',
      description: 'Order from Finfine Café',
      orderId: '#ORD-2026-06-05-0214',
      cafe: 'Finfine Café',
      amount: 180,
      orderDetails: {
        items: [{ name: 'Doro Wat Egg & Sauce', quantity: 1, price: 180 }],
        waiterName: 'Yonas Kassa',
        deliveryConfirmationTime: '01:25 PM',
        totalAmount: 180
      }
    });

    list.push({
      id: 'ORD-2026-06-12-1452',
      date: '2026-06-12T12:15:00.000Z',
      type: 'Deduction',
      description: 'Order from Addis Café',
      orderId: '#ORD-2026-06-12-1452',
      cafe: 'Addis Café',
      amount: 400,
      orderDetails: {
        items: [
          { name: 'Beef Tibs', quantity: 1, price: 350 },
          { name: 'Soft Drink', quantity: 1, price: 50 }
        ],
        waiterName: 'Marta Hailu',
        deliveryConfirmationTime: '12:35 PM',
        totalAmount: 400
      }
    });

    list.push({
      id: 'ORD-2026-06-18-0951',
      date: '2026-06-18T13:40:00.000Z',
      type: 'Deduction',
      description: 'Order from Sheger Café',
      orderId: '#ORD-2026-06-18-0951',
      cafe: 'Sheger Café',
      amount: 120,
      orderDetails: {
        items: [{ name: 'Injera Firfir', quantity: 1, price: 120 }],
        waiterName: 'Abebe Yosef',
        deliveryConfirmationTime: '01:52 PM',
        totalAmount: 120
      }
    });

    // Dynamic integrations of live data
    if (allocationHistory && allocationHistory.length > 0) {
      allocationHistory.forEach((alloc) => {
        const monthStr = new Date(alloc.date).toLocaleString('default', { month: 'long' });
        if (!['June', 'May', 'April'].some(m => monthStr.includes(m))) {
          list.push({
            id: `alloc-${alloc.id || alloc.cycleMonth}`,
            date: alloc.date || new Date().toISOString(),
            type: 'Credit',
            description: 'Monthly allowance credited',
            orderId: '—',
            cafe: '—',
            amount: alloc.amount,
          });
        }
      });
    }

    if (myOrders && myOrders.length > 0) {
      myOrders.forEach((order) => {
        const isDuplicate = list.some(t => t.id === order.id);
        if (!isDuplicate) {
          list.push({
            id: order.id,
            date: order.date || new Date().toISOString(),
            type: 'Deduction',
            description: `Order from ${order.cafe || order.cafeName || 'Main Corporate Cafe'}`,
            orderId: `#${order.id}`,
            cafe: order.cafe || order.cafeName || 'Main Corporate Cafe',
            amount: order.amount,
            orderDetails: {
              items: order.items || [],
              waiterName: order.waiterName || 'Staff',
              deliveryConfirmationTime: order.deliveryConfirmationTime || new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              totalAmount: order.amount
            }
          });
        }
      });
    }

    // Sort chronologically (oldest first) to compute running balance correctly
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute running balance
    let rb = 0;
    const processedList = list.map((t) => {
      if (t.type === 'Credit') {
        rb += t.amount;
      } else if (t.type === 'Deduction' || t.type === 'Expiry') {
        rb -= t.amount;
      }
      return {
        ...t,
        balanceAfter: rb,
      };
    });

    // Reverse to show newest first
    processedList.reverse();
    return processedList;
  }, [user, myOrders, allocationHistory]);

  // Compute stats for June 2026 (this month)
  const juneStats = React.useMemo(() => {
    const juneTx = allTransactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === 2026 && d.getMonth() === 5; // June
    });

    const totalCredited = juneTx
      .filter((t) => t.type === 'Credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDeducted = juneTx
      .filter((t) => t.type === 'Deduction')
      .reduce((sum, t) => sum + t.amount, 0);

    return { totalCredited, totalDeducted };
  }, [allTransactions]);

  // Handle resets
  const handleResetFilters = (e: React.MouseEvent) => {
    e.preventDefault();
    setFromDate('');
    setToDate('');
    setTypeFilter('All');
    setCafeFilter('All');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Filter transactions
  const filteredTransactions = React.useMemo(() => {
    return allTransactions.filter((t) => {
      // Date Range
      if (fromDate) {
        const fDate = new Date(fromDate);
        fDate.setHours(0, 0, 0, 0);
        if (new Date(t.date) < fDate) return false;
      }
      if (toDate) {
        const tDate = new Date(toDate);
        tDate.setHours(23, 59, 59, 999);
        if (new Date(t.date) > tDate) return false;
      }

      // Transaction Type
      if (typeFilter !== 'All') {
        if (t.type !== typeFilter) return false;
      }

      // Cafe
      if (cafeFilter !== 'All') {
        if (t.cafe !== cafeFilter) return false;
      }

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchOrderId = t.orderId.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
        const matchFood = t.orderDetails?.items.some(item => item.name.toLowerCase().includes(q)) || false;
        const matchDesc = t.description.toLowerCase().includes(q);
        if (!matchOrderId && !matchFood && !matchDesc) return false;
      }

      return true;
    });
  }, [allTransactions, fromDate, toDate, typeFilter, cafeFilter, searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, typeFilter, cafeFilter, searchQuery, rowsPerPage]);

  // Pagination calculation
  const totalRows = filteredTransactions.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + rowsPerPage);

  // Formatting helpers
  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');

    return `${day}/${month}/${year} at ${strHours}:${minutes} ${ampm}`;
  };

  const getDayName = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' });
  };

  // Export handlers
  const handleExportCSV = () => {
    const headers = ['#', 'Date & Time', 'Day', 'Type', 'Description', 'Order ID', 'Cafe', 'Amount', 'Balance After'];
    const rows = filteredTransactions.map((t, idx) => {
      const dateStr = formatDateTime(t.date);
      const dayStr = getDayName(t.date);
      const prefix = t.type === 'Credit' ? '+' : '-';
      return [
        filteredTransactions.length - idx,
        `"${dateStr}"`,
        dayStr,
        t.type,
        `"${t.description}"`,
        t.orderId,
        `"${t.cafe}"`,
        `"${prefix}ETB ${t.amount}"`,
        `"ETB ${t.balanceAfter}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `esrom_transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportXLSX = () => {
    // Generate styled XML / comma separated Excel compatible CSV
    const headers = ['#', 'Date & Time', 'Day', 'Type', 'Description', 'Order ID', 'Cafe', 'Amount', 'Balance After'];
    const rows = filteredTransactions.map((t, idx) => {
      const dateStr = formatDateTime(t.date);
      const dayStr = getDayName(t.date);
      const prefix = t.type === 'Credit' ? '+' : '-';
      return [
        filteredTransactions.length - idx,
        `"${dateStr}"`,
        dayStr,
        t.type,
        `"${t.description}"`,
        t.orderId,
        `"${t.cafe}"`,
        `"${prefix}ETB ${t.amount}"`,
        `"ETB ${t.balanceAfter}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `esrom_transactions_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredTransactions.map((t, idx) => {
      const dateStr = formatDateTime(t.date);
      const dayStr = getDayName(t.date);
      const prefix = t.type === 'Credit' ? '+' : '-';
      const amountClass = t.type === 'Credit' ? 'text-success' : t.type === 'Expiry' ? 'text-warning' : 'text-danger';
      
      return `
        <tr>
          <td>${filteredTransactions.length - idx}</td>
          <td>${dateStr}</td>
          <td>${dayStr}</td>
          <td><span class="badge ${t.type.toLowerCase()}">${t.type}</span></td>
          <td>${t.description}</td>
          <td>${t.orderId}</td>
          <td>${t.cafe}</td>
          <td class="${amountClass}">${prefix}ETB ${t.amount}</td>
          <td>ETB ${t.balanceAfter}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>ESROM BirrBalance - Transaction History</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 25px; color: #334155; }
            h1 { font-size: 22px; margin-bottom: 5px; color: #0f172a; font-weight: 800; }
            p { font-size: 13px; color: #64748b; margin-bottom: 25px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 15px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background-color: #f8fafc; font-weight: bold; color: #475569; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 9px; font-weight: 800; text-transform: uppercase; }
            .credit { background: #f0fdf4; color: #166534; }
            .deduction { background: #fef2f2; color: #991b1b; }
            .expiry { background: #fffbeb; color: #92400e; }
            .text-success { color: #166534; font-weight: bold; }
            .text-danger { color: #991b1b; font-weight: bold; }
            .text-warning { color: #92400e; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>ESROM BirrBalance - Transaction History</h1>
          <p>Generated on ${new Date().toLocaleString()} | Employee: ${user.fullname} (${user.employeeId}) | Department: ${user.department || 'N/A'}</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date & Time</th>
                <th>Day</th>
                <th>Type</th>
                <th>Description</th>
                <th>Order ID</th>
                <th>Café</th>
                <th>Amount</th>
                <th>Balance After</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8 animate-fadeIn transaction-history-page p-6 rounded-3xl">
      {/* 1. Page Header */}
      <div>
        <h1 className="text-3xl font-black text-primary tracking-tight">Transaction History</h1>
        <p className="text-sm text-subtle-text font-medium mt-1">A full record of all your balance movements</p>
      </div>

      {/* 2. Summary Strip (3 Compact Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="summary-card credited bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="label text-subtle-text dark:text-slate-400">Total Credited This Month</p>
            <p className="amount text-success dark:text-success">{formatETB(juneStats.totalCredited)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950/20 text-success flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="summary-card deducted bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="label text-subtle-text dark:text-slate-400">Total Deducted This Month</p>
            <p className="amount text-danger dark:text-danger">{formatETB(juneStats.totalDeducted)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/20 text-danger flex items-center justify-center">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="summary-card remaining bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="label text-subtle-text dark:text-slate-400">Current Remaining Balance</p>
            <p className="amount text-primary dark:text-white">{formatETB(user.balance)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-primary dark:text-accent-blue flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="filter-bar bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 flex-1">
            {/* From Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">From Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="filter-input w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary dark:text-white"
                />
              </div>
            </div>

            {/* To Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">To Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="filter-input w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary dark:text-white"
                />
              </div>
            </div>

            {/* Transaction Type */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Transaction Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="filter-select w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary dark:text-white"
              >
                <option value="All">All Types</option>
                <option value="Credit">Credit</option>
                <option value="Deduction">Deduction</option>
                <option value="Expiry">Expiry</option>
              </select>
            </div>

            {/* Café Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Café</label>
              <select
                value={cafeFilter}
                onChange={(e) => setCafeFilter(e.target.value)}
                className="filter-select w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary dark:text-white"
              >
                <option value="All">All Cafés</option>
                <option value="Main Corporate Cafe">Main Corporate Cafe</option>
                <option value="Addis Café">Addis Café</option>
                <option value="Finfine Café">Finfine Café</option>
                <option value="Sheger Café">Sheger Café</option>
              </select>
            </div>

            {/* Search input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Search</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Order ID or item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="filter-input w-full text-xs py-2.5 pl-8 pr-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end md:self-end">
            {(fromDate || toDate || typeFilter !== 'All' || cafeFilter !== 'All' || searchQuery) && (
              <button
                onClick={handleResetFilters}
                className="reset-filters-link text-xs font-bold text-brand-primary hover:text-brand-primary/80 transition-colors uppercase tracking-wider hover:underline"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Transactions Table */}
      <div className="transactions-table bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {totalRows === 0 ? (
          <div className="p-16 text-center space-y-4 max-w-sm mx-auto flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shadow-inner">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-black text-primary dark:text-white">No transactions found</p>
              <p className="text-xs text-subtle-text mt-1">Try adjusting your filters.</p>
            </div>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold rounded-xl text-primary dark:text-white transition-all"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto relative no-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-subtle-text uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/20 font-black">
                    <th className="py-4 px-4 w-12 text-center">#</th>
                    <th className="py-4 px-4 min-w-[150px]">Date & Time</th>
                    <th className="py-4 px-4 w-24">Day</th>
                    <th className="py-4 px-4 w-28">Type</th>
                    <th className="py-4 px-4 min-w-[200px]">Description</th>
                    <th className="py-4 px-4 w-32">Order ID</th>
                    <th className="py-4 px-4 min-w-[150px]">Café</th>
                    <th className="py-4 px-4 text-right w-28">Amount</th>
                    <th className="py-4 px-6 text-right w-32">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedTransactions.map((t, idx) => {
                    const rowNumber = totalRows - (startIndex + idx);
                    const isOrder = t.type === 'Deduction' && t.orderId !== '—';
                    
                    return (
                      <tr
                        key={t.id + idx}
                        onClick={() => isOrder && setSelectedOrder(t)}
                        className={`group transition-colors ${
                          t.type === 'Credit' 
                            ? 'row-credit bg-emerald-500/[0.02] hover:bg-emerald-500/[0.05] dark:bg-emerald-500/[0.01] dark:hover:bg-emerald-500/[0.03]' 
                            : t.type === 'Expiry'
                            ? 'row-expiry bg-amber-500/[0.02] hover:bg-amber-500/[0.05] dark:bg-amber-500/[0.01] dark:hover:bg-amber-500/[0.03]'
                            : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/40'
                        } ${isOrder ? 'cursor-pointer' : ''}`}
                      >
                        <td className="py-4 px-4 text-center font-bold text-slate-400 dark:text-slate-500">{rowNumber}</td>
                        <td className="py-4 px-4 font-semibold text-primary dark:text-slate-200">{formatDateTime(t.date)}</td>
                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400 font-medium">{getDayName(t.date)}</td>
                        <td className="py-4 px-4">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                            t.type === 'Credit' 
                              ? 'badge-credit bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40 text-success' 
                              : t.type === 'Deduction'
                              ? 'badge-deduction bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-danger'
                              : 'badge-expiry bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-warning'
                          }`}>
                            {t.type}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {t.description}
                        </td>
                        <td className="py-4 px-4 font-mono font-bold">
                          {isOrder ? (
                            <span className="text-brand-primary dark:text-brand-secondary group-hover:underline">
                              {t.orderId}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">{t.orderId}</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400 font-semibold">{t.cafe}</td>
                        <td className={`py-4 px-4 text-right font-black text-sm ${
                          t.type === 'Credit' ? 'amount-credit text-success' : t.type === 'Expiry' ? 'text-warning' : 'amount-deduction text-danger'
                        }`}>
                          {t.type === 'Credit' ? '+' : '−'}{formatETB(t.amount)}
                        </td>
                        <td className="py-4 px-6 text-right font-extrabold text-slate-700 dark:text-slate-300">
                          {formatETB(t.balanceAfter)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
              <div className="flex items-center gap-4">
                <span>
                  Showing <strong className="text-primary dark:text-white">{startIndex + 1}</strong> to{' '}
                  <strong className="text-primary dark:text-white">{Math.min(startIndex + rowsPerPage, totalRows)}</strong> of{' '}
                  <strong className="text-primary dark:text-white">{totalRows}</strong> entries
                </span>
                <div className="flex items-center gap-1.5">
                  <span>Rows per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="p-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none dark:text-white font-bold"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="pagination-btn px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`pagination-btn w-8 h-8 rounded-xl transition-all font-bold ${
                          currentPage === pageNum
                            ? 'active bg-primary dark:bg-brand-secondary text-white dark:text-primary shadow-sm'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="pagination-btn px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 5. Export Row (Align to Right) */}
      {totalRows > 0 && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleExportXLSX}
            className="export-btn flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold rounded-xl text-primary dark:text-white border border-slate-200/50 dark:border-slate-700/50 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export XLSX
          </button>
          <button
            onClick={handleExportPDF}
            className="export-btn flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold rounded-xl text-primary dark:text-white border border-slate-200/50 dark:border-slate-700/50 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export PDF
          </button>
          <button
            onClick={handleExportCSV}
            className="export-btn flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold rounded-xl text-primary dark:text-white border border-slate-200/50 dark:border-slate-700/50 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      )}

      {/* Order Details Drawer / Modal overlay */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-end animate-fadeIn"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl p-6 flex flex-col justify-between animate-slideIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Verification Receipt</span>
                  <h2 className="text-lg font-black text-primary dark:text-white tracking-tight mt-1">
                    {selectedOrder.orderId}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 cursor-pointer transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 font-bold block">Café Location</span>
                  <span className="font-extrabold text-primary dark:text-slate-200">{selectedOrder.cafe}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">Transaction Date</span>
                  <span className="font-extrabold text-primary dark:text-slate-200">{new Date(selectedOrder.date).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">Served By (Waiter)</span>
                  <span className="font-extrabold text-primary dark:text-slate-200">{selectedOrder.orderDetails?.waiterName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">Confirmation Time</span>
                  <span className="font-extrabold text-primary dark:text-slate-200">{selectedOrder.orderDetails?.deliveryConfirmationTime}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-black text-primary dark:text-white uppercase tracking-wider">Redeemed Items</h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto pr-1 no-scrollbar">
                  {selectedOrder.orderDetails?.items.map((item, index) => (
                    <div key={item.name + index} className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-extrabold text-primary dark:text-white">{item.name}</p>
                        <span className="text-[10px] text-slate-400 font-medium">Quantity: {item.quantity} × {formatETB(item.price)}</span>
                      </div>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{formatETB(item.quantity * item.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer summary */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">Total Deduction Impact:</span>
                <span className="text-base font-black text-danger">-{formatETB(selectedOrder.amount)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">Balance Remaining After:</span>
                <span className="text-base font-black text-primary dark:text-accent-blue">{formatETB(selectedOrder.balanceAfter)}</span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-secondary transition-all text-xs"
              >
                Close Receipt Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
