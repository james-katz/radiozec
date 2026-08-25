import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface AdminState {
  token: string;
  isLoggedIn: boolean;
}

interface Stats {
  totalDonations: string;
  donationCount: number;
  queueLength: number;
  viewers: number;
  chartData: { date: string; total: number; count: number }[];
  currentItem: any;
}

interface ConfigValues {
  queueVideoPrice: number;
  skipVideoPrice: number;
}

interface JingleFile {
  name: string;
  path: string;
  size: number;
  addedAt: string;
}

interface LiveStatus {
  isLive: boolean;
  hlsUrl: string | null;
  startedAt: string | null;
  mediamtxAlive: boolean;
  streamActive: boolean;
}

const API_BASE = '/api/admin';
const AUTH_STORAGE_KEY = 'radiozec_admin_auth';
const AUTH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Read stored auth from localStorage, verify it hasn't expired */
function loadStoredAuth(): AdminState {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { token: '', isLoggedIn: false };
    const { token, savedAt } = JSON.parse(raw);
    if (!token || !savedAt) return { token: '', isLoggedIn: false };
    // Check TTL
    if (Date.now() - savedAt > AUTH_TTL_MS) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return { token: '', isLoggedIn: false };
    }
    return { token, isLoggedIn: true };
  } catch {
    return { token: '', isLoggedIn: false };
  }
}

function saveAuth(token: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, savedAt: Date.now() }));
}

function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export default function AdminPage() {
  const [auth, setAuth] = useState<AdminState>(loadStoredAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [config, setConfig] = useState<ConfigValues | null>(null);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [jingles, setJingles] = useState<JingleFile[]>([]);
  const [uploadingJingle, setUploadingJingle] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [liveToggling, setLiveToggling] = useState(false);

  // ── Login ──

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json();
      setAuth({ token: data.token, isLoggedIn: true });
      saveAuth(data.token);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.token}`,
  });

  // ── Fetch data ──

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    const fetchAll = async () => {
      try {
        const [statsRes, configRes, queueRes, jinglesRes, liveRes] = await Promise.all([
          fetch(`${API_BASE}/stats`, { headers: authHeaders() }),
          fetch(`${API_BASE}/config`, { headers: authHeaders() }),
          fetch(`${API_BASE}/queue`, { headers: authHeaders() }),
          fetch(`${API_BASE}/jingles`, { headers: authHeaders() }),
          fetch(`${API_BASE}/live/status`, { headers: authHeaders() }),
        ]);

        // If token is rejected by server, log out
        if (statsRes.status === 401 || configRes.status === 401) {
          clearAuth();
          setAuth({ token: '', isLoggedIn: false });
          return;
        }

        setStats(await statsRes.json());
        setConfig(await configRes.json());
        const qData = await queueRes.json();
        setQueueItems(qData.queue || []);
        const jData = await jinglesRes.json();
        setJingles(jData.jingles || []);
        setLiveStatus(await liveRes.json());
      } catch (err) {
        console.error('Failed to fetch admin data:', err);
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [auth.isLoggedIn]);

  // ── Actions ──

  const handleSkip = async () => {
    await fetch(`${API_BASE}/skip`, { method: 'POST', headers: authHeaders() });
  };

  const handleRemoveFromQueue = async (id: string) => {
    await fetch(`${API_BASE}/queue/${id}`, { method: 'DELETE', headers: authHeaders() });
  };

  const handleUpdateConfig = async () => {
    if (!config) return;
    await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(config),
    });
  };

  const handleUploadJingle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingJingle(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/jingles/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
        body: formData,
      });
      if (res.ok) {
        // Refresh jingles list
        const jRes = await fetch(`${API_BASE}/jingles`, { headers: authHeaders() });
        const jData = await jRes.json();
        setJingles(jData.jingles || []);
      }
    } catch (err) {
      console.error('Jingle upload failed:', err);
    } finally {
      setUploadingJingle(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleDeleteJingle = async (name: string) => {
    if (!confirm(`Delete jingle "${name}"?`)) return;
    try {
      await fetch(`${API_BASE}/jingles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setJingles((prev) => prev.filter((j) => j.name !== name));
    } catch (err) {
      console.error('Jingle delete failed:', err);
    }
  };

  const handleToggleLive = async () => {
    setLiveToggling(true);
    try {
      const endpoint = liveStatus?.isLive ? 'live/stop' : 'live/start';
      const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.state) {
        setLiveStatus((prev) => prev ? { ...prev, ...data.state } : prev);
      }
      // Refresh full status
      const statusRes = await fetch(`${API_BASE}/live/status`, { headers: authHeaders() });
      setLiveStatus(await statusRes.json());
    } catch (err) {
      console.error('Live toggle failed:', err);
    } finally {
      setLiveToggling(false);
    }
  };

  // ── Login Screen ──

  if (!auth.isLoggedIn) {
    return (
      <div className="h-full flex items-center justify-center bg-base-950">
        <div className="glass-card p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <span className="text-3xl">📻</span>
            <h1 className="text-xl font-bold mt-2">
              <span className="text-gold-400">Zec</span>
              <span className="text-base-100">Radio</span>
              <span className="text-base-400 text-sm ml-2">Admin</span>
            </h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full bg-base-800 text-sm text-base-100 px-4 py-3 rounded-lg border border-base-600 focus:border-gold-500 focus:outline-none"
              autoFocus
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-base-800 text-sm text-base-100 px-4 py-3 rounded-lg border border-base-600 focus:border-gold-500 focus:outline-none"
            />
            {loginError && <p className="text-xs text-rose-400">{loginError}</p>}
            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 text-base-950 font-bold text-sm hover:from-gold-500 hover:to-gold-400 transition-all active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard ──

  return (
    <div className="h-full overflow-y-auto bg-base-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📻</span>
            <h1 className="text-xl font-bold">
              <span className="text-gold-400">Zec</span>
              <span className="text-base-100">Radio</span>
              <span className="text-base-400 text-sm ml-2">Dashboard</span>
            </h1>
          </div>
          <a href="/" className="text-xs text-base-400 hover:text-base-200 transition-colors">
            ← Back to radio
          </a>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Donations"
            value={`${stats?.totalDonations || '0'} ZEC`}
            icon="💰"
            color="gold"
          />
          <StatCard
            label="Donation Count"
            value={String(stats?.donationCount || 0)}
            icon="📦"
            color="purple"
          />
          <StatCard
            label="Queue Length"
            value={String(stats?.queueLength || 0)}
            icon="🎵"
            color="emerald"
          />
          <StatCard
            label="Viewers"
            value={String(stats?.viewers || 0)}
            icon="👥"
            color="rose"
          />
        </div>

        {/* Chart */}
        <div className="glass-card p-6">
          <h2 className="text-base font-semibold text-base-200 mb-4">Donations Over Time</h2>
          {stats?.chartData && stats.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={stats.chartData}>
                <defs>
                  <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f4b728" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f4b728" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d42" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8b90a8', fontSize: 11 }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={{ fill: '#8b90a8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: '#161822',
                    border: '1px solid #2a2d42',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#b8bcd0' }}
                />
                <Area type="monotone" dataKey="total" stroke="#f4b728" fill="url(#goldGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-base-500 text-center py-12">No donation data yet</p>
          )}
        </div>

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Streaming Controls */}
          <div className={`glass-card p-6 space-y-4 ${liveStatus?.isLive ? 'ring-1 ring-rose-500/50' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-base-200">🔴 Live Streaming</h2>
              {liveStatus?.mediamtxAlive ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">MediaMTX Online</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-base-700 text-base-400 border border-base-600">MediaMTX Offline</span>
              )}
            </div>

            {/* Stream status */}
            <div className="p-3 rounded-lg bg-base-800/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-base-400">Status</span>
                <span className={liveStatus?.isLive ? 'text-rose-400 font-medium' : 'text-base-500'}>
                  {liveStatus?.isLive ? '🔴 LIVE' : '⚪ Offline'}
                </span>
              </div>
              {liveStatus?.streamActive && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-400">OBS Stream</span>
                  <span className="text-emerald-400">Connected</span>
                </div>
              )}
              {liveStatus?.startedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-400">Started</span>
                  <span className="text-base-300">{new Date(liveStatus.startedAt).toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            {/* OBS instructions */}
            {!liveStatus?.isLive && (
              <div className="text-xs text-base-500 space-y-1.5 p-3 rounded-lg bg-base-800/30 border border-base-700/50">
                <p className="text-base-400 font-medium mb-1">OBS Settings:</p>
                <div className="flex items-center justify-between">
                  <span>Server:</span>
                  <code className="text-gold-400 select-all">{`rtmp://${window.location.hostname}:1935`}</code>
                </div>
                <div className="flex items-center justify-between">
                  <span>Stream Key:</span>
                  <code className="text-gold-400 select-all">zecradio-live</code>
                </div>
                <p className="text-base-600 mt-1 pt-1 border-t border-base-700/30">
                  OBS → Settings → Stream → Service: Custom
                </p>
              </div>
            )}

            {/* Toggle button */}
            <button
              onClick={handleToggleLive}
              disabled={liveToggling}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer disabled:opacity-50
                ${liveStatus?.isLive
                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                }`}
            >
              {liveToggling ? 'Switching...' : liveStatus?.isLive ? '⏹ End Live Stream' : '▶ Go Live'}
            </button>
          </div>

          {/* Now Playing + Skip */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-base-200">Now Playing</h2>
            {stats?.currentItem ? (
              <div className="flex items-center gap-4">
                <img
                  src={stats.currentItem.thumbnail}
                  alt={stats.currentItem.title}
                  className="w-24 h-16 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-base-100 truncate">{stats.currentItem.title}</p>
                  <p className="text-xs text-base-400">
                    {stats.currentItem.isFallback ? 'Default Playlist' : `Donation: ${stats.currentItem.donationAmount} ZEC`}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-base-500">Nothing playing</p>
            )}
            <button
              onClick={handleSkip}
              className="w-full py-2.5 rounded-lg bg-rose-500/20 text-rose-400 text-sm font-medium hover:bg-rose-500/30 transition-all border border-rose-500/30"
            >
              ⏭ Force Skip
            </button>
          </div>

          {/* Configuration */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-base-200">Configuration</h2>
            {config && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-base-400 mb-1 block">Queue Video Price (ZEC)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.queueVideoPrice}
                    onChange={(e) => setConfig({ ...config, queueVideoPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-base-800 text-sm text-base-100 px-3 py-2 rounded-lg border border-base-600 focus:border-gold-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-base-400 mb-1 block">Skip Video Price (ZEC)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.skipVideoPrice}
                    onChange={(e) => setConfig({ ...config, skipVideoPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-base-800 text-sm text-base-100 px-3 py-2 rounded-lg border border-base-600 focus:border-gold-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleUpdateConfig}
                  className="w-full py-2.5 rounded-lg bg-purple-500/20 text-purple-400 text-sm font-medium hover:bg-purple-500/30 transition-all border border-purple-500/30"
                >
                  Save Configuration
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Queue Management */}
        <div className="glass-card p-6">
          <h2 className="text-base font-semibold text-base-200 mb-4">Queue ({queueItems.length})</h2>
          {queueItems.length > 0 ? (
            <div className="space-y-2">
              {queueItems.map((item: any, idx: number) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-base-800/50 rounded-lg">
                  <span className="text-xs text-base-500 font-mono w-5">{idx + 1}</span>
                  <img src={item.thumbnail} alt="" className="w-12 h-8 rounded object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-base-200 truncate">{item.title}</p>
                    <p className="text-xs text-base-500">{item.donationAmount} ZEC</p>
                  </div>
                  <button
                    onClick={() => handleRemoveFromQueue(item.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-base-500 text-center py-4">Queue is empty</p>
          )}
        </div>

        {/* Jingle Management */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-base-200">🔔 Jingles ({jingles.length})</h2>
              <p className="text-xs text-base-500 mt-0.5">Auto-played between queued tracks</p>
            </div>
            <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all
              ${uploadingJingle
                ? 'bg-base-700 text-base-400 cursor-wait'
                : 'bg-gold-500/20 text-gold-400 hover:bg-gold-500/30 border border-gold-500/30'
              }`}
            >
              {uploadingJingle ? 'Uploading...' : '＋ Upload Jingle'}
              <input
                type="file"
                accept=".mp3,.ogg,.opus,.wav,.m4a,.flac"
                onChange={handleUploadJingle}
                disabled={uploadingJingle}
                className="hidden"
              />
            </label>
          </div>

          {jingles.length > 0 ? (
            <div className="space-y-2">
              {jingles.map((jingle) => (
                <div key={jingle.name} className="flex items-center gap-3 p-3 bg-base-800/50 rounded-lg group">
                  <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🔔</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-base-200 truncate">{jingle.name}</p>
                    <p className="text-xs text-base-500">
                      {(jingle.size / 1024).toFixed(0)} KB
                      {' · '}
                      {new Date(jingle.addedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteJingle(jingle.name)}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded
                               bg-rose-500/10 hover:bg-rose-500/20 opacity-0 group-hover:opacity-100
                               transition-opacity cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🔇</p>
              <p className="text-sm text-base-500">No jingles uploaded</p>
              <p className="text-xs text-base-600 mt-1">Upload MP3 files to play between queued songs</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const borderColor = {
    gold: 'border-gold-500/30',
    purple: 'border-purple-500/30',
    emerald: 'border-emerald-500/30',
    rose: 'border-rose-500/30',
  }[color] || '';

  const textColor = {
    gold: 'text-gold-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
  }[color] || '';

  return (
    <div className={`glass-card p-4 border-l-3 ${borderColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-xl font-bold ${textColor}`}>{value}</p>
      <p className="text-xs text-base-400 mt-1">{label}</p>
    </div>
  );
}
