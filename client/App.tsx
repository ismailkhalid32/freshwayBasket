import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { FirstTimeSetup } from './components/Auth/FirstTimeSetup';
import { LoginScreen } from './components/Auth/LoginScreen';
import { Sidebar, type ActiveTab } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { DashboardView } from './components/Dashboard/DashboardView';
import { POSView } from './components/POS/POSView';
import { CustomerLedgerView } from './components/Ledger/CustomerLedgerView';
import { CustomerListView } from './components/Customers/CustomerListView';
import { PaymentCollectionView } from './components/Payments/PaymentCollectionView';
import { InvoiceListView } from './components/Invoices/InvoiceListView';
import { ProductListView } from './components/Products/ProductListView';
import { SupplierListView } from './components/Suppliers/SupplierListView';
import { ExpenseListView } from './components/Expenses/ExpenseListView';
import { ReportsView } from './components/Reports/ReportsView';
import { SettingsView } from './components/Settings/SettingsView';
import { api } from './api/client';

function AppContent() {
  const { user, loading, needsSetup } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState<string | undefined>(undefined);

  // Refresh low stock alerts when user or active tab changes
  useEffect(() => {
    if (user) {
      api.getProducts({ lowStock: true })
        .then((prods) => setLowStockCount(prods.length))
        .catch(() => {});
    }
  }, [user, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-blue-200 tracking-wider uppercase">
          Initializing Freshway Water POS...
        </p>
      </div>
    );
  }

  // If brand new installation with 0 users, show Initial Setup
  if (needsSetup) {
    return <FirstTimeSetup />;
  }

  // If not logged in, show Login Screen
  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen flex bg-slate-100/70 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lowStockCount={lowStockCount}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'dashboard' && <DashboardView setActiveTab={setActiveTab} />}
          {activeTab === 'pos' && <POSView />}
          {activeTab === 'ledger' && (
            <CustomerLedgerView initialCustomerId={selectedLedgerCustomerId} />
          )}
          {activeTab === 'customers' && (
            <CustomerListView
              setActiveTab={setActiveTab}
              onSelectCustomerForLedger={(id) => {
                setSelectedLedgerCustomerId(id);
                setActiveTab('ledger');
              }}
            />
          )}
          {activeTab === 'payments' && <PaymentCollectionView />}
          {activeTab === 'invoices' && <InvoiceListView setActiveTab={setActiveTab} />}
          {activeTab === 'inventory' && <ProductListView />}
          {activeTab === 'suppliers' && <SupplierListView />}
          {activeTab === 'expenses' && <ExpenseListView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </AuthProvider>
  );
}
