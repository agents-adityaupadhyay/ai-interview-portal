"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { AuthShell, FormAlert, PasswordField, Spinner } from "@/components/AuthShell";

interface Organization {
  id: string;
  name: string;
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        setOrganizations(Array.isArray(data) ? data : (data.organizations ?? []));
        setOrgsLoading(false);
      })
      .catch(() => {
        setOrgsLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, orgId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      setError("");
      setSuccess("Account created successfully! Please wait for your organization admin to activate your account before logging in.");
      setLoading(false);
      return;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <AuthShell
      showcaseTitle="Start hiring with confidence"
      showcaseSubtitle="Set up in minutes. Create AI-powered interviews, share a link with your candidate and get a structured evaluation back."
      title="Create your account"
      subtitle="Join your organization on InterviewAI"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <FormAlert tone="error">{error}</FormAlert>}
        {success && <FormAlert tone="success">{success}</FormAlert>}

        <div>
          <label htmlFor="reg-name" className="label">Full name</label>
          <input
            id="reg-name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="input-field !py-2.5"
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="label">Work email</label>
          <input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="input-field !py-2.5"
          />
        </div>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="Create a password"
          minLength={8}
          hint="At least 8 characters"
        />

        <div>
          <label htmlFor="reg-org" className="label">Organization</label>
          <select
            id="reg-org"
            required
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="input-field !py-2.5"
            disabled={orgsLoading}
            aria-describedby="reg-org-hint"
          >
            <option value="">
              {orgsLoading ? "Loading organizations…" : "Select your organization"}
            </option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <p id="reg-org-hint" className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            An admin needs to approve your account before you can sign in.
          </p>
        </div>

        <button type="submit" disabled={loading} aria-busy={loading} className="btn-primary mt-2 w-full !py-3 text-[15px]">
          {loading ? (
            <>
              <Spinner />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
