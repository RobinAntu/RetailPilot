import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Store, ScanLine, PackageCheck, TrendingUp, ShieldCheck } from 'lucide-react'
import { getBackend } from '../lib/backend'
import { toast } from '../components/ui/toast'
import { Spinner } from '../components/ui/Spinner'

const FEATURES = [
  { icon: ScanLine, title: 'Blazing-fast POS & scanning', text: 'USB, Bluetooth, camera or manual entry.' },
  { icon: PackageCheck, title: 'FEFO expiry control', text: 'Deduct the oldest stock first. Less waste.' },
  { icon: TrendingUp, title: 'Profit in real time', text: 'See revenue, COGS and margin from one screen.' },
  { icon: ShieldCheck, title: 'Role-based security', text: 'Owner, Manager & Staff permissions.' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [forgotBusy, setForgotBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { toast('warning', 'Missing details', 'Enter your email and password.'); return }
    setBusy(true)
    try {
      const s = await getBackend().signIn(email, password)
      toast('success', 'Welcome back', `Signed in as ${s.name}`)
      navigate('/', { replace: true })
    } catch (err: any) {
      toast('error', 'Sign in failed', err?.message || 'Please check your credentials.')
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!email) { toast('warning', 'Enter your email', 'We need your email to reset the password.'); return }
    setForgotBusy(true)
    try {
      await getBackend().sendPasswordReset(email)
      toast('success', 'Password reset sent', `If ${email} exists, a reset link has been sent.`)
    } catch (err: any) {
      toast('error', 'Reset failed', err?.message)
    } finally {
      setForgotBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-deep relative overflow-hidden flex">
      {/* Ambient glows */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-cyan2/10 blur-3xl pointer-events-none" />

      {/* Left hero panel */}
      <div className="hidden lg:flex w-1/2 flex-col justify-center px-16 xl:px-24 relative z-10">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(6,182,212,0.9)]">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-white text-2xl font-extrabold tracking-tight">RetailPilot</div>
            <div className="text-slate-400 text-sm">Smarter Stock. Less Waste. More Profit.</div>
          </div>
        </div>

        <h1 className="text-white text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight">
          Your supermarket,
          <br />
          <span className="text-gradient">perfectly in control.</span>
        </h1>
        <p className="text-slate-300 text-lg mt-6 max-w-md leading-relaxed">
          One connected system for scanning, stock, expiry, waste, purchasing and profit — built for the whole team.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4 max-w-xl">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-4 hover:bg-white/[0.07] transition-colors">
              <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center mb-3">
                <f.icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-white font-semibold text-sm">{f.title}</div>
              <div className="text-slate-400 text-xs mt-1">{f.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div className="w-11 h-11 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-soft"><Store className="w-5 h-5 text-white" /></div>
            <div className="text-left">
              <div className="text-white text-xl font-extrabold tracking-tight">RetailPilot</div>
              <div className="text-slate-400 text-xs">Smarter Stock. Less Waste. More Profit.</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] ring-1 ring-white/20 p-8 animate-slideUp">
            <h1 className="text-xl font-bold text-textprimary tracking-tight">Welcome back</h1>
            <p className="text-sm text-textsecondary mt-1 mb-6">Sign in to your supermarket console.</p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com.au" className="input" />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input pr-11" />
                  <button type="button" onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-textmuted hover:text-textprimary p-1">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <button type="button" onClick={forgot} className="text-primary hover:underline text-sm font-medium" disabled={forgotBusy}>
                  {forgotBusy ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
              <button type="submit" className="btn-gradient w-full" disabled={busy}>
                {busy ? <Spinner className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                Sign In
              </button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-textmuted">New to RetailPilot?</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Link to="/signup" className="btn-secondary w-full">
              Create an Owner account
            </Link>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            © {new Date().getFullYear()} RetailPilot · Trusted by supermarkets
          </p>
        </div>
      </div>
    </div>
  )
}