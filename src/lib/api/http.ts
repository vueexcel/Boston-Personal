import type { ApiEnvelope } from "@/types/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(params: {
    message: string;
    code: string;
    status: number;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError({
      message: "Invalid JSON response",
      code: "INVALID_RESPONSE",
      status: res.status,
    });
  }
}

function assertEnvelope<T>(res: Response, body: unknown): T {
  if (body == null || typeof body !== "object" || !("success" in body)) {
    throw new ApiClientError({
      message: "Unexpected API response shape",
      code: "INVALID_RESPONSE",
      status: res.status,
    });
  }
  const envelope = body as ApiEnvelope<T>;
  if (!res.ok || !envelope.success) {
    throw new ApiClientError({
      message:
        envelope.success === false
          ? envelope.error.message
          : `Request failed (${res.status})`,
      code:
        envelope.success === false ? envelope.error.code : "HTTP_ERROR",
      status: res.status,
      details:
        envelope.success === false ? envelope.error.details : undefined,
    });
  }
  return envelope.data;
}

export type ApiFetchInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | null;
};

/**
 * JSON API fetch with same-origin credentials and {@link ApiEnvelope} parsing.
 */
export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit,
): Promise<T> {
  const { body: rawBody, headers: initHeaders, ...rest } = init ?? {};
  const headers = new Headers(initHeaders);

  let body: BodyInit | undefined;
  if (rawBody != null) {
    if (
      typeof rawBody === "object" &&
      !(rawBody instanceof FormData) &&
      !(rawBody instanceof Blob) &&
      !(rawBody instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(rawBody)
    ) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      body = JSON.stringify(rawBody);
    } else {
      body = rawBody as BodyInit;
    }
  }

  const res = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers,
    body,
  });

  const json = await parseJsonResponse(res);
  return assertEnvelope<T>(res, json);
}

export function apiGet<T>(path: string, init?: Omit<ApiFetchInit, "method" | "body">) {
  return apiFetch<T>(path, { ...init, method: "GET" });
}

export function apiPost<T>(
  path: string,
  body?: ApiFetchInit["body"],
  init?: Omit<ApiFetchInit, "method" | "body">,
) {
  return apiFetch<T>(path, { ...init, method: "POST", body });
}

export function apiPatch<T>(
  path: string,
  body?: ApiFetchInit["body"],
  init?: Omit<ApiFetchInit, "method" | "body">,
) {
  return apiFetch<T>(path, { ...init, method: "PATCH", body });
}

export function apiDelete<T>(
  path: string,
  init?: Omit<ApiFetchInit, "method" | "body">,
) {
  return apiFetch<T>(path, { ...init, method: "DELETE" });
}

/**
 * POST that returns a binary body (e.g. TTS preview). Throws on non-OK HTTP.
 */
export async function apiPostBlob(
  path: string,
  body?: ApiFetchInit["body"],
  init?: Omit<ApiFetchInit, "method" | "body">,
): Promise<Blob> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const headers = new Headers(initHeaders);
  let fetchBody: BodyInit | undefined;
  if (body != null && typeof body === "object" && !(body instanceof FormData)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    fetchBody = JSON.stringify(body);
  } else if (body != null) {
    fetchBody = body as BodyInit;
  }

  const res = await fetch(path, {
    ...rest,
    method: "POST",
    credentials: "same-origin",
    headers,
    body: fetchBody,
  });

  if (!res.ok) {
    try {
      const json = await parseJsonResponse(res);
      assertEnvelope<never>(res, json);
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
    }
    throw new ApiClientError({
      message: `Request failed (${res.status})`,
      code: "HTTP_ERROR",
      status: res.status,
    });
  }

  return res.blob();
}
