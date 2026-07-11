import { createClient } from '@supabase/supabase-js'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

const [email, newPassword] = process.argv.slice(2)
if (!email || !newPassword) {
  console.error('Usage: tsx scripts/reset-password.ts <email> <new-password>')
  process.exit(1)
}

const sb = createClient('https://rzhjfsgjkbvcspfncyku.supabase.co', SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  let page = 1
  let user: { id: string } | undefined
  while (!user) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error('Error listing users: ' + error.message)
      process.exit(1)
    }
    user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (user || data.users.length < 200) break
    page += 1
  }

  if (!user) {
    console.error(`No user found with email ${email}`)
    process.exit(1)
  }

  const { error } = await sb.auth.admin.updateUserById(user.id, { password: newPassword })
  console.log(error ? 'Error: ' + error.message : `Password updated successfully for ${email}!`)
}

main()
