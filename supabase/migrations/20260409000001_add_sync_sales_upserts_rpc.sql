CREATE OR REPLACE FUNCTION public.sync_sales_upserts(
  business_id UUID,
  debtors JSONB DEFAULT '[]'::jsonb,
  orders JSONB DEFAULT '[]'::jsonb,
  order_items JSONB DEFAULT '[]'::jsonb,
  debtor_transactions JSONB DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(debtors) = 'array' AND jsonb_array_length(debtors) > 0 THEN
    INSERT INTO public.sales_debtors (
      id, business_id, name, phone, balance, total_credit, total_paid,
      due_date, follow_up_date, last_reminder_at, created_at, updated_at, deleted_at
    )
    SELECT
      debtor.id,
      business_id,
      debtor.name,
      debtor.phone,
      COALESCE(debtor.balance, 0),
      COALESCE(debtor.total_credit, 0),
      COALESCE(debtor.total_paid, 0),
      debtor.due_date,
      debtor.follow_up_date,
      debtor.last_reminder_at,
      COALESCE(debtor.created_at, now()),
      now(),
      debtor.deleted_at
    FROM jsonb_to_recordset(debtors) AS debtor(
      id TEXT,
      name TEXT,
      phone TEXT,
      balance NUMERIC,
      total_credit NUMERIC,
      total_paid NUMERIC,
      due_date TEXT,
      follow_up_date TEXT,
      last_reminder_at TEXT,
      created_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
    ON CONFLICT (id) DO UPDATE SET
      business_id = EXCLUDED.business_id,
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      balance = EXCLUDED.balance,
      total_credit = EXCLUDED.total_credit,
      total_paid = EXCLUDED.total_paid,
      due_date = EXCLUDED.due_date,
      follow_up_date = EXCLUDED.follow_up_date,
      last_reminder_at = EXCLUDED.last_reminder_at,
      updated_at = now(),
      deleted_at = EXCLUDED.deleted_at;
  END IF;

  IF jsonb_typeof(orders) = 'array' AND jsonb_array_length(orders) > 0 THEN
    INSERT INTO public.sales_orders (
      id, business_id, order_number, customer_name, status, subtotal, discount, total,
      payment_amount, change_amount, payment_breakdown, is_credit, debtor_id, user_id,
      note, exclude_sales, created_at, updated_at, deleted_at
    )
    SELECT
      sales_order.id,
      business_id,
      sales_order.order_number,
      sales_order.customer_name,
      COALESCE(sales_order.status, 'completed'),
      COALESCE(sales_order.subtotal, 0),
      COALESCE(sales_order.discount, 0),
      COALESCE(sales_order.total, 0),
      sales_order.payment_amount,
      sales_order.change_amount,
      COALESCE(sales_order.payment_breakdown, '[]'::jsonb),
      COALESCE(sales_order.is_credit, false),
      sales_order.debtor_id,
      sales_order.user_id,
      sales_order.note,
      COALESCE(sales_order.exclude_sales, false),
      COALESCE(sales_order.created_at, now()),
      now(),
      sales_order.deleted_at
    FROM jsonb_to_recordset(orders) AS sales_order(
      id TEXT,
      order_number TEXT,
      customer_name TEXT,
      status TEXT,
      subtotal NUMERIC,
      discount NUMERIC,
      total NUMERIC,
      payment_amount NUMERIC,
      change_amount NUMERIC,
      payment_breakdown JSONB,
      is_credit BOOLEAN,
      debtor_id TEXT,
      user_id TEXT,
      note TEXT,
      exclude_sales BOOLEAN,
      created_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
    ON CONFLICT (id) DO UPDATE SET
      business_id = EXCLUDED.business_id,
      order_number = EXCLUDED.order_number,
      customer_name = EXCLUDED.customer_name,
      status = EXCLUDED.status,
      subtotal = EXCLUDED.subtotal,
      discount = EXCLUDED.discount,
      total = EXCLUDED.total,
      payment_amount = EXCLUDED.payment_amount,
      change_amount = EXCLUDED.change_amount,
      payment_breakdown = EXCLUDED.payment_breakdown,
      is_credit = EXCLUDED.is_credit,
      debtor_id = EXCLUDED.debtor_id,
      user_id = EXCLUDED.user_id,
      note = EXCLUDED.note,
      exclude_sales = EXCLUDED.exclude_sales,
      updated_at = now(),
      deleted_at = EXCLUDED.deleted_at;
  END IF;

  IF jsonb_typeof(order_items) = 'array' AND jsonb_array_length(order_items) > 0 THEN
    INSERT INTO public.sales_order_items (
      id, business_id, order_id, product_id, name, price, cost, quantity, subtotal, is_custom, updated_at
    )
    SELECT
      item.id,
      business_id,
      item.order_id,
      item.product_id,
      item.name,
      COALESCE(item.price, 0),
      COALESCE(item.cost, 0),
      COALESCE(item.quantity, 0),
      COALESCE(item.subtotal, 0),
      COALESCE(item.is_custom, false),
      now()
    FROM jsonb_to_recordset(order_items) AS item(
      id TEXT,
      order_id TEXT,
      product_id TEXT,
      name TEXT,
      price NUMERIC,
      cost NUMERIC,
      quantity NUMERIC,
      subtotal NUMERIC,
      is_custom BOOLEAN
    )
    ON CONFLICT (id) DO UPDATE SET
      business_id = EXCLUDED.business_id,
      order_id = EXCLUDED.order_id,
      product_id = EXCLUDED.product_id,
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      cost = EXCLUDED.cost,
      quantity = EXCLUDED.quantity,
      subtotal = EXCLUDED.subtotal,
      is_custom = EXCLUDED.is_custom,
      updated_at = now();
  END IF;

  IF jsonb_typeof(debtor_transactions) = 'array' AND jsonb_array_length(debtor_transactions) > 0 THEN
    INSERT INTO public.sales_debtor_transactions (
      id, business_id, debtor_id, type, amount, profit, note, order_id, user_id, created_at, updated_at
    )
    SELECT
      tx.id,
      business_id,
      tx.debtor_id,
      tx.type,
      COALESCE(tx.amount, 0),
      COALESCE(tx.profit, 0),
      tx.note,
      tx.order_id,
      tx.user_id,
      COALESCE(tx.created_at, now()),
      now()
    FROM jsonb_to_recordset(debtor_transactions) AS tx(
      id TEXT,
      debtor_id TEXT,
      type TEXT,
      amount NUMERIC,
      profit NUMERIC,
      note TEXT,
      order_id TEXT,
      user_id TEXT,
      created_at TIMESTAMPTZ
    )
    ON CONFLICT (id) DO UPDATE SET
      business_id = EXCLUDED.business_id,
      debtor_id = EXCLUDED.debtor_id,
      type = EXCLUDED.type,
      amount = EXCLUDED.amount,
      profit = EXCLUDED.profit,
      note = EXCLUDED.note,
      order_id = EXCLUDED.order_id,
      user_id = EXCLUDED.user_id,
      updated_at = now();
  END IF;
END;
$$;
