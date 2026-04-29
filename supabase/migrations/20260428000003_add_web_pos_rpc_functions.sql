CREATE OR REPLACE FUNCTION public.create_sale_order(
  p_business_id UUID,
  p_order_id TEXT,
  p_customer_name TEXT DEFAULT NULL,
  p_subtotal NUMERIC DEFAULT 0,
  p_discount NUMERIC DEFAULT 0,
  p_total NUMERIC DEFAULT 0,
  p_payment_amount NUMERIC DEFAULT NULL,
  p_change_amount NUMERIC DEFAULT NULL,
  p_payment_breakdown JSONB DEFAULT '[]'::jsonb,
  p_is_credit BOOLEAN DEFAULT false,
  p_debtor_id TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number TEXT;
  v_prefix TEXT;
  v_next_seq INTEGER;
  v_profit NUMERIC := 0;
BEGIN
  IF p_business_id IS DISTINCT FROM get_business_id() THEN
    RAISE EXCEPTION 'Unauthorized business access';
  END IF;

  IF p_order_id IS NULL OR length(trim(p_order_id)) = 0 THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  v_prefix := to_char(timezone('Asia/Manila', now()), 'YYMMDD') || '-';

  PERFORM pg_advisory_xact_lock(hashtext(p_business_id::text || ':' || v_prefix));

  SELECT COALESCE(MAX(split_part(order_number, '-', 2)::INTEGER), 0) + 1
  INTO v_next_seq
  FROM public.sales_orders
  WHERE business_id = p_business_id
    AND order_number LIKE v_prefix || '%';

  v_order_number := v_prefix || lpad(v_next_seq::TEXT, 4, '0');

  INSERT INTO public.sales_orders (
    id,
    business_id,
    order_number,
    customer_name,
    status,
    subtotal,
    discount,
    total,
    payment_amount,
    change_amount,
    payment_breakdown,
    is_credit,
    debtor_id,
    user_id,
    note
  )
  VALUES (
    p_order_id,
    p_business_id,
    v_order_number,
    p_customer_name,
    'completed',
    COALESCE(p_subtotal, 0),
    COALESCE(p_discount, 0),
    COALESCE(p_total, 0),
    p_payment_amount,
    p_change_amount,
    COALESCE(p_payment_breakdown, '[]'::jsonb),
    COALESCE(p_is_credit, false),
    p_debtor_id,
    p_user_id,
    p_note
  );

  INSERT INTO public.sales_order_items (
    id,
    business_id,
    order_id,
    product_id,
    name,
    price,
    cost,
    quantity,
    subtotal,
    is_custom,
    updated_at
  )
  SELECT
    COALESCE(item.id, gen_random_uuid()::TEXT),
    p_business_id,
    p_order_id,
    item.product_id,
    item.name,
    COALESCE(item.price, 0),
    COALESCE(item.cost, 0),
    COALESCE(item.quantity, 0),
    COALESCE(item.subtotal, 0),
    COALESCE(item.is_custom, false),
    now()
  FROM jsonb_to_recordset(p_items) AS item(
    id TEXT,
    product_id TEXT,
    name TEXT,
    price NUMERIC,
    cost NUMERIC,
    quantity NUMERIC,
    subtotal NUMERIC,
    is_custom BOOLEAN
  );

  WITH sale_rows AS (
    SELECT
      item.product_id,
      SUM(COALESCE(item.quantity, 0)) AS quantity,
      SUM(COALESCE(item.quantity, 0) * (COALESCE(item.price, 0) - COALESCE(item.cost, 0))) AS profit
    FROM jsonb_to_recordset(p_items) AS item(
      product_id TEXT,
      quantity NUMERIC,
      price NUMERIC,
      cost NUMERIC,
      is_custom BOOLEAN
    )
    WHERE item.product_id IS NOT NULL
      AND COALESCE(item.is_custom, false) = false
    GROUP BY item.product_id
  )
  UPDATE public.catalog_inventory inv
  SET
    quantity = GREATEST(0, inv.quantity - sale_rows.quantity),
    updated_at = now()
  FROM sale_rows
  WHERE inv.business_id = p_business_id
    AND inv.product_id = sale_rows.product_id;

  WITH sale_rows AS (
    SELECT
      item.product_id,
      SUM(COALESCE(item.quantity, 0)) AS quantity
    FROM jsonb_to_recordset(p_items) AS item(
      product_id TEXT,
      quantity NUMERIC,
      is_custom BOOLEAN
    )
    WHERE item.product_id IS NOT NULL
      AND COALESCE(item.is_custom, false) = false
    GROUP BY item.product_id
  )
  INSERT INTO public.stock_movements (
    id,
    business_id,
    product_id,
    type,
    quantity,
    reference_id,
    note,
    user_id
  )
  SELECT
    gen_random_uuid()::TEXT,
    p_business_id,
    sale_rows.product_id,
    'sale',
    -sale_rows.quantity,
    p_order_id,
    p_note,
    p_user_id
  FROM sale_rows;

  WITH sale_rows AS (
    SELECT
      item.product_id,
      SUM(COALESCE(item.quantity, 0)) AS quantity
    FROM jsonb_to_recordset(p_items) AS item(
      product_id TEXT,
      quantity NUMERIC,
      is_custom BOOLEAN
    )
    WHERE item.product_id IS NOT NULL
      AND COALESCE(item.is_custom, false) = false
    GROUP BY item.product_id
  )
  UPDATE public.catalog_products p
  SET
    monthly_sold = COALESCE(p.monthly_sold, 0) + sale_rows.quantity,
    updated_at = now()
  FROM sale_rows
  WHERE p.business_id = p_business_id
    AND p.id = sale_rows.product_id;

  SELECT COALESCE(SUM((COALESCE(item.price, 0) - COALESCE(item.cost, 0)) * COALESCE(item.quantity, 0)), 0)
  INTO v_profit
  FROM jsonb_to_recordset(p_items) AS item(
    price NUMERIC,
    cost NUMERIC,
    quantity NUMERIC
  );

  IF COALESCE(p_is_credit, false) = true AND p_debtor_id IS NOT NULL THEN
    UPDATE public.sales_debtors
    SET
      balance = COALESCE(balance, 0) + COALESCE(p_total, 0),
      total_credit = COALESCE(total_credit, 0) + COALESCE(p_total, 0),
      updated_at = now()
    WHERE id = p_debtor_id
      AND business_id = p_business_id;

    INSERT INTO public.sales_debtor_transactions (
      id,
      business_id,
      debtor_id,
      type,
      amount,
      profit,
      note,
      order_id,
      user_id
    )
    VALUES (
      gen_random_uuid()::TEXT,
      p_business_id,
      p_debtor_id,
      'debt',
      COALESCE(p_total, 0),
      v_profit,
      p_note,
      p_order_id,
      p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'order_number', v_order_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_debtor_transaction(
  p_business_id UUID,
  p_transaction_id TEXT,
  p_debtor_id TEXT,
  p_type TEXT,
  p_amount NUMERIC DEFAULT 0,
  p_note TEXT DEFAULT NULL,
  p_order_id TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC := COALESCE(p_amount, 0);
BEGIN
  IF p_business_id IS DISTINCT FROM get_business_id() THEN
    RAISE EXCEPTION 'Unauthorized business access';
  END IF;

  IF p_type NOT IN ('debt', 'payment', 'note') THEN
    RAISE EXCEPTION 'Invalid debtor transaction type';
  END IF;

  INSERT INTO public.sales_debtor_transactions (
    id,
    business_id,
    debtor_id,
    type,
    amount,
    profit,
    note,
    order_id,
    user_id
  )
  VALUES (
    p_transaction_id,
    p_business_id,
    p_debtor_id,
    p_type,
    v_amount,
    0,
    p_note,
    p_order_id,
    p_user_id
  );

  IF p_type = 'debt' THEN
    UPDATE public.sales_debtors
    SET
      balance = COALESCE(balance, 0) + v_amount,
      total_credit = COALESCE(total_credit, 0) + v_amount,
      updated_at = now()
    WHERE id = p_debtor_id
      AND business_id = p_business_id;
  ELSIF p_type = 'payment' THEN
    UPDATE public.sales_debtors
    SET
      balance = GREATEST(0, COALESCE(balance, 0) - v_amount),
      total_paid = COALESCE(total_paid, 0) + v_amount,
      updated_at = now()
    WHERE id = p_debtor_id
      AND business_id = p_business_id;
  END IF;

  RETURN jsonb_build_object('id', p_transaction_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_partial_refund(
  p_business_id UUID,
  p_order_id TEXT,
  p_refund_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund_total NUMERIC := 0;
BEGIN
  IF p_business_id IS DISTINCT FROM get_business_id() THEN
    RAISE EXCEPTION 'Unauthorized business access';
  END IF;

  IF jsonb_typeof(p_refund_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_refund_items) = 0 THEN
    RAISE EXCEPTION 'Refund items are required';
  END IF;

  SELECT COALESCE(SUM(COALESCE(item.subtotal, 0)), 0)
  INTO v_refund_total
  FROM jsonb_to_recordset(p_refund_items) AS item(
    subtotal NUMERIC
  );

  UPDATE public.sales_orders
  SET
    total = GREATEST(0, COALESCE(total, 0) - v_refund_total),
    updated_at = now()
  WHERE id = p_order_id
    AND business_id = p_business_id;

  WITH refund_rows AS (
    SELECT
      item.product_id,
      SUM(COALESCE(item.quantity, 0)) AS quantity
    FROM jsonb_to_recordset(p_refund_items) AS item(
      product_id TEXT,
      quantity NUMERIC
    )
    WHERE item.product_id IS NOT NULL
    GROUP BY item.product_id
  )
  UPDATE public.catalog_inventory inv
  SET
    quantity = COALESCE(inv.quantity, 0) + refund_rows.quantity,
    updated_at = now()
  FROM refund_rows
  WHERE inv.business_id = p_business_id
    AND inv.product_id = refund_rows.product_id;

  WITH refund_rows AS (
    SELECT
      item.product_id,
      SUM(COALESCE(item.quantity, 0)) AS quantity
    FROM jsonb_to_recordset(p_refund_items) AS item(
      product_id TEXT,
      quantity NUMERIC
    )
    WHERE item.product_id IS NOT NULL
    GROUP BY item.product_id
  )
  INSERT INTO public.stock_movements (
    id,
    business_id,
    product_id,
    type,
    quantity,
    reference_id,
    note
  )
  SELECT
    gen_random_uuid()::TEXT,
    p_business_id,
    refund_rows.product_id,
    'return',
    refund_rows.quantity,
    p_order_id,
    'Partial refund'
  FROM refund_rows;

  RETURN jsonb_build_object('refund_total', v_refund_total);
END;
$$;
