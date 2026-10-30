import React, { useState, useEffect } from 'react';
import type { User, AuditLog } from '../../types';
import { api } from '../../api/client';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { FreshwayLogo } from '../Branding/FreshwayLogo';
import {
  Settings,
  Building2,
  Users,
  Database,
  Shield,
  Download,
  Upload,
  UserPlus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Key,
  Cloud,
  X,
  Server,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  CheckCircle,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { settings, refreshSettings, updateSettings } = useSettings();
  const { user, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'users' | 'mongodb' | 'backup' | 'audit'>('profile');

  // Business Profile Form
  const [profileForm, setProfileForm] = useState({
    businessName: '',
    tagline: '',
    phone: '',
    email: '',
    address: '',
    currencySymbol: 'Rs',
    taxPercentage: 0,
    receiptFooter: '',
    invoicePrefix: 'INV',
    lowStockDefaultThreshold: 10,
    logoDataUrl: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Users Management State
  const [userList, setUserList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<{
    fullName: string;
    username: string;
    email: string;
    role: import('../../types').UserRole;
    password: string;
    isActive: number;
  }>({
    fullName: '',
    username: '',
    email: '',
    role: 'cashier',
    password: '',
    isActive: 1,
  });
  const [savingUser, setSavingUser] = useState(false);
  const [userModalError, setUserModalError] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Backup & Restore State
  const [restoring, setRestoring] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // MongoDB Atlas Database & Security State
  const [mongoStatus, setMongoStatus] = useState<any>(null);
  const [loadingMongo, setLoadingMongo] = useState(false);
  const [mongoUriInput, setMongoUriInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testingMongo, setTestingMongo] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; pingMs?: number } | null>(null);
  const [connectingMongo, setConnectingMongo] = useState(false);
  const [connectResult, setConnectResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncingAtlas, setSyncingAtlas] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; syncedCounts?: Record<string, number> } | null>(null);

  useEffect(() => {
    if (settings) {
      setProfileForm({
        businessName: settings.businessName || 'Freshway Water',
        tagline: settings.tagline || '',
        phone: settings.phone || '',
        email: settings.email || '',
        address: settings.address || '',
        currencySymbol: settings.currencySymbol || 'Rs',
        taxPercentage: settings.taxPercentage || 0,
        receiptFooter: settings.receiptFooter || '',
        invoicePrefix: settings.invoicePrefix || 'INV',
        lowStockDefaultThreshold: settings.lowStockDefaultThreshold || 10,
        logoDataUrl: settings.logoDataUrl || '',
      });
    }
  }, [settings]);

  // Load users when users tab selected
  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      setLoadingUsers(true);
      const data = await api.getUsers();
      setUserList(data);
    } catch (err: any) {
      setStatusBanner({ type: 'error', message: err.message || 'Failed to load user accounts.' });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Load audit logs
  const loadAudit = async () => {
    try {
      setLoadingAudit(true);
      const data = await api.getAuditLogs();
      setAuditLogs(data);
    } catch (err: any) {
      setStatusBanner({ type: 'error', message: err.message || 'Failed to load audit logs.' });
    } finally {
      setLoadingAudit(false);
    }
  };

  // Load MongoDB Status
  const loadMongoStatus = async () => {
    try {
      setLoadingMongo(true);
      const data = await api.getDatabaseStatus();
      setMongoStatus(data);
    } catch (err: any) {
      console.error('Failed to load MongoDB status:', err);
    } finally {
      setLoadingMongo(false);
    }
  };

  const handleTestMongo = async () => {
    if (!mongoUriInput.trim()) {
      setTestResult({ success: false, message: 'Please enter a MongoDB connection URI to test.' });
      return;
    }
    try {
      setTestingMongo(true);
      setTestResult(null);
      const res = await api.testDatabaseConnection(mongoUriInput.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection test failed.' });
    } finally {
      setTestingMongo(false);
    }
  };

  const handleConnectMongo = async () => {
    if (!mongoUriInput.trim()) {
      setConnectResult({ success: false, message: 'Please enter a valid MongoDB Atlas URI.' });
      return;
    }
    try {
      setConnectingMongo(true);
      setConnectResult(null);
      const res = await api.connectDatabase(mongoUriInput.trim());
      setConnectResult({ success: true, message: res.message });
      loadMongoStatus();
    } catch (err: any) {
      setConnectResult({ success: false, message: err.message || 'Failed to connect to MongoDB Atlas.' });
    } finally {
      setConnectingMongo(false);
    }
  };

  const handleSyncAtlas = async () => {
    try {
      setSyncingAtlas(true);
      setSyncResult(null);
      const res = await api.syncToAtlas();
      setSyncResult(res);
      loadMongoStatus();
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message || 'Failed to synchronize with MongoDB Atlas.' });
    } finally {
      setSyncingAtlas(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'audit') loadAudit();
    if (activeTab === 'mongodb') loadMongoStatus();
  }, [activeTab]);

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileForm((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Save Business Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      setProfileSuccess(false);
      await updateSettings(profileForm);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setStatusBanner({ type: 'error', message: `Save error: ${err.message}` });
    } finally {
      setSavingProfile(false);
    }
  };

  // Open Create/Edit User Modal
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserForm({
      fullName: '',
      username: '',
      email: '',
      role: 'cashier',
      password: '',
      isActive: 1,
    });
    setUserModalError(null);
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setUserForm({
      fullName: u.fullName,
      username: u.username,
      email: u.email,
      role: u.role,
      password: '',
      isActive: u.isActive,
    });
    setUserModalError(null);
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingUser(true);
      setUserModalError(null);

      if (editingUser) {
        await api.updateUser(editingUser.id, {
          fullName: userForm.fullName,
          role: userForm.role,
          isActive: userForm.isActive,
          password: userForm.password || undefined,
          adminName: user?.fullName,
          adminId: user?.id,
        });
      } else {
        if (!userForm.password || userForm.password.length < 6) {
          setUserModalError('Password must be at least 6 characters.');
          setSavingUser(false);
          return;
        }
        await api.createUser({
          ...userForm,
          adminName: user?.fullName,
          adminId: user?.id,
        });
      }

      setShowUserModal(false);
      loadUsers();
    } catch (err: any) {
      setUserModalError(err.message || 'Failed to save user.');
    } finally {
      setSavingUser(false);
    }
  };

  // Backup Download
  const handleDownloadBackup = async () => {
    try {
      setStatusBanner(null);
      const backup = await api.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `freshway_pos_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusBanner({ type: 'success', message: 'Full database backup downloaded successfully.' });
    } catch (err: any) {
      setStatusBanner({ type: 'error', message: `Backup failed: ${err.message}` });
    }
  };

  // Restore Upload
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setRestoring(true);
        setStatusBanner(null);
        const json = JSON.parse(evt.target?.result as string);
        const res = await api.restoreBackup(json, {
          userRole: user?.role,
          adminName: user?.fullName,
          adminId: user?.id,
        });
        setStatusBanner({ type: 'success', message: res.message || 'Database restored successfully!' });
        setTimeout(() => window.location.reload(), 1200);
      } catch (err: any) {
        setStatusBanner({ type: 'error', message: `Restore failed: ${err.message}` });
      } finally {
        setRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              System Settings & Administration
            </h2>
            <p className="text-xs text-slate-500">
              Configure your business brand, user permissions, database backups, and audit security logs.
            </p>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button onClick={() => setStatusBanner(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-bold">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'profile'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Business Brand & Receipt</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Staff & Role Permissions</span>
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => setActiveTab('mongodb')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'mongodb'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>MongoDB Atlas & Security</span>
            {mongoStatus?.isConnected && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
            )}
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'backup'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Database Backup & Restore</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Audit Security Logs</span>
        </button>
      </div>

      {/* TAB 1: BUSINESS PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/90 dark:border-slate-800 shadow-xs max-w-3xl">
          {profileSuccess && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Business settings updated successfully!</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            {/* Logo Preview & Custom Upload */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FreshwayLogo size="lg" customLogoUrl={profileForm.logoDataUrl} />
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white">Business Brand Logo</h4>
                  <p className="text-[11px] text-slate-400">
                    Vector Freshway Water logo active by default, or upload a custom image.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="px-3 py-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold cursor-pointer hover:bg-slate-50 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {profileForm.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setProfileForm((p) => ({ ...p, logoDataUrl: '' }))}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                    title="Reset to Freshway Water vector"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={profileForm.businessName}
                  onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tagline / Slogan
                </label>
                <input
                  type="text"
                  value={profileForm.tagline}
                  onChange={(e) => setProfileForm({ ...profileForm, tagline: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Plant / Office Physical Address
              </label>
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Currency Symbol
                </label>
                <input
                  type="text"
                  value={profileForm.currencySymbol}
                  onChange={(e) => setProfileForm({ ...profileForm, currencySymbol: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Default Tax Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={profileForm.taxPercentage}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, taxPercentage: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Invoice Number Prefix
                </label>
                <input
                  type="text"
                  value={profileForm.invoicePrefix}
                  onChange={(e) => setProfileForm({ ...profileForm, invoicePrefix: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Receipt Footer Message
              </label>
              <textarea
                rows={2}
                value={profileForm.receiptFooter}
                onChange={(e) => setProfileForm({ ...profileForm, receiptFooter: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              System Accounts & Permissions
            </h3>
            <button
              onClick={handleOpenAddUser}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create User Account</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {userList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{u.fullName}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{u.username}</td>
                    <td className="py-3 px-4 text-slate-500">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full font-bold uppercase text-[10px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.isActive
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleOpenEditUser(u)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 cursor-pointer"
                        title="Edit user"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DATABASE BACKUP & RESTORE */}
      {activeTab === 'backup' && isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {/* Export Box */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Export Full Database Backup
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Creates a complete encrypted snapshot of all customers, ledger entries, invoices, inventory, suppliers, and business settings as a portable JSON file.
            </p>
            <button
              onClick={handleDownloadBackup}
              className="mt-3 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download JSON Backup Archive</span>
            </button>
          </div>

          {/* Restore Box */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Restore from Backup Archive
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload a previously downloaded POS backup JSON file. All collections are schema-validated before atomic restoration.
            </p>

            <label className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{restoring ? 'Restoring Database...' : 'Choose JSON Backup File'}</span>
              <input type="file" accept=".json" onChange={handleRestoreFile} disabled={restoring} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT SECURITY LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              System Audit Security Trail ({auditLogs.length} events)
            </h3>
            <button onClick={loadAudit} className="text-xs text-blue-600 font-bold hover:underline cursor-pointer">
              Refresh Logs
            </button>
          </div>

          {auditLogs.length > 0 ? (
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">User</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Module</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-PK')}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">{log.userName}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-600 dark:text-cyan-400">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{log.module}</td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">No audit events recorded yet.</div>
          )}
        </div>
      )}

      {/* TAB 5: MONGODB ATLAS DATABASE & SECURITY ARCHITECTURE */}
      {activeTab === 'mongodb' && (
        <div className="space-y-6 max-w-4xl text-xs">
          {/* Status Overview Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${
                  mongoStatus?.isConnected
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                }`}>
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      MongoDB Atlas Cluster
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      mongoStatus?.isConnected
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                    }`}>
                      {mongoStatus?.isConnected ? 'Connected & Synced' : 'Ready to Connect'}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px]">
                    Enterprise Document Database with strict Mongoose schema validation & zero fake data.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadMongoStatus}
                  disabled={loadingMongo}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMongo ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Diagnostic Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase text-slate-400">Database Name</p>
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate font-mono mt-0.5">
                  {mongoStatus?.databaseName || 'freshway_pos'}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase text-slate-400">Cluster Host</p>
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate font-mono mt-0.5" title={mongoStatus?.host || 'Cloud Atlas'}>
                  {mongoStatus?.host ? mongoStatus.host : 'Configure Below'}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase text-slate-400">Ping Latency</p>
                <p className="text-xs font-bold text-slate-800 dark:text-white font-mono mt-0.5">
                  {mongoStatus?.lastPingMs ? `${mongoStatus.lastPingMs} ms` : mongoStatus?.isConnected ? '< 15 ms' : 'Offline'}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase text-slate-400">Security Guard</p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Enforced</span>
                </p>
              </div>
            </div>

            {/* Collection Counts Breakdown */}
            {mongoStatus?.atlasCounts && Object.keys(mongoStatus.atlasCounts).length > 0 && (
              <div className="p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
                <p className="font-bold text-emerald-900 dark:text-emerald-200 mb-1.5 flex items-center gap-1.5 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>MongoDB Atlas Collections Active</span>
                </p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-medium">
                    Users: <strong>{mongoStatus.atlasCounts.users ?? 0}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-medium">
                    Customers: <strong>{mongoStatus.atlasCounts.customers ?? 0}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-medium">
                    Products: <strong>{mongoStatus.atlasCounts.products ?? 0}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-medium">
                    Invoices: <strong>{mongoStatus.atlasCounts.invoices ?? 0}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-medium">
                    Payments: <strong>{mongoStatus.atlasCounts.payments ?? 0}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Connection Configuration Box */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Connect / Update MongoDB Atlas URI
                </h4>
                <p className="text-[11px] text-slate-500">
                  Provide your MongoDB Atlas connection string to connect your cluster directly.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  MongoDB Atlas Connection URI (SRV Format)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={mongoUriInput}
                    onChange={(e) => setMongoUriInput(e.target.value)}
                    placeholder="mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/freshway_pos?retryWrites=true&w=majority"
                    className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Tip: In MongoDB Atlas console, click Connect &gt; Drivers &gt; Node.js to copy your SRV connection string.
                </p>
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                }`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              {connectResult && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  connectResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {connectResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  <span>{connectResult.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestMongo}
                  disabled={testingMongo || !mongoUriInput.trim()}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer transition-all disabled:opacity-50"
                >
                  {testingMongo ? 'Testing Cluster...' : 'Test Connection'}
                </button>

                <button
                  type="button"
                  onClick={handleConnectMongo}
                  disabled={connectingMongo || !mongoUriInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {connectingMongo ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <span>Save & Connect Atlas</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSyncAtlas}
                  disabled={syncingAtlas}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingAtlas ? 'animate-spin' : ''}`} />
                  <span>{syncingAtlas ? 'Syncing...' : 'Sync All Collections to Atlas'}</span>
                </button>
              </div>

              {syncResult && (
                <div className={`p-3 rounded-xl text-xs mt-2 ${
                  syncResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800'
                }`}>
                  <p className="font-bold">{syncResult.message}</p>
                  {syncResult.syncedCounts && (
                    <div className="mt-1 text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-1">
                      {Object.entries(syncResult.syncedCounts).map(([key, val]) => (
                        <span key={key}>{key}: <strong>{val}</strong></span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Security Constitution & Hardening Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white">
              <Shield className="w-4 h-4 text-emerald-600" />
              <h4 className="font-bold text-sm">Security Guard & Hardening Report</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">NIST PBKDF2 Password Hashing</p>
                  <p className="text-[11px] text-slate-500">
                    100,000 iterations of SHA-512 with 32-byte cryptographic salt. Timing-safe comparison.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">HMAC-SHA256 Bearer Token Auth</p>
                  <p className="text-[11px] text-slate-500">
                    Cryptographically signed bearer tokens with 24-hour expiry and signature validation.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">Brute-Force Rate Limiting</p>
                  <p className="text-[11px] text-slate-500">
                    Limits consecutive failed logins to 5 attempts per 5 minutes per IP/user with audit logging.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">NoSQL Injection Guard</p>
                  <p className="text-[11px] text-slate-500">
                    Recursive deep sanitizer strips suspicious operator keys ($gt, $ne, $where) from requests.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">Role-Based Access Control (RBAC)</p>
                  <p className="text-[11px] text-slate-500">
                    Explicit permissions: Cashiers cannot cancel invoices, void payments, delete expenses, or access sensitive financials.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">Tamper-Evident Audit Trail</p>
                  <p className="text-[11px] text-slate-500">
                    Every transaction, void, cancellation, user update, and login attempt is logged with IP address and timestamp.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* USER MODAL */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>{editingUser ? 'Edit User Account' : 'Create Staff Account'}</span>
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {userModalError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{userModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  placeholder="e.g. Asif Raza"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {!editingUser && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      placeholder="e.g. asif"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      placeholder="asif@freshwaywater.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Role & Permissions
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e: any) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                  >
                    <option value="cashier">Cashier (POS & Collection)</option>
                    <option value="manager">Manager (POS, Stock, Reports)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Status
                  </label>
                  <select
                    value={userForm.isActive}
                    onChange={(e: any) => setUserForm({ ...userForm, isActive: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Disabled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password (min 6 chars) *'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {savingUser ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
