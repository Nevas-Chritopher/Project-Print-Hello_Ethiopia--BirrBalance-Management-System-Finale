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
  const { user, apiGet, apiPost, apiPut, setGlobalLoading, refreshData } = useApp();
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
    if (path.includes('messages')) return 'messages';
    if (path.includes('notifications')) return 'notifications';
    return 'dashboard';
  };

  const activeTab = getActiveTab();

  // States
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [cafes, setCafes] = useState<any[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState<number | null>(null);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [allocationHistory, setAllocationHistory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [qrToken, setQrToken] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);

  const loadEmployeeData = async () => {
    try {
      const cafesData = await apiGet('/api/employee/cafes');
      const activeCafes = cafesData.data || [];
      setCafes(activeCafes);
      const savedCafeId = Number(localStorage.getItem('employeeActiveCafeId'));
      const cafeId = activeCafes.some((c: any) => c.id === selectedCafeId)
        ? selectedCafeId
        : activeCafes.some((c: any) => c.id === savedCafeId)
          ? savedCafeId
          : activeCafes[0]?.id ?? null;

      if (cafeId) {
        setSelectedCafeId(cafeId);
        localStorage.setItem('employeeActiveCafeId', String(cafeId));
        const itemsData = await apiGet(`/api/employee/cafes/${cafeId}/menu`);
        setMenuItems((itemsData.data || []).filter((i: any) => i.is_available));
      } else {
        setMenuItems([]);
      }

      const ordersData = await apiGet('/api/employee/orders');
      setMyOrders((ordersData.data?.items || []).map((o: any) => ({
        id: o.id,
        status: o.status,
        amount: Number(o.total_amount),
        date: o.created_at,
        cafeName: o.cafes?.name,
        items: (o.order_items || []).map((i: any) => ({
          itemId: i.menu_item_id,
          name: i.item_name_snapshot || i.menu_items?.name,
          quantity: i.quantity,
          price: Number(i.unit_price_snapshot)
        }))
      })));

      const profileData = await apiGet('/api/employee/profile');
      const profile = profileData?.data ?? profileData;
      setAllocationHistory(profile?.allocations || []);
      setTransactions(profile?.transactions || []);
      setQrToken(profile?.qr_token || profile?.qrToken || '');
    } catch (e) {
      console.error('Error loading employee portal data', e);
    }
  };

  useEffect(() => {
    if (user && user.role === 'employee') {
      refreshData();
      loadEmployeeData();
    }
  }, [user, location.pathname]);

  useEffect(() => {
    if (user?.role === 'employee' && selectedCafeId !== null) loadEmployeeData();
  }, [selectedCafeId]);

  if (!user || user.role !== 'employee') return null;

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 md:py-10 space-y-8 font-sans relative">
      {activeTab === 'dashboard' && (
        <EmployeeDashboard
          user={user}
          myOrders={myOrders}
          onReload={loadEmployeeData}
          allocationHistory={allocationHistory}
          qrToken={qrToken}
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
          cafes={cafes}
          selectedCafeId={selectedCafeId}
          onCafeChange={setSelectedCafeId}
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
          transactions={transactions}
        />
      )}
      {activeTab === 'notifications' && (
        <EmployeeNotificationsPage />
      )}
      {activeTab === 'messages' && (
        <EmployeeMessagesPage apiPost={apiPost} />
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

function EmployeeMessagesPage({ apiPost }: { apiPost: (path: string, body: any) => Promise<any> }) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    setStatus(null);
    try {
      await apiPost('/api/employee/messages', { message: trimmed });
      setMessage('');
      setStatus({ type: 'success', text: 'Your message was sent to the company manager.' });
    } catch (error: any) {
      setStatus({ type: 'error', text: error.message || 'Unable to send your message.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Message Company Manager</h1>
        <p className="mt-1 text-xs font-medium text-subtle-text">Send questions or concerns directly to your company manager.</p>
      </div>
      <form onSubmit={sendMessage} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <label className="block text-xs font-bold text-primary" htmlFor="employee-message">Your message</label>
        <textarea id="employee-message" required maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your message here..." className="min-h-40 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none" />
        {status && <p className={`rounded-xl p-3 text-xs font-bold ${status.type === 'success' ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}`}>{status.text}</p>}
        <div className="flex justify-end"><button disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white disabled:opacity-60"><Send className="h-4 w-4" />{sending ? 'Sending...' : 'Send message'}</button></div>
      </form>
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
  allocationHistory,
  qrToken
}: {
  user: any;
  myOrders: any[];
  onReload: () => Promise<void>;
  allocationHistory: any[];
  qrToken: string;
}) {
  const { t } = useTranslation();
  const displayName = (user?.fullName || user?.fullname || '').trim();
  const displayDepartment = user?.department || '';
  const employee = user ? {
    ...user,
    firstName: displayName.split(/\s+/)[0] || ''
  } : null;
  const navigate = useNavigate();
  const [qrPassword, setQrPassword] = useState('');

  // Dynamic low balance check
  const monthlyAllowance = allocationHistory && allocationHistory.length > 0 ? allocationHistory[0].amount : 1000;
  const isLowBalance = user.balance < (monthlyAllowance * 0.2);
  const recentOrderCount = (myOrders || []).filter((order) => {
    const orderDate = new Date(order.date);
    const daysSince = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
    return Number.isFinite(daysSince) && daysSince <= 7;
  }).length;

  const createDownloadCardCanvas = (sourceCanvas: HTMLCanvasElement) => {
    const width = sourceCanvas.width;
    const textLines = [
      `Name: ${user.fullname}`,
      `ID: ${user.employeeId}`,
      `Department: ${user.department}`,
      qrPassword ? `Password: ${qrPassword}` : null,
    ].filter(Boolean) as string[];

    const lineHeight = 18;
    const padding = 16;
    const textHeight = textLines.length * lineHeight + 8;
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = width;
    targetCanvas.height = sourceCanvas.height + padding + textHeight + padding;
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return sourceCanvas;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(sourceCanvas, 0, 0);

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(textLines[0], width / 2, sourceCanvas.height + padding);

    ctx.font = 'normal 12px Arial';
    textLines.slice(1).forEach((line, index) => {
      ctx.fillText(line, width / 2, sourceCanvas.height + padding + lineHeight * (index + 1));
    });

    return targetCanvas;
  };

  const downloadPNG = () => {
    const canvas = document.querySelector('#employee-qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const target = createDownloadCardCanvas(canvas);
    const url = target.toDataURL('image/png');
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
    pdf.text(`Name: ${displayName}`, 52.5, 95, { align: 'center' });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`ID: ${user.employeeId}`, 52.5, 102, { align: 'center' });
    if (displayDepartment) {
      pdf.text(`Department: ${displayDepartment}`, 52.5, 109, { align: 'center' });
    }
    if (qrPassword) {
      pdf.text(`Password: ${qrPassword}`, 52.5, 116, { align: 'center' });
    }

    // Footer note
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Present this card at the cafeteria counter', 52.5, 130, { align: 'center' });

    pdf.save(`Hello_Ethiopia_QR_${user.employeeId}.pdf`);
  };

  const downloadSVG = () => {
    const svgElement = document.querySelector('#employee-qr-svg');
    if (!svgElement) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgElement);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, 'image/svg+xml');
    const svgRoot = doc.documentElement;
    const width = Number(svgRoot.getAttribute('width') || '220');
    const height = Number(svgRoot.getAttribute('height') || '220');
    const inner = svgRoot.innerHTML;
    const textLines = [
      `Name: ${user.fullname}`,
      `ID: ${user.employeeId}`,
      `Department: ${user.department}`,
      qrPassword ? `Password: ${qrPassword}` : null,
    ].filter(Boolean) as string[];
    const wrapperHeight = height + textLines.length * 18 + 24;
    const output = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${wrapperHeight}" viewBox="0 0 ${width} ${wrapperHeight}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <g transform="translate(0,0)">${inner}</g>
  ${textLines.map((line, index) => `<text x="${width / 2}" y="${height + 20 + index * 18}" text-anchor="middle" font-family="Arial" font-size="12" fill="#0F172A">${line}</text>`).join('')}
</svg>`;

    const blob = new Blob([output], { type: 'image/svg+xml' });
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
    const passwordLine = qrPassword ? `<div class="details">Password: ${qrPassword}</div>` : '';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Hello_Ethiopia QR Code - ${displayName}</title>
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
          <div class="name">Name: ${displayName}</div>
          <div class="details">ID: ${user.employeeId}</div>
          ${displayDepartment ? `<div class="details">Department: ${displayDepartment}</div>` : ''}
          ${passwordLine}
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
                <p className="text-[11px] text-subtle-text font-medium mt-0.5">You ordered {recentOrderCount} time{recentOrderCount === 1 ? '' : 's'} in the last 7 days.</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-warning">{recentOrderCount}</span>
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
              value={qrToken || ''}
              size={220}
              bgColor="#FFFFFF"
              fgColor="#0A1628"
              level="H"
              includeMargin={true}
              style={{ display: 'block' }}
            />
            <QRCodeSVG
              id="employee-qr-svg"
              value={qrToken || ''}
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

          <div className="w-full max-w-sm">
            <label className="block text-xs font-bold text-slate-700 mb-2">Password to include</label>
            <input
              type="text"
              value={qrPassword}
              onChange={(e) => setQrPassword(e.target.value)}
              placeholder="Enter password to include"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:border-accent"
            />
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
  allocationHistory,
  cafes,
  selectedCafeId,
  onCafeChange
}: {
  user: any;
  menuItems: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
  setToast: (toast: any) => void;
  refreshData: () => Promise<void>;
  allocationHistory: any[];
  cafes: any[];
  selectedCafeId: number | null;
  onCafeChange: (cafeId: number) => void;
}) {
  const [cart, setCart] = useState<{ item: any; quantity: number }[]>([]);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ratings for feedback
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [activeCat, setActiveCat] = useState<'All' | 'Food' | 'Beverage' | 'Snack'>('All');

  useEffect(() => {
    // A cart can never span cafeterias; discard it when the employee switches.
    setCart([]);
  }, [selectedCafeId]);

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
    if (!selectedCafeId || cart.length === 0) {
      setToast({ type: 'warning', message: 'Select a café and add a menu item before checking out.' });
      return;
    }
    const total = getCartTotal();
    if (total > user.balance) {
      setToast({ type: 'error', message: "Overdraft! You don't have enough ETB to pay for this meal tray." });
      return;
    }

    setIsSubmitting(true);
    try {
      const cafeId = selectedCafeId;
      const res = await apiPost('/api/employee/orders', {
        cafe_id: cafeId,
        items: cart.map(c => ({
          menu_item_id: c.item.id,
          quantity: c.quantity
        }))
      });

      // Clear tray
      setCart([]);

      // Show the confirmation as soon as the payment API succeeds. Refreshing
      // background data must not hide a successful order if one of those
      // secondary requests is temporarily unavailable.
      const orderResult = res.data ?? res;
      const remainingBalance = Number(orderResult.remainingBalance ?? user.balance - total);
      setSuccessOrder({
        id: orderResult.orderUuid || orderResult.orderId,
        amount: Number(orderResult.totalAmount ?? total),
        cafeId
      });
      setToast({
        type: 'success',
        message: `${formatETB(total)} payment confirmed. Remaining: ${formatETB(remainingBalance)}`
      });

      // Real-time balance refetch in AppContext
      await Promise.allSettled([refreshData(), onReload()]);

      // Trigger amber warning toast if balance drops below 20%
      if (remainingBalance < (monthlyAllowance * 0.2)) {
        setTimeout(() => {
          setToast({
            type: 'warning',
            message: `Your balance is running low. ${formatETB(remainingBalance)} remaining`
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
            value={selectedCafeId ?? ''}
            onChange={(e) => onCafeChange(Number(e.target.value))}
            className="text-xs font-black text-primary bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-accent dark:text-white shadow-sm cursor-pointer min-h-[44px]"
          >
            {cafes.map((cafe) => (
              <option key={cafe.id} value={cafe.id}>
                {cafe.name}{cafe.location ? ` — ${cafe.location}` : ''}
              </option>
            ))}
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
  allocationHistory,
  cafes,
  selectedCafeId,
  onCafeChange
}: {
  user: any;
  menuItems: any[];
  myOrders: any[];
  onReload: () => Promise<void>;
  apiPost: (path: string, body: any) => Promise<any>;
  setToast: (toast: any) => void;
  refreshData: () => Promise<void>;
  allocationHistory: any[];
  cafes: any[];
  selectedCafeId: number | null;
  onCafeChange: (cafeId: number) => void;
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
          cafes={cafes}
          selectedCafeId={selectedCafeId}
          onCafeChange={onCafeChange}
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
  allocationHistory,
  transactions
}: {
  user: any;
  myOrders: any[];
  allocationHistory: any[];
  transactions: any[];
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
    const list = (transactions || []).map((entry: any) => ({
      id: entry.id,
      date: entry.date,
      type: entry.type,
      description: entry.description,
      orderId: entry.orderId || '—',
      cafe: entry.cafe || '—',
      amount: Number(entry.amount || 0),
      balanceAfter: Number(entry.balanceAfter || 0),
      orderDetails: entry.orderDetails,
    }));

    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return list.reverse();
  }, [transactions]);

  // Compute stats for the current month from the live ledger
  const juneStats = React.useMemo(() => {
    const now = new Date();
    const currentTx = allTransactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    const totalCredited = currentTx
      .filter((t) => t.type === 'Credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDeducted = currentTx
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
