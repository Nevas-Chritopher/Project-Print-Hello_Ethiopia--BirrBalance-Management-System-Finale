import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { formatETB } from '../../utils/format';
import {
  QrCode,
  Search,
  LogOut,
  Plus,
  Minus,
  CheckCircle,
  AlertTriangle,
  Lock,
  UtensilsCrossed,
  ArrowLeft,
  DollarSign,
  UserCheck,
  RotateCcw,
  X
} from 'lucide-react';

export default function WaiterPanel() {
  const { user, apiGet, apiPost, apiPut, addToOfflineQueue, isOffline, offlineQueue, setShowLogoutModal } = useApp();
  const { t } = useTranslation();

  // Workflow states: 'scan' | 'order' | 'success'
  const [step, setStep] = useState<'scan' | 'order' | 'success'>('scan');

  // Employee lookup states
  const [manualId, setManualId] = useState('');
  const [scannedEmployee, setScannedEmployee] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState('');

  // Cart / Menu states
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [cart, setCart] = useState<{ item: any; quantity: number }[]>([]);
  const [orderMode, setOrderMode] = useState<'menu' | 'total'>('menu');
  const [manualTotal, setManualTotal] = useState('');

  // Transaction Authorization
  const [waiterPassword, setWaiterPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [finalTxId, setFinalTxId] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [cameraError, setCameraError] = useState('');

  // HTML5 QR Scanner
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const employeeCacheKey = 'waiter_employee_cache';
  const cacheEmployee = (employee: any) => {
    const cached = JSON.parse(localStorage.getItem(employeeCacheKey) || '[]');
    const next = [employee, ...cached.filter((item: any) => item.id !== employee.id)].slice(0, 100);
    localStorage.setItem(employeeCacheKey, JSON.stringify(next));
  };
  const useCachedEmployee = (employeeId: string) => {
    const cached = JSON.parse(localStorage.getItem(employeeCacheKey) || '[]');
    const employee = cached.find((item: any) => String(item.employeeId || item.employee_external_id).toLowerCase() === employeeId.trim().toLowerCase());
    if (!employee) return false;
    setScannedEmployee({ ...employee, offline: true });
    setCart([]);
    setStep('order');
    return true;
  };

  // Load menu items
  useEffect(() => {
    const loadMenu = async () => {
      try {
        const res = await apiGet('/api/cafe/menu');
        setMenuItems((res.data || []).filter((i: any) => i.is_available));
      } catch (err) {
        console.error(err);
      }
    };
    loadMenu();
  }, []);


  // temporaty

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const employeeId = params.get('id');
    if (employeeId) {
      handleLookupEmployee(employeeId);
    }
  }, []);

  //

  // HTML5 QR code scanning initialization
  useEffect(() => {
    let cancelled = false;
    if (step === 'scan' && !scannerRef.current) {
      // Setup qr scanner container
      setTimeout(() => {
        const qrContainer = document.getElementById('qr-scanner-viewport');
        if (cancelled || !qrContainer) return;
        if (!window.isSecureContext) {
          setCameraError('Camera access requires HTTPS when opening the system by IP address. Open it through HTTPS, or use localhost on this device.');
          return;
        }
        if (qrContainer) {
          try {
            setCameraError('');
            const scanner = new Html5QrcodeScanner(
              'qr-scanner-viewport',
              {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1,
                rememberLastUsedCamera: true,
                supportedScanTypes: [0],
              },
              false
            );

            scanner.render(
              async (decodedText) => {
                await scanner.clear();
                scannerRef.current = null;
                await handleQrScan(decodedText.trim());
              },
              (err) => {
                // Ignore silent scans
              }
            );

            scannerRef.current = scanner;
          } catch (e) {
            console.warn('QR Code Scanner initialization failed or skipped', e);
            setCameraError('Unable to start the camera. Allow camera permission, close other apps using it, then try again.');
          }
        }
      }, 500);
    }

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [step]);

  // Handle scanned encrypted QR code
  const handleQrScan = async (qrString: string) => {
    if (!qrString.trim()) return;
    setLookupError('');

    try {
      const res = await apiPost('/api/waiter/scan', { qr_token: qrString });
      if (res.data?.employee) {
        const employee = { ...res.data.employee, qrSessionId: res.data.qrSessionId };
        cacheEmployee(employee);
        setScannedEmployee(employee);
        setCart([]);
        setStep('order');
      } else {
        setLookupError('Employee not found or invalid token.');
      }
    } catch (e: any) {
      setLookupError(e.message || 'Error verifying encrypted QR token.');
    }
  };

  // Query employee detail (manual ID fallback)
  const handleLookupEmployee = async (empId: string) => {
    if (!empId.trim()) return;
    setLookupError('');

    if (isOffline) {
      if (!useCachedEmployee(empId)) {
        setLookupError('This employee is not saved on this device. Connect once to look them up before taking offline orders.');
      }
      return;
    }

    try {
      const res = await apiPost('/api/waiter/lookup-employee', { employee_external_id: empId });
      if (res.data?.employee) {
        const employee = { ...res.data.employee, qrSessionId: res.data.qrSessionId };
        cacheEmployee(employee);
        setScannedEmployee(employee);
        setCart([]);
        setStep('order');
      } else {
        setLookupError('Employee ID not found in database.');
      }
    } catch (e: any) {
      if (useCachedEmployee(empId)) return;
      setLookupError(e.message || 'Error locating employee record.');
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookupEmployee(manualId);
  };

  const getBasketTotal = () => {
    return cart.reduce((sum, c) => sum + (c.item.price * c.quantity), 0);
  };
  const getOrderTotal = () => orderMode === 'total' ? Number(manualTotal || 0) : getBasketTotal();

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

  const adjustCartQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const idx = prev.findIndex(c => c.item.id === itemId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx].quantity += delta;
      if (next[idx].quantity <= 0) {
        next.splice(idx, 1);
      }
      return next;
    });
  };

  // Perform secure authorized debit
  const handleConfirmDebit = async () => {
    if (!waiterPassword) {
      setAuthError('Please enter your authorization password.');
      return;
    }
    setAuthError('');

    if (getOrderTotal() <= 0 || (orderMode === 'menu' && cart.length === 0)) {
      setAuthError('Add a menu item or enter a valid total amount.');
      return;
    }
    if (getOrderTotal() > Number(scannedEmployee.balance || 0)) {
      setAuthError('The total is above this employee’s available wallet balance.');
      return;
    }

    try {
      const formattedItems = cart.map(c => ({
        menu_item_id: c.item.id,
        quantity: c.quantity
      }));

      if (isOffline) {
        addToOfflineQueue({
          employee_id: scannedEmployee.id,
          items: orderMode === 'menu' ? formattedItems : [],
          ...(orderMode === 'total' ? { manual_total: getOrderTotal() } : {}),
          password: waiterPassword,
          queued_at: new Date().toISOString(),
        });
        setFinalTxId('Queued for automatic sync');
        setWaiterPassword('');
        setStep('success');
        return;
      }

      const res = await apiPost('/api/waiter/order', {
        employee_id: scannedEmployee.id,
        qr_session_id: scannedEmployee.qrSessionId,
        items: orderMode === 'menu' ? formattedItems : [],
        ...(orderMode === 'total' ? { manual_total: getOrderTotal() } : {}),
        password: waiterPassword
      });

      // Beep audio notifications
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch success beep
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
      } catch (e) {
        console.log('Audio beep blocked or unsupported');
      }

      setFinalTxId(res.data?.orderUuid || res.data?.orderId);
      setWaiterPassword('');
      setStep('success');
    } catch (e: any) {
      const isNetworkError = e instanceof TypeError || /network|fetch|offline/i.test(String(e.message || ''));
      if (isNetworkError) {
        addToOfflineQueue({
          employee_id: scannedEmployee.id,
          items: orderMode === 'menu' ? cart.map(c => ({ menu_item_id: c.item.id, quantity: c.quantity })) : [],
          ...(orderMode === 'total' ? { manual_total: getOrderTotal() } : {}),
          password: waiterPassword,
          queued_at: new Date().toISOString(),
        });
        setFinalTxId('Queued for automatic sync');
        setWaiterPassword('');
        setStep('success');
        return;
      }
      setAuthError(e.message || 'Authorization failed. Please check password.');
      // Low beep for failure
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime); // Low buzz
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      } catch (e) {}
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    try {
      await apiPut('/api/waiter/password', { old_password: passwordForm.oldPassword, new_password: passwordForm.newPassword });
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordError('');
      setShowPasswordDialog(false);
    } catch (error: any) {
      setPasswordError(error.message || 'Unable to change password.');
    }
  };

  if (!user || user.role !== 'waiter') return null;

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 md:py-10 space-y-8 font-sans">
      {/* Header banner */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-primary tracking-tight">Waiter Sales Portal</h1>
          <p className="text-[10px] text-subtle-text font-medium uppercase tracking-wider mt-1">Logged in: <strong>{user.fullName}</strong> &bull; Cashier Waiter Mode</p>
        </div>
        {isOffline && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Offline mode: orders will sync automatically ({offlineQueue.length} queued).</p>}
        <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowPasswordDialog(true)} className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-all">
          <Lock className="w-3.5 h-3.5" /> Profile / Password
        </button>
        <button onClick={() => setShowLogoutModal(true)} className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-all md:hidden">
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>
        {step !== 'scan' && (
          <button
            id="waiter-reset-btn"
            onClick={() => {
              setScannedEmployee(null);
              setCart([]);
              setStep('scan');
            }}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-all focus:outline-none"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Scan / Lookup</span>
          </button>
        )}
        </div>
      </div>

      {showPasswordDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={changePassword} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-primary">Change Password</h2><p className="text-xs text-subtle-text">This is the only editable waiter profile setting.</p></div><button type="button" onClick={() => setShowPasswordDialog(false)}><X className="w-5 h-5 text-slate-500" /></button></div>
            {passwordError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-danger">{passwordError}</p>}
            <input required type="password" placeholder="Current password" value={passwordForm.oldPassword} onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
            <input required type="password" placeholder="New password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
            <input required type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
            <button type="submit" className="w-full rounded-xl bg-primary py-3 text-xs font-bold text-white">Update Password</button>
          </form>
        </div>
      )}

      {step === 'scan' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          
          {/* Scan coupon panel */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
            <div className="text-center md:text-left">
              <h3 className="text-sm font-black text-primary tracking-tight">Scan Employee QR Token</h3>
              <p className="text-[10px] text-subtle-text font-medium mt-0.5">Place coupon in front of front-facing or mobile camera</p>
            </div>

            {/* Html5-qrcode viewport container */}
            <div className="bg-slate-50 rounded-3xl border border-slate-200 p-4 relative overflow-hidden flex flex-col items-center justify-center min-h-[300px]">
              <div id="qr-scanner-viewport" className="w-full max-w-sm rounded-2xl overflow-hidden shadow-inner text-xs font-mono font-bold text-slate-500" />
              {cameraError && <p className="mt-3 max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-semibold text-amber-800">{cameraError}</p>}
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <QrCode className="w-4 h-4 text-slate-300" />
                <span>Camera scan state online</span>
              </div>
            </div>
          </div>

          {/* Manual ID fallback input card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-primary tracking-tight">Manual ID Lookup</h3>
              <p className="text-[10px] text-subtle-text font-medium">Use if camera permissions are absent or blocked</p>
            </div>

            {lookupError && (
              <div className="p-3.5 bg-red-50 rounded-2xl border border-red-100 text-danger text-xs font-bold flex gap-2 items-start">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{lookupError}</span>
              </div>
            )}

            <form onSubmit={handleManualSearch} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Enter Employee ID / Name</label>
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-4" />
                  <input
                    id="manual-id-input"
                    type="text"
                    required
                    placeholder="e.g. EMP001"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent text-xs font-bold uppercase tracking-wider"
                  />
                </div>
              </div>

              <button
                id="manual-search-submit"
                type="submit"
                className="w-full py-4 bg-primary hover:bg-secondary text-white font-bold rounded-xl shadow-md transition-all uppercase text-[10px] tracking-wider min-h-[44px]"
              >
                Search Account
              </button>
            </form>

            <div className="p-4 bg-blue-50/50 rounded-2xl text-xs text-slate-600 leading-relaxed border border-slate-100">
              <h4 className="font-bold text-primary mb-1">Authorization Instructions</h4>
              <p>Verify that the employee has a valid corporate badge. Once identified, select meals and have the employee enter their account password to authorize the debit.</p>
            </div>
          </div>

        </div>
      )}

      {step === 'order' && scannedEmployee && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Menu / items (8 columns) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-primary font-black flex items-center justify-center uppercase shadow-sm">
                  {scannedEmployee.fullName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-primary">{scannedEmployee.fullName}</h4>
                  <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">{scannedEmployee.employeeId} &bull; {scannedEmployee.department}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Available Balance</span>
                <span className="text-base font-black text-success">{formatETB(scannedEmployee.balance)}</span>
              </div>
            </div>

            {/* Dishes selections */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-black text-primary uppercase tracking-wider">Order Method</h3><div className="flex rounded-xl bg-slate-100 p-1 text-[10px] font-bold"><button onClick={() => setOrderMode('menu')} className={`rounded-lg px-3 py-2 ${orderMode === 'menu' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>Menu</button><button onClick={() => setOrderMode('total')} className={`rounded-lg px-3 py-2 ${orderMode === 'total' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>Enter Total</button></div></div>
              {orderMode === 'menu' ? <><h3 className="text-xs font-black text-primary uppercase tracking-wider">Quick Select Meals</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                {menuItems.map((item) => (
                  <button
                    id={`waiter-add-${item.id}`}
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="p-3 border border-slate-200 hover:border-primary rounded-2xl text-left hover:bg-slate-50/30 transition-all space-y-2 flex flex-col justify-between h-28"
                  >
                    <span className="font-extrabold text-primary line-clamp-2 leading-tight">{item.name}</span>
                    <div className="flex justify-between items-end w-full">
                      <span className="text-[10px] font-bold text-secondary">{formatETB(item.price)}</span>
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        +
                      </div>
                    </div>
                  </button>
                ))}
              </div></> : <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-2"><label className="text-xs font-bold text-slate-700">Order total (ETB)</label><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Enter total amount" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-lg font-bold text-primary outline-none focus:border-accent" /><p className="text-[10px] text-slate-500">The amount is checked against the employee wallet before the order is accepted.</p></div>}
            </div>
          </div>

          {/* Subtotal & debit validation (4 columns) */}
          <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-5 text-xs">
            <div>
              <h3 className="text-sm font-black text-primary tracking-tight">Active Tray Details</h3>
              <p className="text-[10px] text-subtle-text font-medium mt-0.5">Meal selections ready to be authorized</p>
            </div>

            {orderMode === 'menu' && cart.length === 0 ? (
              <div className="py-12 text-center text-slate-300 flex flex-col items-center justify-center space-y-2">
                <UtensilsCrossed className="w-8 h-8" />
                <p className="font-medium">No items in tray</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cart list */}
                {orderMode === 'menu' ? <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto pr-1">
                  {cart.map((c) => (
                    <div key={c.item.id} className="py-3 flex items-center justify-between text-xs">
                      <div className="min-w-0 flex-1">
                        <h5 className="font-bold text-primary truncate">{c.item.name}</h5>
                        <p className="text-[10px] text-slate-400">ETB {c.item.price} each</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          id={`waiter-cart-dec-${c.item.id}`}
                          onClick={() => adjustCartQuantity(c.item.id, -1)}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-primary w-4 text-center">{c.quantity}</span>
                        <button
                          id={`waiter-cart-inc-${c.item.id}`}
                          onClick={() => adjustCartQuantity(c.item.id, 1)}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div> : <div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Entered order total</p><p className="mt-1 text-2xl font-black text-primary">ETB {getOrderTotal().toFixed(2)}</p></div>}

                {/* Subtotals */}
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                  <div className="flex justify-between text-slate-500">
                    <span>Remaining Balance:</span>
                    <span>ETB {scannedEmployee.balance}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold text-primary pt-2 border-t mt-1">
                    <span>Total Debit:</span>
                    <span className="text-secondary font-black">ETB {getOrderTotal().toFixed(2)}</span>
                  </div>
                </div>

                {getOrderTotal() > scannedEmployee.balance && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-danger text-[10px] font-bold flex gap-2 items-start">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>Overdraft error! Employee balance is insufficient.</p>
                  </div>
                )}

                {/* Authorization form */}
                {getOrderTotal() > 0 && getOrderTotal() <= scannedEmployee.balance && (
                  <div className="space-y-3.5 pt-3 border-t">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Employee Account Password *</span>
                      </label>
                      <input
                        id="waiter-auth-password"
                        type="password"
                        required
                        placeholder="Employee types password to authorize..."
                        value={waiterPassword}
                        onChange={(e) => setWaiterPassword(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-accent"
                      />
                    </div>

                    {authError && (
                      <p className="text-[10px] font-bold text-danger bg-red-50 p-2.5 rounded-xl border border-red-200">{authError}</p>
                    )}

                    <button
                      id="waiter-debit-submit-btn"
                      onClick={handleConfirmDebit}
                      disabled={!waiterPassword}
                      className="w-full py-3.5 bg-primary hover:bg-secondary text-white font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all shadow-md disabled:opacity-45"
                    >
                      Authorize & Debit Meal
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {step === 'success' && (
        <div className="bg-white rounded-3xl p-8 max-w-md mx-auto shadow-xl border border-slate-100 text-center space-y-6 animate-scaleIn text-xs">
          <div className="flex flex-col items-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-green-50 text-success flex items-center justify-center shadow">
              <CheckCircle className="w-9 h-9" />
            </div>
            <h2 className="text-lg font-black text-primary tracking-tight">Debit Transaction Approved!</h2>
            <p className="text-subtle-text">The corporate meal coupon has been successfully processed.</p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-2">
            <p className="text-[9px] font-bold text-subtle-text uppercase">Transaction Record</p>
            <div className="flex justify-between font-mono">
              <span>Receipt ID:</span>
              <span className="font-bold text-primary">{finalTxId}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span>Debited Cost:</span>
              <span className="font-bold text-danger">-ETB {getOrderTotal().toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-mono pt-1.5 border-t">
              <span>Approved For:</span>
              <span className="font-bold text-primary">{scannedEmployee?.fullName}</span>
            </div>
          </div>

          <button
            id="waiter-success-close-btn"
            onClick={() => {
              setScannedEmployee(null);
              setCart([]);
              setStep('scan');
            }}
            className="w-full py-3.5 bg-primary hover:bg-secondary text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md min-h-[44px]"
          >
            Start Another Transaction
          </button>
        </div>
      )}
    </div>
  );
}
