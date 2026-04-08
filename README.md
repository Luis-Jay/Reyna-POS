# Reyna POS

Offline-first point of sale desktop app for Reyna store.

## Current Scope

Reyna POS currently supports:

- Local POS sales on a single device
- Product, category, variation, inventory, debtor, and reporting features stored in local SQLite
- Cloud account signup/login for account connection
- Cashier sync to Supabase
- Shared category, variation, product, and inventory sync to Supabase
- Shared orders, sales history, and debtor balance sync to Supabase
- Backup export/import
- Reyna Pro activation flow

Current limitations:

- Product image files are not yet synced across devices
- Thermal printing must be tested on the target hardware before release
- Financial reports are operational estimates, not full bookkeeping output

## Local Development

```bash
npm install
npm run dev
```

Build the desktop app:

```bash
npm run build
```

## Release Checklist

Before shipping to a client, verify all of the following on a clean machine:

1. Setup flow works for new account signup.
2. Cloud login works after switching accounts.
3. Admin and cashier PIN login both work.
4. Products can be created, edited, searched, and sold.
5. Orders appear correctly in sales history.
6. Debtor balances update correctly after credit sales and payments.
7. Backup export and import both succeed.
8. Activation flow opens payment and checks status successfully.
9. Thermal printer test page works on the actual client printer.
10. Installer package launches correctly after fresh install.

## Cloud Notes

Cloud connection is currently used for:

- account identity
- business profile setup
- cashier synchronization
- shared product catalog and inventory synchronization
- shared orders and debtor synchronization
- Reyna Pro activation

Cloud connection is not yet used for syncing product image files across multiple devices, and conflict resolution is still basic last-write-wins during manual sync.

## Support Notes

If a client reports cloud or activation problems:

1. Confirm they are signed in to the correct cloud account.
2. Check Supabase Edge Function deployment status.
3. Confirm Xendit and Supabase secrets are configured.
4. Export a backup before resetting or re-linking the device.
5. Re-test the activation flow after re-login.
