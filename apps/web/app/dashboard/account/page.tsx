'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { PasswordInput } from '../../../components/auth/PasswordInput';
import { updateProfile, changePassword } from './_actions';

export default function AccountPage() {
  const { data: session, update } = useSession();
  const user = session?.user;
  const role = (user as any)?.role as string | undefined;

  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const result = await updateProfile(null, formData);
      if (result.success) {
        toast.success('Profile updated');
        update({ name: formData.get('name') as string });
      } else {
        toast.error(result.error ?? 'Failed to update profile');
      }
    } finally {
      setProfileLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const newPassword = formData.get('newPassword') as string;
      const confirmPassword = formData.get('confirmPassword') as string;
      if (newPassword !== confirmPassword) {
        setPasswordError('Passwords do not match');
        return;
      }
      const result = await changePassword(null, formData);
      if (result.success) {
        toast.success('Password changed');
        // Refresh JWT so current session stays valid (passwordAcknowledgedAt prevents self-signout)
        update({ passwordChanged: true });
        setShowPasswordForm(false);
        (e.target as HTMLFormElement).reset();
      } else {
        setPasswordError(result.error ?? 'Failed to change password');
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold text-[#D4AF37] mb-8">Account Settings</h1>

      {/* Profile section */}
      <section className="bg-[#0B0E14] border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-1">Profile</h2>
        <p className="text-sm text-gray-500 mb-4">Update your display name.</p>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="name" className="block text-sm font-medium text-gray-400">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              maxLength={100}
              defaultValue={user?.name ?? ''}
              className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2
                         text-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]
                         focus:border-[#D4AF37]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Email</p>
              <p className="text-sm text-gray-300">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Role</p>
              <p className="text-sm text-gray-300">{role ?? '—'}</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={profileLoading}
            className="bg-[#D4AF37] hover:bg-[#F2D675] disabled:opacity-50
                       text-[#0B0E14] font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {profileLoading ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </section>

      {/* Password section */}
      <section className="bg-[#0B0E14] border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-medium text-white">Password</h2>
          {!showPasswordForm && (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="text-sm text-[#D4AF37] hover:text-[#F2D675] transition-colors"
            >
              Change password
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {showPasswordForm ? 'Enter your current password to set a new one.' : 'Manage your account password.'}
        </p>

        {showPasswordForm && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <PasswordInput
              id="currentPassword"
              name="currentPassword"
              label="Current password"
              autoComplete="current-password"
            />
            <PasswordInput
              id="newPassword"
              name="newPassword"
              label="New password (min 12 chars, uppercase, number or symbol)"
              autoComplete="new-password"
            />
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              label="Confirm new password"
              autoComplete="new-password"
            />

            {passwordError && (
              <p role="alert" className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {passwordError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={passwordLoading}
                className="bg-[#D4AF37] hover:bg-[#F2D675] disabled:opacity-50
                           text-[#0B0E14] font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {passwordLoading ? 'Updating…' : 'Update password'}
              </button>
              <button
                type="button"
                onClick={() => { setShowPasswordForm(false); setPasswordError(null); }}
                className="text-sm text-gray-400 hover:text-white px-4 py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
