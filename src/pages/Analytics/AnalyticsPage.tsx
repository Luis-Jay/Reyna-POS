import { useEffect, useMemo, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { AnalyticsRange, AnalyticsReport, CashflowPoint, HourlyStat, TopProduct, CategoryStat } from '../../types'
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, Line, Cell } from 'recharts'
import { getProductImageSrc } from '../../utils/images'
import { exportToExcel, exportToPdf } from '../../utils/export'
import { FileDown, FileSpreadsheet } from 'lucide-react'

const FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Custom', value: 'custom' },
] as const

type FilterPreset = typeof FILTERS[number]['value']

function inRange(date: string, from?: string, to?: string) {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

function shiftDays(dateStr: string, delta: number) {
  const date = new Date(`${dateStr}T00:00:00+08:00`)
  date.setDate(date.getDate() + delta)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

function monthBounds(offsetMonths = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const end = offsetMonths === 0
    ? new Date()
    : new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0)
  const fmt = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
  return { from: fmt(start), to: fmt(end) }
}

function rangeForPreset(preset: Exclude<FilterPreset, 'custom'>): AnalyticsRange {
  const current = today()
  if (preset === 'today') return { preset }
  if (preset === 'yesterday') {
    const value = shiftDays(current, -1)
    return { preset, from: value, to: value }
  }
  if (preset === 'last_7_days') {
    return { preset, from: shiftDays(current, -6), to: current }
  }
  return { preset, ...monthBounds(-1) }
}

export default function AnalyticsPage() {
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [cashflow, setCashflow] = useState<CashflowPoint[]>([])
  const [hourly, setHourly] = useState<HourlyStat[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [categories, setCategories] = useState<CategoryStat[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [valuation, setValuation] = useState({ potential_revenue: 0, total_cost: 0 })
  const [topDebtors, setTopDebtors] = useState<any[]>([])
  const [slowMoving, setSlowMoving] = useState<any[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<any[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('last_7_days')
  const [customRange, setCustomRange] = useState(() => {
    const current = today()
    return { from: shiftDays(current, -6), to: current }
  })

  const range = useMemo<AnalyticsRange>(() => {
    if (filterPreset === 'custom') return customRange
    return rangeForPreset(filterPreset)
  }, [filterPreset, customRange])

  const load = async () => {
    setLoadError(null)
    const daysInRange = Math.max(
      1,
      Math.round(
        (new Date(`${range.to || today()}T00:00:00+08:00`).getTime() - new Date(`${range.from || today()}T00:00:00+08:00`).getTime()) / 86400000
      ) + 1
    )

    try {
      const results = await Promise.allSettled([
        window.api.analytics.getReport(range),
        window.api.analytics.getCashflow(range),
        window.api.analytics.getTopProducts(range),
        window.api.analytics.getCategories(range),
        window.api.analytics.getTopDebtors(),
        window.api.analytics.getSlowMoving(range),
        window.api.analytics.getPaymentBreakdown(Math.max(daysInRange, 7)),
        window.api.inventory.getAll(),
      ])

      const [
        reportResult,
        cashflowResult,
        topProductsResult,
        categoriesResult,
        topDebtorsResult,
        slowMovingResult,
        paymentBreakdownResult,
        inventoryResult,
      ] = results

      let nextCashflow: CashflowPoint[] = []
      if (cashflowResult.status === 'fulfilled') {
        nextCashflow = cashflowResult.value
      } else {
        const fallbackDaily = await window.api.analytics.getDaily(Math.max(daysInRange + 7, 30))
        nextCashflow = fallbackDaily
          .filter((d: any) => inRange(d.date, range.from, range.to))
          .map((d: any) => ({
            date: d.date,
            sales: d.sales || 0,
            expenses: d.expenses || 0,
            net_income: (d.net_income ?? d.profit ?? 0) as number,
          }))
      }

      let nextReport: AnalyticsReport
      if (reportResult.status === 'fulfilled') {
        nextReport = reportResult.value
      } else {
        const totalSales = nextCashflow.reduce((sum, row) => sum + row.sales, 0)
        const totalExpenses = nextCashflow.reduce((sum, row) => sum + row.expenses, 0)
        const netIncome = nextCashflow.reduce((sum, row) => sum + row.net_income, 0)
        nextReport = {
          total_sales: totalSales,
          net_profit: netIncome + totalExpenses,
          net_income: netIncome,
          total_cost: 0,
          total_expenses: totalExpenses,
          order_count: 0,
          avg_sale: 0,
          debt_outstanding: 0,
          debt_added: 0,
          debt_paid: 0,
        }
      }

      setReport(nextReport)
      setCashflow(nextCashflow)
      if (topProductsResult.status === 'fulfilled') setTopProducts(topProductsResult.value)
      if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value)
      if (topDebtorsResult.status === 'fulfilled') setTopDebtors(topDebtorsResult.value)
      if (slowMovingResult.status === 'fulfilled') setSlowMoving(slowMovingResult.value)
      if (paymentBreakdownResult.status === 'fulfilled') setPaymentBreakdown(paymentBreakdownResult.value)
      if (inventoryResult.status === 'fulfilled') {
        const inv: any[] = inventoryResult.value
        setValuation({
          potential_revenue: inv.reduce((s, i) => s + (i.quantity * (i.base_price ?? 0)), 0),
          total_cost: inv.reduce((s, i) => s + (i.quantity * (i.base_cost ?? 0)), 0),
        })
      }

      const defaultDay = selectedDay && nextCashflow.some((row: CashflowPoint) => row.date === selectedDay)
        ? selectedDay
        : nextCashflow[nextCashflow.length - 1]?.date || null
      setSelectedDay(defaultDay)

      try {
        const hours = await window.api.analytics.getHourly(defaultDay || range)
        setHourly(hours)
      } catch {
        setHourly([])
      }

      const failed = results.filter(r => r.status === 'rejected')
      if (failed.length > 0) {
        setLoadError('Some analytics sections could not be loaded fully. The core sales data has been restored.')
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load analytics.')
    }
  }

  useEffect(() => { load() }, [range.from, range.to])

  useEffect(() => {
    window.api.analytics.getHourly(selectedDay || range)
      .then(setHourly)
  }, [selectedDay, range.from, range.to])

  const filterLabel = filterPreset === 'custom'
    ? `${range.from} to ${range.to}`
    : FILTERS.find(f => f.value === filterPreset)?.label || 'Selected Period'

  const selectedPoint = selectedDay
    ? cashflow.find(d => d.date === selectedDay) || null
    : cashflow[cashflow.length - 1] || null

  const displayDay = selectedPoint?.date
    ? new Date(`${selectedPoint.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'No data'

  const fullHourly = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourly.find(x => x.hour === h)?.count || 0,
  }))
  const maxHour = fullHourly.reduce((m, h) => h.count > m.count ? h : m, fullHourly[0] || { hour: 0, count: 0 })

  const handleExcelExport = () => {
    exportToExcel([
      {
        name: 'Summary',
        rows: [{
          Period: filterLabel,
          From: range.from ?? '',
          To: range.to ?? '',
          'Total Sales': report?.total_sales ?? 0,
          'Total Expenses': report?.total_expenses ?? 0,
          'Gross Profit': report?.net_profit ?? 0,
          'Net Income': report?.net_income ?? 0,
          'Order Count': report?.order_count ?? 0,
          'Avg Sale': report?.avg_sale ?? 0,
          'Outstanding Debt': report?.debt_outstanding ?? 0,
        }],
      },
      {
        name: 'Cashflow',
        rows: cashflow.map(d => ({
          Date: d.date,
          Sales: d.sales,
          Expenses: d.expenses,
          'Net Income': d.net_income,
        })),
      },
      { name: 'Top Products', rows: topProducts.map(p => ({ Name: p.name, 'Qty Sold': p.total_qty, Revenue: p.total_revenue })) },
      { name: 'Top Creditors', rows: topDebtors.map(d => ({ Name: d.name, Phone: d.phone ?? '', Balance: d.balance })) },
      { name: 'Slow Moving', rows: slowMoving.map(p => ({ Name: p.name, 'Period Sold': p.period_sold, 'Monthly Avg': p.monthly_sold })) },
      { name: 'Payments', rows: paymentBreakdown.map(p => ({ Date: p.date, Cash: p.cash, GCash: p.gcash, Card: p.card, Other: p.other })) },
    ], `analytics-${range.from || 'range'}-${range.to || 'range'}`)
  }

  const handlePdfExport = () => {
    const p = (v: number) => `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
    const tbl = (headers: string[], rowsData: (string | number)[][]) =>
      `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
      rowsData.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') +
      `</tbody></table>`

    const peakHour = fullHourly.reduce((m, h) => h.count > m.count ? h : m, { hour: 0, count: 0 })
    const fmtHour = (h: number) => `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'}`

    const html = `
      <style>
        .kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px; }
        .kpi { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px; }
        .kpi-label { font-size:10px; color:#6b7280; margin-bottom:2px; }
        .kpi-value { font-size:16px; font-weight:700; color:#111; }
        .kpi-value.green { color:#16a34a; }
        .kpi-value.red   { color:#dc2626; }
        .kpi-value.blue  { color:#2563eb; }
        .bar-row { display:flex; align-items:center; gap:8px; margin:4px 0; }
        .bar-bg  { flex:1; height:10px; background:#f3f4f6; border-radius:4px; overflow:hidden; }
        .bar-fill{ height:100%; background:#3b82f6; border-radius:4px; }
      </style>

      <div class="section-title">Performance Summary — ${filterLabel}</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Total Sales</div><div class="kpi-value blue">${p(report?.total_sales ?? 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Gross Profit</div><div class="kpi-value green">${p(report?.net_profit ?? 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Total Expenses</div><div class="kpi-value red">${p(report?.total_expenses ?? 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Net Income</div><div class="kpi-value green">${p(report?.net_income ?? 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Orders</div><div class="kpi-value">${report?.order_count ?? 0}</div></div>
        <div class="kpi"><div class="kpi-label">Avg. Sale</div><div class="kpi-value">${p(report?.avg_sale ?? 0)}</div></div>
      </div>

      <div class="section-title">Debt Overview</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Outstanding Debt</div><div class="kpi-value red">${p(report?.debt_outstanding ?? 0)}</div></div>
        <div class="kpi"><div class="kpi-label">New Debt Added</div><div class="kpi-value">${p(report?.debt_added ?? 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Payments Received</div><div class="kpi-value green">${p(report?.debt_paid ?? 0)}</div></div>
      </div>

      <div class="section-title">Cashflow by Day</div>
      ${tbl(['Date', 'Sales', 'Expenses', 'Net Income'],
        cashflow.map(d => [d.date, p(d.sales), p(d.expenses), p(d.net_income)]))}

      <div class="section-title">Top Products</div>
      ${tbl(['#', 'Product', 'Qty Sold', 'Revenue'],
        topProducts.slice(0, 10).map((prod, i) => [i + 1, prod.name, prod.total_qty, p(prod.total_revenue)]))}

      <div class="section-title">Category Performance</div>
      ${tbl(['Category', 'Revenue', 'Share'],
        categories.map(c => [c.category_name, p(c.total), `${c.pct}%`]))}

      <div class="section-title">Payment Breakdown</div>
      ${tbl(['Date', 'Cash', 'GCash', 'Card', 'Other'],
        paymentBreakdown.map(d => [d.date, p(d.cash ?? 0), p(d.gcash ?? 0), p(d.card ?? 0), p(d.other ?? 0)]))}

      <div class="section-title">Top Creditors (Outstanding Balance)</div>
      ${topDebtors.length === 0
        ? '<p style="color:#9ca3af;font-size:12px">No outstanding balances</p>'
        : tbl(['#', 'Name', 'Phone', 'Balance'],
            topDebtors.map((d, i) => [i + 1, d.name, d.phone ?? '', p(Number(d.balance))]))}

      <div class="section-title">Slow Moving Products</div>
      ${slowMoving.length === 0
        ? '<p style="color:#9ca3af;font-size:12px">No data</p>'
        : tbl(['#', 'Product', 'Sold This Period', 'Monthly Avg'],
            slowMoving.slice(0, 10).map((prod, i) => [i + 1, prod.name, prod.period_sold, prod.monthly_sold ?? 0]))}

      <div class="section-title">Busiest Hour</div>
      <p style="font-size:13px;margin:4px 0 10px">Peak: <strong>${fmtHour(peakHour.hour)}</strong> with <strong>${peakHour.count} sales</strong></p>
      ${tbl(['Hour', 'Sales Count'],
        fullHourly.filter(h => h.count > 0).map(h => [fmtHour(h.hour), h.count]))}

      <div class="section-title">Inventory Valuation</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Potential Revenue (at Selling Price)</div><div class="kpi-value green">${p(valuation.potential_revenue)}</div></div>
        <div class="kpi"><div class="kpi-label">Total Inventory Cost</div><div class="kpi-value blue">${p(valuation.total_cost)}</div></div>
      </div>
    `
    exportToPdf(`Analytics Report — ${filterLabel}`, html)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Analytics & Reports" back="/" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(p => (
              <button
                key={p.value}
                onClick={() => setFilterPreset(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterPreset === p.value ? 'bg-[#1a8eff] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleExcelExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={handlePdfExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600">
              <FileDown size={13} /> PDF
            </button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {loadError}
          </div>
        )}

        {filterPreset === 'custom' && (
          <div className="bg-white rounded-xl p-4 shadow-sm flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={customRange.from || ''}
                onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={customRange.to || ''}
                onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
            </div>
            <p className="text-xs text-gray-400 pb-2">Custom range uses Manila dates.</p>
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">{filterLabel} Performance</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total Sales', value: `₱${(report?.total_sales || 0).toLocaleString()}`, icon: '💰', color: 'bg-blue-50' },
              { label: 'Gross Profit', value: `₱${(report?.net_profit || 0).toLocaleString()}`, icon: '💵', color: 'bg-green-50', green: true },
              { label: 'Expenses', value: `₱${(report?.total_expenses || 0).toLocaleString()}`, icon: '🧾', color: 'bg-rose-50' },
              { label: 'Net Income', value: `₱${(report?.net_income || 0).toLocaleString()}`, icon: '📈', color: 'bg-emerald-50', green: true },
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

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">{filterLabel} Debt Overview</p>
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

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-gray-800">Cashflow Graph</p>
              <p className="text-xs text-gray-400">Sales, expenses, and net income across the selected range</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={cashflow} onClick={(e) => e?.activeLabel && setSelectedDay(e.activeLabel as string)}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => `₱${Number(v).toLocaleString()}`} />
              <Bar dataKey="sales" name="Sales" fill="#93c5fd" radius={[4, 4, 0, 0]}>
                {cashflow.map((d, i) => (
                  <Cell key={i} fill={d.date === selectedPoint?.date ? '#3b82f6' : '#93c5fd'} />
                ))}
              </Bar>
              <Bar dataKey="expenses" name="Expenses" fill="#fda4af" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="net_income" name="Net Income" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-3 pt-3 border-t flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400 uppercase">Selected Day</p>
              <p className="font-semibold text-gray-800">{displayDay}</p>
            </div>
            <div className="flex gap-6 text-right">
              <div><p className="text-xs text-gray-400">Sales</p><p className="font-bold text-gray-800">₱{(selectedPoint?.sales || 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Expenses</p><p className="font-bold text-rose-500">₱{(selectedPoint?.expenses || 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Net Income</p><p className="font-bold text-green-600">₱{(selectedPoint?.net_income || 0).toLocaleString()}</p></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">Busiest Hours (Manila Time)</p>
            <div className="flex gap-1">
              <div className="flex-1">
                <p className="text-xs text-gray-400 text-center mb-1">AM (00:00 - 11:59)</p>
                <div className="flex items-end gap-0.5 h-20">
                  {fullHourly.slice(0, 12).map(h => (
                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className={`w-full rounded-t transition-all ${h.hour === maxHour.hour ? 'bg-[#1a8eff]' : 'bg-blue-100'}`}
                        style={{ height: `${maxHour.count ? (h.count / maxHour.count) * 100 : 0}%`, minHeight: h.count ? 4 : 0 }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  {[12, 3, 6, 9].map(h => <span key={h}>{h}</span>)}
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
                  {[12, 3, 6, 9].map(h => <span key={h}>{h}</span>)}
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

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">Top Products (Selected Period)</p>
            {topProducts.slice(0, 5).map((p, i) => (
              <div key={p.product_id || i} className="flex items-center gap-3 mb-3">
                <span className="text-gray-400 font-bold w-4 text-sm">{i + 1}</span>
                <div className="w-8 h-8 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                  {p.image_path && <img src={getProductImageSrc(p.image_path)} alt={p.name ?? ''} className="w-full h-full object-cover" />}
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

        <div className="grid grid-cols-2 gap-4">
          {/* Top 10 Creditors */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-1">Top 10 Creditors</p>
            <p className="text-xs text-gray-400 mb-3">Debtors with the highest outstanding balance</p>
            {topDebtors.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No outstanding balances</p>
            ) : topDebtors.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 mb-2.5">
                <span className="text-xs text-gray-400 font-bold w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                  {d.phone && <p className="text-xs text-gray-400 truncate">{d.phone}</p>}
                </div>
                <p className="text-sm font-bold text-red-500 shrink-0">₱{Number(d.balance).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Top 10 Slow Movers */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-1">Top 10 Slow Movers</p>
            <p className="text-xs text-gray-400 mb-3">Products with the least sales in the selected period</p>
            {slowMoving.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No products found</p>
            ) : slowMoving.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 mb-2.5">
                <span className="text-xs text-gray-400 font-bold w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.period_sold} sold this period</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  p.period_sold === 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                }`}>{p.period_sold === 0 ? 'No sales' : `${p.period_sold} sold`}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">Inventory Valuation</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="border-2 border-green-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Potential Revenue (Selling Price)</p>
              <p className="text-2xl font-bold text-green-600">₱{valuation.potential_revenue.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Total value if all current stock is sold</p>
            </div>
            <div className="border-2 border-blue-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Inventory Cost</p>
              <p className="text-2xl font-bold text-blue-600">₱{valuation.total_cost.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Current stock cost based on recorded item costs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
