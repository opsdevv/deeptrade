'use client';

import { useState, useEffect } from 'react';

interface DerivAccount {
  id: string;
  account_name: string;
  broker: string;
  server: string;
  login_id?: string;
  account_type: 'real' | 'demo';
  account_id: string | null;
  balance: number | null;
  currency: string;
  is_active: boolean;
  is_selected: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface MT5Account {
  id: string;
  account_name: string;
  broker: string;
  server: string;
  login_id?: string;
  account_type: 'real' | 'demo';
  account_id: string | null;
  balance: number | null;
  currency: string;
  is_active: boolean;
  is_selected: boolean;
  last_login_at: string | null;
  created_at: string;
}

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [mt5Accounts, setMt5Accounts] = useState<MT5Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editingMt5Account, setEditingMt5Account] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<'deriv' | 'mt5'>('deriv');
  const [formData, setFormData] = useState({
    account_name: '',
    broker: 'Deriv',
    server: 'demo',
    login_id: '',
    password: '',
    account_type: 'demo' as 'real' | 'demo',
    api_token: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadAccounts();
    loadMt5Accounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const response = await fetch('/api/deriv/auth');
      const data = await response.json();
      if (data.success) {
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error loading Deriv accounts:', error);
    }
  };

  const loadMt5Accounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/mt5/accounts');
      const data = await response.json();
      if (data.success) {
        setMt5Accounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error loading MT5 accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const endpoint = accountType === 'deriv' ? '/api/deriv/auth' : '/api/mt5/accounts';
      const accountId = accountType === 'deriv' ? editingAccount : editingMt5Account;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          account_id: accountId || null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: accountId ? 'Account updated successfully!' : `${accountType === 'deriv' ? 'Deriv' : 'MT5'} account added successfully!` });
        setFormData({
          account_name: '',
          broker: accountType === 'deriv' ? 'Deriv' : '',
          server: 'demo',
          login_id: '',
          password: '',
          account_type: 'demo',
          api_token: '',
        });
        setEditingAccount(null);
        setEditingMt5Account(null);
        loadAccounts();
        loadMt5Accounts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to connect account' });
      }
    } catch (error: any) {
      console.error('Error connecting account:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to connect account' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account: DerivAccount | MT5Account, type: 'deriv' | 'mt5') => {
    setAccountType(type);
    setFormData({
      account_name: account.account_name,
      broker: account.broker,
      server: account.server,
      login_id: account.login_id || '',
      password: '', // Don't pre-fill password
      account_type: account.account_type,
      api_token: '', // Don't pre-fill API token for security
    });
    if (type === 'deriv') {
      setEditingAccount(account.id);
      setEditingMt5Account(null);
    } else {
      setEditingMt5Account(account.id);
      setEditingAccount(null);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this account?')) {
      return;
    }

    try {
      const response = await fetch(`/api/deriv/auth?account_id=${accountId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Account deleted successfully' });
        loadAccounts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete account' });
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to delete account' });
    }
  };

  const handleSelectAccount = async (accountId: string, type: 'deriv' | 'mt5') => {
    try {
      const endpoint = type === 'deriv' ? '/api/deriv/auth' : '/api/mt5/accounts';
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ account_id: accountId }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: `${type === 'deriv' ? 'Deriv' : 'MT5'} account selected successfully` });
        loadAccounts();
        loadMt5Accounts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to select account' });
      }
    } catch (error: any) {
      console.error('Error selecting account:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to select account' });
    }
  };

  const handleDeleteMt5Account = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this MT5 account?')) {
      return;
    }

    try {
      const response = await fetch(`/api/mt5/accounts?account_id=${accountId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'MT5 account deleted successfully' });
        loadMt5Accounts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete account' });
      }
    } catch (error: any) {
      console.error('Error deleting MT5 account:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to delete account' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Manage your Deriv and MT5 trading accounts</p>
        </div>

        {/* Add/Edit Account Form */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              {editingAccount || editingMt5Account ? 'Edit Account' : 'Add New Trading Account'}
            </h2>
            {!editingAccount && !editingMt5Account && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAccountType('deriv');
                    setFormData({
                      account_name: '',
                      broker: 'Deriv',
                      server: 'demo',
                      login_id: '',
                      password: '',
                      account_type: 'demo',
                      api_token: '',
                    });
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    accountType === 'deriv'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Deriv
                </button>
                <button
                  onClick={() => {
                    setAccountType('mt5');
                    setFormData({
                      account_name: '',
                      broker: '',
                      server: '',
                      login_id: '',
                      password: '',
                      account_type: 'demo',
                      api_token: '',
                    });
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    accountType === 'mt5'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  MT5
                </button>
              </div>
            )}
          </div>
          
          {message && (
            <div
              className={`mb-4 p-4 rounded ${
                message.type === 'success'
                  ? 'bg-green-900/50 border border-green-700 text-green-200'
                  : 'bg-red-900/50 border border-red-700 text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Account Name
              </label>
              <input
                type="text"
                value={formData.account_name}
                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                required
                placeholder="e.g., My Demo Account"
                className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Broker
                </label>
                <input
                  type="text"
                  value={formData.broker}
                  onChange={(e) => setFormData({ ...formData, broker: e.target.value })}
                  required
                  placeholder={accountType === 'deriv' ? 'e.g., Deriv' : 'e.g., IC Markets, FXTM'}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Server
                </label>
                <input
                  type="text"
                  value={formData.server}
                  onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                  required
                  placeholder={accountType === 'deriv' ? 'e.g., demo, real, Deriv-Demo' : 'e.g., ICMarkets-Demo, FXTM-Demo'}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Account Type
              </label>
              <select
                value={formData.account_type}
                onChange={(e) => setFormData({ ...formData, account_type: e.target.value as 'real' | 'demo' })}
                className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="demo">Demo Account</option>
                <option value="real">Real Account</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Login ID
                </label>
                <input
                  type="text"
                  value={formData.login_id}
                  onChange={(e) => setFormData({ ...formData, login_id: e.target.value })}
                  required
                  placeholder="Your trading account login ID"
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingAccount && !editingMt5Account}
                  placeholder={(editingAccount || editingMt5Account) ? "Leave blank to keep current" : "Your trading account password"}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {accountType === 'deriv' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API Token <span className="text-yellow-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.api_token}
                  onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
                  required={!editingAccount}
                  placeholder={editingAccount ? "Leave blank to keep current" : "Your Deriv API token (required for trading)"}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Get your API token from <a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Deriv API Token Manager</a>
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !formData.account_name || !formData.broker || !formData.server || !formData.login_id || (!formData.password && !editingAccount && !editingMt5Account) || (accountType === 'deriv' && !formData.api_token && !editingAccount)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                {saving ? 'Connecting...' : (editingAccount || editingMt5Account) ? 'Update Account' : 'Add Account'}
              </button>
              {(editingAccount || editingMt5Account) && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccount(null);
                    setEditingMt5Account(null);
        setFormData({
          account_name: '',
          broker: accountType === 'deriv' ? 'Deriv' : '',
          server: 'demo',
          login_id: '',
          password: '',
          account_type: 'demo',
          api_token: '',
        });
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Deriv Accounts */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Deriv Accounts</h2>
          
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-gray-400">No Deriv accounts added yet</p>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`bg-gray-700 rounded-lg p-4 border ${
                    account.is_selected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-medium text-lg">
                          {account.account_name}
                        </span>
                        {account.is_selected && (
                          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded font-medium">
                            SELECTED
                          </span>
                        )}
                        <span className={`px-2 py-1 text-white text-xs rounded ${
                          account.account_type === 'real' ? 'bg-red-600' : 'bg-green-600'
                        }`}>
                          {account.account_type.toUpperCase()}
                        </span>
                        {account.is_active && (
                          <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-300">
                        <div>
                          <span className="text-gray-400">Broker:</span> {account.broker}
                        </div>
                        <div>
                          <span className="text-gray-400">Server:</span> {account.server}
                        </div>
                        <div>
                          <span className="text-gray-400">Login:</span> {account.login_id}
                        </div>
                        {account.account_id && (
                          <div>
                            <span className="text-gray-400">Account ID:</span> {account.account_id}
                          </div>
                        )}
                      </div>
                      {account.balance !== null && (
                        <p className="text-sm text-gray-300 mt-2">
                          <span className="text-gray-400">Balance:</span>{' '}
                          <span className="font-medium text-white">
                            {account.balance.toFixed(2)} {account.currency}
                          </span>
                        </p>
                      )}
                      {account.last_login_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last login: {new Date(account.last_login_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {!account.is_selected && (
                        <button
                          onClick={() => handleSelectAccount(account.id, 'deriv')}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-3 rounded transition whitespace-nowrap"
                        >
                          Select
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(account, 'deriv')}
                        className="bg-gray-600 hover:bg-gray-700 text-white text-xs py-1 px-3 rounded transition whitespace-nowrap"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(account.id)}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-3 rounded transition whitespace-nowrap"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MT5 Accounts */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">MT5 Accounts</h2>
          
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
            </div>
          ) : mt5Accounts.length === 0 ? (
            <p className="text-gray-400">No MT5 accounts added yet</p>
          ) : (
            <div className="space-y-3">
              {mt5Accounts.map((account) => (
                <div
                  key={account.id}
                  className={`bg-gray-700 rounded-lg p-4 border ${
                    account.is_selected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-medium text-lg">
                          {account.account_name}
                        </span>
                        {account.is_selected && (
                          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded font-medium">
                            SELECTED
                          </span>
                        )}
                        <span className={`px-2 py-1 text-white text-xs rounded ${
                          account.account_type === 'real' ? 'bg-red-600' : 'bg-green-600'
                        }`}>
                          {account.account_type.toUpperCase()}
                        </span>
                        {account.is_active && (
                          <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-300">
                        <div>
                          <span className="text-gray-400">Broker:</span> {account.broker}
                        </div>
                        <div>
                          <span className="text-gray-400">Server:</span> {account.server}
                        </div>
                        <div>
                          <span className="text-gray-400">Login:</span> {account.login_id}
                        </div>
                        {account.account_id && (
                          <div>
                            <span className="text-gray-400">Account ID:</span> {account.account_id}
                          </div>
                        )}
                      </div>
                      {account.balance !== null && (
                        <p className="text-sm text-gray-300 mt-2">
                          <span className="text-gray-400">Balance:</span>{' '}
                          <span className="font-medium text-white">
                            {account.balance.toFixed(2)} {account.currency}
                          </span>
                        </p>
                      )}
                      {account.last_login_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last login: {new Date(account.last_login_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {!account.is_selected && (
                        <button
                          onClick={() => handleSelectAccount(account.id, 'mt5')}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-3 rounded transition whitespace-nowrap"
                        >
                          Select
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(account, 'mt5')}
                        className="bg-gray-600 hover:bg-gray-700 text-white text-xs py-1 px-3 rounded transition whitespace-nowrap"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMt5Account(account.id)}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-3 rounded transition whitespace-nowrap"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
