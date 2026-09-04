import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Store, Eye, EyeOff, Building2, ShieldCheck } from 'lucide-react'
import { getBackend } from '../lib/backend'
import { toast } from '../components/ui/toast'
import { Spinner } from '../components/ui/Spinner'

export default function SignupPage() {
  const [form, setForm] = useState({ storeName: '', name: '', email: '', password: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.storeName || !form.name || !form.email || form.password.length < 6) {
      toast('warning', 'Missing details', 'Complete all fields; password must be at least 6 characters.')
      return
    }
    setBusy(true)
    try {
      const s = await getBackend().signUp({ ...form, role: 'owner' })
      toast('success', 'Store created', `Welcome to RetailPilot, ${s.name}`)
      navigate('/', { replace: true })
    } catch (err: any) {
      toast('error', 'Sign up failed', err?.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-deep relative overflow-hidden flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-[460px] h-[460px] rounded-full bg-primary/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-soft"><Store className="w-5 h-5 text-white" /></div>
          <div className="text-left">
            <div className="text-white text-xl font-extrabold tracking-tight">RetailPilot</div>
            <div className="text-slate-400 text-xs">Smarter Stock. Less Waste. More Profit.</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] ring-1 ring-white/20 p-8 animate-slideUp">
          <h1 className="text-xl font-bold text-textprimary tracking-tight">Create your store</h1>
          <p className="text-sm text-textsecondary mt-1 mb-6">Set up the Owner account for your supermarket.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Store name</label>
              <input className="input" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} placeholder="FreshMart Supermarket" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Your name</label>
                <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@store.com.au" />
              </div>
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} className="input pr-11" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 6 characters" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-textmuted hover:text-textprimary p-1">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-success-soft text-success text-xs">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Your Owner account has full access. Invite Managers and Staff from the Users page after signing in.</span>
            </div>

            <button type="submit" className="btn-gradient w-full" disabled={busy}>
              {busy ? <Spinner className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
              Create Store & Sign In
            </button>
          </form>

          <p className="text-center text-sm text-textsecondary mt-6">
            Already have an account? <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}