import React, { useState, useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import type { ActiveTab } from './Sidebar';
import { api } from '../../api/client';
import {
  Menu,
  Sun,
  Moon,
  Plus,
  ShoppingCart,
  BookOpen,
  CreditCard,
  Server,
} from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSidebar,
}) => {
  const { settings, theme, toggleTheme } = useSettings();
  const { isAdmin } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mongoConnected, setMongoConnected] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api
      .getDatabaseStatus()
      .then((res) => setMongoConnected(!!res?.isConnected))
      .catch(() => {});
  }, [activeTab]);

  const tabTitles: Record<ActiveTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Executive Dashboard',
      subtitle: 'Real-time water plant sales, Udhaar receivables & stock analytics',
    },
    pos: {
      title: 'Fast POS Billing',
      subtitle: 'Create instant walk-in or customer account water bottle invoices',
    },
    ledger: {
      title: 'Customer Monthly Ledger',
      subtitle: 'Automated monthly billing statements, debits, credits & running balances',
    },
    customers: {
      title: 'Customer Accounts',
      subtitle: 'Manage retail, corporate & residential water delivery customers',
    },
    payments: {
      title: 'Payment Collection',
      subtitle: 'Record cash/bank collections & issue official payment vouchers',
    },
    invoices: {
      title: 'Sales Invoices History',
      subtitle: 'Search, reprint thermal/A4 receipts, or void sales orders',
    },
    inventory: {
      title: 'Products & Inventory',
      subtitle: 'Track 19L bottles, dispensers, stock levels & movement logs',
    },
    suppliers: {
      title: 'Suppliers & Purchases',
      subtitle: 'Manage vendor accounts & stock intake purchase orders',
    },
    expenses: {
      title: 'Operating Expenses',
      subtitle: 'Track daily fuel, electricity, maintenance & staff salaries',
    },
    reports: {
      title: 'Financial Reports & P&L',
      subtitle: 'Audited sales summaries, Udhaar aging & inventory valuation',
    },
    settings: {
      title: 'System Settings & MongoDB Atlas',
      subtitle: 'Manage branding, staff roles, MongoDB Atlas & database backups',
    },
  };

  const current = tabTitles[activeTab] || tabTitles.dashboard;

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between flex-shrink-0 print:hidden">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenSidebar}
          className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
              {current.title}
            </h1>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-cyan-400 border border-blue-200/60 dark:border-blue-800">
              {settings.businessName}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate hidden sm:block">
            {current.subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Navigation Shortcuts */}
        <div className="hidden xl:flex items-center gap-1.5 mr-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-cyan-400 hover:bg-blue-100'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>New Sale</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Receive Payment</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'ledger'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Ledger</span>
          </button>
        </div>

        {/* MongoDB Atlas Status Indicator */}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('settings')}
            title="MongoDB Atlas & Database Status"
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all ${
              mongoConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-emerald-500" />
            <span>Atlas DB</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </button>
        )}

        {/* Date Display */}
        <div className="hidden md:flex flex-col items-end px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-[10px]">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {currentTime.toLocaleDateString('en-PK', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </span>
          <span className="text-slate-400 font-mono">
            {currentTime.toLocaleTimeString('en-PK', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 cursor-pointer transition-colors"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
