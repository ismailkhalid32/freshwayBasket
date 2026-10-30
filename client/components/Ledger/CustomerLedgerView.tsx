import React, { useState, useEffect } from 'react';
import type { Customer, CustomerMonthlySummary, Invoice } from '../../types';
import { api } from '../../api/client';
import { useSettings } from '../../context/SettingsContext';
import { PrintReceiptModal } from '../Common/PrintReceiptModal';
import {
  BookOpen,
  Search,
  Calendar,
  Printer,
  Download,
  Filter,
  DollarSign,
  FileText,
  CreditCard,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  ChevronDown,
  User,
} from 'lucide-react';

interface CustomerLedgerViewProps {
  initialCustomerId?: string;
}

export const CustomerLedgerView: React.FC<CustomerLedgerViewProps> = ({ initialCustomerId }) => {
  const { settings, formatCurrency } = useSettings();

  // Customer List & Selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Month & Year / Custom Date Range
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Status Filter & Search inside Ledger
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Partially Paid' | 'Unpaid'>('All');
  const [refSearch, setRefSearch] = useState('');

  // Ledger Data State
  const [summaryData, setSummaryData] = useState<CustomerMonthlySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transaction Inspection / Print Modal
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Load customer directory
  const loadCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const data = await api.getCustomers();
      setCustomers(data);
      if (initialCustomerId && data.some((c) => c.id === initialCustomerId)) {
        setSelectedCustomerId(initialCustomerId);
      } else if (data.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(data[0].id);
      }
    } catch (err: any) {
      setError('Unable to load customer list from database.');
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [initialCustomerId]);

  // Fetch summary when customer or date changes
  const fetchMonthlySummary = async () => {
    if (!selectedCustomerId) return;
    try {
      setLoadingSummary(true);
      setError(null);

      const params: any = {};
      if (useCustomRange && customStartDate && customEndDate) {
        params.startDate = customStartDate;
        params.endDate = customEndDate;
      } else {
        params.month = selectedMonth;
        params.year = selectedYear;
      }

      const res = await api.getCustomerMonthlySummary(selectedCustomerId, params);
      setSummaryData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve customer monthly summary.');
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (selectedCustomerId) {
      fetchMonthlySummary();
    }
  }, [selectedCustomerId, selectedMonth, selectedYear, useCustomRange, customStartDate, customEndDate]);

  // Months List
  const months = [
    { num: 1, name: 'January' },
    { num: 2, name: 'February' },
    { num: 3, name: 'March' },
    { num: 4, name: 'April' },
    { num: 5, name: 'May' },
    { num: 6, name: 'June' },
    { num: 7, name: 'July' },
    { num: 8, name: 'August' },
    { num: 9, name: 'September' },
    { num: 10, name: 'October' },
    { num: 11, name: 'November' },
    { num: 12, name: 'December' },
  ];

  // Years List
  const years = [2024, 2025, 2026, 2027, 2028];

  // Filtered customer list for selector
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch) ||
      c.id.toLowerCase().includes(customerSearch.toLowerCase())
  );

  // Filter ledger transactions by status or reference number search
  const filteredLedgerEntries = (summaryData?.ledgerEntries || []).filter((entry) => {
    const matchesRef =
      !refSearch ||
      (entry.referenceNumber && entry.referenceNumber.toLowerCase().includes(refSearch.toLowerCase())) ||
      entry.description.toLowerCase().includes(refSearch.toLowerCase());

    if (!matchesRef) return false;

    if (statusFilter !== 'All') {
      // Find corresponding invoice if entry is an invoice
      if (entry.transactionType === 'INVOICE' && entry.referenceId) {
        const inv = summaryData?.invoices.find((i) => i.id === entry.referenceId);
        if (inv && inv.paymentStatus !== statusFilter) return false;
      } else if (statusFilter !== 'Paid') {
        // Payments are considered paid credits
        return false;
      }
    }

    return true;
  });

  // Open transaction detail
  const handleOpenTransaction = async (entry: any) => {
    if (entry.transactionType === 'INVOICE' && entry.referenceId) {
      try {
        const inv = await api.getInvoice(entry.referenceId);
        setViewInvoice(inv);
        setShowInvoiceModal(true);
      } catch (e: any) {
        setError('Could not load invoice details.');
      }
    }
  };

  // Export Customer Statement to CSV
  const handleExportCSV = () => {
    if (!summaryData) return;

    const headers = [
      'Date',
      'Transaction Type',
      'Reference Number',
      'Description',
      'Payment Method',
      'Debit (Rs)',
      'Credit (Rs)',
      'Running Balance (Rs)',
    ];

    const rows = summaryData.ledgerEntries.map((e) => [
      `"${new Date(e.createdAt).toLocaleString('en-PK')}"`,
      `"${e.transactionType}"`,
      `"${e.referenceNumber || ''}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.paymentMethod || ''}"`,
      e.debit,
      e.credit,
      e.runningBalance,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      `"Freshway Water - Customer Account Statement"\n` +
      `"Customer:","${summaryData.customer.name}"\n` +
      `"Phone:","${summaryData.customer.phone}"\n` +
      `"Period:","${summaryData.period.label}"\n` +
      `"Opening Balance:","${summaryData.summary.openingBalance}"\n` +
      `"Net Sales:","${summaryData.summary.netSales}"\n` +
      `"Payments Received:","${summaryData.summary.paymentsReceived}"\n` +
      `"Closing Balance:","${summaryData.summary.closingBalance}"\n\n` +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `statement_${summaryData.customer.name.replace(/\s+/g, '_')}_${summaryData.period.label.replace(/\s+/g, '_')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Statement (Trigger browser print on printable container)
  const handlePrintStatement = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Filter Bar */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Monthly Customer Billing & Ledger
              </h2>
              <p className="text-xs text-slate-500">
                Track full month invoices, quantity sold, payments received, and running account balances.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={handleExportCSV}
              disabled={!summaryData}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrintStatement}
              disabled={!summaryData}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print Account Statement</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Customer Dropdown */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">
              Select Customer *
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">-- Choose a Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone}) - {c.category}
                </option>
              ))}
            </select>
          </div>

          {/* Month Selector */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Month</label>
            <select
              disabled={useCustomRange}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
            >
              {months.map((m) => (
                <option key={m.num} value={m.num}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Year</label>
            <select
              disabled={useCustomRange}
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Date Range Toggle */}
          <div className="space-y-1 flex flex-col justify-end">
            <button
              onClick={() => setUseCustomRange(!useCustomRange)}
              className={`w-full px-3 py-2 rounded-xl border font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                useCustomRange
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-600 dark:text-cyan-400'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{useCustomRange ? 'Using Custom Date Range' : 'Use Custom Date Range'}</span>
            </button>
          </div>
        </div>

        {/* Custom Start & End Dates if toggled */}
        {useCustomRange && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Ledger & Summary Body */}
      {customers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 max-w-md mx-auto">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 stroke-1 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">
            No customers added yet
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Add your customers in the Customer Directory to start creating multi-invoice ledgers.
          </p>
        </div>
      ) : loadingSummary ? (
        <div className="p-12 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Calculating customer ledger balances...</p>
        </div>
      ) : summaryData ? (
        <div className="space-y-6" id="printable-statement">
          {/* Printable Statement Header (visible during print or screen) */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-cyan-400">
                  Customer Account Statement
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                  {summaryData.customer.name}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>Tel: {summaryData.customer.phone}</span>
                  {summaryData.customer.address && <span>• {summaryData.customer.address}</span>}
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                    {summaryData.customer.category}
                  </span>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-xs text-slate-400 block">Statement Period:</span>
                <span className="font-extrabold text-slate-800 dark:text-white text-sm">
                  {summaryData.period.label}
                </span>
                <p className="text-[11px] text-slate-400">
                  Overall Account Balance: <strong className="text-rose-600">{formatCurrency(summaryData.customer.overallBalance)}</strong>
                </p>
              </div>
            </div>

            {/* MONTHLY SUMMARY METRICS GRID (Exact formula from Requirement 5) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-5">
              {/* 1. Opening Balance */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Opening Balance
                </span>
                <p className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                  {formatCurrency(summaryData.summary.openingBalance)}
                </p>
                <span className="text-[9px] text-slate-400">Unpaid from prior periods</span>
              </div>

              {/* 2. Total Invoices & Quantity */}
              <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Invoices & Quantity
                </span>
                <p className="text-base font-extrabold text-blue-900 dark:text-blue-100 mt-1">
                  {summaryData.summary.invoiceCount} inv • {summaryData.summary.totalQuantitySold} units
                </p>
                <span className="text-[9px] text-blue-600 dark:text-blue-400">Delivered in period</span>
              </div>

              {/* 3. Gross Sales */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Gross Sales
                </span>
                <p className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                  {formatCurrency(summaryData.summary.grossSales)}
                </p>
                <span className="text-[9px] text-slate-400">
                  Disc: -{formatCurrency(summaryData.summary.discounts)}
                </span>
              </div>

              {/* 4. Net Sales in Period */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  Net Period Sales
                </span>
                <p className="text-base font-extrabold text-indigo-900 dark:text-indigo-100 mt-1">
                  {formatCurrency(summaryData.summary.netSales)}
                </p>
                <span className="text-[9px] text-indigo-600 dark:text-indigo-400">Gross − Discounts</span>
              </div>

              {/* 5. Payments Received */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Payments Received
                </span>
                <p className="text-base font-extrabold text-emerald-800 dark:text-emerald-200 mt-1">
                  {formatCurrency(summaryData.summary.paymentsReceived)}
                </p>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400">Period collections</span>
              </div>

              {/* 6. Closing Outstanding Balance */}
              <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Closing Balance
                </span>
                <p className="text-base font-black text-rose-800 dark:text-rose-200 mt-1">
                  {formatCurrency(summaryData.summary.closingBalance)}
                </p>
                <span className="text-[9px] text-rose-600 dark:text-rose-400">Total remaining due</span>
              </div>
            </div>
          </div>

          {/* Sub-filtering inside Ledger Table */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 print:hidden">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
                placeholder="Search invoice # or description..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Status:</span>
              {(['All', 'Paid', 'Partially Paid', 'Unpaid'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* CUSTOMER LEDGER TABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" /> Customer Account Ledger Table
              </h4>
              <span className="text-xs font-semibold text-slate-400">
                {filteredLedgerEntries.length} transaction(s) recorded in period
              </span>
            </div>

            {filteredLedgerEntries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Reference #</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Debit (+)</th>
                      <th className="py-3 px-4 text-right">Credit (−)</th>
                      <th className="py-3 px-4 text-right">Running Balance</th>
                      <th className="py-3 px-4 text-center print:hidden">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {filteredLedgerEntries.map((entry) => {
                      const isInvoice = entry.transactionType === 'INVOICE';
                      const isPayment = entry.transactionType === 'PAYMENT';

                      return (
                        <tr
                          key={entry.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleString('en-PK', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            {entry.referenceNumber || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                isInvoice
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                  : isPayment
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {entry.transactionType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-800 dark:text-slate-200 max-w-xs truncate">
                            {entry.description}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                            {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                            {formatCurrency(entry.runningBalance)}
                          </td>
                          <td className="py-3 px-4 text-center print:hidden">
                            {isInvoice ? (
                              <button
                                onClick={() => handleOpenTransaction(entry)}
                                className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                                title="View Invoice Receipt"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-400">
                <FileText className="w-8 h-8 stroke-1 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-semibold">No ledger entries in this period</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Invoices and payments recorded for this customer in {summaryData.period.label} will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* INVOICE DETAIL VIEW MODAL */}
      {showInvoiceModal && viewInvoice && (
        <PrintReceiptModal
          invoice={viewInvoice}
          onClose={() => {
            setShowInvoiceModal(false);
            setViewInvoice(null);
          }}
        />
      )}
    </div>
  );
};
