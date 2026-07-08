import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import { ConfettiCanvas } from '@/components/Confetti';
import { OfflineSync } from '@/components/OfflineSync';
import '@/components/forms.css';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login'); // belt-and-braces beside middleware
  return (
    <ToastProvider>
      <div className="shell">
        <Sidebar username={session.user.username} />
        <main className="shell-main">{children}</main>
      </div>
      <ConfettiCanvas />
      <OfflineSync />
    </ToastProvider>
  );
}
