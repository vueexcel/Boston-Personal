import { NextResponse } from "next/server";
import type { ApiEnvelope, ApiErrorBody } from "@/types/api";

/**
 * Builds a successful API envelope with typed `data` and `error` explicitly null.
 *
 * @param data - Response payload for the client.
 * @returns Typed success envelope.
 */
export function okEnvelope<T>(data: T): ApiEnvelope<T> {
  return { success: true, data, error: null };
}

/**
 * Builds a failed API envelope with `data` explicitly null.
 *
 * @param error - Structured error for the client.
 * @returns Typed failure envelope.
 */
export function errEnvelope<T = never>(error: ApiErrorBody): ApiEnvelope<T> {
  return { success: false, data: null, error };
}

/**
 * Serializes an API envelope to JSON with HTTP status.
 *
 * @param envelope - Result produced by {@link okEnvelope} or {@link errEnvelope}.
 * @param init - Optional `ResponseInit` (e.g. status code).
 */
export function jsonEnvelope<T>(
  envelope: ApiEnvelope<T>,
  init?: ResponseInit,
): NextResponse<ApiEnvelope<T>> {
  const status =
    envelope.success ? (init?.status ?? 200) : (init?.status ?? 400);
  return NextResponse.json(envelope, { ...init, status });
}
