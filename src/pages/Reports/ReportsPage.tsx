import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDown, FileSpreadsheet, LockKeyhole, Sparkles } from 'lucide-react'
import TopBar from '../../components/layout/TopBar'
import { exportToExcel, exportToPdf } from '../../utils/export'

const FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Custom', value: 'custom' },
] as const

const REPORT_TABS = [
  { key: 'profit_and_loss', label: 'Profit & Loss' },
  { key: 'income_statement', label: 'Income Statement' },
  { key: 'z_reading', label: 'Z-Reading' },
  { key: 'e_sales', label: 'E-Sales' },
  { key: 'payments_report', label: 'Credit Payment Report' },
  { key: 'trial_balance', label: 'Trial Balance' },
  { key: 'expense_report', label: 'Expense Report' },
  { key: 'return_report', label: 'Return / Refund Report' },
  { key: 'customer_report', label: 'Customer Report' },
] as const

type FilterPreset = typeof FILTERS[number]['value']
type ReportTab = typeof REPORT_TABS[number]['key']

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

function rangeForPreset(preset: Exclude<FilterPreset, 'custom'>) {
  const current = today()
  if (preset === 'today') return { from: current, to: current }
  if (preset === 'yesterday') {
    const value = shiftDays(current, -1)
    return { from: value, to: value }
  }
  if (preset === 'last_7_days') return { from: shiftDays(current, -6), to: current }
  if (preset === 'last_month') return monthBounds(-1)
  return monthBounds(0)
}

function peso(amount: number) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriodLabel(from: string, to: string) {
  return from === to ? from : `${from} to ${to}`
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildDocument(title: string, businessName: string, periodLabel: string, body: string) {
  return `
    <section style="min-height:260mm;padding:18mm 16mm 16mm;background:#fff;color:#0f172a;">
      <header style="border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Reyna POS Report</p>
        <h1 style="margin:0;font-size:26px;font-weight:800;">${escapeHtml(businessName || 'Business')}</h1>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-top:10px;font-size:12px;color:#475569;">
          <span>${escapeHtml(title)}</span>
          <span>${escapeHtml(periodLabel)}</span>
        </div>
      </header>
      ${body}
    </section>
  `
}

function buildTable(headers: string[], rows: string[][], rightAligned = new Set<number>()) {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr>
          ${headers.map((header, index) => `
            <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:${rightAligned.has(index) ? 'right' : 'left'};background:#f8fafc;color:#334155;">
              ${escapeHtml(header)}
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${row.map((cell, index) => `
              <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:${rightAligned.has(index) ? 'right' : 'left'};">
                ${cell}
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ReportTab>('profit_and_loss')
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month')
  const [customRange, setCustomRange] = useState(() => {
    const current = today()
    return { from: shiftDays(current, -6), to: current }
  })
  const [isPro, setIsPro] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [financials, setFinancials] = useState<any>(null)
  const [expenseReport, setExpenseReport] = useState<any>(null)
  const [paymentsReport, setPaymentsReport] = useState<any>(null)
  const [customerReport, setCustomerReport] = useState<any>(null)
  const [returnReport, setReturnReport] = useState<any>(null)
  const [zReading, setZReading] = useState<any>(null)
  const [eSales, setESales] = useState<any>(null)

  const range = useMemo(() => {
    if (filterPreset === 'custom') return customRange
    return rangeForPreset(filterPreset)
  }, [filterPreset, customRange])

  const businessName = settings.store_name || 'Reyna POS'
  const periodLabel = formatPeriodLabel(range.from, range.to)

  useEffect(() => {
    Promise.all([
      window.api.activation.getStatus(),
      window.api.settings.getAll(),
    ]).then(([status, allSettings]) => {
      setIsPro(status.activated === true)
      setSettings(allSettings || {})
    })
  }, [])

  useEffect(() => {
    if (!isPro) return
    setLoading(true)
    setError(null)
    Promise.all([
      window.api.analytics.getFinancials(range),
      window.api.analytics.getExpenseReport(range),
      window.api.analytics.getPaymentsReport(range),
      window.api.analytics.getCustomerReport(range),
      window.api.analytics.getReturnReport(range),
      window.api.analytics.getZReading(range),
      window.api.analytics.getESales(range),
    ]).then(([
      nextFinancials,
      nextExpenseReport,
      nextPaymentsReport,
      nextCustomerReport,
      nextReturnReport,
      nextZReading,
      nextESales,
    ]) => {
      setFinancials(nextFinancials)
      setExpenseReport(nextExpenseReport)
      setPaymentsReport(nextPaymentsReport)
      setCustomerReport(nextCustomerReport)
      setReturnReport(nextReturnReport)
      setZReading(nextZReading)
      setESales(nextESales)
      setLoading(false)
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
      setLoading(false)
    })
  }, [isPro, range.from, range.to])

  const buildExportPayload = () => {
    if (!financials) return null

    if (activeTab === 'profit_and_loss') {
      const report = financials.profit_and_loss
      const rows = [
        ['Revenue', peso(report.revenue)],
        ['Cost of Goods Sold', peso(report.cost_of_goods_sold)],
        ['Gross Profit', peso(report.gross_profit)],
        ['Net Profit', peso(report.net_profit)],
      ]
      return {
        title: 'Profit & Loss',
        excelRows: rows.map(([item, amount]) => ({ Item: item, Amount: amount })),
        html: buildDocument('Profit & Loss', businessName, periodLabel, buildTable(['Account', 'Amount'], rows, new Set([1]))),
      }
    }

    if (activeTab === 'income_statement') {
      const report = financials.income_statement
      const rows = [
        ['Gross Sales', peso(report.gross_sales || 0)],
        ['Less: Discounts', peso(report.discounts || 0)],
        ['Less: Returns', peso(report.returns || 0)],
        ['Net Sales', peso(report.net_sales)],
        ['Cost of Sales', peso(report.cost_of_sales)],
        ['Gross Income', peso(report.gross_income)],
        ['Operating Expenses', peso(report.operating_expenses)],
        ['Net Income', peso(report.net_income)],
      ]
      return {
        title: 'Income Statement',
        excelRows: rows.map(([item, amount]) => ({ Item: item, Amount: amount })),
        html: buildDocument('Income Statement', businessName, periodLabel, `
          ${buildTable(['Account', 'Amount'], rows, new Set([1]))}
          <p style="margin-top:14px;font-size:11px;color:#64748b;">${escapeHtml(report.note)}</p>
        `),
      }
    }

    if (activeTab === 'trial_balance') {
      const report = financials.trial_balance
      const rows = report.lines.map((line: any) => [
        escapeHtml(line.label),
        line.type === 'debit' ? peso(line.amount) : '—',
        line.type === 'credit' ? peso(line.amount) : '—',
      ])
      rows.push(['Totals', peso(report.total_debits), peso(report.total_credits)])
      return {
        title: 'Trial Balance',
        excelRows: report.lines.map((line: any) => ({
          Account: line.label,
          Debit: line.type === 'debit' ? line.amount : '',
          Credit: line.type === 'credit' ? line.amount : '',
        })),
        html: buildDocument('Trial Balance', businessName, periodLabel, `
          ${buildTable(['Account', 'Debit', 'Credit'], rows, new Set([1, 2]))}
          <p style="margin-top:14px;font-size:11px;color:#64748b;">${escapeHtml(report.note)}</p>
        `),
      }
    }

    if (activeTab === 'expense_report') {
      const rows = (expenseReport?.rows || []).map((row: any) => [row.date, row.category, escapeHtml(row.description || '—'), peso(row.amount)])
      rows.push(['', '', 'Total', peso(expenseReport?.total || 0)])
      return {
        title: 'Expense Report',
        excelRows: (expenseReport?.rows || []).map((row: any) => ({
          Date: row.date,
          Category: row.category,
          Description: row.description || '',
          Amount: row.amount,
        })),
        html: buildDocument('Expense Report', businessName, periodLabel, buildTable(['Date', 'Category', 'Description', 'Amount'], rows, new Set([3]))),
      }
    }

    if (activeTab === 'payments_report') {
      const rows = (paymentsReport?.rows || []).map((row: any) => [
        new Date(row.date).toLocaleString('en-PH'),
        row.customer_name,
        row.order_number || row.note || 'Manual payment',
        peso(row.amount),
      ])
      rows.push(['', '', 'Total', peso(paymentsReport?.total || 0)])
      return {
        title: 'Credit Payments Report',
        excelRows: (paymentsReport?.rows || []).map((row: any) => ({
          Date: row.date,
          Customer: row.customer_name,
          Order: row.order_number || '',
          Note: row.note || '',
          Amount: row.amount,
        })),
        html: buildDocument('Credit Payments Report', businessName, periodLabel, buildTable(['Date', 'Customer', 'Reference', 'Amount'], rows, new Set([3]))),
      }
    }

    if (activeTab === 'return_report') {
      const rows = (returnReport?.rows || []).map((row: any) => [
        new Date(row.created_at).toLocaleString('en-PH'),
        row.order_number,
        escapeHtml(row.item_name),
        String(row.quantity),
        row.event_type === 'damage' ? 'Damaged Item' : 'Refund / Return',
        peso(row.event_type === 'damage' ? row.cost_amount : row.amount),
      ])
      return {
        title: 'Return / Refund Report',
        excelRows: (returnReport?.rows || []).map((row: any) => ({
          Date: row.created_at,
          Order: row.order_number,
          Item: row.item_name,
          Quantity: row.quantity,
          Reason: row.event_type,
          Amount: row.event_type === 'damage' ? row.cost_amount : row.amount,
        })),
        html: buildDocument('Return / Refund Report', businessName, periodLabel, buildTable(['Date', 'Order #', 'Item', 'Qty', 'Reason', 'Amount'], rows, new Set([5]))),
      }
    }

    if (activeTab === 'customer_report') {
      const rows = (customerReport?.rows || []).map((row: any) => [
        escapeHtml(row.name),
        escapeHtml(row.phone || '—'),
        peso(row.period_credit),
        peso(row.period_paid),
        peso(row.balance),
      ])
      return {
        title: 'Customer Report',
        excelRows: (customerReport?.rows || []).map((row: any) => ({
          Customer: row.name,
          Phone: row.phone || '',
          'Period Credit': row.period_credit,
          'Period Paid': row.period_paid,
          Balance: row.balance,
        })),
        html: buildDocument('Customer Report', businessName, periodLabel, buildTable(['Customer', 'Phone', 'Period Credit', 'Period Paid', 'Balance'], rows, new Set([2, 3, 4]))),
      }
    }

    if (activeTab === 'z_reading') {
      const rows = [
        ['Receipt Count', String(zReading?.receipt_count || 0)],
        ['Gross Sales', peso(zReading?.gross_sales || 0)],
        ['Discounts', peso(zReading?.discounts || 0)],
        ['Returns', peso(zReading?.returns || 0)],
        ['Net Sales', peso(zReading?.net_sales || 0)],
        ['Cash Sales', peso(zReading?.cash_sales || 0)],
        ['Credit Sales', peso(zReading?.credit_sales || 0)],
        ['Credit Collections', peso(zReading?.credit_collections || 0)],
      ]
      return {
        title: 'Z-Reading Report',
        excelRows: rows.map(([item, value]) => ({ Item: item, Value: value })),
        html: buildDocument('Z-Reading Report', businessName, periodLabel, buildTable(['Metric', 'Value'], rows, new Set([1]))),
      }
    }

    const rows = (eSales?.daily_rows || []).map((row: any) => ({
      Date: row.date,
      Day: row.day,
      Transactions: row.transaction_count,
      'Gross Sales': row.gross_sales,
      Discounts: row.discounts,
      Returns: row.returns,
      'Net Sales': row.net_sales,
      'Avg Basket': row.avg_basket,
    }))
    rows.push({
      Date: 'TOTAL',
      Day: '',
      Transactions: eSales?.transaction_count || 0,
      'Gross Sales': eSales?.gross_sales || 0,
      Discounts: eSales?.total_discounts || 0,
      Returns: eSales?.total_returns || 0,
      'Net Sales': eSales?.net_sales || 0,
      'Avg Basket': eSales?.average_sale || 0,
    })
    return {
      title: 'E-Sales Report',
      excelRows: rows,
      html: buildDocument('E-Sales Report', businessName, periodLabel, buildTable(
        ['Date', 'Day', 'Transactions', 'Gross Sales', 'Discounts', 'Returns', 'Net Sales', 'Avg Basket'],
        rows.map((row: any) => [
          row.Date,
          row.Day,
          String(row.Transactions),
          peso(row['Gross Sales']),
          peso(row.Discounts),
          peso(row.Returns),
          peso(row['Net Sales']),
          peso(row['Avg Basket']),
        ]),
        new Set([2, 3, 4, 5, 6, 7]),
      )),
    }
  }

  const handleExcelExport = () => {
    const payload = buildExportPayload()
    if (!payload) return
    exportToExcel([{ name: payload.title, rows: payload.excelRows }], `${payload.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${range.from}-${range.to}`)
  }

  const handlePdfExport = async () => {
    const payload = buildExportPayload()
    if (!payload) return
    await exportToPdf(`${businessName} ${payload.title} ${range.from}-${range.to}`, payload.html)
  }

  const renderBody = () => {
    if (!financials) return null

    if (activeTab === 'profit_and_loss') {
      const report = financials.profit_and_loss
      return <MetricList rows={[
        ['Revenue', report.revenue],
        ['Cost of Goods Sold', report.cost_of_goods_sold],
        ['Gross Profit', report.gross_profit],
        ['Net Profit', report.net_profit],
      ]} highlightIndex={3} />
    }

    if (activeTab === 'income_statement') {
      const report = financials.income_statement
      return (
        <>
          <MetricList rows={[
            ['Gross Sales', report.gross_sales || 0],
            ['Less: Discounts', report.discounts || 0],
            ['Less: Returns', report.returns || 0],
            ['Net Sales', report.net_sales],
            ['Cost of Sales', report.cost_of_sales],
            ['Gross Income', report.gross_income],
            ['Operating Expenses', report.operating_expenses],
            ['Net Income', report.net_income],
          ]} highlightIndex={4} />
          <p className="mt-4 text-sm text-slate-500">{report.note}</p>
        </>
      )
    }

    if (activeTab === 'trial_balance') {
      return (
        <>
          <TableView
            headers={['Account', 'Debit', 'Credit']}
            rows={financials.trial_balance.lines.map((line: any) => [
              line.label,
              line.type === 'debit' ? peso(line.amount) : '—',
              line.type === 'credit' ? peso(line.amount) : '—',
            ])}
            rightAligned={[1, 2]}
          />
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm font-semibold text-slate-700">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">Total Debits: {peso(financials.trial_balance.total_debits)}</div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">Total Credits: {peso(financials.trial_balance.total_credits)}</div>
          </div>
          <p className="mt-4 text-sm text-slate-500">{financials.trial_balance.note}</p>
        </>
      )
    }

    if (activeTab === 'expense_report') {
      return <TableView headers={['Date', 'Category', 'Description', 'Amount']} rows={(expenseReport?.rows || []).map((row: any) => [row.date, row.category, row.description || '—', peso(row.amount)])} rightAligned={[3]} footer={`Total Expenses: ${peso(expenseReport?.total || 0)}`} />
    }

    if (activeTab === 'payments_report') {
      return <TableView headers={['Date', 'Customer', 'Reference', 'Amount']} rows={(paymentsReport?.rows || []).map((row: any) => [new Date(row.date).toLocaleString('en-PH'), row.customer_name, row.order_number || row.note || 'Manual payment', peso(row.amount)])} rightAligned={[3]} footer={`Total Credit Payments: ${peso(paymentsReport?.total || 0)}`} />
    }

    if (activeTab === 'return_report') {
      return (
        <>
          <TableView
            headers={['Date', 'Order #', 'Item', 'Qty', 'Reason', 'Amount']}
            rows={(returnReport?.rows || []).map((row: any) => [
              new Date(row.created_at).toLocaleString('en-PH'),
              row.order_number,
              row.item_name,
              String(row.quantity),
              row.event_type === 'damage' ? 'Damaged Item' : 'Refund / Return',
              peso(row.event_type === 'damage' ? row.cost_amount : row.amount),
            ])}
            rightAligned={[5]}
          />
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm font-semibold text-slate-700">
            <div className="rounded-2xl bg-rose-50 px-4 py-3">Refund Total: {peso(returnReport?.refund_total || 0)}</div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3">Damage Total: {peso(returnReport?.damage_total || 0)}</div>
          </div>
        </>
      )
    }

    if (activeTab === 'customer_report') {
      return <TableView headers={['Customer', 'Phone', 'Period Credit', 'Period Paid', 'Balance']} rows={(customerReport?.rows || []).map((row: any) => [row.name, row.phone || '—', peso(row.period_credit), peso(row.period_paid), peso(row.balance)])} rightAligned={[2, 3, 4]} />
    }

    if (activeTab === 'z_reading') {
      return <MetricList rows={[
        ['Receipt Count', String(zReading?.receipt_count || 0)],
        ['Gross Sales', zReading?.gross_sales || 0],
        ['Discounts', zReading?.discounts || 0],
        ['Returns', zReading?.returns || 0],
        ['Net Sales', zReading?.net_sales || 0],
        ['Cash Sales', zReading?.cash_sales || 0],
        ['Credit Sales', zReading?.credit_sales || 0],
        ['Credit Collections', zReading?.credit_collections || 0],
      ]} />
    }

    return (
      <>
        <TableView
          headers={['Date', 'Day', 'Transactions', 'Gross Sales', 'Discounts', 'Returns', 'Net Sales', 'Avg Basket']}
          rows={(eSales?.daily_rows || []).map((row: any) => [
            row.date,
            row.day,
            String(row.transaction_count),
            peso(row.gross_sales),
            peso(row.discounts),
            peso(row.returns),
            peso(row.net_sales),
            peso(row.avg_basket),
          ])}
          rightAligned={[2, 3, 4, 5, 6, 7]}
          footer={`Period Net Sales: ${peso(eSales?.net_sales || 0)}`}
        />
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm font-semibold text-slate-700 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">Transactions: {eSales?.transaction_count || 0}</div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3">Cash Sales: {peso(eSales?.cash_sales || 0)}</div>
          <div className="rounded-2xl bg-blue-50 px-4 py-3">Credit Sales: {peso(eSales?.credit_sales || 0)}</div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3">Average Sale: {peso(eSales?.average_sale || 0)}</div>
        </div>
      </>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <TopBar title="Reports" back="/" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-[28px] bg-gradient-to-br from-[#0f172a] via-[#0f3d5e] to-[#0f8c71] p-6 text-white shadow-[0_20px_55px_rgba(15,23,42,0.25)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Reyna Pro</p>
              <h2 className="mt-2 text-3xl font-semibold">Accounting and management reports</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
                Financial statements, operational summaries, payments, returns, customer balances, Z-Reading, and E-Sales are all managed here with desktop export support.
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
            <h3 className="mt-4 text-2xl font-semibold text-slate-900">All reports are part of Reyna Pro</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Upgrade to unlock financial statements, payments, expense tracking reports, customer reports, return reports, Z-Reading, and E-Sales reports.
            </p>
            <button
              onClick={() => navigate('/pro')}
              className="mt-6 rounded-2xl bg-[#1a8eff] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0077e6]"
            >
              Upgrade to Pro
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-[28px] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map(filter => (
                  <button
                    key={filter.value}
                    onClick={() => setFilterPreset(filter.value)}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${filterPreset === filter.value ? 'bg-[#1a8eff] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {filterPreset === 'custom' && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-600">
                    From
                    <input
                      type="date"
                      value={customRange.from}
                      onChange={e => setCustomRange(prev => ({ ...prev, from: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-700"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    To
                    <input
                      type="date"
                      value={customRange.to}
                      onChange={e => setCustomRange(prev => ({ ...prev, to: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-700"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {REPORT_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExcelExport}
                  disabled={!financials || loading}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button
                  onClick={() => { void handlePdfExport() }}
                  disabled={!financials || loading}
                  className="flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  <FileDown size={14} /> PDF
                </button>
              </div>
            </div>

            {loading ? (
              <div className="rounded-[28px] bg-white p-8 text-sm text-slate-400 shadow-sm">Loading report...</div>
            ) : error ? (
              <div className="rounded-[28px] bg-white p-8 text-sm text-red-600 shadow-sm">{error}</div>
            ) : (
              <div className="mx-auto max-w-[920px] rounded-[28px] bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                <header className="border-b-2 border-slate-900 pb-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Accounting Report</p>
                  <h1 className="mt-2 text-3xl font-extrabold text-slate-900">{businessName}</h1>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                    <span>{REPORT_TABS.find(tab => tab.key === activeTab)?.label}</span>
                    <span>{periodLabel}</span>
                  </div>
                </header>
                <div className="mt-6">{renderBody()}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MetricList({ rows, highlightIndex }: { rows: Array<[string, number | string]>; highlightIndex?: number }) {
  return (
    <div className="space-y-3">
      {rows.map(([label, amount], index) => (
        <div
          key={label}
          className={`flex items-center justify-between rounded-2xl px-4 py-3 ${highlightIndex === index ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'}`}
        >
          <span className="font-medium">{label}</span>
          <span className="text-lg font-semibold">{typeof amount === 'number' ? peso(amount) : amount}</span>
        </div>
      ))}
    </div>
  )
}

function TableView({
  headers,
  rows,
  rightAligned = [],
  footer,
}: {
  headers: string[]
  rows: string[][]
  rightAligned?: number[]
  footer?: string
}) {
  return (
    <>
      <div className="overflow-hidden rounded-[24px] border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              {headers.map((header, index) => (
                <th key={header} className={`px-4 py-3 font-semibold ${rightAligned.includes(index) ? 'text-right' : 'text-left'}`}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-400">No records found for this period.</td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`} className="border-t border-slate-100">
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className={`px-4 py-3 text-slate-700 ${rightAligned.includes(cellIndex) ? 'text-right' : 'text-left'}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <p className="mt-4 text-right text-sm font-semibold text-slate-700">{footer}</p>}
    </>
  )
}
