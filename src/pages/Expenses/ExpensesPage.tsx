import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

const CATEGORIES = ['Utilities', 'Rent', 'Salaries', 'Supplies', 'Maintenance', 'Transportation', 'Other']

type Expense = {
  id: string
  category: string
  description: string
  amount: number
  date: string
}

const today = () => new Date().toISOString().slice(0, 10)

const blank = (): Omit<Expense, 'id'> => ({
  category: 'Other',
  description: '',
  amount: 0,
  date: today(),
})

export default function ExpensesPage() {
  const [expenses, setExpenses]   = useState<Expense[]>([])
  const [summary, setSummary]     = useState<{ rows: any[]; total: number }>({ rows: [], total: 0 })
  const [period, setPeriod]       = useState<'today' | 'week' | 'month' | 'year'>('month')
  const [trendData, setTrendData] = useState<{ label: string; amount: number }[]>([])
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<Expense | null>(null)
  const [form, setForm]           = useState(blank())
  const [saving, setSaving]       = useState(false)
  const [filterCat, setFilterCat] = useState('')

  const load = async () => {
    const [list, sum] = await Promise.all([
      window.api.expenses.getAll(filterCat ? { category: filterCat } : {}),
      window.api.expenses.getSummary(period),
    ])
    setExpenses(list)
    setSummary(sum)

    // Build bar chart trend data from the expense list grouped by date
    const byDate: Record<string, number> = {}
    for (const e of list as Expense[]) {
      byDate[e.date] = (byDate[e.date] || 0) + e.amount
    }
    const sorted = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({
        label: date.slice(5), // "MM-DD"
        amount: Math.round(amount * 100) / 100,
      }))
    setTrendData(sorted)
  }

  useEffect(() => { load() }, [period, filterCat])

  const openAdd = () => { setEditing(null); setForm(blank()); setShowForm(true) }
  const openEdit = (e: Expense) => { setEditing(e); setForm({ category: e.category, description: e.description, amount: e.amount, date: e.date }); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null) }

  const handleSave = async () => {
    if (!form.amount || form.amount <= 0) return
    setSaving(true)
    if (editing) {
      await window.api.expenses.update(editing.id, form)
    } else {
      await window.api.expenses.create(form)
    }
    setSaving(false)
    closeForm()
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    await window.api.expenses.delete(id)
    load()
  }

  const fmt = (n: number) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Expenses" back="/" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">

          {/* Summary */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Total Expenses</h3>
              <div className="flex gap-1">
                {(['today','week','month','year'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${period === p ? 'bg-[#1a8eff] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{fmt(summary.total)}</p>
            {summary.rows.length > 0 && (
              <div className="mt-3 space-y-1">
                {(summary.rows as any[]).map((r: any) => (
                  <div key={r.category} className="flex justify-between text-sm">
                    <span className="text-gray-600">{r.category}</span>
                    <span className="font-medium text-gray-800">{fmt(r.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trend bar chart */}
          {trendData.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Expense Trend</h3>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {trendData.map((_, i) => (
                      <Cell key={i} fill={i === trendData.length - 1 ? '#f43f5e' : '#fda4af'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={openAdd}
              className="flex items-center gap-2 bg-[#1a8eff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0077e6]">
              <Plus size={16} /> Add Expense
            </button>
          </div>

          {/* List */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {expenses.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">No expenses recorded yet.</p>
            ) : (
              expenses.map(exp => (
                <div key={exp.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{exp.category}</span>
                      <span className="text-xs text-gray-400">{exp.date}</span>
                    </div>
                    {exp.description && <p className="text-sm text-gray-700 mt-0.5 truncate">{exp.description}</p>}
                  </div>
                  <span className="font-semibold text-gray-900 shrink-0">{fmt(exp.amount)}</span>
                  <button onClick={() => openEdit(exp)} className="text-gray-400 hover:text-[#1a8eff]"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(exp.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{editing ? 'Edit Expense' : 'Add Expense'}</h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Meralco bill"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
                <input type="number" min="0" step="0.01" value={form.amount || ''}
                  onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={closeForm} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.amount}
                className="flex-1 py-2.5 rounded-xl bg-[#1a8eff] text-white text-sm font-semibold hover:bg-[#0077e6] disabled:opacity-50 flex items-center justify-center gap-2">
                <Check size={16} /> {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
