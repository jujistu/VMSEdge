// Access tokens live in memory; the backend owns the HttpOnly refresh cookie.
export const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1"
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: string[],
  ) {
    super(
      details?.length
        ? details.join("\n")
        : message.replace(/_/g, " ").toLowerCase(),
    );
  }
}
let token: string | undefined;
let refreshing: Promise<Session> | undefined;
let onExpired = () => {};
export type Session = {
  accessToken: string;
  expiresIn: number;
  user: import("./models").User & { departmentId?: string };
};
export const setExpiredHandler = (handler: () => void) => {
  onExpired = handler;
};
export const clearSession = () => {
  token = undefined;
};
type Envelope<T> = { data: T; meta?: { totalPages?: number } };
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  retry = true,
  idempotencyKey?: string,
): Promise<Envelope<T>> {
  const headers: Record<string, string> = { "X-VMS-Client": "web" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  // Preserve this key when a request is retried after token refresh.
  const key =
    idempotencyKey || (method === "POST" ? crypto.randomUUID() : undefined);
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (
    response.status === 401 &&
    retry &&
    ![
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/auth/forgot-password",
      "/auth/reset-password",
    ].includes(path)
  ) {
    try {
      await refreshSession();
    } catch (error) {
      clearSession();
      onExpired();
      throw error;
    }
    return request<T>(path, method, body, false, key);
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error?.code || "REQUEST_FAILED",
      result.error?.message || "Request failed",
      result.error?.details,
    );
  return result;
}
export async function refreshSession(): Promise<Session> {
  if (!refreshing)
    refreshing = request<Session>("/auth/refresh", "POST", {}, false)
      .then((r) => {
        token = r.data.accessToken;
        return r.data;
      })
      .finally(() => {
        refreshing = undefined;
      });
  return refreshing;
}
export async function login(email: string, password: string) {
  const { data } = await request<Session>(
    "/auth/login",
    "POST",
    { email, password },
    false,
  );
  token = data.accessToken;
  return data;
}
export async function logout() {
  await request("/auth/logout", "POST", {}, false);
  clearSession();
}
export async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const result = await request<T[]>(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page}`,
    );
    rows.push(...result.data);
    if (page >= (result.meta?.totalPages || 1)) return rows;
  }
}
export type Command = {
  path: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
};
export type Update = (command: Command) => Promise<boolean>;
export const sendCommand = (command: Command, idempotencyKey?: string) =>
  request(
    command.path,
    command.method || "POST",
    command.body,
    true,
    idempotencyKey,
  );
export async function downloadReport(
  query: string,
  retry = true,
): Promise<void> {
  const response = await fetch(`${API_URL}/reports/export.csv?${query}`, {
    credentials: "include",
    headers: {
      "X-VMS-Client": "web",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 401 && retry) {
    try {
      await refreshSession();
    } catch (e) {
      clearSession();
      onExpired();
      throw e;
    }
    return downloadReport(query, false);
  }
  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(
      response.status,
      error.error?.code || "EXPORT_FAILED",
      error.error?.message || "Export failed",
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "gatewise-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}
