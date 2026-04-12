import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { AnalyticsReport, DailyStat, HourlyStat, TopProduct, CategoryStat } from '../../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { getProductImageSrc } from '../../utils/images'
import { exportToExcel, exportToPdf } from '../../utils/export'
import { FileDown, FileSpreadsheet } from 'lucide-react'

const PERIODS = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Today', value: 'today' },
]

export default function AnalyticsPage() {
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [hourly, setHourly] = useState<HourlyStat[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [categories, setCategories] = useState<CategoryStat[]>([])
  const [period, setPeriod] = useState('this_month')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [chartMode, setChartMode] = useState<'All' | 'Sales' | 'Debt'>('All')
  const [chartPeriod, setChartPeriod] = useState<'Daily (30d)' | 'Monthly'>('Daily (30d)')
  const [valuation, setValuation]         = useState({ potential_revenue: 0, total_cost: 0 })
  const [topDebtors, setTopDebtors]       = useState<any[]>([])
  const [slowMoving, setSlowMoving]       = useState<any[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<any[]>([])

  const load = async () => {
    const [r, d, h, tp, cats, debtors, slow, payments] = await Promise.all([
      window.api.analytics.getReport(period),
      window.api.analytics.getDaily(30),
      window.api.analytics.getHourly(selectedDay || undefined),
      window.api.analytics.getTopProducts(period),
      window.api.analytics.getCategories(period),
      window.api.analytics.getTopDebtors(),
      window.api.analytics.getSlowMoving(period),
      window.api.analytics.getPaymentBreakdown(30),
    ])
    setReport(r)
    setDaily(d)
    setHourly(h)
    setTopProducts(tp)
    setCategories(cats)
    setTopDebtors(debtors)
    setSlowMoving(slow)
    setPaymentBreakdown(payments)

    const inv: any[] = await window.api.inventory.getAll()
    setValuation({
      potential_revenue: inv.reduce((s, i) => s + (i.quantity * (i.base_price ?? 0)), 0),
      total_cost: inv.reduce((s, i) => s + (i.quantity * (i.base_cost ?? 0)), 0),
    })
  }

  useEffect(() => { load() }, [period, selectedDay])

  const handleExcelExport = () => {
    exportToExcel([
      {
        name: 'Summary',
        rows: [{
          Period: PERIODS.find(p => p.value === period)?.label ?? period,
          'Total Sales': report?.total_sales ?? 0,
          'Net Profit': report?.net_profit ?? 0,
          'Order Count': report?.order_count ?? 0,
          'Avg Sale': report?.avg_sale ?? 0,
          'Outstanding Debt': report?.debt_outstanding ?? 0,
        }],
      },
      { name: 'Daily Sales', rows: daily.map(d => ({ Date: d.date, Sales: d.sales, Profit: d.profit, Cost: d.cost })) },
      { name: 'Top Products', rows: topProducts.map(p => ({ Name: p.name, 'Qty Sold': p.total_qty, Revenue: p.total_revenue })) },
      { name: 'Top Creditors', rows: topDebtors.map(d => ({ Name: d.name, Phone: d.phone ?? '', Balance: d.balance })) },
      { name: 'Slow Moving', rows: slowMoving.map(p => ({ Name: p.name, 'Period Sold': p.period_sold, 'Monthly Avg': p.monthly_sold })) },
      { name: 'Payments', rows: paymentBreakdown.map(p => ({ Date: p.date, Cash: p.cash, GCash: p.gcash, Card: p.card, Other: p.other })) },
    ], `analytics-${period}-${new Date().toISOString().slice(0,10)}`)
  }

  const handlePdfExport = () => {
    const rows = (arr: any[], cols: string[]) =>
      `<table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
      arr.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`).join('') +
      `</tbody></table>`

    const html = `
      <div class="section-title">Summary — ${PERIODS.find(p => p.value === period)?.label}</div>
      ${rows([{ 'Total Sales': `₱${(report?.total_sales??0).toLocaleString()}`, 'Net Profit': `₱${(report?.net_profit??0).toLocaleString()}`, 'Orders': report?.order_count??0, 'Avg Sale': `₱${(report?.avg_sale??0).toLocaleString()}`, 'Outstanding Debt': `₱${(report?.debt_outstanding??0).toLocaleString()}` }], ['Total Sales','Net Profit','Orders','Avg Sale','Outstanding Debt'])}
      <div class="section-title">Top Products</div>
      ${rows(topProducts.map(p => ({ Name: p.name, 'Qty Sold': p.total_qty, Revenue: `₱${p.total_revenue.toLocaleString()}` })), ['Name','Qty Sold','Revenue'])}
      <div class="section-title">Top 10 Creditors</div>
      ${rows(topDebtors.map(d => ({ Name: d.name, Phone: d.phone??'', Balance: `₱${Number(d.balance).toLocaleString()}` })), ['Name','Phone','Balance'])}
      <div class="section-title">Slow-Moving Items</div>
      ${rows(slowMoving.map(p => ({ Name: p.name, 'Sold This Period': p.period_sold, 'Monthly Avg': p.monthly_sold })), ['Name','Sold This Period','Monthly Avg'])}
    `
    exportToPdf(`Analytics Report — ${PERIODS.find(p => p.value === period)?.label}`, html)
  }

  const displayDay = selectedDay
    ? new Date(selectedDay).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : daily[0]?.date
      ? new Date(daily[0].date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'Today'

  const selectedDaySales = selectedDay
    ? daily.find(d => d.date === selectedDay)?.sales || 0
    : daily[0]?.sales || 0
  const selectedDayProfit = selectedDay
    ? daily.find(d => d.date === selectedDay)?.profit || 0
    : daily[0]?.profit || 0
  const selectedDayCost = selectedDay
    ? daily.find(d => d.date === selectedDay)?.cost || 0
    : daily[0]?.cost || 0

  // Build full 24h array
  const fullHourly = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourly.find(x => x.hour === h)?.count || 0,
  }))
  const maxHour = fullHourly.reduce((m, h) => h.count > m.count ? h : m, fullHourly[0])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Analytics & Reports" back="/" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Period picker + export */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p.value ? 'bg-[#1a8eff] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleExcelExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={handlePdfExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600">
              <FileDown size={13} /> PDF
            </button>
          </div>
        </div>

        {/* Monthly performance */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">This Month's Performance</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Sales', value: `₱${(report?.total_sales || 0).toLocaleString()}`, icon: '💰', color: 'bg-blue-50' },
              { label: 'Net Profit', value: `₱${(report?.net_profit || 0).toLocaleString()}`, icon: '💵', color: 'bg-green-50', green: true },
              { label: 'Total Sales Count', value: String(report?.order_count || 0), icon: '📋', color: 'bg-purple-50' },
              { label: 'Avg. Sale Value', value: `₱${(report?.avg_sale || 0).toLocaleString()}`, icon: '📊', color: 'bg-orange-50' },
            ].map(c => (
              <div key={c.label} className={`${c.color} rounded-xl p-4`}>
                <p className="text-lg mb-1">{c.icon}</p>
                <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
                <p className={`text-lg font-bold ${c.green ? 'text-green-600' : 'text-gray-800'}`}>{c.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Debt overview */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">This Month's Debt Overview</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Outstanding Debt', value: `₱${(report?.debt_outstanding || 0).toLocaleString()}`, color: 'bg-red-50', icon: '👥' },
              { label: 'New Debt Added', value: `₱${(report?.debt_added || 0).toLocaleString()}`, color: 'bg-orange-50', icon: '↑' },
              { label: 'Payments Received', value: `₱${(report?.debt_paid || 0).toLocaleString()}`, color: 'bg-green-50', icon: '↓' },
            ].map(c => (
              <div key={c.label} className={`${c.color} rounded-xl p-4`}>
                <p className="text-xl mb-1">{c.icon}</p>
                <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
                <p className="text-lg font-bold text-gray-800">{c.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sales Trend Chart */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-gray-800">Sales Trend</p>
            <div className="flex gap-1">
              {(['All','Sales','Debt'] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)}
                  className={`px-2 py-1 rounded text-xs font-medium ${chartMode === m ? 'bg-[#1a8eff] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {m}
                </button>
              ))}
              {(['Daily (30d)','Monthly'] as const).map(m => (
                <button key={m} onClick={() => setChartPeriod(m)}
                  className={`px-2 py-1 rounded text-xs font-medium ${chartPeriod === m ? 'bg-[#1a8eff] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={[...daily].reverse()} onClick={(e) => e?.activeLabel && setSelectedDay(e.activeLabel as string)}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis hide />
              <Tooltip formatter={(v: any) => `₱${Number(v).toLocaleString()}`} />
              <Bar dataKey="sales" fill="#e2e8f0" radius={[3,3,0,0]}>
                {daily.map((d, i) => (
                  <Cell key={i} fill={d.date === (selectedDay || daily[0]?.date) ? '#94a3b8' : '#e2e8f0'} />
                ))}
              </Bar>
              <Bar dataKey="profit" fill="#86efac" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 pt-3 border-t flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400 uppercase">Selected Period</p>
              <p className="font-semibold text-gray-800">{displayDay}</p>
            </div>
            <div className="flex gap-6 text-right">
              <div><p className="text-xs text-gray-400">Sales</p><p className="font-bold text-gray-800">₱{selectedDaySales.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Profit</p><p className="font-bold text-green-500">₱{selectedDayProfit.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Cost</p><p className="font-bold text-gray-600">₱{selectedDayCost.toLocaleString()}</p></div>
            </div>
          </div>
        </div>

        {/* Two column: Busiest Hours + Top Products */}
        <div className="grid grid-cols-2 gap-4">
          {/* Busiest Hours */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">Busiest Hours (Manila Time)</p>
            <div className="flex gap-1">
              <div className="flex-1">
                <p className="text-xs text-gray-400 text-center mb-1">AM (00:00 - 11:59)</p>
                <div className="flex items-end gap-0.5 h-20">
                  {fullHourly.slice(0,12).map(h => (
                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className={`w-full rounded-t transition-all ${h.hour === maxHour.hour ? 'bg-[#1a8eff]' : 'bg-blue-100'}`}
                        style={{ height: `${maxHour.count ? (h.count / maxHour.count) * 100 : 0}%`, minHeight: h.count ? 4 : 0 }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  {[12,3,6,9].map(h => <span key={h}>{h}</span>)}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 text-center mb-1">PM (12:00 - 23:59)</p>
                <div className="flex items-end gap-0.5 h-20">
                  {fullHourly.slice(12).map(h => (
                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className={`w-full rounded-t transition-all ${h.hour === maxHour.hour ? 'bg-[#1a8eff]' : 'bg-blue-100'}`}
                        style={{ height: `${maxHour.count ? (h.count / maxHour.count) * 100 : 0}%`, minHeight: h.count ? 4 : 0 }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  {[12,3,6,9].map(h => <span key={h}>{h}</span>)}
                </div>
              </div>
            </div>
            {maxHour.count > 0 && (
              <div className="mt-3 pt-3 border-t text-center">
                <p className="text-xs text-gray-400">{maxHour.hour === 0 ? '12' : maxHour.hour > 12 ? maxHour.hour - 12 : maxHour.hour}:00 {maxHour.hour < 12 ? 'AM' : 'PM'} – {maxHour.hour === 0 ? '12' : maxHour.hour > 12 ? maxHour.hour - 12 : maxHour.hour}:59 {maxHour.hour < 12 ? 'AM' : 'PM'}</p>
                <p className="font-bold text-gray-800">{maxHour.count} sales</p>
              </div>
            )}
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">Top Products (Selected Period)</p>
            {topProducts.slice(0, 5).map((p, i) => (
              <div key={p.product_id || i} className="flex items-center gap-3 mb-3">
                <span className="text-gray-400 font-bold w-4 text-sm">{i + 1}</span>
                <div className="w-8 h-8 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                  {p.image_path && <img src={getProductImageSrc(p.image_path)} alt={p.name ?? ""} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.total_qty} sold</p>
                </div>
                <p className="text-sm font-bold text-gray-800">₱{p.total_revenue.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Category Performance */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-4">Category Performance (Selected Period)</p>
          {categories.map(c => (
            <div key={c.category_name} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{c.category_name}</span>
                <span className="font-medium text-gray-800">₱{c.total.toLocaleString()} ({c.pct}%)</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1a8eff] rounded-full transition-all" style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Inventory Valuation */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">Inventory Valuation</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="border-2 border-green-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Potential Revenue (Selling Price)</p>
              <p className="text-2xl font-bold text-green-600">₱{valuation.potential_revenue.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Total value if all current stock is sold</p>
            </div>
            <div className="border-2 border-blue-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Inventory Cost</p>
              <p className="text-2xl font-bold text-[#1a8eff]">₱{valuation.total_cost.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Total cost invested in current stock</p>
            </div>
          </div>
        </div>

        {/* Payments Monitoring */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">Payments by Method (Last 30 Days)</p>
          {paymentBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No payment data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={paymentBreakdown}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis hide />
                <Tooltip formatter={(v: any) => `₱${Number(v).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="cash"  name="Cash"  stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                <Bar dataKey="gcash" name="GCash" stackId="a" fill="#3b82f6" />
                <Bar dataKey="card"  name="Card"  stackId="a" fill="#a855f7" />
                <Bar dataKey="other" name="Other" stackId="a" fill="#f59e0b" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Reports: Creditors + Slow-Moving */}
        <div className="grid grid-cols-2 gap-4">
          {/* Top 10 Creditors */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">Top 10 Creditors (Highest Balance)</p>
            {topDebtors.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No outstanding debts.</p>
            ) : topDebtors.map((d, i) => (
              <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                  {d.phone && <p className="text-xs text-gray-400">{d.phone}</p>}
                </div>
                <span className="text-sm font-bold text-red-500">₱{Number(d.balance).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Top 10 Slow-Moving Items */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">Top 10 Slow-Moving Items</p>
            {slowMoving.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No product data yet.</p>
            ) : slowMoving.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.period_sold} sold this period</p>
                </div>
                <span className="text-xs text-gray-500 shrink-0">{p.monthly_sold}/mo avg</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
