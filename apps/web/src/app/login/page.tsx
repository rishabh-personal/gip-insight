import { Suspense } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { LoginForm } from './login-form';

function LoginSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex items-center justify-center h-[260px]">
      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">GIP Insight</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>

        {/* Form — useSearchParams lives inside LoginForm, wrapped in Suspense */}
        <Suspense fallback={<LoginSkeleton />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          GIP Insight · Internal dashboard · Zwing
        </p>
      </div>
    </div>
  );
}
