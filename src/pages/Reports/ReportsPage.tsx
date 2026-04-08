import { ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { FinancialStatements } from '../../types'
import { BarChart2, CreditCard, FileText, LockKeyhole, Sparkles } from 'lucide-react'

const PERIODS = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Today', value: 'today' },
] as const

const REPORT_TABS = [
  { key: 'profit_and_loss', label: 'Profit & Loss' },
  { key: 'income_statement', label: 'Income Statement' },
  { key: 'trial_balance', label: 'Trial Balance' },
] as const

type ReportTab = typeof REPORT_TABS[number]['key']

export default function ReportsPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('this_month')
  const [activeTab, setActiveTab] = useState<ReportTab>('profit_and_loss')
  const [financials, setFinancials] = useState<FinancialStatements | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPro, setIsPro] = useState(false)

  useEffect(() => {
    window.api.activation.getStatus().then(status => setIsPro(status.activated === true))
  }, [])

  useEffect(() => {
    if (!isPro) return
    setLoading(true)
    setError(null)
    window.api.analytics.getFinancials(period)
      .then((data) => {
        setFinancials(data)
        setLoading(false)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load financial reports')
        setLoading(false)
      })
  }, [isPro, period])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Financial Reports" back="/" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-[28px] bg-gradient-to-br from-[#0f8c71] to-[#085d49] p-6 text-white shadow-[0_22px_50px_rgba(8,93,73,0.2)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Reyna Pro</p>
              <h2 className="mt-2 text-3xl font-semibold">Financial statement hub</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
                Generate operational financial views from your current POS data, including Profit & Loss, Income Statement, and Trial Balance.
              </p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4">
              <Sparkles size={30} />
            </div>
          </div>
        </div>

        {!isPro ? (
          <div className="rounded-[28px] border border-dashed border-[#1a8eff]/30 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-[#1a8eff]">
              <LockKeyhole size={28} />
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-slate-900">Financial reports are part of Reyna Pro</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Upgrade to unlock automated Profit & Loss, Income Statement, and Trial Balance views. Your core POS remains available without a subscription.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => navigate('/pro')}
                className="rounded-2xl bg-[#1a8eff] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0077e6]"
              >
                Upgrade to Pro
              </button>
              <button
                onClick={() => navigate('/analytics')}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-gray-50"
              >
                View Free Analytics
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {REPORT_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      activeTab === tab.key ? 'bg-[#1a8eff] text-white' : 'bg-white text-slate-600 border border-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                {PERIODS.map(item => (
                  <button
                    key={item.value}
                    onClick={() => setPeriod(item.value)}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      period === item.value ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-gray-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_360px]">
              <StatementPanel activeTab={activeTab} financials={financials} loading={loading} error={error} />
              <ReportSidebar financials={financials} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatementPanel({ activeTab, financials, loading, error }: { activeTab: ReportTab; financials: FinancialStatements | null; loading: boolean; error: string | null }) {
  if (loading) {
    return <div className="rounded-[28px] bg-white p-6 text-sm text-slate-400 shadow-sm">Loading report...</div>
  }

  if (error) {
    return <div className="rounded-[28px] bg-white p-6 text-sm text-red-600 shadow-sm">Error: {error}</div>
  }

  if (!financials) {
    return <div className="rounded-[28px] bg-white p-6 text-sm text-slate-400 shadow-sm">No data available</div>
  }

  if (activeTab === 'profit_and_loss') {
    const report = financials.profit_and_loss
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-sm">
        <SectionTitle
          icon={<BarChart2 size={18} />}
          title="Profit & Loss"
          subtitle={`Period: ${financials.period.from} to ${financials.period.to}`}
        />
        <LineItem label="Revenue" amount={report.revenue} strong />
        <LineItem label="Cost of Goods Sold" amount={report.cost_of_goods_sold} />
        <LineItem label="Gross Profit" amount={report.gross_profit} accent />
        <div className="mt-6 rounded-2xl bg-emerald-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/70">Net Profit</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">₱{report.net_profit.toLocaleString()}</p>
        </div>
      </div>
    )
  }

  if (activeTab === 'income_statement') {
    const report = financials.income_statement
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-sm">
        <SectionTitle
          icon={<FileText size={18} />}
          title="Income Statement"
          subtitle={`Period: ${financials.period.from} to ${financials.period.to}`}
        />
        <LineItem label="Net Sales" amount={report.net_sales} strong />
        <LineItem label="Cost of Sales" amount={report.cost_of_sales} />
        <LineItem label="Gross Income" amount={report.gross_income} accent />
        <LineItem label="Operating Expenses" amount={report.operating_expenses} />
        <LineItem label="Net Income" amount={report.net_income} accent />
        <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{report.note}</p>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-sm">
      <SectionTitle
        icon={<CreditCard size={18} />}
        title="Trial Balance"
        subtitle={`Period end context: ${financials.period.to}`}
      />
      <div className="overflow-hidden rounded-2xl border border-gray-100">
        <div className="grid grid-cols-[1.6fr_1fr_1fr] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          <span>Account</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
        </div>
        {financials.trial_balance.lines.map(line => (
          <div key={line.label} className="grid grid-cols-[1.6fr_1fr_1fr] border-t border-gray-100 px-4 py-3 text-sm text-slate-700">
            <span>{line.label}</span>
            <span className="text-right">{line.type === 'debit' ? `₱${line.amount.toLocaleString()}` : '-'}</span>
            <span className="text-right">{line.type === 'credit' ? `₱${line.amount.toLocaleString()}` : '-'}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1.6fr_1fr_1fr] border-t border-gray-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
          <span>Totals</span>
          <span className="text-right">₱{financials.trial_balance.total_debits.toLocaleString()}</span>
          <span className="text-right">₱{financials.trial_balance.total_credits.toLocaleString()}</span>
        </div>
      </div>
      <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{financials.trial_balance.note}</p>
    </div>
  )
}

function ReportSidebar({ financials }: { financials: FinancialStatements | null }) {
  if (!financials) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Quick Summary</p>
        <div className="mt-4 space-y-4">
          <SummaryCard label="Revenue" value={financials.profit_and_loss.revenue} tone="text-slate-900" />
          <SummaryCard label="Gross Profit" value={financials.profit_and_loss.gross_profit} tone="text-emerald-700" />
          <SummaryCard label="Receivables" value={getTrialLine(financials, 'Accounts Receivable')} tone="text-orange-600" />
          <SummaryCard label="Inventory Cost" value={getTrialLine(financials, 'Inventory on Hand')} tone="text-blue-700" />
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Read This First</p>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
          <li>These statements are generated from the sales, debtor, and inventory records currently stored in the POS.</li>
          <li>Operating expenses are not yet tracked, so some values are operational estimates rather than full bookkeeping output.</li>
          <li>For stronger financial reports later, the next best upgrade is adding expense tracking and supplier purchasing records.</li>
        </ul>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="rounded-2xl bg-blue-50 p-3 text-[#1a8eff]">{icon}</div>
      <div>
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}

function LineItem({ label, amount, strong, accent }: { label: string; amount: number; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-4 last:border-0">
      <span className={`text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-lg font-semibold ${accent ? 'text-emerald-700' : 'text-slate-900'}`}>₱{amount.toLocaleString()}</span>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>₱{value.toLocaleString()}</p>
    </div>
  )
}

function getTrialLine(financials: FinancialStatements, label: string) {
  return financials.trial_balance.lines.find(line => line.label === label)?.amount || 0
}
