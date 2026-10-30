import React, { useState, useEffect } from 'react';
import type { Customer, Payment } from '../../types';
import { api } from '../../api/client';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { FreshwayLogo } from '../Branding/FreshwayLogo';
import {
  CreditCard,
  Search,
  DollarSign,
  Printer,
  X,
  AlertCircle,
  CheckCircle2,
  Calendar,
  FileText,
  RotateCcw,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface PaymentCollectionViewProps {
  initialCustomerId?: string;
}

export const PaymentCollectionView: React.FC<PaymentCollectionViewProps> = ({ initialCustomerId }) => {
  const { settings, formatCurrency } = useSettings();
  const { user, isAdmin } = useAuth();

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || '');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Receipt Modal State
  const [completedPayment, setCompletedPayment] = useState<Payment | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Void Modal State
  const [voidingPayment, setVoidingPayment] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [custs, pays] = await Promise.all([
        api.getCustomers({ status: 'active' }),
        api.getPayments(),
      ]);
      setCustomers(custs);
      setPayments(pays);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment data from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Set payment to full outstanding amount
  const handlePayFull = () => {
    if (selectedCustomer && selectedCustomer.currentBalance > 0) {
      setAmount(String(selectedCustomer.currentBalance));
    }
  };

  // Submit payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setFormError('Please select a customer.');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid payment amount greater than zero.');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      const res = await api.createPayment({
        customerId: selectedCustomerId,
        amount: numAmount,
        paymentMethod,
        paymentDate,
        referenceNumber,
        notes,
        createdByName: user?.fullName || 'Cashier',
        createdById: user?.id,
      });

      if (res.success) {
        // Construct printable payment object
        const newPaymentObj: Payment = {
          id: res.paymentId,
          receiptNumber: res.receiptNumber,
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.name || 'Customer',
          amount: res.amount,
          paymentMethod,
          referenceNumber,
          notes,
          createdByName: user?.fullName || 'Cashier',
          isVoided: 0,
          createdAt: new Date().toISOString(),
        };

        setCompletedPayment(newPaymentObj);
        setShowReceiptModal(true);

        // Reset inputs
        setAmount('');
        setReferenceNumber('');
        setNotes('');

        // Refresh customers & payments list
        loadData();
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save payment.');
    } finally {
      setSaving(false);
    }
  };

  // Void payment
  const handleConfirmVoid = async () => {
    if (!voidingPayment || !voidReason.trim()) {
      setVoidError('A reason is required to void this payment.');
      return;
    }

    try {
      setVoiding(true);
      setVoidError(null);
      await api.voidPayment(voidingPayment.id, {
        reason: voidReason.trim(),
        userRole: user?.role,
        voidedByName: user?.fullName || 'Admin',
        voidedById: user?.id,
      });

      setVoidingPayment(null);
      setVoidReason('');
      loadData();
    } catch (err: any) {
      setVoidError(`Void failed: ${err.message}`);
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Payment Collection & Udhaar Management
            </h2>
            <p className="text-xs text-slate-500">
              Collect payments from customer accounts, issue payment vouchers, and reduce outstanding balances.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          title="Refresh payment data"
          className="p-2 rounded-xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Grid: Left Payment Entry Form, Right History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: PAYMENT ENTRY CARD (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" /> Collect Payment
            </h3>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            {/* Customer Dropdown */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Select Customer *
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone}) - Udhaar: {formatCurrency(c.currentBalance)}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Balance Indicator Card */}
            {selectedCustomer && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Current Outstanding Due:
                  </span>
                  <span
                    className={`font-black text-sm ${
                      selectedCustomer.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {formatCurrency(selectedCustomer.currentBalance)}
                  </span>
                </div>
                {selectedCustomer.currentBalance > 0 && (
                  <button
                    type="button"
                    onClick={handlePayFull}
                    className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    ⚡ Auto-fill full amount ({formatCurrency(selectedCustomer.currentBalance)})
                  </button>
                )}
              </div>
            )}

            {/* Payment Amount */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Amount Received ({settings.currencySymbol}) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-slate-400">
                  {settings.currencySymbol}
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Payment Method & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card / POS</option>
                  <option value="Mobile Wallet">JazzCash / Easypaisa</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Reference Number */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Transaction / Slip Reference #
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. Bank slip # or JazzCash TID"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Remarks / Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all transform active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Save Payment & Generate Receipt</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT: RECENT PAYMENT COLLECTIONS TABLE (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Recent Collected Payments
            </h3>
            <span className="text-xs text-slate-400 font-semibold">
              {payments.length} payment(s)
            </span>
          </div>

          {payments.length > 0 ? (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Receipt #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        p.isVoided ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {p.receiptNumber}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(p.createdAt).toLocaleDateString('en-PK')}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 dark:text-white">
                        {p.customerName}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {p.paymentMethod}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setCompletedPayment(p);
                              setShowReceiptModal(true);
                            }}
                            title="Print Voucher"
                            className="p-1 rounded text-slate-400 hover:text-emerald-600 cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {isAdmin && !p.isVoided && (
                            <button
                              onClick={() => {
                                setVoidingPayment(p);
                                setVoidReason('');
                              }}
                              title="Void Incorrect Payment"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <CreditCard className="w-10 h-10 stroke-1 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                No payments collected yet
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                Select a customer on the left to record cash, bank, or mobile wallet payments against their account.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PRINTABLE PAYMENT VOUCHER MODAL */}
      {showReceiptModal && completedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase">Payment Voucher</span>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div id="payment-voucher-print" className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-xs space-y-3 font-mono">
              <div className="text-center pb-2 border-b border-dashed border-slate-300">
                <p className="font-bold text-sm text-slate-900 dark:text-white">{settings.businessName}</p>
                <p className="text-[10px] text-slate-500">Official Payment Receipt</p>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Receipt #:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{completedPayment.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold">{completedPayment.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Method:</span>
                  <span>{completedPayment.paymentMethod}</span>
                </div>
                {completedPayment.referenceNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Slip Ref:</span>
                    <span>{completedPayment.referenceNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span>{new Date(completedPayment.createdAt).toLocaleString('en-PK')}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-dashed border-slate-300 flex justify-between items-center text-sm font-extrabold text-emerald-600">
                <span>Amount Paid:</span>
                <span>{formatCurrency(completedPayment.amount)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Voucher</span>
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOID PAYMENT MODAL (Admin Only) */}
      {voidingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-rose-200 dark:border-rose-900 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-rose-600 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Void Payment Transaction
              </h3>
              <button
                onClick={() => setVoidingPayment(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              You are about to void payment <strong>{voidingPayment.receiptNumber}</strong> of{' '}
              <strong>{formatCurrency(voidingPayment.amount)}</strong> collected from{' '}
              <strong>{voidingPayment.customerName}</strong>. This will restore the customer's outstanding balance.
            </p>

            {voidError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{voidError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mandatory Audit Reason *
              </label>
              <textarea
                rows={2}
                required
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Accidental duplicate entry, bounced cheque, etc."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setVoidingPayment(null)}
                className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVoid}
                disabled={voiding || !voidReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {voiding ? 'Reversing...' : 'Confirm Void Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
