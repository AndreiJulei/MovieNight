const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ApiUser {
  id: number | string;
  username: string;
  displayName: string;
  role: string;
  createdAt?: string;
}

export interface LoginApiResponse {
  token: string;
  tokenType: string;
  id: number;
  username: string;
  displayName: string;
  role: string;
  createdAt?: string;
}

export interface CheckNameApiResponse {
  displayName: string;
  available: boolean;
  message: string;
}

export const authApi = {
  /**
   * Check if a display name is unique and valid on the backend.
   */
  async checkDisplayName(displayName: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${API_BASE}/api/auth/check-name?displayName=${encodeURIComponent(displayName)}`,
      );
      if (!res.ok) return false;
      const data: CheckNameApiResponse = await res.json();
      return data.available;
    } catch (err) {
      console.warn("Failed to check display name against backend, falling back:", err);
      return true;
    }
  },

  /**
   * Sign up a new user on the backend.
   */
  async signup(payload: {
    username: string;
    displayName: string;
    password: string;
  }): Promise<{ ok: boolean; user?: ApiUser; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          ok: false,
          error: data.message || (data.errors ? Object.values(data.errors).join(", ") : "Signup failed."),
        };
      }

      return { ok: true, user: data };
    } catch (err) {
      return { ok: false, error: "Cannot connect to server. Is the backend running on port 8080?" };
    }
  },

  /**
   * Login with username and password, receiving a JWT token and user profile.
   */
  async login(
    username: string,
    password: string,
  ): Promise<{ ok: boolean; token?: string; user?: ApiUser; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          ok: false,
          error: data.message || "Invalid username or password.",
        };
      }

      const loginData = data as LoginApiResponse;
      localStorage.setItem("movienight_token", loginData.token);

      return {
        ok: true,
        token: loginData.token,
        user: {
          id: String(loginData.id),
          username: loginData.username,
          displayName: loginData.displayName,
          role: loginData.role,
          createdAt: loginData.createdAt,
        },
      };
    } catch (err) {
      return { ok: false, error: "Cannot connect to server. Is the backend running on port 8080?" };
    }
  },

  /**
   * Helper to retrieve the current JWT token.
   */
  getToken(): string | null {
    return localStorage.getItem("movienight_token");
  },

  /**
   * Logout helper.
   */
  logout() {
    localStorage.removeItem("movienight_token");
  },
};
