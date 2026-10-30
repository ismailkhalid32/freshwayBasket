import React, { useState, useEffect } from 'react';
import type { Supplier, Purchase, Product } from '../../types';
import { api } from '../../api/client';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import {
  Truck,
  Plus,
  Search,
  DollarSign,
  Package,
  Calendar,
  X,
  AlertCircle,
  FileText,
  RefreshCw,
} from 'lucide-react';

export const SupplierListView: React.FC = () => {
  const { settings, formatCurrency } = useSettings();
  const { user } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'purchases'>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Supplier Modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    address: '',
    openingBalance: 0,
    notes: '',
  });

  // Record Purchase Modal
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<Array<{ productId: string; productName: string; unit: string; quantity: number; unitCost: number }>>([]);
  const [purchasePaidAmount, setPurchasePaidAmount] = useState('');
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState('Cash');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sups, purs, prods] = await Promise.all([
        api.getSuppliers(),
        api.getPurchases(),
        api.getProducts(),
      ]);
      setSuppliers(sups);
      setPurchases(purs);
      setProducts(prods);
    } catch (err: any) {
      setError(err.message || 'Failed to load supplier & purchase data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name || !supplierForm.phone) {
      setModalError('Supplier name and phone are required.');
      return;
    }

    try {
      setSubmitting(true);
      setModalError(null);
      await api.createSupplier({
        ...supplierForm,
        createdByName: user?.fullName || 'User',
        createdById: user?.id,
      });
      setShowSupplierModal(false);
      setSupplierForm({
        name: '',
        company: '',
        phone: '',
        email: '',
        address: '',
        openingBalance: 0,
        notes: '',
      });
      setSuccessMsg('Supplier registered successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
    } catch (err: any) {
      setModalError(`Error creating supplier: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPurchaseItem = (prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;
    setPurchaseItems((prev) => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        unit: prod.unit,
        quantity: 10,
        unitCost: prod.costPrice || 0,
      },
    ]);
  };

  const handleUpdatePurchaseItem = (index: number, field: 'quantity' | 'unitCost', value: number) => {
    setPurchaseItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  const handleRemovePurchaseItem = (index: number) => {
    setPurchaseItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalPurchaseAmount = purchaseItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setModalError('Please select a supplier.');
      return;
    }
    if (purchaseItems.length === 0) {
      setModalError('Please add at least one product item to the purchase invoice.');
      return;
    }

    const sup = suppliers.find((s) => s.id === selectedSupplierId);

    try {
      setSubmitting(true);
      setModalError(null);
      await api.createPurchase({
        supplierId: selectedSupplierId,
        supplierName: sup?.name || 'Supplier',
        items: purchaseItems,
        totalAmount: totalPurchaseAmount,
        paidAmount: parseFloat(purchasePaidAmount) || 0,
        paymentMethod: purchasePaymentMethod,
        notes: purchaseNotes,
        createdByName: user?.fullName || 'User',
        createdById: user?.id,
      });

      setShowPurchaseModal(false);
      setPurchaseItems([]);
      setPurchasePaidAmount('');
      setPurchaseNotes('');
      loadData();
      setSuccessMsg('Purchase recorded successfully! Product stock has been updated.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setModalError(`Error recording purchase: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Suppliers & Purchase Orders
            </h2>
            <p className="text-xs text-slate-500">
              Manage vendors, water cap/bottle suppliers, and record purchases that increase warehouse stock.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-blue-600" />
            <span>Add Supplier</span>
          </button>
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Record New Purchase</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <span>{successMsg}</span>
        </div>
      )}

      {/* Subtabs Selector */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('suppliers')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'suppliers'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Suppliers Directory ({suppliers.length})
        </button>
        <button
          onClick={() => setActiveSubTab('purchases')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'purchases'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Purchase Orders ({purchases.length})
        </button>
      </div>

      {/* Table Display */}
      {activeSubTab === 'suppliers' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          {suppliers.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4 text-right">Payable Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{s.name}</td>
                    <td className="py-3 px-4 text-slate-500">{s.company || '—'}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{s.phone}</td>
                    <td className="py-3 px-4 text-slate-500">{s.address || '—'}</td>
                    <td className="py-3 px-4 text-right font-black text-rose-600">
                      {formatCurrency(s.currentBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400">
              <Truck className="w-10 h-10 stroke-1 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No suppliers registered yet</p>
              <p className="text-[11px] text-slate-400 mt-1 mb-4">Add your raw material suppliers or bottle vendors.</p>
              <button
                onClick={() => setShowSupplierModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                + Add First Supplier
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          {purchases.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Purchase #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {purchases.map((pur) => (
                  <tr key={pur.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {pur.purchaseNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(pur.createdAt).toLocaleDateString('en-PK')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800 dark:text-white">
                      {pur.supplierName}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                      {formatCurrency(pur.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-bold">
                      {formatCurrency(pur.paidAmount)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-600 font-bold">
                      {formatCurrency(pur.balanceAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {pur.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400">
              <FileText className="w-10 h-10 stroke-1 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No purchase orders recorded yet</p>
              <p className="text-[11px] text-slate-400 mt-1 mb-4">Record purchases from suppliers to increase inventory stock.</p>
              <button
                onClick={() => setShowPurchaseModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                + Record First Purchase
              </button>
            </div>
          )}
        </div>
      )}

      {/* ADD SUPPLIER MODAL */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" /> Add New Supplier
              </h3>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supplier / Vendor Name *
                </label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  placeholder="e.g. Master Caps & Bottles Ltd"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Company / Organization
                </label>
                <input
                  type="text"
                  value={supplierForm.company}
                  onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })}
                  placeholder="e.g. Packaging Division"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phone *
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    placeholder="e.g. +92 300 1122334"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Opening Payable (Rs)
                  </label>
                  <input
                    type="number"
                    value={supplierForm.openingBalance || ''}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, openingBalance: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vendor Address
                </label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  placeholder="e.g. Plot 12, Industrial Area, SITE"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PURCHASE MODAL */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" /> Record Supplier Purchase (Stock Intake)
              </h3>
              <button onClick={() => setShowPurchaseModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePurchase} className="space-y-4 text-xs">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supplier *
                </label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.company || s.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Product Items to Purchase */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Purchase Items (Stock will be incremented)
                  </span>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddPurchaseItem(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-blue-600 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="">+ Add Product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {purchaseItems.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {purchaseItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate">{item.productName}</p>
                          <span className="text-[10px] text-slate-400">{item.unit}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div>
                            <label className="text-[9px] text-slate-400 block">Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdatePurchaseItem(idx, 'quantity', parseFloat(e.target.value) || 1)
                              }
                              className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center font-bold"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] text-slate-400 block">Cost Price</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) =>
                                handleUpdatePurchaseItem(idx, 'unitCost', parseFloat(e.target.value) || 0)
                              }
                              className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-right font-bold"
                            />
                          </div>

                          <div className="text-right min-w-[60px]">
                            <label className="text-[9px] text-slate-400 block">Total</label>
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              {formatCurrency(item.quantity * item.unitCost)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemovePurchaseItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-slate-400">
                    Select a product above to add to this purchase invoice.
                  </div>
                )}
              </div>

              {/* Purchase Totals */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 space-y-2">
                <div className="flex justify-between font-extrabold text-sm text-slate-900 dark:text-white">
                  <span>Total Purchase Cost:</span>
                  <span>{formatCurrency(totalPurchaseAmount)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Amount Paid Now
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={purchasePaidAmount}
                      onChange={(e) => setPurchasePaidAmount(e.target.value)}
                      placeholder={String(totalPurchaseAmount)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={purchasePaymentMethod}
                      onChange={(e) => setPurchasePaymentMethod(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Credit">Credit (Pay Later)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || purchaseItems.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Record Purchase & Update Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
