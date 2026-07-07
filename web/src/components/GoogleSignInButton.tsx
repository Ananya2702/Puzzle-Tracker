import { signIn } from '@/auth';

export function GoogleSignInButton() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  return (
    <form
      action={async () => {
        'use server';
        await signIn('google', { redirectTo: '/dashboard' });
      }}
    >
      <button type="submit" className="auth-google">Continue with Google</button>
    </form>
  );
}
