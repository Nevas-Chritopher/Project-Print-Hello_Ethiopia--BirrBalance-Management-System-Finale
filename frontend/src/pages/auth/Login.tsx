import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { normalizeRole, useApp } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, ShieldAlert, KeyRound, UserSquare2, Sparkles } from 'lucide-react';
import { EsromLogo } from '../../components/layout/HeaderSidebar';

export default function Login() {
  const { login } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [loggedOutMsg, setLoggedOutMsg] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    // Check if on mobile device and banner wasn't dismissed
    const dismissed = localStorage.getItem('pwa_dismissed') === 'true';
    // By default, let's also show on smaller viewports in general for preview visibility
    const isMobileOrTablet = window.innerWidth < 1024;
    if (isMobileOrTablet && !dismissed) {
      setShowInstallBanner(true);
    }
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('loggedOut') === 'true') {
      setLoggedOutMsg(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = normalizeRole(localStorage.getItem("role"));
    if (token && role) {
      if (role === "manager") navigate("/manager/dashboard");
      else if (role === "cafe") navigate("/cafe/dashboard");
      else if (role === "employee") navigate("/employee/dashboard");
      else if (role === "waiter") navigate("/waiter/panel");
    }
  }, [navigate]);

 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!employeeId.trim() || !password.trim()) {
    setErrorMsg('Employee ID and password are required.');
    return;
  }

  setErrorMsg('');
  setLoading(true);

  try {
    await login(employeeId.toUpperCase(), password);
    // AppContext already set token, role, and user in localStorage
    // Just grab the role and navigate
    const role = normalizeRole(localStorage.getItem('role'));
    if (role === "manager") navigate("/manager/dashboard");
    else if (role === "cafe") navigate("/cafe/dashboard");
    else if (role === "employee") navigate("/employee/dashboard");
    else if (role === "waiter") navigate("/waiter/panel");
    else navigate("/login");
  } catch (err: any) {
    setErrorMsg("Incorrect Employee ID or password. Please try again.");
    setPassword('');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-page-bg font-sans">
      {/* Left Column - Tech / Brand Panel (Desktop only) */}
      <div className="hidden lg:flex lg:col-span-5 bg-primary relative overflow-hidden flex-col justify-between p-12 text-white">
        {/* Subtle Tech Glowing Circles */}
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-secondary opacity-20 blur-[120px]"></div>
        <div className="absolute bottom-[-30%] right-[-10%] w-[90%] h-[90%] rounded-full bg-accent opacity-20 blur-[130px]"></div>
        
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35"></div>

        {/* Logo top */}
        <div className="relative z-10">
          <EsromLogo light />
        </div>

        {/* Centered Content */}
        <div className="relative z-10 my-auto max-w-sm space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-accent-blue shadow-inner">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Smart Lunch Birr Balance Management</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
            Seamless employee meal balances & payments.
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed font-light">
            {t('auth.tagline')}
          </p>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-slate-400">
          &copy; 2026 Hello_Ethiopia Digital Solutions. All Rights Reserved.
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24">
        <div className="w-full max-w-md bg-white dark:bg-primary dark:border dark:border-slate-800/80 rounded-3xl p-8 shadow-xl shadow-slate-100/40 dark:shadow-none space-y-8">
          {/* Mobile Header */}
          <div className="flex flex-col items-center text-center space-y-3 lg:items-start lg:text-left">
            <div className="lg:hidden">
              <EsromLogo />
            </div>
            <h2 className="text-2xl font-black text-dark-text dark:text-white tracking-tight">
              Welcome back
            </h2>
            <p className="text-xs text-subtle-text dark:text-slate-400 font-medium tracking-wide uppercase">
              Enter your credentials to access your BirrBalance portal
            </p>
          </div>

          {/* Validation Error Alert */}
          {errorMsg && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 text-danger text-xs font-bold leading-relaxed animate-shake">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Logout Success Banner */}
          {loggedOutMsg && (
            <div id="logout-success-banner" className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/60 text-success text-xs font-bold leading-relaxed animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-success mt-1.5 animate-pulse" />
              <span>You have been logged out successfully</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Employee ID */}
            <div className="space-y-2">
              <label htmlFor="login-employee-id" className="block text-xs font-bold text-dark-text dark:text-slate-200 tracking-wider uppercase">
                {t('auth.employeeId')}
              </label>
              <div className="relative flex items-center">
                <UserSquare2 className="w-4 h-4 text-slate-400 absolute left-4" />
                <input
                  id="login-employee-id"
                  type="text"
                  required
                  placeholder="e.g. EMP001"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className={`w-full text-xs pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border ${
                    errorMsg ? 'border-red-400 focus:border-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-accent'
                  } rounded-xl focus:outline-none focus:ring-1 focus:ring-accent dark:text-white uppercase font-semibold`}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="login-password" className="block text-xs font-bold text-dark-text dark:text-slate-200 tracking-wider uppercase">
                {t('auth.password')}
              </label>
              <div className="relative flex items-center">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-4" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full text-xs pl-11 pr-12 py-3.5 bg-slate-50 dark:bg-slate-900 border ${
                    errorMsg ? 'border-red-400 focus:border-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-accent'
                  } rounded-xl focus:outline-none focus:ring-1 focus:ring-accent dark:text-white font-medium`}
                />
                <button
                  id="login-toggle-password-btn"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 text-slate-400 hover:text-slate-600 focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Help */}
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300 select-none">
                <input
                  id="login-remember-checkbox"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-secondary focus:ring-secondary cursor-pointer"
                />
                <span>{t('auth.rememberMe')}</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="login-btn focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
            >
              {loading ? t('common.loading') : t('auth.login')}
            </button>
          </form>

          {/* Contact Support note */}
          <div className="text-center">
            <p className="text-[11px] text-subtle-text dark:text-slate-400">
              Forgot password? Please contact your Company Manager to reset it.
            </p>
          </div>
        </div>
      </div>

      {/* PWA Mobile Install Banner */}
      {showInstallBanner && (
        <div className="fixed bottom-4 left-4 right-4 lg:hidden bg-slate-900 border border-slate-800 text-white p-4 rounded-2xl shadow-2xl z-50 flex items-center justify-between gap-3 animate-slideUp">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-blue flex items-center justify-center font-black text-sm text-white flex-shrink-0">
              E
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Hello_Ethiopia BirrBalance</h4>
              <p className="text-[10px] text-slate-300">Install app for fast checkout & offline cards</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowInstallBanner(false);
                localStorage.setItem('pwa_dismissed', 'true');
              }}
              className="px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white cursor-pointer"
            >
              Later
            </button>
            <button
              onClick={() => {
                setShowInstallBanner(false);
                localStorage.setItem('pwa_dismissed', 'true');
              }}
              className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
            >
              Install
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
