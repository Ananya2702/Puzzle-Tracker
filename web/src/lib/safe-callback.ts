/** Only allow same-origin relative paths for post-login redirects. */
export function safeCallbackPath(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}
