const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ApiUser {
  id: number | string;
  username: string;
  displayName: string;
  email?: string;
  role: string;
  createdAt?: string;
}

export interface LoginApiResponse {
  token: string;
  tokenType: string;
  id: number;
  username: string;
  displayName: string;
  email?: string;
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
    email: string;
    username: string;
    displayName?: string;
    password: string;
    confirmPassword?: string;
  }): Promise<{ ok: boolean; user?: ApiUser; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          displayName: payload.displayName || payload.username,
        }),
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
   * Login with email (or username) and password, receiving a JWT token and user profile.
   */
  async login(
    emailOrUsername: string,
    password: string,
  ): Promise<{ ok: boolean; token?: string; user?: ApiUser; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailOrUsername,
          username: emailOrUsername,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          ok: false,
          error: data.message || "Invalid email or password.",
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
          email: loginData.email,
          role: loginData.role,
          createdAt: loginData.createdAt,
        },
      };
    } catch (err) {
      return { ok: false, error: "Cannot connect to server. Is the backend running on port 8080?" };
    }
  },

  /**
   * Request a 6-digit OTP code to reset password.
   */
  async forgotPassword(
    email: string,
  ): Promise<{ ok: boolean; message?: string; devCode?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          ok: false,
          error: data.message || "Failed to send reset code.",
        };
      }

      return {
        ok: true,
        message: data.message,
        devCode: data.devCode,
      };
    } catch {
      return { ok: false, error: "Cannot connect to server. Is the backend running on port 8080?" };
    }
  },

  /**
   * Reset password with the 6-digit OTP code.
   */
  async resetPassword(payload: {
    email: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ ok: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          ok: false,
          error: data.message || (data.errors ? Object.values(data.errors).join(", ") : "Failed to reset password."),
        };
      }

      return { ok: true, message: data.message };
    } catch {
      return { ok: false, error: "Cannot connect to server. Is the backend running on port 8080?" };
    }
  },

  /**
   * Update user display name.
   */
  async updateDisplayName(displayName: string): Promise<{ ok: boolean; user?: ApiUser; error?: string }> {
    try {
      const token = this.getToken();
      const res = await fetch(`${API_BASE}/api/users/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ displayName }),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          error: data.message || (data.errors ? Object.values(data.errors).join(", ") : "Could not update display name."),
        };
      }

      return { ok: true, user: data };
    } catch {
      return { ok: false, error: "Network error. Is the backend running?" };
    }
  },

  /**
   * Change user password.
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const token = this.getToken();
      const res = await fetch(`${API_BASE}/api/users/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          error: data.message || (data.errors ? Object.values(data.errors).join(", ") : "Could not change password."),
        };
      }

      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Is the backend running?" };
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
