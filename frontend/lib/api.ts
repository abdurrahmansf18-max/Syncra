import { API_BASE_URL } from "./constants"

type ApiErrorBody = {
  detail?: unknown
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

export class ApiError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

function toHumanMessage(input: unknown): string | null {
  if (!input) return null
  if (typeof input === "string") return input

  if (Array.isArray(input)) {
    const parts = input
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object") {
          const maybeMsg = (item as { msg?: unknown }).msg
          if (typeof maybeMsg === "string") return maybeMsg
        }
        return null
      })
      .filter((item): item is string => Boolean(item && item.trim()))

    if (parts.length > 0) {
      return parts.join(" • ")
    }
  }

  if (input && typeof input === "object") {
    const maybeMessage = (input as { message?: unknown; detail?: unknown; msg?: unknown })
    for (const value of [maybeMessage.message, maybeMessage.detail, maybeMessage.msg]) {
      if (typeof value === "string" && value.trim()) {
        return value
      }
    }
  }

  return null
}

export function buildApiError(status: number, body: unknown): ApiError {
  const payload = (body ?? null) as ApiErrorBody | null
  const errorMessage = toHumanMessage(payload?.error?.message)
  const errorDetails = toHumanMessage(payload?.error?.details)
  const detailMessage = toHumanMessage(payload?.detail)

  const composedMessage = errorMessage ?? detailMessage ?? `Request failed: ${status}`
  const finalMessage = errorDetails ? `${composedMessage}\n${errorDetails}` : composedMessage

  return new ApiError(finalMessage, status, payload?.error?.code, payload?.error?.details)
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("syncra_token")
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "ngrok-skip-browser-warning": "true",
    ...(options.headers as Record<string, string>),
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const fullUrl = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`

  const res = await fetch(fullUrl, {
    ...options,
    headers,
  })

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    const body = await res.json().catch(() => null)
    const error = buildApiError(res.status, body)

    // Global Error Toast Dispatch (except 401 which is handled separately)
    if (res.status !== 401 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("appToast", {
          detail: {
            type: "error",
            message: error.message,
          },
        })
      );
    }

    throw error
  }

  if (res.status === 204) return null as T
  return res.json()
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "POST", body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined) }),
  patch: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PATCH", body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined) }),
  put: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PUT", body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined) }),
  delete: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "DELETE", body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined) }),
}
