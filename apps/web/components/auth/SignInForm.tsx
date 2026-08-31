'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PasswordInput } from './PasswordInput';

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type SignInValues = z.infer<typeof signInSchema>;

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Invalid email or password.',
  RateLimit: 'Too many failed attempts. Please wait 15 minutes before trying again.',
  ServiceUnavailable: 'The service is temporarily unavailable. Please try again shortly.',
  default: 'Something went wrong. Please try again in a moment.',
};

function mapAuthError(error: string | undefined): string {
  if (!error) return AUTH_ERROR_MESSAGES.default;
  return AUTH_ERROR_MESSAGES[error] ?? AUTH_ERROR_MESSAGES.default;
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  async function onSubmit(data: SignInValues) {
    setServerError(null);
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe ? 'true' : 'false',
        redirect: false,
      });

      if (result?.error) {
        setServerError(mapAuthError(result.error));
        return;
      }

      // Only allow relative URLs to prevent open-redirect attacks
      const rawCallback = searchParams.get('callbackUrl');
      const safeCallback = rawCallback?.startsWith('/') ? rawCallback : '/go'; // role-aware landing (US-11)
      router.push(safeCallback);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-busy={isLoading}>
      <div className="space-y-4">
        {/* Email */}
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-gray-400">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourfirm.com"
            aria-describedby={errors.email ? 'email-error' : undefined}
            aria-invalid={!!errors.email}
            className="w-full bg-[#0B0E14] border border-gray-700 rounded-lg px-3 py-2
                       text-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]
                       focus:border-[#D4AF37] aria-[invalid=true]:border-red-500"
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="text-red-400 text-xs mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <PasswordInput
          id="password"
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {/* Remember me */}
        <div className="flex items-center gap-2">
          <input
            id="rememberMe"
            type="checkbox"
            className="w-4 h-4 rounded border-gray-700 bg-[#0B0E14] accent-[#D4AF37]"
            {...register('rememberMe')}
          />
          <label htmlFor="rememberMe" className="text-sm text-gray-400">
            Remember me for 30 days
          </label>
        </div>

        {/* Server error */}
        {serverError && (
          <div role="alert" className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {serverError}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#D4AF37] hover:bg-[#F2D675] disabled:opacity-50
                     text-[#0B0E14] font-semibold py-2.5 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-2
                     focus:ring-offset-[#161B22]"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>

        <a
          href="/auth/forgot-password"
          className="block text-center text-sm text-gray-500 underline hover:text-gray-300"
        >
          Forgot your password?
        </a>
      </div>
    </form>
  );
}
