"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, buildApiError } from "./api";
import { API_BASE_URL } from "./constants";
import type { User, Token } from "./types";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  googleRegister: (idToken: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  deleteAccount: (password: string, confirmation: string) => Promise<void>;
  forceLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const forceLogout = useCallback(async () => {
    try {
      await api.post("/auth/logout/force", {});
    } catch {
      /* ignore */
    }
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch (err) {
      localStorage.removeItem("syncra_token");
      setToken(null);
      setUser(null);

      const message =
        err instanceof Error
          ? err.message
          : "Oturum doğrulanamadı, lütfen tekrar giriş yapın.";
      window.dispatchEvent(
        new CustomEvent("appToast", {
          detail: {
            type: "error",
            message,
          },
        }),
      );
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("syncra_token");
    if (stored) {
      setToken(stored);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem("syncra_token");
      setToken(null);
      setUser(null);
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/register")) {
        window.location.href = "/login";
      }
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    if (token) {
      fetchMe().finally(() => setLoading(false));
    }
  }, [token, fetchMe]);

  const login = async (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw buildApiError(res.status, body);
    }

    const data = (await res.json()) as Token;
    localStorage.setItem("syncra_token", data.access_token);
    setToken(data.access_token);
  };

  const googleLogin = async (idToken: string) => {
    let data: Token;
    try {
      data = await api.post<Token>("/auth/google/login", { id_token: idToken });
    } catch (err) {
      if (err instanceof Error && "status" in err && (err as { status?: number }).status === 404) {
        data = await api.post<Token>("/auth/google", { id_token: idToken, mode: "login" });
      } else {
        throw err;
      }
    }
    localStorage.setItem("syncra_token", data.access_token);
    setToken(data.access_token);
  };

  const googleRegister = async (idToken: string) => {
    let data: Token;
    try {
      data = await api.post<Token>("/auth/google/register", { id_token: idToken });
    } catch (err) {
      if (err instanceof Error && "status" in err && (err as { status?: number }).status === 404) {
        data = await api.post<Token>("/auth/google", { id_token: idToken, mode: "register" });
      } else {
        throw err;
      }
    }
    localStorage.setItem("syncra_token", data.access_token);
    setToken(data.access_token);
  };

  const register = async (
    username: string,
    email: string,
    password: string,
  ) => {
    await api.post("/auth/register", { username, email, password });
    await login(email, password);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // Sessiyon zaten yoksa veya ağ hatası varsa yoksay
    } finally {
      localStorage.removeItem("syncra_token");
      setToken(null);
      setUser(null);
      window.location.href = "/";
    }
  };

  const updateUser = (data: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : null));
  };

  const deleteAccount = async (password: string, confirmation: string) => {
    await api.delete("/auth/me", { password, confirmation });
    logout();
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, googleLogin, googleRegister, register, logout, updateUser, deleteAccount, forceLogout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
