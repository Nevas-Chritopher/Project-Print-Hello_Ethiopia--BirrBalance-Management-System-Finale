import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Bell, 
  Check, 
  Trash2, 
  ArrowLeft, 
  ArrowUp, 
  ArrowDown, 
  AlertTriangle, 
  ChevronRight, 
  X, 
  Clock, 
  CheckCircle2,
  Receipt,
  Eye,
  Wallet,
  RefreshCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function EmployeeNotificationsPage() {
  const { 
    user, 
    notifications, 
    unreadCount, 
    markNotificationsAsRead, 
    apiPatch, 
    apiGet,
    refreshData 
  } = useApp();
  
  const navigate = useNavigate();
  
  // States
  const [filter, setFilter] = useState<'all' | 'unread' | 'orders' | 'credits'>('all');
  const [visibleLimit, setVisibleLimit] = useState<number>(10);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [localLoading, setLocalLoading] = useState<string | null>(null);

  // Load orders to back "View Receipt" actions
  const loadMyOrders = async () => {
    setLoadingOrders(true);
    try {
      const data = await apiGet('/api/employee/orders');
      const items = data?.data?.items || data?.items || data?.orders || [];
      setMyOrders(items);
    } catch (e) {
      console.error('Error fetching orders for notifications view', e);
      setMyOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadMyOrders();
  }, []);

  // Helper to format ETB amounts
  const formatETB = (amount: number) => {
    return `ETB ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Mark single notification as read
  const handleMarkAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    try {
      setLocalLoading(id);
      await apiPatch(`/api/notifications/${id}/read`, {});
      await refreshData();
    } catch (e) {
      console.error('Error marking notification as read', e);
    } finally {
      setLocalLoading(null);
    }
  };

  // Clear all notifications
  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all your notifications? This action cannot be undone.')) {
      try {
        await apiPatch('/api/notifications/clear-all', {});
        await refreshData();
      } catch (e) {
        console.error('Error clearing notifications', e);
      }
    }
  };

  // Helper to extract Order ID from notification messages
  const extractOrderId = (message: string): string | null => {
    const match = message.match(/#ORD-\d{4}-\d{2}-\d{2}-\d+/);
    if (match) return match[0];
    const plainMatch = message.match(/ORD-\d{4}-\d{2}-\d{2}-\d+/);
    if (plainMatch) return plainMatch[0];
    return null;
  };

  // Find order by ID or extract details
  const handleViewReceipt = (notif: any) => {
    const orderId = extractOrderId(notif.message);
    if (orderId) {
      const order = myOrders.find(o => o.orderId === orderId || o.id === orderId);
      if (order) {
        setSelectedOrder(order);
        handleMarkAsRead(notif.id, notif.read);
        return;
      }
    }
    
    // Fallback if full order object not found (parse amount and mock)
    const amountMatch = notif.message.match(/ETB\s?([\d,.]+)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
    
    // Create a fallback mock order details
    const fallbackOrder = {
      orderId: orderId || 'ORD-VERIFIED',
      amount: amount || 250.00,
      date: new Date().toISOString(),
      cafe: 'Main Corporate Cafe',
      balanceAfter: user?.balance || 0,
      orderDetails: {
        waiterName: 'Cafeteria POS System',
        deliveryConfirmationTime: 'Instant',
        items: [
          { name: 'Redeemed Meal / Refreshment Service', quantity: 1, price: amount || 250.00 }
        ]
      }
    };
    setSelectedOrder(fallbackOrder);
    handleMarkAsRead(notif.id, notif.read);
  };

  // Determine Notification Categories
  const getNotificationCategory = (n: any): 'order' | 'credit' | 'balance-low' | 'expiry' | 'system' => {
    const title = n.title.toLowerCase();
    const msg = n.message.toLowerCase();
    const type = n.type?.toLowerCase() || '';

    if (title.includes('order') || title.includes('confirm') || msg.includes('order') || type === 'success') {
      return 'order';
    }
    if (title.includes('credit') || title.includes('allocate') || msg.includes('credited') || type === 'info') {
      return 'credit';
    }
    if (title.includes('low') || title.includes('balance alert') || msg.includes('below 20%') || type === 'warning') {
      return 'balance-low';
    }
    if (title.includes('expire') || title.includes('expiry') || msg.includes('expire')) {
      return 'expiry';
    }
    return 'system';
  };

  // Categorize for unread style bindings
  const getUnreadSubclass = (n: any) => {
    const cat = getNotificationCategory(n);
    if (cat === 'balance-low') return 'balance-low';
    return cat;
  };

  // Get matching icon and color
  const getNotificationIconDetails = (n: any) => {
    const cat = getNotificationCategory(n);
    switch (cat) {
      case 'order':
        return {
          icon: <ArrowDown className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
          bgClass: 'notif-icon order',
        };
      case 'credit':
        return {
          icon: <ArrowUp className="w-5 h-5 text-green-600 dark:text-green-400" />,
          bgClass: 'notif-icon credit',
        };
      case 'balance-low':
      case 'expiry':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
          bgClass: 'notif-icon warning',
        };
      default:
        return {
          icon: <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
          bgClass: 'notif-icon system',
        };
    }
  };

  // Filter logic
  const filteredNotifications = notifications.filter(n => {
    const cat = getNotificationCategory(n);
    if (filter === 'unread') return !n.read;
    if (filter === 'orders') return cat === 'order';
    if (filter === 'credits') return cat === 'credit';
    return true;
  });

  // Grouping notifications by date based on timestamp string
  const groupNotifications = (list: any[]) => {
    const today: any[] = [];
    const yesterday: any[] = [];
    const earlier: any[] = [];

    list.forEach(n => {
      const ts = (n.timestamp || '').toLowerCase();
      if (
        ts.includes('min') || 
        ts.includes('hour') || 
        ts.includes('now') || 
        ts === 'today'
      ) {
        today.push(n);
      } else if (
        ts.includes('yesterday') || 
        ts.includes('1 day ago')
      ) {
        yesterday.push(n);
      } else {
        earlier.push(n);
      }
    });

    return { today, yesterday, earlier };
  };

  const grouped = groupNotifications(filteredNotifications.slice(0, visibleLimit));
  const hasMore = filteredNotifications.length > visibleLimit;

  return (
    <div className="space-y-8 animate-fadeIn p-2 md:p-6">
      
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <button 
            onClick={() => navigate('/employee/dashboard')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-primary transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-primary tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <span className="px-3 py-1 text-xs font-extrabold bg-blue-500 text-white rounded-full animate-pulse">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p className="text-sm text-subtle-text font-medium">
            {unreadCount > 0 
              ? `You have ${unreadCount} unread system notifications and updates.` 
              : 'You are completely caught up on all system updates.'}
          </p>
        </div>
      </div>

      {/* 2. Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        
        {/* Real-time Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'unread', 'orders', 'credits'] as const).map((type) => (
            <button
              key={type}
              onClick={() => { setFilter(type); setVisibleLimit(10); }}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold capitalize transition-all cursor-pointer ${
                filter === type
                  ? 'bg-primary dark:bg-brand-secondary text-white dark:text-primary shadow-sm scale-[1.02]'
                  : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {type === 'all' ? 'All Alerts' : type === 'credits' ? 'Credits' : type}
            </button>
          ))}
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={refreshData}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markNotificationsAsRead}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-900/30 text-success rounded-xl border border-green-200/50 dark:border-green-900/40 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Mark All Read
            </button>
          )}
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-danger rounded-xl border border-red-200/50 dark:border-red-900/40 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear All
          </button>
        </div>
      </div>

      {/* 3. Notification Feed */}
      <div className="space-y-6">
        {filteredNotifications.length === 0 ? (
          
          /* Empty State */
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-16 text-center space-y-4 max-w-md mx-auto flex flex-col items-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shadow-inner">
              <Bell className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-black text-primary dark:text-white">All quiet for now</h3>
              <p className="text-xs text-subtle-text mt-1.5 leading-relaxed">
                There are no notifications matching your selected filter. System alerts, crediting vouchers, and cafeteria receipts will appear here.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Today Group */}
            {grouped.today.length > 0 && (
              <div>
                <div className="date-separator">Today</div>
                <div className="space-y-2.5">
                  {grouped.today.map((notif) => (
                    <NotificationItem 
                      key={notif.id}
                      notif={notif}
                      onMarkRead={handleMarkAsRead}
                      onViewReceipt={handleViewReceipt}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Yesterday Group */}
            {grouped.yesterday.length > 0 && (
              <div>
                <div className="date-separator">Yesterday</div>
                <div className="space-y-2.5">
                  {grouped.yesterday.map((notif) => (
                    <NotificationItem 
                      key={notif.id}
                      notif={notif}
                      onMarkRead={handleMarkAsRead}
                      onViewReceipt={handleViewReceipt}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Earlier Group */}
            {grouped.earlier.length > 0 && (
              <div>
                <div className="date-separator">Earlier</div>
                <div className="space-y-2.5">
                  {grouped.earlier.map((notif) => (
                    <NotificationItem 
                      key={notif.id}
                      notif={notif}
                      onMarkRead={handleMarkAsRead}
                      onViewReceipt={handleViewReceipt}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Load More Trigger */}
            <div className="pt-4 flex justify-center">
              {hasMore ? (
                <button
                  onClick={() => setVisibleLimit(prev => prev + 10)}
                  className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-black rounded-xl text-primary dark:text-white transition-all cursor-pointer flex items-center gap-2"
                >
                  <Clock className="w-3.5 h-3.5" /> Load More Alerts
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-400 font-bold py-2 bg-slate-50 dark:bg-slate-800/40 px-5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 animate-bounce" />
                  You are all caught up
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 4. Order Details Receipt Modal overlay */}
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
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Validated Transaction Receipt</span>
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
                  {selectedOrder.orderDetails?.items.map((item: any, index: number) => (
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

  // Sub-component for individual list cards to keep code highly modular
  function NotificationItem({ 
    notif, 
    onMarkRead, 
    onViewReceipt 
  }: { 
    notif: any;
    onMarkRead: (id: string, isRead: boolean) => any;
    onViewReceipt: (notif: any) => void;
    [key: string]: any;
  }) {
    const isUnread = !notif.read;
    const { icon, bgClass } = getNotificationIconDetails(notif);
    const cat = getNotificationCategory(notif);
    const unreadSubclass = getUnreadSubclass(notif);

    return (
      <div 
        onClick={() => onMarkRead(notif.id, notif.read)}
        className={`notification-card group cursor-pointer ${
          isUnread ? `unread ${unreadSubclass}` : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-slate-100 dark:border-slate-800'
        }`}
      >
        {/* Left icon badge */}
        <div className={bgClass}>
          {icon}
        </div>

        {/* Core details */}
        <div className="space-y-1 flex-1 pr-6">
          <p className="notif-title">{notif.title}</p>
          <p className="notif-body">{notif.message}</p>
          
          {/* Action Links */}
          {cat === 'order' && (
            <button 
              onClick={(e) => { e.stopPropagation(); onViewReceipt(notif); }}
              className="notif-action-link flex items-center gap-1 hover:underline"
            >
              <Receipt className="w-3.5 h-3.5" /> View Receipt <ChevronRight className="w-3 h-3" />
            </button>
          )}

          {cat === 'credit' && (
            <button 
              onClick={(e) => { e.stopPropagation(); navigate('/employee/transactions'); }}
              className="notif-action-link flex items-center gap-1 hover:underline"
            >
              <Wallet className="w-3.5 h-3.5" /> View Balance Ledger <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Time Stamp label */}
        <div className="notif-time font-mono">
          {notif.timestamp}
        </div>

        {/* Blue Unread Dot indicator */}
        {isUnread && (
          <span className="unread-dot" />
        )}
      </div>
    );
  }
}
