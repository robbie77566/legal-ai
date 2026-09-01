import { Suspense } from 'react';
import { SignInForm } from '../../../../components/auth/SignInForm';

export default function SignInPage() {
  return (
    <>
      <h1 className="text-xl font-semibold  mb-6">Sign in to your account</h1>
      <Suspense fallback={<div className="h-64 flex items-center justify-center text-db-muted">Loading...</div>}>
        <SignInForm />
      </Suspense>
    </>
  );
}
