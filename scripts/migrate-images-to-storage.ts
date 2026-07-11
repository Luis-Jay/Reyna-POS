/**
 * One-time migration: moves all base64 product images from the
 * catalog_products.image_url column into Supabase Storage.
 *
 * Run once:
 *   SUPABASE_SERVICE_ROLE_KEY=<your_key> npx tsx scripts/migrate-images-to-storage.ts
 *
 * Safe to re-run — skips products that already have a Storage URL.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('❌  Set SUPABASE_SERVICE_ROLE_KEY before running this script.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const BUCKET = 'product-images'

async function ensureBucketIsPublic() {
  const { data: bucket } = await supabase.storage.getBucket(BUCKET)
  if (!bucket) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
    if (error) throw new Error(`Failed to create bucket: ${error.message}`)
    console.log(`✅  Created public bucket "${BUCKET}"`)
  } else if (!bucket.public) {
    const { error } = await supabase.storage.updateBucket(BUCKET, { public: true })
    if (error) throw new Error(`Failed to make bucket public: ${error.message}`)
    console.log(`✅  Made bucket "${BUCKET}" public`)
  } else {
    console.log(`✅  Bucket "${BUCKET}" already exists and is public`)
  }
}

function mimeToExt(mimeType: string): string {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'jpg'
}

async function migrateProduct(product: { id: string; business_id: string; image_url: string }) {
  const match = product.image_url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) {
    console.log(`  ⚠️  ${product.id}: not a valid base64 data URL, skipping`)
    return
  }

  const [, mimeType, base64] = match
  const ext = mimeToExt(mimeType)
  const path = `${product.business_id}/${product.id}.${ext}`

  // Upload to Storage
  const buffer = Buffer.from(base64, 'base64')
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: true })

  if (uploadError) {
    console.error(`  ❌  ${product.id}: upload failed — ${uploadError.message}`)
    return
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // Update the DB column
  const { error: updateError } = await supabase
    .from('catalog_products')
    .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', product.id)

  if (updateError) {
    console.error(`  ❌  ${product.id}: DB update failed — ${updateError.message}`)
    return
  }

  const kb = Math.round(buffer.byteLength / 1024)
  console.log(`  ✅  ${product.id}: ${kb}KB → ${publicUrl}`)
}

async function main() {
  console.log('🔍  Checking bucket…')
  await ensureBucketIsPublic()

  console.log('\n🔍  Fetching products with base64 images…')

  // Check total product count first
  const { count, error: countError } = await supabase
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })

  if (countError) throw new Error(`Failed to count products: ${countError.message}`)
  console.log(`    Total products in DB: ${count ?? 0}`)

  const { count: base64Count, error: base64CountError } = await supabase
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .like('image_url', 'data:%')

  if (base64CountError) throw new Error(`Failed to count base64 images: ${base64CountError.message}`)
  console.log(`    Products with base64 images: ${base64Count ?? 0}`)

  if (!base64Count || base64Count === 0) {
    console.log('\n✅  No base64 images found — nothing to migrate.')
    return
  }

  let page = 0
  const pageSize = 50
  let total = 0
  let migrated = 0

  while (true) {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('id, business_id, image_url')
      .like('image_url', 'data:%')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) throw new Error(`Failed to fetch products: ${error.message}`)
    if (!data || data.length === 0) break

    total += data.length
    console.log(`\n📦  Page ${page + 1}: ${data.length} products to migrate`)

    for (const product of data) {
      await migrateProduct(product as any)
      migrated++
    }

    if (data.length < pageSize) break
    page++
  }

  console.log(`\n🎉  Done. Migrated ${migrated} / ${total} product images to Storage.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
