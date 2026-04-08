import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { AnalyticsReport, DailyStat, HourlyStat, TopProduct, CategoryStat } from '../../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getProductImageSrc } from '../../utils/images'

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
  const [valuation, setValuation] = useState({ potential_revenue: 0, total_cost: 0 })

  const load = async () => {
    const [r, d, h, tp, cats] = await Promise.all([
      window.api.analytics.getReport(period),
      window.api.analytics.getDaily(30),
      window.api.analytics.getHourly(selectedDay || undefined),
      window.api.analytics.getTopProducts(period),
      window.api.analytics.getCategories(period),
    ])
    setReport(r)
    setDaily(d)
    setHourly(h)
    setTopProducts(tp)
    setCategories(cats)

    // Inventory valuation from inventory endpoint
    const inv: any[] = await window.api.inventory.getAll()
    setValuation({
      potential_revenue: inv.reduce((s, i) => s + (i.quantity * (i.base_price ?? 0)), 0),
      total_cost: inv.reduce((s, i) => s + (i.quantity * (i.base_cost ?? 0)), 0),
    })
  }

  useEffect(() => { load() }, [period, selectedDay])

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
                  {p.image_path && <img src={getProductImageSrc(p.image_path)} className="w-full h-full object-cover" />}
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
      </div>
    </div>
  )
}
