import Link from 'next/link';
import { UserMenu } from '../../components/nav/UserMenu';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#161B22] text-white">
      <nav className="fixed top-0 left-0 right-0 z-40 bg-[#0B0E14]/90 backdrop-blur-md border-b border-[#D4AF37]/10 h-14 flex items-center">
        <div className="w-full px-6 flex items-center justify-between">
          <Link href="/dashboard" className="text-[#D4AF37] font-serif font-bold text-lg tracking-wider">
            HabeasGraph
          </Link>
          <UserMenu />
        </div>
      </nav>
      {/* Push content below the fixed nav */}
      <div className="pt-14">
        {children}
      </div>
    </div>
  );
}
