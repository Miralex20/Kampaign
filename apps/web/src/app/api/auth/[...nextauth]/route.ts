/**
 * Auth.js v5 API route handler.
 * Handles all /api/auth/* requests (signin, callback, signout, session, etc.)
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
