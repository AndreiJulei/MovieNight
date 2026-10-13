import { authApi } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ApiWebhookSubscriptionResponse {
  id: number;
  userId: number;
  targetUrl: string;
  secret: string;
  description?: string | null;
  events: string;
  isActive: boolean;
  consecutiveFailures: number;
  lastDeliveryAt?: string | null;
  lastDeliveryStatus?: number | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ApiCreateWebhookSubscriptionRequest {
  targetUrl: string;
  secret?: string;
  description?: string;
  events?: string;
}

export interface ApiUpdateWebhookSubscriptionRequest {
  targetUrl?: string;
  secret?: string;
  description?: string;
  events?: string;
  isActive?: boolean;
}

export interface ApiWebhookDeliveryLogResponse {
  id: number;
  subscriptionId: number;
  eventId: string;
  eventType: string;
  payload: string;
  responseStatus: number;
  responseBody?: string | null;
  durationMs: number;
  success: boolean;
  attemptCount: number;
  createdAt: string;
}

export interface ApiTestWebhookResponse {
  success: boolean;
  responseStatus?: number;
  durationMs?: number;
  message: string;
  responseBody?: string | null;
}

function getAuthHeaders(): HeadersInit {
  const token = authApi.getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export const webhooksApi = {
  /**
   * Fetch user's registered webhook subscriptions.
   */
  async getSubscriptions(): Promise<ApiWebhookSubscriptionResponse[]> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch webhook subscriptions:", err);
      return [];
    }
  },

  /**
   * Fetch single webhook subscription.
   */
  async getSubscription(id: number): Promise<ApiWebhookSubscriptionResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks/${id}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to fetch webhook subscription ${id}:`, err);
      return null;
    }
  },

  /**
   * Register new webhook subscription.
   */
  async createSubscription(
    req: ApiCreateWebhookSubscriptionRequest
  ): Promise<ApiWebhookSubscriptionResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error("Failed to create webhook subscription:", err);
      return null;
    }
  },

  /**
   * Update webhook subscription.
   */
  async updateSubscription(
    id: number,
    req: ApiUpdateWebhookSubscriptionRequest
  ): Promise<ApiWebhookSubscriptionResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to update webhook subscription ${id}:`, err);
      return null;
    }
  },

  /**
   * Delete webhook subscription.
   */
  async deleteSubscription(id: number): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete webhook subscription ${id}:`, err);
      return false;
    }
  },

  /**
   * Trigger immediate test ping for subscription.
   */
  async testSubscription(id: number): Promise<ApiTestWebhookResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks/${id}/test`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to test webhook subscription ${id}:`, err);
      return null;
    }
  },

  /**
   * Get delivery audit logs for subscription.
   */
  async getDeliveryLogs(id: number): Promise<ApiWebhookDeliveryLogResponse[]> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks/${id}/logs`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error(`Failed to fetch webhook delivery logs for ${id}:`, err);
      return [];
    }
  },

  /**
   * Test incoming ML sync webhook
   */
  async triggerMlSync(
    secret = "movienight_internal_ml_secret"
  ): Promise<{ success: boolean; message: string; pairsCount?: number }> {
    try {
      const res = await fetch(`${API_BASE}/api/webhooks/incoming/ml-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MovieNight-Secret": secret,
        },
      });
      const data = await res.json();
      return {
        success: res.ok,
        message: data.message || (res.ok ? "ML sync triggered successfully" : "Failed to trigger sync"),
        pairsCount: data.pairsCount,
      };
    } catch (err) {
      console.error("Failed to trigger ML sync webhook:", err);
      return {
        success: false,
        message: err instanceof Error ? err.message : "Network error triggering ML sync",
      };
    }
  },
};
