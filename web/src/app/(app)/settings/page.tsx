import { SignOutButton } from './SignOutButton';
import { ThemePicker } from '@/components/ThemePicker';

export default function SettingsPage() {
  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <p className="desc">Customize your experience</p>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Theme</h3>
        <ThemePicker />
      </div>
      <div className="card">
        <SignOutButton />
      </div>
    </>
  );
}
