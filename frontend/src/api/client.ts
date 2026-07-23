import axios from "axios";
import { parseError } from "./errors";

/** Base URL of the FastAPI backend (all routes are under /api). */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

export const client = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

/**
 * Turn any thrown value into a human-readable message. Thin wrapper over
 * `parseError` so existing call sites keep working; prefer `parseError`/
 * `toast.error` where you also want the title, details, and retry affordance.
 */
export function errorMessage(err: unknown): string {
  return parseError(err).message;
}
