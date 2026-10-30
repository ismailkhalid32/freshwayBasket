import React, { useState } from 'react';
import type { Invoice } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { FreshwayLogo } from '../Branding/FreshwayLogo';
import { Printer, X } from 'lucide-react';

interface PrintReceiptModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({ invoice, onClose }) => {
  const { settings, formatCurrency } = useSettings();
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('thermal');

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const invoiceDate = new Date(invoice.createdAt).toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Format:</span>
            <div className="inline-flex rounded-xl bg-slate-200 dark:bg-slate-700 p-1 text-xs font-semibold">
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  printFormat === 'thermal'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Thermal (80mm)
              </button>
              <button
                onClick={() => setPrintFormat('a4')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  printFormat === 'a4'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Standard A4
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 dark:bg-slate-950 flex justify-center">
          <div
            id="printable-receipt"
            className={`bg-white text-slate-900 shadow-lg rounded-2xl p-6 transition-all border border-slate-200 print:shadow-none print:border-none print:m-0 print:p-0 ${
              printFormat === 'thermal' ? 'max-w-[340px] w-full font-mono text-xs' : 'max-w-2xl w-full text-sm'
            }`}
          >
            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              <div className="flex justify-center mb-2">
                <FreshwayLogo
                  size={printFormat === 'thermal' ? 'sm' : 'md'}
                  showText={true}
                  customLogoUrl={settings.logoDataUrl}
                />
              </div>
              <p className="font-bold text-sm">{settings.businessName}</p>
              {settings.tagline && <p className="text-[11px] text-slate-600">{settings.tagline}</p>}
              <p className="text-[11px] text-slate-600 mt-1">{settings.address}</p>
              <p className="text-[11px] text-slate-600">Tel: {settings.phone}</p>
            </div>

            <div className="py-3 border-b border-dashed border-slate-300 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice #:</span>
                <span className="font-bold text-slate-900">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Date/Time:</span>
                <span>{invoiceDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cashier:</span>
                <span>{invoice.createdByName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Customer:</span>
                <span className="font-bold">{invoice.customerName}</span>
              </div>
              {invoice.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Phone:</span>
                  <span>{invoice.customerPhone}</span>
                </div>
              )}
              {invoice.customerAddress && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Address:</span>
                  <span className="text-right max-w-[180px] truncate">{invoice.customerAddress}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Status:</span>
                <span
                  className={`font-bold ${
                    invoice.paymentStatus === 'Paid'
                      ? 'text-emerald-700'
                      : invoice.paymentStatus === 'Partially Paid'
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  {invoice.paymentStatus.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="py-3 border-b border-dashed border-slate-300">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-600 font-bold">
                    <th className="py-1">Item</th>
                    <th className="py-1 text-center">Qty</th>
                    <th className="py-1 text-right">Price</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items && invoice.items.length > 0 ? (
                    invoice.items.map((item, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1 pr-1 font-medium">
                          {item.productName}
                          <div className="text-[9px] text-slate-600">{item.unit}</div>
                        </td>
                        <td className="py-1 text-center font-bold">{item.quantity}</td>
                        <td className="py-1 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-1 text-right font-bold">{formatCurrency(item.totalAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-2 text-center text-slate-400">
                        No item breakdown available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount:</span>
                  <span>- {formatCurrency(invoice.discountAmount)}</span>
                </div>
              )}
              {invoice.taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax:</span>
                  <span>+ {formatCurrency(invoice.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                <span>Grand Total:</span>
                <span>{formatCurrency(invoice.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Paid ({invoice.paymentMethod}):</span>
                <span className="font-bold">{formatCurrency(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-slate-200">
                <span className={invoice.balanceAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  Balance Due (Udhaar):
                </span>
                <span className={invoice.balanceAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {formatCurrency(invoice.balanceAmount)}
                </span>
              </div>
            </div>

            <div className="pt-4 text-center space-y-2">
              <div className="flex flex-col items-center">
                <div className="tracking-[0.3em] font-mono text-[10px] text-slate-500 font-bold uppercase">
                  *{invoice.invoiceNumber}*
                </div>
                <div className="h-7 w-48 bg-[repeating-linear-gradient(90deg,#000,#000_2px,transparent_2px,transparent_5px,#000_5px,#000_8px,transparent_8px,transparent_10px)] opacity-75 my-1" />
              </div>
              <p className="text-[10px] text-slate-500 italic max-w-xs mx-auto">
                {settings.receiptFooter || 'Thank you for choosing Freshway Water! Clean & Pure Water.'}
              </p>
              <p className="text-[9px] text-slate-400">
                Computer Generated Invoice • Software: Freshway POS
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
