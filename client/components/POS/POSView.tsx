import React, { useState, useEffect } from 'react';
import type { Customer, Product, Invoice } from '../../types';
import { api } from '../../api/client';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { PrintReceiptModal } from '../Common/PrintReceiptModal';
import {
  Search,
  Plus,
  Trash2,
  UserPlus,
  DollarSign,
  CreditCard,
  ShoppingCart,
  Percent,
  Receipt,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  Package,
} from 'lucide-react';

interface CartItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  discountAmount: number;
  totalAmount: number;
  stockAvailable: number;
}

export const POSView: React.FC = () => {
  const { settings, formatCurrency } = useSettings();
  const { user } = useAuth();

  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Cart states
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer selection
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Discount & Payment
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [notes, setNotes] = useState<string>('');

  // Modals
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    category: 'Retail' as const,
    openingBalance: 0,
  });
  const [addCustomerLoading, setAddCustomerLoading] = useState(false);
  const [addCustomerError, setAddCustomerError] = useState<string | null>(null);

  // Completed Invoice & Print Modal
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch products and customers
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [prods, custs] = await Promise.all([
        api.getProducts(),
        api.getCustomers({ status: 'active' }),
      ]);
      setProducts(prods);
      setCustomers(custs);
      // Default to walk-in if no customers yet
      if (custs.length === 0) {
        setIsWalkIn(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load catalog from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter products
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.categoryName || 'General')))];
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.barcode && p.barcode.includes(productSearch));
    const matchesCat = selectedCategory === 'All' || p.categoryName === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Selected customer object
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Filter customers for dropdown
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch) ||
      c.id.toLowerCase().includes(customerSearch.toLowerCase())
  );

  // Add product to cart
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        const nextQty = existing.quantity + 1;
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: nextQty,
                totalAmount: (item.unitPrice * nextQty) - item.discountAmount,
              }
            : item
        );
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unit: product.unit,
            unitPrice: product.sellingPrice,
            costPrice: product.costPrice,
            quantity: 1,
            discountAmount: 0,
            totalAmount: product.sellingPrice,
            stockAvailable: product.stockQuantity,
          },
        ];
      }
    });
  };

  // Modify cart quantity
  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = Math.max(1, item.quantity + delta);
            return {
              ...item,
              quantity: newQty,
              totalAmount: (item.unitPrice * newQty) - item.discountAmount,
            };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  // Remove cart item
  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Calculate Subtotals & Grand Totals
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = (subtotal * Math.min(100, Math.max(0, discountValue))) / 100;
  } else {
    discountAmount = Math.min(subtotal, Math.max(0, discountValue));
  }

  const taxAmount = ((subtotal - discountAmount) * (settings.taxPercentage || 0)) / 100;
  const grandTotal = Math.max(0, subtotal - discountAmount + taxAmount);

  const numPaid = paidAmount === '' ? grandTotal : parseFloat(paidAmount) || 0;
  const balanceDue = Math.max(0, grandTotal - numPaid);
  const changeReturn = Math.max(0, numPaid - grandTotal);

  // Quick Payment Buttons
  const setExactPayment = () => {
    setPaidAmount(String(grandTotal));
  };
  const setZeroPayment = () => {
    setPaidAmount('0');
  };

  // Handle Quick Add Customer Submit
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerForm.name || !newCustomerForm.phone) {
      setAddCustomerError('Customer name and phone number are required.');
      return;
    }

    try {
      setAddCustomerLoading(true);
      setAddCustomerError(null);
      const created = await api.createCustomer({
        ...newCustomerForm,
        createdByName: user?.fullName || 'Cashier',
        createdById: user?.id,
      });

      // Reload customers and automatically select this new customer
      const updatedCusts = await api.getCustomers({ status: 'active' });
      setCustomers(updatedCusts);
      setSelectedCustomerId(created.id);
      setIsWalkIn(false);
      setShowAddCustomerModal(false);
      setNewCustomerForm({
        name: '',
        phone: '',
        email: '',
        address: '',
        category: 'Retail',
        openingBalance: 0,
      });
    } catch (err: any) {
      setAddCustomerError(err.message || 'Failed to create customer.');
    } finally {
      setAddCustomerLoading(false);
    }
  };

  // Submit Sale Invoice
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      setError('Cart is empty. Please add items to checkout.');
      return;
    }

    if (!isWalkIn && !selectedCustomerId) {
      setError('Please select an existing customer or toggle Walk-in Sale.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.createInvoice({
        customerId: isWalkIn ? null : selectedCustomerId,
        customerName: isWalkIn ? 'Walk-in Customer' : (selectedCustomer?.name || 'Customer'),
        customerPhone: isWalkIn ? '' : (selectedCustomer?.phone || ''),
        customerAddress: isWalkIn ? '' : (selectedCustomer?.address || ''),
        isWalkIn: isWalkIn ? 1 : 0,
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          unit: item.unit,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
          quantity: item.quantity,
          discountAmount: item.discountAmount,
          totalAmount: item.totalAmount,
        })),
        subtotal,
        discountType,
        discountValue,
        discountAmount,
        taxAmount,
        grandTotal,
        paidAmount: numPaid,
        paymentMethod,
        notes,
        createdByName: user?.fullName || 'Cashier',
        createdById: user?.id,
      });

      if (res.success) {
        // Fetch full created invoice for printing
        const fullInvoice = await api.getInvoice(res.invoiceId);
        setCompletedInvoice(fullInvoice);
        setShowPrintModal(true);

        // Reset cart and inputs
        setCart([]);
        setDiscountValue(0);
        setPaidAmount('');
        setNotes('');

        // Refresh product stock counts
        const updatedProds = await api.getProducts();
        setProducts(updatedProds);
      }
    } catch (err: any) {
      setError(`Sale submission error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col lg:flex-row bg-slate-100/60 dark:bg-slate-950 overflow-hidden">
      {/* LEFT COLUMN: Product Catalog & Search */}
      <div className="flex-1 flex flex-col h-full overflow-hidden p-4 border-r border-slate-200 dark:border-slate-800">
        {/* Search & Category Filter */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products by name, SKU, or scan barcode..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Categories Horizontal Carousel */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const inCart = cart.find((i) => i.productId === p.id);
                const isOutOfStock = p.stockQuantity <= 0;

                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-blue-500 hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer group relative overflow-hidden"
                  >
                    {inCart && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white font-extrabold text-[10px] flex items-center justify-center shadow-xs">
                        {inCart.quantity}
                      </div>
                    )}

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-cyan-400">
                        {p.unit}
                      </span>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2 mt-0.5 group-hover:text-blue-600 transition-colors">
                        {p.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {p.sku}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {formatCurrency(p.sellingPrice)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isOutOfStock
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : p.stockQuantity <= p.lowStockThreshold
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {p.stockQuantity} in stock
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 stroke-1 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {products.length === 0 ? 'No products in database' : 'No matching products found'}
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                {products.length === 0
                  ? 'Your inventory starts empty. Go to Products & Stock to add your 19L Bottles, 1.5L bottles, or dispensers.'
                  : 'Try adjusting your search query or filter.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Active Cart & Fast Checkout */}
      <div className="w-full lg:w-[420px] xl:w-[460px] bg-white dark:bg-slate-900 flex flex-col h-full shadow-xl border-l border-slate-200 dark:border-slate-800">
        {/* Customer Header Box */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Customer Assignment
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsWalkIn(!isWalkIn)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  isWalkIn
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {isWalkIn ? '✓ Walk-in Cash Sale' : 'Walk-in Sale'}
              </button>
              <button
                onClick={() => setShowAddCustomerModal(true)}
                className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 hover:bg-blue-100 font-bold text-xs flex items-center gap-1 cursor-pointer"
                title="Add New Customer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>

          {!isWalkIn && (
            <div className="space-y-1.5">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">-- Choose Registered Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone}) - {c.category}
                  </option>
                ))}
              </select>

              {selectedCustomer && (
                <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-blue-900 dark:text-blue-100">{selectedCustomer.name}</span>
                    <p className="text-[10px] text-blue-700 dark:text-blue-300">
                      {selectedCustomer.phone} {selectedCustomer.address && `• ${selectedCustomer.address}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500">Udhaar Due:</span>
                    <p className={`font-extrabold ${selectedCustomer.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatCurrency(selectedCustomer.currentBalance)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {cart.length > 0 ? (
            cart.map((item) => (
              <div
                key={item.productId}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <h5 className="font-bold text-slate-800 dark:text-white truncate">
                    {item.productName}
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    {formatCurrency(item.unitPrice)} / {item.unit}
                  </p>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => updateQuantity(item.productId, -1)}
                    className="w-5 h-5 flex items-center justify-center font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-extrabold px-1 text-slate-900 dark:text-white min-w-[20px] text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, 1)}
                    className="w-5 h-5 flex items-center justify-center font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    +
                  </button>
                </div>

                {/* Item Total & Remove */}
                <div className="text-right flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white min-w-[60px]">
                    {formatCurrency(item.totalAmount)}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <ShoppingCart className="w-10 h-10 stroke-1 mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-semibold">Your cart is empty</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Click products on the left catalog to add to invoice
              </p>
            </div>
          )}
        </div>

        {/* Invoice Summary & Checkout Panel */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 space-y-3">
          {/* Discount & Payment Method */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Discount
              </label>
              <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                <input
                  type="number"
                  min="0"
                  value={discountValue || ''}
                  onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs text-slate-900 dark:text-white bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDiscountType(discountType === 'fixed' ? 'percent' : 'fixed')}
                  className="px-2 bg-slate-100 dark:bg-slate-700 font-bold text-[10px] text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  {discountType === 'fixed' ? settings.currencySymbol : '%'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card / POS</option>
                <option value="Mobile Wallet">JazzCash / Easypaisa</option>
                <option value="Credit">Credit (Udhaar)</option>
              </select>
            </div>
          </div>

          {/* Amount Paid Input & Quick Buttons */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Amount Paid
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={setExactPayment}
                  className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Full ({formatCurrency(grandTotal)})
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={setZeroPayment}
                  className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Credit (Rs 0)
                </button>
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                {settings.currencySymbol}
              </span>
              <input
                type="number"
                min="0"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={String(grandTotal)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="space-y-1 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Discount:</span>
                <span>- {formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
              <span>Grand Total:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Amount Paid:</span>
              <span className="font-bold">{formatCurrency(numPaid)}</span>
            </div>
            {balanceDue > 0 ? (
              <div className="flex justify-between text-rose-600 font-bold">
                <span>Remaining (Udhaar):</span>
                <span>{formatCurrency(balanceDue)}</span>
              </div>
            ) : changeReturn > 0 ? (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Change Return:</span>
                <span>{formatCurrency(changeReturn)}</span>
              </div>
            ) : null}
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCompleteSale}
            disabled={submitting || cart.length === 0}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-extrabold shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] disabled:opacity-50 cursor-pointer text-sm"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Receipt className="w-4 h-4" />
                <span>Save Sale & Generate Receipt</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* QUICK ADD CUSTOMER MODAL */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" /> Add New Customer
              </h3>
              <button
                onClick={() => setShowAddCustomerModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addCustomerError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{addCustomerError}</span>
              </div>
            )}

            <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  placeholder="e.g. Al-Madina Supermarket"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number *
                </label>
                <input
                  type="text"
                  required
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                  placeholder="e.g. +92 321 9876543"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newCustomerForm.category}
                    onChange={(e: any) =>
                      setNewCustomerForm({ ...newCustomerForm, category: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="Corporate">Corporate</option>
                    <option value="Residential">Residential</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Opening Balance ({settings.currencySymbol})
                  </label>
                  <input
                    type="number"
                    value={newCustomerForm.openingBalance || ''}
                    onChange={(e) =>
                      setNewCustomerForm({
                        ...newCustomerForm,
                        openingBalance: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Delivery Address
                </label>
                <input
                  type="text"
                  value={newCustomerForm.address}
                  onChange={(e) =>
                    setNewCustomerForm({ ...newCustomerForm, address: e.target.value })
                  }
                  placeholder="e.g. Shop # 4, Sector 5, North Karachi"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addCustomerLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {addCustomerLoading ? 'Saving...' : 'Save & Select Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT RECEIPT MODAL */}
      {showPrintModal && (
        <PrintReceiptModal
          invoice={completedInvoice}
          onClose={() => {
            setShowPrintModal(false);
            setCompletedInvoice(null);
          }}
        />
      )}
    </div>
  );
};
