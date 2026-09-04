import { useNavigate } from 'react-router-dom'
import { Sparkles, AlertTriangle, Info } from 'lucide-react'
import { useAIData } from './AIAssistant'
import { buildInsights } from '../../lib/ai/engine'

export default function InsightsPanel() {
  const data = useAIData()
  const nav = useNavigate()
  const insights = buildInsights(data)
  if (insights.length === 0) return null

  const iconFor = (tone: string) => tone === 'info' ? <Info className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-brand-gradient flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <h2 className="text-base font-bold text-textprimary tracking-tight">Copilot insights</h2>
        <span className="ml-auto text-[11px] text-textmuted">computed from live data</span>
      </div>
      <div className="divide-y divide-slate-100">
        {insights.map((ins, i) => (
          <button key={i} onClick={() => nav(ins.to)} className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors">
            <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              ins.tone === 'danger' ? 'bg-danger-soft text-danger'
              : ins.tone === 'warning' ? 'bg-warning-soft text-warning'
              : ins.tone === 'info' ? 'bg-info2/10 text-info2'
              : 'bg-success-soft text-success'
            }`}>
              {iconFor(ins.tone)}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-textprimary">{ins.title}</div>
              <div className="text-xs text-textsecondary mt-0.5">{ins.detail}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}