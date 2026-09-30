/**
 * ListmonkClient interface and HTTP adapter.
 *
 * No file outside this package may import listmonk HTTP logic directly.
 * All external callers depend only on the `ListmonkClient` interface.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TransactionalInput {
  subscriberEmail: string;
  templateId: number;
  data: Record<string, unknown>;
  subject?: string;
  contentType?: "html" | "plain";
  altBody?: string;
  headers?: Array<Record<string, string>>;
}

export interface ListmonkClient {
  sendTransactional(input: TransactionalInput): Promise<{ ok: true }>;
  deleteSubscriber(subscriberEmail: string): Promise<void>;
  blocklistSubscriber(subscriberEmail: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// HTTP adapter
// ---------------------------------------------------------------------------

interface ListmonkConfig {
  baseUrl: string;
  apiUser: string;
  apiToken: string;
}

class ListmonkHttpClient implements ListmonkClient {
  private readonly auth: string;
  private readonly baseUrl: string;

  constructor(config: ListmonkConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.auth = Buffer.from(`${config.apiUser}:${config.apiToken}`).toString("base64");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${this.auth}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`listmonk ${method} ${path} → ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async sendTransactional(input: TransactionalInput): Promise<{ ok: true }> {
    await this.request("POST", "/api/tx", {
      subscriber_email: input.subscriberEmail,
      subscriber_mode: "external",
      template_id: input.templateId,
      data: input.data,
      ...(input.subject ? { subject: input.subject } : {}),
      content_type: input.contentType ?? "html",
      ...(input.altBody ? { altbody: input.altBody } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    });
    return { ok: true };
  }

  async deleteSubscriber(subscriberEmail: string): Promise<void> {
    // Look up the subscriber by email first, then delete by ID.
    const list = await this.request<{
      data: { results: Array<{ id: number }> };
    }>(
      "GET",
      `/api/subscribers?query=subscribers.email='${encodeURIComponent(subscriberEmail)}'&per_page=1`,
    );

    const sub = list.data.results[0];
    if (!sub) return; // Not in listmonk — nothing to delete.

    await this.request("DELETE", `/api/subscribers/${sub.id}`);
  }

  async blocklistSubscriber(subscriberEmail: string): Promise<void> {
    const list = await this.request<{
      data: { results: Array<{ id: number }> };
    }>(
      "GET",
      `/api/subscribers?query=subscribers.email='${encodeURIComponent(subscriberEmail)}'&per_page=1`,
    );

    const sub = list.data.results[0];
    if (!sub) return;

    await this.request("PUT", `/api/subscribers/${sub.id}/blocklist`);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createListmonkClient(config: ListmonkConfig): ListmonkClient {
  return new ListmonkHttpClient(config);
}

/** Load listmonk config from environment variables. */
export function listmonkConfigFromEnv(): ListmonkConfig {
  const baseUrl = process.env["LISTMONK_BASE_URL"];
  const apiUser = process.env["LISTMONK_API_USER"];
  const apiToken = process.env["LISTMONK_API_TOKEN"];

  if (!baseUrl) throw new Error("LISTMONK_BASE_URL is not set");
  if (!apiUser) throw new Error("LISTMONK_API_USER is not set");
  if (!apiToken) throw new Error("LISTMONK_API_TOKEN is not set");

  return { baseUrl, apiUser, apiToken };
}
