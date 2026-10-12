import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { messageFor } from '../lib/errors';
import { authApi } from '../services/api';
import { Field, inputClass, PrimaryButton } from '../components/ui';

const proofs = [
  { title: 'Demand, scored', body: 'Each SKU and warehouse gets a stored forecast your team can audit.' },
  { title: 'Risk, before the miss', body: 'Cover and stockout probability sit next to the order quantity.' },
  { title: 'Orders, after a person', body: 'The assistant explains the math. Approval still creates the purchase order.' },
];

function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-ink px-12 py-14 text-stone-200 lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-copper text-[13px] font-bold text-white">Iv</span>
          <div>
            <p className="text-sm font-semibold text-white">Invorra</p>
            <p className="text-[11px] text-stone-400">Inventory intelligence</p>
          </div>
        </div>
        <div className="mt-16 max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-copper">For FMCG planners</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.15] tracking-tight text-white">
            See the stockout before the dark store does.
          </h1>
          <p className="mt-5 text-base leading-7 text-stone-300">
            Forecast demand, measure cover, and turn a replenishment decision into a purchase order your team can approve.
          </p>
        </div>
        <ul className="mt-12 max-w-md space-y-4">
          {proofs.map((proof) => (
            <li key={proof.title} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-sm font-semibold text-white">{proof.title}</p>
              <p className="mt-1 text-sm leading-6 text-stone-400">{proof.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-10 text-xs text-stone-500">Deterministic quantities. Human approval.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-copper lg:hidden">Invorra</p>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <p className="mt-6 text-sm text-stone-500">{footer}</p>
        </div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('owner@nimbus.invorra');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await authApi.login({ email, password });
      setUser(result.user);
      navigate('/dashboard');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      title="Sign in"
      subtitle="Use the organization account your team was given."
      footer={
        <>
          New brand? <Link to="/register" className="font-semibold text-ink">Create an organization</Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Email">
          <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <PrimaryButton className="w-full" type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>
      </form>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await authApi.register(form);
      setUser(result.user);
      navigate('/dashboard');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPending(false);
    }
  }

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <AuthFrame
      title="Create your organization"
      subtitle="The first user becomes the owner."
      footer={
        <>
          Already registered? <Link to="/login" className="font-semibold text-ink">Sign in</Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Organization">
          <input className={inputClass} value={form.organizationName} onChange={(event) => update('organizationName', event.target.value)} required />
        </Field>
        <Field label="Your name">
          <input className={inputClass} value={form.name} onChange={(event) => update('name', event.target.value)} required />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" value={form.password} onChange={(event) => update('password', event.target.value)} required />
        </Field>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <PrimaryButton className="w-full" type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create organization'}
        </PrimaryButton>
      </form>
    </AuthFrame>
  );
}
