import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { authConfig } from './auth.config';
import { getDb } from '@/db';
import { verifyCredentials, findOrCreateGoogleUser } from '@/lib/users';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { identifier: { label: 'Username or email' }, password: { label: 'Password', type: 'password' } },
      async authorize(creds) {
        const user = await verifyCredentials(
          getDb(),
          String(creds?.identifier ?? ''),
          String(creds?.password ?? ''),
        );
        if (!user) return null;
        return { id: String(user.id), name: user.username, email: user.email, username: user.username, theme: user.theme };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        if (!user.email) return false;
        const dbUser = await findOrCreateGoogleUser(getDb(), {
          email: user.email,
          name: user.name ?? '',
          providerAccountId: account.providerAccountId,
        });
        user.id = String(dbUser.id);
        (user as { username?: string }).username = dbUser.username;
        (user as { theme?: string }).theme = dbUser.theme;
      }
      return true;
    },
  },
});
