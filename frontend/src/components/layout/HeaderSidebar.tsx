import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp, normalizeRole } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  Building2,
  Wallet,
  FileText,
  MessageSquare,
  ShieldAlert,
  ClipboardList,
  Menu,
  Bell,
  Search,
  Globe,
  Sun,
  Moon,
  LogOut,
  X,
  ChevronDown,
  User as UserIcon,
  Settings,
  UtensilsCrossed,
  Clock,
  History
} from 'lucide-react';

export function EsromLogo({ className = "h-8", light = false, collapsedResponsive = false }: { className?: string; light?: boolean; collapsedResponsive?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary shadow-md flex-shrink-0">
        <UtensilsCrossed className="w-5 h-5 text-white" />
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-success animate-pulse"></div>
      </div>
      <div className={`flex flex-col ${collapsedResponsive ? 'xl:flex md:hidden' : 'flex'}`}>
        <span className="font-black text-lg leading-none tracking-tight text-text-primary">
          Print(&quot;Hello_Ethiopia&quot;)
        </span>
        <span className="text-[9px] font-bold tracking-widest uppercase text-text-subtle">
          BirrBalance Management System
        </span>
      </div>
    </div>
  );
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { user, setShowLogoutModal, theme, toggleTheme } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  // Determine links based on role
  const getLinks = () => {
    switch (user.role) {
      case 'manager':
        return [
          { label: t('nav.overview'), path: '/manager/dashboard', icon: LayoutDashboard },
          { label: t('nav.employees'), path: '/manager/employees', icon: Users },
          { label: 'Cafes', path: '/manager/cafes', icon: Building2 },
          { label: t('nav.departments'), path: '/manager/departments', icon: Building2 },
          { label: t('nav.balance'), path: '/manager/balance', icon: Wallet },
          { label: 'Reports', path: '/manager/reports', icon: FileText },
          { label: 'Messages', path: '/manager/messages', icon: MessageSquare },
          { label: t('nav.auditLogs'), path: '/manager/audit', icon: ClipboardList },
          { label: 'Profile & Admins', path: '/manager/profile', icon: Settings },
        ];
      case 'cafe':
        return [
          { label: t('nav.dashboard'), path: '/cafe/dashboard', icon: LayoutDashboard },
          { label: t('nav.menu'), path: '/cafe/menu', icon: UtensilsCrossed },
          { label: t('nav.orders'), path: '/cafe/orders', icon: ClipboardList },
          { label: t('nav.waiters'), path: '/cafe/waiters', icon: Users },
          { label: t('nav.analytics'), path: '/cafe/analytics', icon: LayoutDashboard },
          { label: 'Reports', path: '/cafe/reports', icon: FileText },
        ];
      case 'employee':
        return [
          { label: t('nav.dashboard'), path: '/employee/dashboard', icon: LayoutDashboard },
          { label: t('nav.myOrders'), path: '/employee/orders', icon: ClipboardList },
          { label: t('nav.transactions'), path: '/employee/transactions', icon: History },
          { label: t('nav.myProfile'), path: '/employee/profile', icon: UserIcon },
          { label: 'Messages', path: '/employee/messages', icon: MessageSquare },
          { label: t('nav.notifications'), path: '/employee/notifications', icon: Bell },
        ];
      default:
        return [];
    }
  };

  const links = getLinks();

  const renderContent = (isMobile = false) => (
    <div className="flex flex-col h-full bg-sidebar text-text-secondary overflow-hidden">
      {/* Header / Logo */}
      <div className="p-6 border-b border-border-default flex items-center justify-between">
        <EsromLogo collapsedResponsive={!isMobile} />
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-2 text-text-subtle hover:text-text-primary rounded-lg hover:bg-card-hover min-h-[44px] min-w-[44px]"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <button
              id={`sidebar-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              key={link.path}
              onClick={() => {
                navigate(link.path);
                if (isMobile && onClose) onClose();
              }}
              className={`w-full flex items-center xl:gap-3.5 md:gap-0 xl:px-4 md:px-0 xl:justify-start md:justify-center py-3 rounded-xl text-sm font-medium transition-all relative overflow-visible has-tooltip ${
                isActive
                  ? 'bg-sidebar-active text-text-sidebar-active shadow-sm font-bold'
                  : 'text-text-sidebar hover:bg-card-hover hover:text-text-primary'
              }`}
            >
              {/* Left blue bar indicator in dark mode */}
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-secondary dark:block hidden" />
              )}
              <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-text-sidebar-active' : 'text-slate-500 dark:text-slate-600'}`} />
              <span className="xl:block md:hidden block truncate">{link.label}</span>
              
              {/* Tablet tooltips (only active on tablet where links are icon-only) */}
              {!isMobile && (
                <div className="tooltip-text xl:hidden md:block hidden">
                  {link.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Section / Footer */}
      <div className="p-4 border-t border-border-default">
        <div className="flex items-center gap-3 xl:p-2 md:p-0 rounded-xl xl:bg-card-hover md:bg-transparent xl:border xl:border-border-default/40 md:border-none mb-3 xl:justify-start md:justify-center">
          <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center font-bold text-white uppercase shadow flex-shrink-0">
            {user?.fullName?.charAt(0) || "?"}
          </div>
          <div className="flex-1 overflow-hidden xl:block md:hidden block">
            <h4 className="text-xs font-bold text-text-primary truncate">{user?.fullName}</h4>
            <p className="text-[10px] text-text-subtle capitalize truncate">{user?.role}</p>
          </div>
        </div>
        
        {/* Subtle separator above settings and logout */}
        <div className="border-t border-border-default my-3 xl:block md:hidden block" />

        {(normalizeRole(user.role) === 'employee' || normalizeRole(user.role) === 'manager' || normalizeRole(user.role) === 'cafe') && (
          <div className="theme-toggle-wrapper mb-3 xl:flex md:hidden flex" onClick={toggleTheme}>
            <span>{theme === 'light' ? '☀️ Light' : '🌙 Dark'}</span>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleTheme();
              }}
              aria-label="Toggle theme"
            />
          </div>
        )}

        <button
          id="sidebar-logout-btn"
          onClick={() => {
            if (isMobile && onClose) onClose();
            setShowLogoutModal(true);
          }}
          className="w-full flex items-center xl:gap-3 md:gap-0 xl:px-4 md:px-0 xl:justify-start md:justify-center py-2.5 rounded-xl text-xs font-semibold text-danger hover:bg-danger-bg transition-all border border-transparent hover:border-danger/30 min-h-[44px] has-tooltip"
        >
          <LogOut className="w-4 h-4 text-danger flex-shrink-0" />
          <span className="xl:block md:hidden block">{t('nav.logout')}</span>
          {!isMobile && (
            <div className="tooltip-text xl:hidden md:block hidden">
              {t('nav.logout')}
            </div>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop and Tablet Sidebar */}
      <aside id="main-sidebar" className="hidden md:flex flex-col xl:w-[240px] md:w-16 bg-sidebar text-text-secondary border-r border-border-default h-screen sticky top-0 transition-all duration-300 z-30 flex-shrink-0">
        {renderContent(false)}
      </aside>

      {/* Mobile Drawer Sidebar */}
      <div className={`fixed inset-0 z-[9999] md:hidden transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        ></div>
        <aside className={`sidebar fixed top-0 bottom-0 left-0 flex flex-col w-[80vw] max-w-[300px] bg-sidebar text-text-secondary h-full shadow-2xl z-[10000] ${mobileOpen ? 'open' : ''}`}>
          {renderContent(true)}
        </aside>
      </div>
    </>
  );
}

export function TopNav({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, theme, toggleTheme, notifications, unreadCount, markNotificationsAsRead, setShowLogoutModal } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  if (!user) return null;

  const getLinks = () => {
    switch (normalizeRole(user.role)) {
      case 'manager':
        return [
          { label: t('nav.overview'), path: '/manager/dashboard' },
          { label: t('nav.employees'), path: '/manager/employees' },
          { label: t('nav.departments'), path: '/manager/departments' },
          { label: t('nav.balance'), path: '/manager/balance' },
          { label: 'Reports', path: '/manager/reports' },
          { label: 'Messages', path: '/manager/messages' },
          { label: t('nav.auditLogs'), path: '/manager/audit' },
          { label: 'Profile & Admins', path: '/manager/profile' },
        ];
      case 'cafe':
        return [
          { label: t('nav.dashboard'), path: '/cafe/dashboard' },
          { label: t('nav.menu'), path: '/cafe/menu' },
          { label: t('nav.orders'), path: '/cafe/orders' },
          { label: t('nav.waiters'), path: '/cafe/waiters' },
          { label: t('nav.analytics'), path: '/cafe/analytics' },
          { label: 'Reports', path: '/cafe/reports' },
        ];
      case 'employee':
        return [
          { label: t('nav.dashboard'), path: '/employee/dashboard' },
          { label: t('nav.myOrders'), path: '/employee/orders' },
          { label: t('nav.transactions'), path: '/employee/transactions' },
          { label: t('nav.myProfile'), path: '/employee/profile' },
          { label: 'Messages', path: '/employee/messages' },
        ];
      default:
        return [];
    }
  };

  const links = getLinks();

  return (
    <>
      <header id="top-navbar" className="bg-white dark:bg-primary border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 px-4 py-3 xl:px-8 shadow-sm h-16 flex items-center relative">
        <div className="flex items-center justify-between gap-4 w-full max-w-7xl mx-auto">
          
          {/* Expanded Search Bar Overlay for Mobile/Tablet */}
          {isSearchExpanded && (
            <div className="absolute inset-0 bg-white dark:bg-primary px-4 py-3 flex items-center gap-3 z-50 animate-fadeIn">
              <button
                id="search-close-btn"
                onClick={() => setIsSearchExpanded(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none min-h-[44px] min-w-[44px] cursor-pointer"
              >
                <X className="w-5 h-5 dark:text-white" />
              </button>
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="header-search-expanded"
                  type="text"
                  autoFocus
                  placeholder={t('common.search')}
                  className="w-full text-sm py-2.5 pl-10 pr-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent dark:text-white min-h-[48px]"
                />
              </div>
            </div>
          )}

          {/* Brand Logo & Mobile Trigger */}
          <div className="flex items-center gap-3">
            <button
              id="mobile-hamburger-btn"
              onClick={onMenuClick}
              className="xl:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none min-h-[44px] min-w-[44px] cursor-pointer"
            >
              <Menu className="w-6 h-6 dark:text-white" />
            </button>
            <div className="xl:hidden">
              <EsromLogo collapsedResponsive />
            </div>
            {/* Desktop Top Links (Fitshop style) */}
            <div className="hidden xl:flex items-center gap-6 pl-2">
              <EsromLogo />
              <div className="h-5 w-px bg-slate-200 dark:bg-slate-800"></div>
              <nav className="flex items-center gap-1">
                {links.slice(0, 5).map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <button
                      id={`top-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                      key={link.path}
                      onClick={() => navigate(link.path)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide uppercase transition-all cursor-pointer ${
                        isActive
                          ? 'text-secondary dark:text-accent-blue bg-blue-50 dark:bg-blue-950/40'
                          : 'text-subtle-text dark:text-slate-300 hover:text-dark-text dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {link.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Search, Actions & Dropdowns */}
          <div className="flex items-center gap-2.5">
            {/* Desktop Search */}
            <div className="hidden xl:flex items-center relative w-48 lg:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
              <input
                id="header-search-input"
                type="text"
                placeholder={t('common.search')}
                className="w-full text-xs py-2 pl-9 pr-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent dark:text-white"
              />
            </div>

            {/* Collapse Search Icon (Tablet / Mobile trigger) */}
            <button
              id="mobile-search-trigger"
              onClick={() => setIsSearchExpanded(true)}
              className="xl:hidden p-2.5 rounded-xl text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all min-h-[44px] min-w-[44px] cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Theme Toggle (Hidden on mobile) */}
            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="hidden md:flex p-2.5 rounded-xl text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all min-h-[44px] min-w-[44px] cursor-pointer"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                id="notifications-bell-btn"
                onClick={() => {
                  setShowNotificationsMenu(!showNotificationsMenu);
                  setShowProfileMenu(false);
                }}
                className="relative p-2.5 rounded-xl text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all min-h-[44px] min-w-[44px] cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger text-white text-[10px] font-black rounded-full flex items-center justify-center animate-bounce shadow">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotificationsMenu && (
                <div id="notifications-dropdown" className="absolute right-0 mt-3 w-80 bg-white dark:bg-primary border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
                    <h3 className="text-xs font-bold text-dark-text dark:text-white uppercase tracking-wider">
                      Recent Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markNotificationsAsRead}
                        className="text-[10px] font-bold text-accent hover:underline uppercase"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto no-scrollbar">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-subtle-text">
                        No recent notifications
                      </div>
                    ) : (
                      notifications.slice(0, 5).map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-3.5 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all flex items-start gap-3 ${
                            !notif.read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                            notif.type === 'success' ? 'bg-success' : notif.type === 'warning' ? 'bg-warning' : 'bg-accent'
                          }`} />
                          <div className="flex-1">
                            <h4 className="text-xs font-bold text-dark-text dark:text-white">{notif.title}</h4>
                            <p className="text-[11px] text-subtle-text dark:text-slate-300 mt-0.5 leading-tight">{notif.message}</p>
                            <span className="text-[9px] text-slate-400 mt-1 block">{notif.timestamp}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-center bg-slate-50 dark:bg-slate-900">
                    <button
                      onClick={() => {
                        setShowNotificationsMenu(false);
                        navigate(normalizeRole(user.role) === 'employee' ? '/employee/notifications' : '/manager/dashboard');
                      }}
                      className="text-xs font-bold text-secondary dark:text-accent-blue hover:underline"
                    >
                      View All Notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                id="profile-dropdown-btn"
                onClick={() => {
                  setShowProfileMenu(!showProfileMenu);
                  setShowNotificationsMenu(false);
                }}
                className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-all min-h-[44px] cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-white uppercase shadow-inner flex-shrink-0">
                  {user?.fullName?.charAt(0) || "?"}

                </div>
                <span className="hidden xl:inline text-xs font-bold text-text-primary max-w-[120px] truncate">
                  {user.fullName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {/* Profile Dropdown Menu */}
              {showProfileMenu && (
                <div id="profile-dropdown" className="absolute right-0 mt-3 w-56 bg-white dark:bg-primary border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60">
                    <p className="text-xs text-subtle-text">Logged in as</p>
                    <h4 className="text-sm font-black text-dark-text dark:text-white truncate mt-0.5">{user.fullName}</h4>
                    <span className="inline-block mt-1 text-[10px] font-bold text-white bg-secondary px-2 py-0.5 rounded-full capitalize">
                      {user.role}
                    </span>
                  </div>
                  {normalizeRole(user.role) !== 'waiter' && <div className="p-2 space-y-0.5">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate(normalizeRole(user.role) === 'employee' ? '/employee/profile' : '#');
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span>Profile Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        toggleTheme();
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                      {theme === 'light' ? <Moon className="w-4 h-4 text-slate-400" /> : <Sun className="w-4 h-4 text-slate-400" />}
                      <span>Toggle Dark Mode</span>
                    </button>
                  </div>}
                  <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowLogoutModal(true);
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-danger hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t('nav.logout')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
