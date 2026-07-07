import { Suspense } from 'react';
import { LoginForm } from './LoginForm';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm googleSlot={<GoogleSignInButton />} />
    </Suspense>
  );
}
