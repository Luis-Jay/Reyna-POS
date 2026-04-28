import { supabase } from '../supabase'
import { getBusinessId } from './context'

type RangeInput =
  | string
  | { preset?: string; from?: string; to?: string }

function manilaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

function monthBounds(offsetMonths = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const end = offsetMonths === 0 ? new Date() : new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0)
  return { from: manilaDate(start), to: manilaDate(end) }
}

function resolveRange(input?: RangeInput): { from: string; to: string } {
  if (input && typeof input === 'object' && input.from && input.to) {
    return { from: input.from, to: input.to }
  }
  const preset = typeof input === 'string' ? input : (input as any)?.preset || 'this_month'
  const today = manilaDate()
  const yesterday = manilaDate(new Date(Date.now() - 86400000))
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'yesterday') return { from: yesterday, to: yesterday }
  if (preset === 'last_7_days') return { from: manilaDate(new Date(Date.now() - 6 * 86400000)), to: today }
  if (preset === 'last_month') return monthBounds(-1)
  return monthBounds(0)
}

function tzFilter(from: string, to: string) {
  return {
    from: `${from}T00:00:00+08:00`,
    to: `${to}T23:59:59+08:00`,
  }
}

async function getCompletedOrders(businessId: string, from: string, to: string) {
  const tf = tzFilter(from, to)
  const { data } = await supabase
    .from('sales_orders')
    .select('id, total, subtotal, discount, created_at, sales_order_items(price, cost, quantity, product_id, is_custom)')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .eq('exclude_sales', false)
    .is('deleted_at', null)
    .gte('created_at', tf.from)
    .lte('created_at', tf.to)
  return data ?? []
}

export const analyticsApi = {
  getDashboard: async () => {
    try {
      const businessId = await getBusinessId()
      const today = manilaDate()
      const tf = tzFilter(today, today)

      const [ordersRes, productsRes] = await Promise.all([
        supabase.from('sales_orders')
          .select('id, order_number, total, created_at, sales_order_items(quantity)')
          .eq('business_id', businessId)
          .eq('status', 'completed')
          .eq('exclude_sales', false)
          .is('deleted_at', null)
          .gte('created_at', tf.from)
          .lte('created_at', tf.to)
          .order('created_at', { ascending: false }),
        supabase.from('catalog_products')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .is('deleted_at', null)
          .eq('is_active', true),
      ])

      const todayOrders = ordersRes.data ?? []
      const salesToday = todayOrders.reduce((s, o) => s + (o.total ?? 0), 0)
      const profitToday = todayOrders.reduce((s, o) => {
        const items = (o.sales_order_items ?? []) as any[]
        return s + items.reduce((ps, i) => ps + (i.price - i.cost) * i.quantity, 0)
      }, 0)

      return {
        sales_today: salesToday,
        profit_today: profitToday,
        total_products: productsRes.count ?? 0,
        recent_orders: todayOrders.slice(0, 5).map(o => ({
          id: o.id,
          order_number: o.order_number,
          total: o.total,
          item_count: (o.sales_order_items as any[])?.reduce((s, i) => s + i.quantity, 0) ?? 0,
          created_at: o.created_at,
        })),
      }
    } catch {
      return { sales_today: 0, profit_today: 0, total_products: 0, recent_orders: [] }
    }
  },

  getReport: async (periodOrRange?: RangeInput) => {
    try {
      const businessId = await getBusinessId()
      const { from, to } = resolveRange(periodOrRange)
      const orders = await getCompletedOrders(businessId, from, to)

      const totalSales = orders.reduce((s, o) => s + (o.total ?? 0), 0)
      const totalCost = orders.reduce((s, o) => {
        const items = (o.sales_order_items ?? []) as any[]
        return s + items.reduce((ps, i) => ps + (i.cost ?? 0) * i.quantity, 0)
      }, 0)
      const netProfit = totalSales - totalCost

      // Expenses
      const tf = tzFilter(from, to)
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('business_id', businessId)
        .gte('date', from)
        .lte('date', to)
      const totalExpenses = (expenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0)

      // Debts
      const { data: debtTxs } = await supabase
        .from('sales_debtor_transactions')
        .select('type, amount')
        .eq('business_id', businessId)
        .gte('created_at', tf.from)
        .lte('created_at', tf.to)
      const debtAdded = (debtTxs ?? []).filter(t => t.type === 'debt').reduce((s, t) => s + t.amount, 0)
      const debtPaid = (debtTxs ?? []).filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0)
      const { data: debtors } = await supabase.from('sales_debtors').select('balance').eq('business_id', businessId).is('deleted_at', null)
      const debtOutstanding = (debtors ?? []).reduce((s, d) => s + (d.balance ?? 0), 0)

      return {
        total_sales: totalSales,
        net_profit: netProfit,
        net_income: netProfit - totalExpenses,
        total_cost: totalCost,
        total_expenses: totalExpenses,
        order_count: orders.length,
        avg_sale: orders.length > 0 ? totalSales / orders.length : 0,
        debt_outstanding: debtOutstanding,
        debt_added: debtAdded,
        debt_paid: debtPaid,
      }
    } catch {
      return { total_sales: 0, net_profit: 0, net_income: 0, total_cost: 0, total_expenses: 0, order_count: 0, avg_sale: 0, debt_outstanding: 0, debt_added: 0, debt_paid: 0 }
    }
  },

  getDaily: async (days: number) => {
    try {
      const businessId = await getBusinessId()
      const today = manilaDate()
      const from = manilaDate(new Date(Date.now() - (days - 1) * 86400000))
      const orders = await getCompletedOrders(businessId, from, today)

      const byDate: Record<string, { sales: number; profit: number; cost: number }> = {}
      for (const o of orders) {
        const date = manilaDate(new Date(o.created_at))
        if (!byDate[date]) byDate[date] = { sales: 0, profit: 0, cost: 0 }
        byDate[date].sales += o.total ?? 0
        const items = (o.sales_order_items ?? []) as any[]
        for (const i of items) {
          byDate[date].cost += (i.cost ?? 0) * i.quantity
          byDate[date].profit += (i.price - (i.cost ?? 0)) * i.quantity
        }
      }

      return Object.entries(byDate)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date))
    } catch {
      return []
    }
  },

  getCashflow: async (periodOrRange?: RangeInput) => {
    try {
      const businessId = await getBusinessId()
      const { from, to } = resolveRange(periodOrRange)
      const orders = await getCompletedOrders(businessId, from, to)
      const tf = tzFilter(from, to)
      const { data: expenses } = await supabase.from('expenses').select('date, amount').eq('business_id', businessId).gte('date', from).lte('date', to)
      const expByDate: Record<string, number> = {}
      for (const e of expenses ?? []) { expByDate[e.date] = (expByDate[e.date] ?? 0) + e.amount }

      const byDate: Record<string, { sales: number; expenses: number }> = {}
      for (const o of orders) {
        const date = manilaDate(new Date(o.created_at))
        if (!byDate[date]) byDate[date] = { sales: 0, expenses: 0 }
        byDate[date].sales += o.total ?? 0
      }
      for (const [date, exp] of Object.entries(expByDate)) {
        if (!byDate[date]) byDate[date] = { sales: 0, expenses: 0 }
        byDate[date].expenses += exp
      }

      return Object.entries(byDate)
        .map(([date, v]) => ({ date, sales: v.sales, expenses: v.expenses, net_income: v.sales - v.expenses }))
        .sort((a, b) => a.date.localeCompare(b.date))
    } catch {
      return []
    }
  },

  getHourly: async (dateOrRange?: any) => {
    try {
      const businessId = await getBusinessId()
      const today = manilaDate()
      const from = typeof dateOrRange === 'string' ? dateOrRange : today
      const tf = tzFilter(from, from)
      const { data } = await supabase
        .from('sales_orders')
        .select('created_at')
        .eq('business_id', businessId)
        .eq('status', 'completed')
        .eq('exclude_sales', false)
        .gte('created_at', tf.from)
        .lte('created_at', tf.to)
      const byhour: number[] = new Array(24).fill(0)
      for (const o of data ?? []) {
        const manilaHour = new Date(new Date(o.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })).getHours()
        byhour[manilaHour]++
      }
      return byhour.map((count, hour) => ({ hour, count }))
    } catch {
      return []
    }
  },

  getTopProducts: async (periodOrRange?: RangeInput) => {
    try {
      const businessId = await getBusinessId()
      const { from, to } = resolveRange(periodOrRange)
      const orders = await getCompletedOrders(businessId, from, to)

      const byProduct: Record<string, { name: string; total_qty: number; total_revenue: number }> = {}
      for (const o of orders) {
        for (const i of (o.sales_order_items ?? []) as any[]) {
          if (!i.product_id || i.is_custom) continue
          if (!byProduct[i.product_id]) byProduct[i.product_id] = { name: i.name, total_qty: 0, total_revenue: 0 }
          byProduct[i.product_id].total_qty += i.quantity
          byProduct[i.product_id].total_revenue += i.subtotal ?? i.price * i.quantity
        }
      }
      return Object.entries(byProduct)
        .map(([product_id, v]) => ({ product_id, ...v }))
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 20)
    } catch {
      return []
    }
  },

  getCategories: async (periodOrRange?: RangeInput) => {
    try {
      const businessId = await getBusinessId()
      const { from, to } = resolveRange(periodOrRange)
      const orders = await getCompletedOrders(businessId, from, to)

      // Fetch product → category mapping
      const productIds = [...new Set((orders.flatMap(o => (o.sales_order_items ?? []) as any[]).map((i: any) => i.product_id).filter(Boolean)))]
      const { data: products } = await supabase.from('catalog_products').select('id, category_id, catalog_categories(name)').in('id', productIds).eq('business_id', businessId)
      const catByProduct: Record<string, string> = {}
      for (const p of products ?? []) { catByProduct[p.id] = (p as any).catalog_categories?.name ?? 'Uncategorized' }

      const byCat: Record<string, number> = {}
      let grandTotal = 0
      for (const o of orders) {
        for (const i of (o.sales_order_items ?? []) as any[]) {
          const cat = (i.product_id && catByProduct[i.product_id]) || 'Uncategorized'
          byCat[cat] = (byCat[cat] ?? 0) + (i.subtotal ?? i.price * i.quantity)
          grandTotal += i.subtotal ?? i.price * i.quantity
        }
      }
      return Object.entries(byCat)
        .map(([category_name, total]) => ({ category_name, total, pct: grandTotal > 0 ? (total / grandTotal) * 100 : 0 }))
        .sort((a, b) => b.total - a.total)
    } catch {
      return []
    }
  },

  getFinancials: async (periodOrRange?: RangeInput) => {
    try {
      const businessId = await getBusinessId()
      const { from, to } = resolveRange(periodOrRange)
      const report = await analyticsApi.getReport(periodOrRange)

      const grossProfit = report.total_sales - report.total_cost
      return {
        period: { from, to },
        profit_and_loss: {
          revenue: report.total_sales,
          cost_of_goods_sold: report.total_cost,
          gross_profit: grossProfit,
          net_profit: report.net_profit,
        },
        income_statement: {
          net_sales: report.total_sales,
          cost_of_sales: report.total_cost,
          gross_income: grossProfit,
          operating_expenses: report.total_expenses,
          net_income: report.net_income,
          note: '',
        },
        trial_balance: {
          lines: [
            { label: 'Net Sales', amount: report.total_sales, type: 'credit' },
            { label: 'Cost of Goods Sold', amount: report.total_cost, type: 'debit' },
            { label: 'Operating Expenses', amount: report.total_expenses, type: 'debit' },
            { label: 'Gross Profit', amount: grossProfit, type: 'credit' },
          ],
          total_debits: report.total_cost + report.total_expenses,
          total_credits: report.total_sales,
          note: '',
        },
      }
    } catch {
      return null
    }
  },

  getTopDebtors: async () => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('sales_debtors')
        .select('id, name, balance')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .gt('balance', 0)
        .order('balance', { ascending: false })
        .limit(10)
      return data ?? []
    } catch {
      return []
    }
  },

  getSlowMoving: async (periodOrRange?: RangeInput) => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('catalog_products')
        .select('id, name, monthly_sold, catalog_inventory(quantity)')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('monthly_sold')
        .limit(20)
      return (data ?? []).map(p => ({
        product_id: p.id,
        name: p.name,
        monthly_sold: p.monthly_sold,
        stock: (p.catalog_inventory as any)?.[0]?.quantity ?? 0,
      }))
    } catch {
      return []
    }
  },

  getPaymentBreakdown: async (days: number) => {
    try {
      const businessId = await getBusinessId()
      const from = manilaDate(new Date(Date.now() - (days - 1) * 86400000))
      const to = manilaDate()
      const tf = tzFilter(from, to)
      const { data } = await supabase
        .from('sales_orders')
        .select('payment_breakdown, total, is_credit')
        .eq('business_id', businessId)
        .eq('status', 'completed')
        .eq('exclude_sales', false)
        .is('deleted_at', null)
        .gte('created_at', tf.from)
        .lte('created_at', tf.to)

      const breakdown: Record<string, number> = { cash: 0, gcash: 0, card: 0, credit: 0 }
      for (const o of data ?? []) {
        if (o.is_credit) { breakdown.credit += o.total ?? 0; continue }
        const pbs = Array.isArray(o.payment_breakdown) ? o.payment_breakdown : []
        if (pbs.length === 0) { breakdown.cash += o.total ?? 0 }
        for (const pb of pbs) { breakdown[pb.method] = (breakdown[pb.method] ?? 0) + pb.amount }
      }
      return breakdown
    } catch {
      return {}
    }
  },
}
