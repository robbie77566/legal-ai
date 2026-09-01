'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PasswordInput } from './PasswordInput';
import { useLang } from '../../lib/i18n';

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
  const { lang } = useLang();
  const T = lang === 'es'
    ? { email: 'Correo electrónico', remember: 'Recordarme por 30 días', signin: 'Iniciar sesión', signingIn: 'Iniciando…', forgot: '¿Olvidó su contraseña?', password: 'Contraseña' }
    : { email: 'Email address', remember: 'Remember me for 30 days', signin: 'Sign in', signingIn: 'Signing in…', forgot: 'Forgot your password?', password: 'Password' };

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
          <label htmlFor="email" className="block text-sm font-semibold">
            {T.email}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourfirm.com"
            aria-describedby={errors.email ? 'email-error' : undefined}
            aria-invalid={!!errors.email}
            className="w-full rounded-lg border border-db-line bg-db-surface p-3
                       focus:outline-none focus:ring-2 focus:ring-db-accent
                       aria-[invalid=true]:border-[var(--db-urgent)]"
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="mt-1 text-xs" style={{ color: 'var(--db-urgent)' }}>
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <PasswordInput
          id="password"
          label={T.password}
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {/* Remember me */}
        <div className="flex items-center gap-2">
          <input
            id="rememberMe"
            type="checkbox"
            className="h-4 w-4 rounded border-db-line accent-[var(--db-accent)]"
            {...register('rememberMe')}
          />
          <label htmlFor="rememberMe" className="text-sm text-db-muted">
            {T.remember}
          </label>
        </div>

        {/* Server error */}
        {serverError && (
          <div role="alert" className="rounded-lg border px-4 py-3 text-sm" style={{ color: 'var(--db-urgent)', borderColor: 'var(--db-urgent)' }}>
            {serverError}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-xl bg-db-accent px-6 py-3 text-lg font-semibold text-db-surface disabled:opacity-50
                     transition-colors focus:outline-none focus:ring-2 focus:ring-db-accent
                     focus:ring-offset-2"
        >
          {isLoading ? T.signingIn : T.signin}
        </button>

        <a
          href="/auth/forgot-password"
          className="block text-center text-sm text-db-muted underline"
        >
          {T.forgot}
        </a>
      </div>
    </form>
  );
}
