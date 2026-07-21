import { createContext, useContext, useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

type AuthUser = { username: string };

type AuthCtx = {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthCtx>({
  user: null, token: null,
  login: async () => {}, logout: () => {}, isAdmin: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("auth_token")
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const s = localStorage.getItem("auth_user");
    return s ? JSON.parse(s) : null;
  });

  async function login(username: string, password: string) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("Invalid credentials");
    const data: { access_token: string } = await res.json();
    const u: AuthUser = { username };
    setToken(data.access_token);
    setUser(u);
    localStorage.setItem("auth_token", data.access_token);
    localStorage.setItem("auth_user", JSON.stringify(u));
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  }

  // Auto sign-in on load so protected actions (rescan, admin CRUD) always have a
  // fresh token — the platform normally owns login, and locally there's no login
  // screen. Uses VITE_ADMIN_USERNAME/PASSWORD (local .env); if unset (e.g. prod
  // build) this is a no-op and behavior is unchanged. Runs once on mount and
  // refreshes any stale/expired token.
  useEffect(() => {
    const u = import.meta.env.VITE_ADMIN_USERNAME;
    const p = import.meta.env.VITE_ADMIN_PASSWORD;
    if (u && p) login(u, p).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAdmin: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
