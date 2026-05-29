import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  const token = () => localStorage.getItem('kiteai_token');

  const headers = () => ({
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token()}`,
  });

  const verifyToken = useCallback(async () => {
    const t = token();
    if (!t) { setLoading(false); return; }
    try {
      const res = await fetch(`${API}/api/auth/me`, { headers: headers() });
      if (res.ok) {
        const { user: u } = await res.json();
        setUser(u);
      } else {
        localStorage.removeItem('kiteai_token');
      }
    } catch { localStorage.removeItem('kiteai_token'); }
    setLoading(false);
  }, []);

  useEffect(() => { verifyToken(); }, [verifyToken]);

  async function login(email, password) {
    const res  = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('kiteai_token', data.token);
    setUser(data.user);
    return data.user;
  }

  async function register(email, password) {
    const res  = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    localStorage.setItem('kiteai_token', data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('kiteai_token');
    setUser(null);
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
    });
    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    return res;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
