"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"candidate" | "expert">("candidate");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create account.");
      }

      // Redirect to home or onboarding
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1918] flex flex-col justify-center items-center px-6 py-12 selection:bg-[#E5E2DA]">
      <div className="w-full max-w-md space-y-6">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center text-xs font-mono text-[#6E6B65] hover:text-[#1A1918] transition-colors focus-visible:outline-2 focus-visible:outline-[#1A1918]"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          <span>Back to Quorix Home</span>
        </Link>

        {/* Register Card */}
        <div className="border border-[#D5D1C7] bg-[#FFFFFF] p-8 shadow-xs space-y-6">
          <div className="space-y-1">
            <div className="text-xs font-mono text-[#6E6B65] uppercase">
              Registration (SRS §3.1)
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1A1918]">
              Create your account
            </h1>
            <p className="text-xs text-[#55524C] leading-relaxed">
              Join Quorix to practice mock interviews with real-time AI scoring or participate as an industry board expert.
            </p>
          </div>

          {error && (
            <div className="border border-[#E5C9C0] bg-[#FAF3F0] p-3 text-xs text-[#B45332] flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="block text-xs font-medium text-[#1A1918]"
              >
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2 text-sm text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-[#1A1918]"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@organization.com"
                className="w-full border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2 text-sm text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-[#1A1918]"
              >
                Password (min. 8 characters)
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-[#D5D1C7] bg-[#FAF8F5] px-3.5 py-2 text-sm text-[#1A1918] placeholder-[#8E8B84] focus-visible:outline-2 focus-visible:outline-[#1A1918] transition-colors"
              />
            </div>

            {/* Role Selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#1A1918]">
                Account Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("candidate")}
                  className={`p-3 text-left border transition-all text-xs ${
                    role === "candidate"
                      ? "border-[#1A1918] bg-[#FAF8F5] text-[#1A1918] font-semibold"
                      : "border-[#E5E2DA] bg-[#FFFFFF] text-[#6E6B65] hover:border-[#D5D1C7]"
                  }`}
                >
                  <div className="font-semibold text-xs text-[#1A1918]">Candidate</div>
                  <div className="text-[10px] text-[#6E6B65] mt-0.5">Practice AI Mocks</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("expert")}
                  className={`p-3 text-left border transition-all text-xs ${
                    role === "expert"
                      ? "border-[#1A1918] bg-[#FAF8F5] text-[#1A1918] font-semibold"
                      : "border-[#E5E2DA] bg-[#FFFFFF] text-[#6E6B65] hover:border-[#D5D1C7]"
                  }`}
                >
                  <div className="font-semibold text-xs text-[#1A1918]">Expert Interviewer</div>
                  <div className="text-[10px] text-[#6E6B65] mt-0.5">Participate on Boards</div>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center text-xs font-medium bg-[#1A1918] text-[#FAF8F5] py-2.5 px-4 hover:bg-[#2C2A28] active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1918]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Register Account</span>
              )}
            </button>
          </form>

          <div className="border-t border-[#E5E2DA] pt-4 text-center">
            <p className="text-xs text-[#6E6B65]">
              Already registered?{" "}
              <Link
                href="/login"
                className="font-medium text-[#1A1918] hover:underline focus-visible:outline-2 focus-visible:outline-[#1A1918]"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
