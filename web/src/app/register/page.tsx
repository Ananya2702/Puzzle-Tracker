import { RegisterForm } from './RegisterForm';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function RegisterPage() {
  return <RegisterForm googleSlot={<GoogleSignInButton />} />;
}
