import axios, { AxiosError } from "axios";

/** Base URL of the FastAPI backend (all routes are under /api). */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

export const client = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

/** Turn any thrown value into a human-readable message (FastAPI `detail` aware). */
export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
