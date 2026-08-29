'use client';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Settings, LogOut } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ATTORNEY: 'Attorney',
  INVESTIGATOR: 'Investigator',
  VIEWER: 'Viewer',
};

export function UserMenu() {
  const { data: session } = useSession();
  if (!session) return null;

  const user = session.user;
  const displayName = user.name ?? user.email ?? '?';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const role = (user as any).role as string | undefined;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                     hover:bg-[#D4AF37]/10 transition-colors text-sm
                     focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
          aria-label="User menu"
        >
          <div
            className="w-7 h-7 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40
                       flex items-center justify-center text-[#D4AF37] text-xs font-semibold"
          >
            {initials}
          </div>
          <span className="text-gray-200 max-w-[120px] truncate hidden sm:inline">
            {displayName}
          </span>
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="w-56 bg-[#161B22] border border-gray-800 rounded-xl shadow-2xl z-50
                     animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
          sideOffset={6}
          align="end"
        >
          {/* User info header — not interactive */}
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
            {role && (
              <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full
                               bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                {ROLE_LABELS[role] ?? role}
              </span>
            )}
          </div>

          <div className="p-1">
            <DropdownMenu.Item asChild>
              <Link
                href="/dashboard/account"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300
                           rounded-lg hover:bg-[#D4AF37]/10 hover:text-white transition-colors
                           focus:outline-none focus:bg-[#D4AF37]/10 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                Account Settings
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="h-px bg-gray-800 my-1" />

            <DropdownMenu.Item
              onSelect={() => signOut({ callbackUrl: '/' })}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-400
                         rounded-lg hover:bg-red-500/10 transition-colors
                         focus:outline-none focus:bg-red-500/10 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
