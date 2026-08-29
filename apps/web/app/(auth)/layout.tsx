export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-[#D4AF37] font-serif font-bold text-2xl tracking-wider">
            HabeasGraph
          </span>
        </div>

        <div className="bg-[#161B22] border border-gray-800 rounded-xl p-8 shadow-2xl">
          {children}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6 leading-relaxed">
          Access to this system is restricted to authorized users of your organization.
          Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
