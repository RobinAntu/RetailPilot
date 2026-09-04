import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Send, Sparkles, X, Zap, RotateCcw } from 'lucide-react'
import { useDataStore } from '../../store/appStore'
import { chatAnswer, buildInsights, type AIData } from '../../lib/ai/engine'
import type { Product, Sale, StockBatch, WasteRecord } from '../../types'

interface Msg { role: 'user' | 'assistant'; text: string }

export function useAIData(): AIData {
  const settings = useDataStore((s) => s.settings)
  const products = useDataStore((s) => s.products)
  const batches = useDataStore((s) => s.batches)
  const suppliers = useDataStore((s) => s.suppliers)
  const sales = useDataStore((s) => s.sales)
  const waste = useDataStore((s) => s.waste)
  const orders = useDataStore((s) => s.orders)
  return useMemo(() => ({ products, batches, suppliers, sales, waste, orders, settings }), [settings, products, batches, suppliers, sales, waste, orders])
}

const GREETING = "Hi! 👋 I'm **RetailPilot Copilot**. I read your live store data to help you run smarter. Ask me anything — like how things are today, what to reorder, expiry risk, waste, or a sales forecast."

function render(text: string): string {
  // lightweight markdown: **bold** and * bullets already use •; convert newlines
  return text.replace(/\*\*(.+?)\*\*/g, (_, g) => `<b>${g}</b>`)
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', text: GREETING }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const data = useAIData()
  const nav = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)
  const insights = useMemo(() => buildInsights(data), [data])

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, typing, open])

  const ask = (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text || typing) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setTyping(true)
    // small delay to feel natural
    setTimeout(() => {
      const reply = chatAnswer(text, data)
      setMessages((m) => [...m, { role: 'assistant', text: reply.text }])
      setTyping(false)
      // surface quick chips after the answer
    }, 450)
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI Copilot"
          className="fixed bottom-24 lg:bottom-6 right-5 z-[85] flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-2xl bg-brand-gradient text-white font-semibold shadow-lift hover:brightness-110 active:scale-95 transition-all"
        >
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span className="hidden sm:inline text-sm">Copilot</span>
          {insights.length > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{insights.length}</span>}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed z-[86] bottom-24 lg:bottom-6 right-3 sm:right-5 w-[calc(100vw-24px)] sm:w-[400px] h-[70vh] sm:h-[560px] max-h-[80vh] flex flex-col rounded-2xl bg-card shadow-pop ring-1 ring-black/5 overflow-hidden animate-slideUp">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 bg-brand-deep text-white shrink-0">
            <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-soft">
              <Bot className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-sm flex items-center gap-1.5">RetailPilot Copilot <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /></div>
              <div className="text-[11px] text-slate-300">Reads your live store data</div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setMessages([{ role: 'assistant', text: GREETING }])} className="p-2 rounded-lg hover:bg-white/10 text-slate-200" title="Reset chat"><RotateCcw className="w-4 h-4" /></button>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-white/10 text-slate-200" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-page">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                    m.role === 'user'
                      ? 'bg-brand-gradient text-white rounded-2xl rounded-br-md shadow-soft'
                      : 'bg-white border border-border rounded-2xl rounded-bl-md shadow-card text-textprimary'
                  }`}
                  dangerouslySetInnerHTML={{ __html: render(m.text) }}
                />
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-white border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '240ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Quick chips */}
          <div className="px-4 pt-2 flex gap-2 overflow-x-auto shrink-0 pb-1">
            {insights.slice(0, 3).map((ins, i) => (
              <button key={i} onClick={() => nav(ins.to)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary-soft text-primary hover:bg-primary/15 transition-colors">
                <Zap className="w-3 h-3" />{ins.title}
              </button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); ask() }} className="p-3 pt-1 flex items-center gap-2 shrink-0 border-t border-border bg-card">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about sales, stock, expiry, waste…"
              className="input flex-1 min-h-[46px]"
            />
            <button type="submit" disabled={!input.trim() || typing} className="btn-gradient min-h-[46px] w-12 p-0 !px-0" aria-label="Send">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}