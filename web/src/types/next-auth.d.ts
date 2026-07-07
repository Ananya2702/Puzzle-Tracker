import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      theme: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
