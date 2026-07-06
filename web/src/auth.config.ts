import type { NextAuthConfig } from 'next-auth';

const PROTECTED = /^\/(dashboard|timer|log|history|analytics|goals|awards|settings)/;

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth, request }) {
      if (PROTECTED.test(request.nextUrl.pathname) && !auth?.user) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.username = (user as { username?: string }).username;
        token.theme = (user as { theme?: string }).theme;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.userId);
      session.user.username = (token.username as string) ?? session.user.name ?? '';
      session.user.theme = (token.theme as string) ?? 'midnight';
      return session;
    },
  },
  providers: [], // filled in by auth.ts
} satisfies NextAuthConfig;
