import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { FreshwayLogo } from '../Branding/FreshwayLogo';
import {
  LayoutDashboard,
  ShoppingCart,
  BookOpen,
  Users,
  CreditCard,
  FileText,
  Package,
  Truck,
  TrendingDown,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  User,
  FlaskConical,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'pos'
  | 'ledger'
  | 'customers'
  | 'payments'
  | 'invoices'
  | 'inventory'
  | 'suppliers'
  | 'expenses'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lowStockCount?: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  lowStockCount = 0,
  isOpen,
  setIsOpen,
}) => {
  const { user, logout, isAdmin, isManager, isTestMode, toggleTestMode } = useAuth();
  const { settings } = useSettings();

  const navigationItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      allowed: true,
    },
    {
      id: 'pos' as ActiveTab,
      label: 'Fast POS Billing',
      icon: ShoppingCart,
      badge: 'Hot',
      allowed: true,
    },
    {
      id: 'ledger' as ActiveTab,
      label: 'Monthly Ledger',
      icon: BookOpen,
      badge: 'Core',
      allowed: true,
    },
    {
      id: 'customers' as ActiveTab,
      label: 'Customers',
      icon: Users,
      badge: null,
      allowed: true,
    },
    {
      id: 'payments' as ActiveTab,
      label: 'Payment Collection',
      icon: CreditCard,
      badge: null,
      allowed: true,
    },
    {
      id: 'invoices' as ActiveTab,
      label: 'Invoices History',
      icon: FileText,
      badge: null,
      allowed: true,
    },
    {
      id: 'inventory' as ActiveTab,
      label: 'Products & Stock',
      icon: Package,
      badge: lowStockCount > 0 ? `${lowStockCount} Low` : null,
      badgeColor: 'bg-amber-500 text-white',
      allowed: true,
    },
    {
      id: 'suppliers' as ActiveTab,
      label: 'Suppliers & Purchases',
      icon: Truck,
      badge: null,
      allowed: isManager,
    },
    {
      id: 'expenses' as ActiveTab,
      label: 'Expenses',
      icon: TrendingDown,
      badge: null,
      allowed: isManager,
    },
    {
      id: 'reports' as ActiveTab,
      label: 'Reports & P&L',
      icon: BarChart3,
      badge: null,
      allowed: isManager,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Settings & Backup',
      icon: Settings,
      badge: null,
      allowed: isAdmin,
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      <aside
        className={`fixed lg:static top-0 left-0 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Brand Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <FreshwayLogo size="md" showText={true} customLogoUrl={settings.logoDataUrl} />
        </div>

        {/* Test Sandbox Mode Banner */}
        {isTestMode && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
            <span className="flex items-center gap-1.5 font-bold">
              <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
              Test Sandbox Mode
            </span>
            <button
              onClick={toggleTestMode}
              className="text-[10px] underline hover:text-amber-900 font-medium"
            >
              Exit
            </button>
          </div>
        )}

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
          {navigationItems
            .filter((item) => item.allowed)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800/80 hover:text-blue-700 dark:hover:text-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : item.badgeColor || 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        {/* User Profile Card & Sign Out */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                  {user?.fullName || 'User'}
                </p>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] capitalize text-slate-400 dark:text-slate-500 font-semibold">
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 px-1">
            <span>Freshway POS v2.0</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              MongoDB Atlas
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
