/** Only allow same-origin relative paths for post-login redirects. Rejects paths starting with //, /, or \ */
export function safeCallbackPath(raw: string | null): string {
  return raw && /^\/(?![/\\])/.test(raw) ? raw : '/dashboard';
}
