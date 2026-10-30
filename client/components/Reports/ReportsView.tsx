import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useSettings } from '../../context/SettingsContext';
import {
  BarChart3,
  Download,
  Printer,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { formatCurrency } = useSettings();

  const [reportType, setReportType] = useState<
    'sales' | 'customer-sales' | 'product-sales' | 'udhaar-aging' | 'inventory-valuation'
  >('sales');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getReportSummary({
        reportType,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setReportData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType]);

  const handleExportCSV = () => {
    if (reportData.length === 0) return;

    let headers: string[] = [];
    let rows: any[][] = [];

    if (reportType === 'sales') {
      headers = ['Date', 'Invoices Count', 'Gross Sales (Rs)', 'Discounts (Rs)', 'Net Sales (Rs)', 'Collected (Rs)', 'Credit Extended (Rs)'];
      rows = reportData.map((r) => [r.saleDate, r.invoiceCount, r.grossSales, r.discounts, r.netSales, r.collected, r.creditExtended]);
    } else if (reportType === 'customer-sales') {
      headers = ['Customer ID', 'Customer Name', 'Phone', 'Category', 'Total Invoices', 'Total Purchased (Rs)', 'Total Paid (Rs)', 'Current Udhaar Due (Rs)'];
      rows = reportData.map((r) => [r.id, `"${r.name}"`, `"${r.phone}"`, r.category, r.invoiceCount, r.totalPurchased, r.totalPaid, r.currentBalance]);
    } else if (reportType === 'product-sales') {
      headers = ['Product Name', 'SKU', 'Unit', 'Qty Sold', 'Total Revenue (Rs)', 'Gross Profit (Rs)'];
      rows = reportData.map((r) => [`"${r.productName}"`, r.sku, r.unit, r.totalQtySold, r.totalRevenue, r.grossProfit]);
    } else if (reportType === 'udhaar-aging') {
      headers = ['Customer ID', 'Customer Name', 'Phone', 'Category', 'Delivery Address', 'Outstanding Udhaar (Rs)'];
      rows = reportData.map((r) => [r.id, `"${r.name}"`, `"${r.phone}"`, r.category, `"${r.address || ''}"`, r.currentBalance]);
    } else if (reportType === 'inventory-valuation') {
      headers = ['Product Name', 'SKU', 'Stock Quantity', 'Unit', 'Cost Price (Rs)', 'Selling Price (Rs)', 'Cost Valuation (Rs)', 'Retail Valuation (Rs)'];
      rows = reportData.map((r) => [`"${r.name}"`, r.sku, r.stockQuantity, r.unit, r.costPrice, r.sellingPrice, r.costValuation, r.retailValuation]);
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      `"Freshway Water - Financial Report: ${reportType.toUpperCase()}"\n\n` +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Financial Reports & Business Analytics
            </h2>
            <p className="text-xs text-slate-500">
              Generate audited accounting reports, Udhaar credit aging, and inventory valuation from live database records.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={reportData.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            disabled={reportData.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Report Types Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold">
        {[
          { id: 'sales', label: 'Daily / Period Sales' },
          { id: 'customer-sales', label: 'Customer-Wise Sales' },
          { id: 'product-sales', label: 'Product-Wise Sales' },
          { id: 'udhaar-aging', label: 'Udhaar Outstanding Balances' },
          { id: 'inventory-valuation', label: 'Inventory Stock Valuation' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id as any)}
            className={`px-4 py-2 rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
              reportType === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Filters Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-slate-500">Filter Dates:</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        />
        <span>to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        />
        <button
          onClick={fetchReport}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer"
        >
          Apply Filter
        </button>
      </div>

      {/* Report Output Content */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Compiling database report...</div>
        ) : reportData.length > 0 ? (
          <div className="overflow-x-auto">
            {reportType === 'sales' && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-center">Invoices</th>
                    <th className="py-3 px-4 text-right">Gross Sales</th>
                    <th className="py-3 px-4 text-right">Discounts</th>
                    <th className="py-3 px-4 text-right">Net Sales</th>
                    <th className="py-3 px-4 text-right">Collected</th>
                    <th className="py-3 px-4 text-right">Credit Extended (Udhaar)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {reportData.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono font-bold">{r.saleDate}</td>
                      <td className="py-3 px-4 text-center">{r.invoiceCount}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(r.grossSales)}</td>
                      <td className="py-3 px-4 text-right text-emerald-600">-{formatCurrency(r.discounts)}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                        {formatCurrency(r.netSales)}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-bold">
                        {formatCurrency(r.collected)}
                      </td>
                      <td className="py-3 px-4 text-right text-rose-600 font-bold">
                        {formatCurrency(r.creditExtended)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'customer-sales' && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Invoices Count</th>
                    <th className="py-3 px-4 text-right">Total Purchased</th>
                    <th className="py-3 px-4 text-right">Total Paid</th>
                    <th className="py-3 px-4 text-right">Current Udhaar Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {reportData.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{c.name}</td>
                      <td className="py-3 px-4 text-slate-500">{c.phone}</td>
                      <td className="py-3 px-4">{c.category}</td>
                      <td className="py-3 px-4 text-center font-bold">{c.invoiceCount}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                        {formatCurrency(c.totalPurchased)}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-bold">
                        {formatCurrency(c.totalPaid)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-rose-600">
                        {formatCurrency(c.currentBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'product-sales' && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4 text-center">Qty Sold</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                    <th className="py-3 px-4 text-right">Estimated Gross Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {reportData.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{p.productName}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{p.sku}</td>
                      <td className="py-3 px-4 text-slate-500">{p.unit}</td>
                      <td className="py-3 px-4 text-center font-black">{p.totalQtySold}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                        {formatCurrency(p.totalRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right text-teal-600 font-bold">
                        {formatCurrency(p.grossProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'udhaar-aging' && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Address</th>
                    <th className="py-3 px-4 text-right">Outstanding Udhaar Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {reportData.map((u, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{u.name}</td>
                      <td className="py-3 px-4 text-slate-500">{u.phone}</td>
                      <td className="py-3 px-4">{u.category}</td>
                      <td className="py-3 px-4 text-slate-500">{u.address || '—'}</td>
                      <td className="py-3 px-4 text-right font-black text-rose-600 text-sm">
                        {formatCurrency(u.currentBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'inventory-valuation' && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4 text-center">Stock</th>
                    <th className="py-3 px-4 text-right">Cost Price</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4 text-right">Valuation at Cost</th>
                    <th className="py-3 px-4 text-right">Valuation at Retail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {reportData.map((inv, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{inv.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{inv.sku}</td>
                      <td className="py-3 px-4 text-center font-bold">
                        {inv.stockQuantity} {inv.unit}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">{formatCurrency(inv.costPrice)}</td>
                      <td className="py-3 px-4 text-right font-bold">{formatCurrency(inv.sellingPrice)}</td>
                      <td className="py-3 px-4 text-right font-bold text-blue-600 dark:text-cyan-400">
                        {formatCurrency(inv.costValuation)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                        {formatCurrency(inv.retailValuation)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400">
            <BarChart3 className="w-10 h-10 stroke-1 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No records found for this report</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Zero fake data policy: reports compute only from real saved transactions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
