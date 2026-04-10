'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoginForm() {
  const params     = useSearchParams();
  const redirectTo = params.get('from') || '/enterprises';

  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [error,      setError]      = useState('');
  const [isPending,  startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        if (res.ok) {
          // Full page reload so the browser re-fetches HTML with the new cookie
          // instead of doing a client-side RSC navigation that the middleware
          // would intercept before the cookie is visible.
          window.location.href = redirectTo;
        } else {
          const body = await res.json().catch(() => ({}));
          setError(body.error || 'Login failed. Check your credentials.');
        }
      } catch {
        setError('Network error. Please try again.');
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Username */}
        <div className="space-y-1.5">
          <label htmlFor="username" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isPending}
            placeholder="Enter username"
            className={cn(
              'w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white',
              'placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-red-300' : 'border-gray-200',
            )}
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              placeholder="Enter password"
              className={cn(
                'w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border bg-white',
                'placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                error ? 'border-red-300' : 'border-gray-200',
              )}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending || !username || !password}
          className={cn(
            'w-full flex items-center justify-center gap-2',
            'py-2.5 px-4 rounded-xl text-sm font-semibold',
            'bg-indigo-600 text-white',
            'hover:bg-indigo-700 active:bg-indigo-800',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
            'transition-all disabled:opacity-50 disabled:cursor-not-allowed',
            'shadow-sm shadow-indigo-200',
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </div>
  );
}
