import React, { useState, useEffect } from 'react';
import type { DashboardStats } from '../../types';
import { api } from '../../api/client';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import {
  TrendingUp,
  DollarSign,
  AlertCircle,
  Users,
  FileText,
  CreditCard,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  RefreshCw,
  PackageX,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import type { ActiveTab } from '../Layout/Sidebar';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ setActiveTab }) => {
  const { formatCurrency } = useSettings();
  const { isTestMode } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard statistics from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Retrieving live database statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex flex-col items-center text-center max-w-lg mx-auto">
          <AlertCircle className="w-10 h-10 text-rose-600 mb-3" />
          <h3 className="text-base font-bold">Failed to load real data</h3>
          <p className="text-xs text-rose-600 dark:text-rose-300 mt-1 mb-4">{error}</p>
          <button
            onClick={fetchStats}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Today's Sales",
      value: formatCurrency(stats?.todaySales || 0),
      subtext: `${stats?.todayInvoicesCount || 0} invoice(s) today`,
      icon: ShoppingBag,
      color: 'from-blue-600 to-cyan-600',
      textColor: 'text-blue-600 dark:text-cyan-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    },
    {
      label: 'Monthly Sales',
      value: formatCurrency(stats?.monthlySales || 0),
      subtext: 'Current billing calendar month',
      icon: TrendingUp,
      color: 'from-indigo-600 to-blue-600',
      textColor: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950/40',
    },
    {
      label: 'Payments Received',
      value: formatCurrency(stats?.totalReceived || 0),
      subtext: 'Total collected to date',
      icon: CreditCard,
      color: 'from-emerald-600 to-teal-600',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    },
    {
      label: 'Outstanding Udhaar',
      value: formatCurrency(stats?.outstandingBalance || 0),
      subtext: 'Total due from customers',
      icon: DollarSign,
      color: 'from-rose-600 to-amber-600',
      textColor: 'text-rose-600 dark:text-rose-400',
      bgColor: 'bg-rose-50 dark:bg-rose-950/40',
    },
    {
      label: 'Total Expenses',
      value: formatCurrency(stats?.totalExpenses || 0),
      subtext: 'Operating costs recorded',
      icon: ArrowDownRight,
      color: 'from-amber-600 to-orange-600',
      textColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    },
    {
      label: 'Estimated Profit',
      value: formatCurrency(stats?.estimatedProfit || 0),
      subtext: 'Net sales - COGS - Expenses',
      icon: ArrowUpRight,
      color: 'from-teal-600 to-emerald-600',
      textColor: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-50 dark:bg-teal-950/40',
    },
    {
      label: 'Total Customers',
      value: String(stats?.totalCustomers || 0),
      subtext: 'Registered accounts',
      icon: Users,
      color: 'from-sky-600 to-blue-600',
      textColor: 'text-sky-600 dark:text-sky-400',
      bgColor: 'bg-sky-50 dark:bg-sky-950/40',
    },
    {
      label: 'Total Invoices',
      value: String(stats?.totalInvoices || 0),
      subtext: 'Non-cancelled sales orders',
      icon: FileText,
      color: 'from-violet-600 to-purple-600',
      textColor: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    },
  ];

  const isCompletelyEmpty =
    (stats?.totalInvoices || 0) === 0 &&
    (stats?.totalCustomers || 0) === 0 &&
    (stats?.totalExpenses || 0) === 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Zero Fake Data Assurance Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
              Strict Zero Fake Data Policy Active
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Every figure below is queried directly from your MongoDB Atlas & persistent database engine. No demo transactions exist.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStats}
            title="Refresh statistics"
            className="p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTab('pos')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Real-time Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <div className={`p-2 rounded-xl ${card.bgColor} ${card.textColor}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {card.value}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                {card.subtext}
              </p>
            </div>
          );
        })}
      </div>

      {/* Empty State Welcome Guide if fresh database */}
      {isCompletelyEmpty && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-blue-950/40 rounded-3xl p-8 border border-blue-100 dark:border-blue-900/50 text-center max-w-2xl mx-auto my-4">
          <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Welcome to your Freshway Water POS!
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
            Your system has started in a pristine, zero-data state. To get started with your daily water distribution and sales:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 text-left">
            <button
              onClick={() => setActiveTab('inventory')}
              className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 hover:border-blue-500 transition-all text-xs font-semibold shadow-xs cursor-pointer group"
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[11px] font-bold mb-2">
                1
              </span>
              <p className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600">
                Add Products
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Set up 19L Bottles, 1.5L bottles, prices & stock
              </p>
            </button>

            <button
              onClick={() => setActiveTab('customers')}
              className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 hover:border-blue-500 transition-all text-xs font-semibold shadow-xs cursor-pointer group"
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[11px] font-bold mb-2">
                2
              </span>
              <p className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600">
                Add Customers
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Residential, corporate, or wholesale accounts
              </p>
            </button>

            <button
              onClick={() => setActiveTab('pos')}
              className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 hover:border-blue-500 transition-all text-xs font-semibold shadow-xs cursor-pointer group"
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[11px] font-bold mb-2">
                3
              </span>
              <p className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600">
                Create First Sale
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Issue invoices with cash or Udhaar billing
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Lower Dashboard Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Recent Sales Invoices
            </h3>
            <button
              onClick={() => setActiveTab('invoices')}
              className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
            >
              View All &rarr;
            </button>
          </div>

          {stats?.recentInvoices && stats.recentInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2">Invoice #</th>
                    <th className="pb-2">Customer</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {stats.recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 font-mono font-bold text-slate-900 dark:text-white">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2.5 text-slate-700 dark:text-slate-300 font-medium">
                        {inv.customerName}
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900 dark:text-white">
                        {formatCurrency(inv.grandTotal)}
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            inv.paymentStatus === 'Paid'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : inv.paymentStatus === 'Partially Paid'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
              <PackageX className="w-8 h-8 stroke-1 mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-semibold">No sales recorded yet</p>
              <button
                onClick={() => setActiveTab('pos')}
                className="mt-3 px-3 py-1.5 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-cyan-400 rounded-xl text-xs font-bold hover:bg-blue-100 cursor-pointer"
              >
                + Create First Sale
              </button>
            </div>
          )}
        </div>

        {/* Low Stock Alerts & Top Customers */}
        <div className="space-y-6">
          {/* Low Stock Box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" /> Low Stock Alerts
              </h3>
              <button
                onClick={() => setActiveTab('inventory')}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
              >
                Manage Stock &rarr;
              </button>
            </div>

            {stats?.lowStockItems && stats.lowStockItems.length > 0 ? (
              <div className="space-y-2">
                {stats.lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                      <p className="text-[11px] text-slate-500">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-amber-600 dark:text-amber-400 text-sm">
                        {item.stockQuantity} {item.unit}
                      </span>
                      <p className="text-[10px] text-slate-500">Min: {item.lowStockThreshold}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>All product stock levels are within safe operating limits.</span>
              </div>
            )}
          </div>

          {/* Top Customers Box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" /> Top Customers by Sales
              </h3>
              <button
                onClick={() => setActiveTab('customers')}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
              >
                View Customers &rarr;
              </button>
            </div>

            {stats?.topCustomers && stats.topCustomers.length > 0 ? (
              <div className="space-y-2">
                {stats.topCustomers.map((cust, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{cust.customerName}</p>
                        <p className="text-[10px] text-slate-400">{cust.invoiceCount} invoices</p>
                      </div>
                    </div>
                    <span className="font-extrabold text-blue-600 dark:text-cyan-400">
                      {formatCurrency(cust.totalSpent)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                No customer transactions recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
