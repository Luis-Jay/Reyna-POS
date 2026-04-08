import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { VariationGroup } from '../../types'
import { Plus, Trash2, X } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'

export default function SettingsPage() {
  const navigate = useNavigate()
  const logout = useAuthStore(s => s.logout)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [groups, setGroups] = useState<VariationGroup[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newOption, setNewOption] = useState<Record<string, { name: string; price: string; cost: string }>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [printerStatus, setPrinterStatus] = useState<any>(null)
  const [printers, setPrinters] = useState<any[]>([])
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const load = async () => {
    const [s, g, ps, printerList, sync] = await Promise.all([
      window.api.settings.getAll(),
      window.api.variations.getGroups(),
      window.api.printer.getStatus(),
      window.api.printer.listPrinters(),
      window.api.sync.getStatus(),
    ])
    setSettings(s)
    setGroups(g)
    setPrinterStatus(ps)
    setPrinters(Array.isArray(printerList) ? printerList : [])
    setSyncStatus(sync)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const unsubscribe = window.api.on.syncStatus((status) => {
      setSyncStatus(status)
    })

    return unsubscribe
  }, [])

  const set = (key: string, value: string) => setSettings(s => ({ ...s, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    await window.api.settings.setMany(settings)
    await window.api.printer.setConfig({
      enabled: settings['thermal_enabled'] === 'true',
      paperSize: settings['paper_size'] || '58mm',
      interface: settings['printer_interface'] || '',
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return
    await window.api.variations.createGroup(newGroupName.trim())
    setNewGroupName('')
    load()
  }

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Delete this variation group and all its options?')) return
    await window.api.variations.deleteGroup(id)
    load()
  }

  const handleAddOption = async (groupId: string) => {
    const opt = newOption[groupId]
    if (!opt?.name?.trim()) return
    await window.api.variations.addOption(groupId, {
      name: opt.name.trim(),
      price: parseFloat(opt.price) || 0,
      cost: parseFloat(opt.cost) || 0,
    })
    setNewOption(n => ({ ...n, [groupId]: { name: '', price: '', cost: '' } }))
    load()
  }

  const handleDeleteOption = async (id: string) => {
    await window.api.variations.deleteOption(id)
    load()
  }

  const handleUpdateOption = async (id: string, price: string, cost: string) => {
    await window.api.variations.updateOption(id, {
      price: parseFloat(price) || 0,
      cost: parseFloat(cost) || 0,
    })
  }

  const handleTestPrint = async () => {
    const result = await window.api.printer.testPage()
    if (!result.success) {
      alert(result.error || 'Printer test failed.')
    }
    setPrinterStatus(await window.api.printer.getStatus())
  }

  const handleForceSync = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const result = await window.api.sync.force()
      setSyncMessage(result.message || (result.success ? 'Sync completed.' : 'Sync failed.'))
      setSyncStatus(await window.api.sync.getStatus())
    } finally {
      setSyncing(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('DANGER: This will permanently delete all store data. Are you absolutely sure?')) return
    if (!confirm('This cannot be undone. Type YES to confirm.')) return
    await window.api.backup.reset()
    window.location.reload()
  }

  const handleSwitchAccount = async () => {
    if (!confirm('Disconnect this device from the current cloud account and go back to the sign-in/setup screen?')) return
    try {
      await window.api.auth.cloudLogout()
      logout()
      window.location.reload()
    } catch (error) {
      alert(`Failed to logout from cloud: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const Toggle = ({ setting, label }: { setting: string; label: string }) => (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => set(setting, settings[setting] === 'true' ? 'false' : 'true')}
        className={`relative w-12 h-6 rounded-full transition-colors ${settings[setting] === 'true' ? 'bg-[#1a8eff]' : 'bg-gray-200'}`}
      >
        <div className={`absolute w-5 h-5 bg-white rounded-full shadow top-0.5 transition-transform ${settings[setting] === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )

  const Select = ({ setting, label, options }: { setting: string; label: string; options: Array<{ label: string; value: string }> }) => (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <select value={settings[setting] ?? options[0]?.value ?? ''} onChange={e => set(setting, e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )

  const yesNo = [
    { label: 'Yes', value: 'true' },
    { label: 'No', value: 'false' },
  ]

  const noYes = [
    { label: 'No', value: 'false' },
    { label: 'Yes', value: 'true' },
  ]

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Settings" back="/" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* Store info */}
          <Section title="Store">
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
              <input value={settings['store_name'] || ''} onChange={e => set('store_name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Contact Number</label>
              <input value={settings['store_phone'] || ''} onChange={e => set('store_phone', e.target.value)}
                placeholder="+639123456789"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              <p className="mt-1 text-xs text-gray-500">Used for your store profile and optional Pro SMS reminders if you subscribe later.</p>
            </div>
          </Section>

          <Section title="Reyna Pro">
            <p className="py-3 text-sm text-gray-600">
              Payment is only for Pro-only features like sending SMS reminders to debtors and auto-generated financial reports such as trial balance, income statement, and profit and loss.
            </p>
            <button
              onClick={() => navigate('/pro')}
              className="mb-4 w-full rounded-xl bg-[#1a8eff] py-3 text-sm font-semibold text-white hover:bg-[#0077e6]"
            >
              Manage Pro Subscription
            </button>
          </Section>

          {/* Feature Controls */}
          <Section title="Feature Controls">
            <SectionInner label="Inventory & Profit">
              <Select setting="inventory_enabled" label="Enable Inventory, Profit & Cost Tracking" options={yesNo} />
            </SectionInner>
            <SectionInner label="Cashier Permissions">
              <Select setting="cashier_manage_debtors" label="Allow Cashier to Manage Debtors" options={noYes} />
            </SectionInner>
            <SectionInner label="Buyer Online Ordering Page">
              <Select setting="buyer_page_enabled" label="Enable Buyer Page" options={yesNo} />
              <Select setting="oos_blocking" label="Out-of-Stock Blocking for buyers" options={yesNo} />
              <Select setting="sound_alerts" label="New Order Placed Sound Alerts" options={yesNo} />
              <Select
                setting="store_closed"
                label="Store is Closed for Buyers"
                options={[
                  { label: 'Open', value: 'false' },
                  { label: 'Closed', value: 'true' },
                ]}
              />
            </SectionInner>
            <SectionInner label="AI Features">
              <Select setting="ai_image_recognition" label="Enable AI Image Recognition" options={yesNo} />
            </SectionInner>
          </Section>

          <Section title="Cloud Sync">
            <div className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Connection</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {syncStatus?.message || 'Checking cloud sync status...'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  syncStatus?.status === 'connected'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {syncStatus?.status === 'connected' ? 'Connected' : 'Not Signed In'}
                </span>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Pending local records: <span className="font-semibold text-gray-700">{syncStatus?.pending ?? 0}</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Auto-sync: <span className="font-semibold text-gray-700">{syncStatus?.syncing ? 'Syncing now' : 'Enabled'}</span>
                {syncStatus?.lastSyncedAt ? ` • Last synced ${new Date(syncStatus.lastSyncedAt).toLocaleString()}` : ''}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Current cloud sync scope: cashiers, categories, variations, products, inventory, completed orders, and debtor balances. Product images still stay local on each device.
              </p>
              {syncMessage && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{syncMessage}</p>}
            </div>
            <div className="pb-3">
              <button
                onClick={handleForceSync}
                disabled={syncing}
                className="w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
              >
                {syncing ? 'Syncing Now...' : 'Sync Now'}
              </button>
            </div>
          </Section>

          {/* Thermal Printer */}
          <Section title="Thermal Printer">
            <Toggle setting="thermal_enabled" label="Enable Thermal Printing" />
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">Paper Size</label>
              <div className="flex gap-2">
                {['58mm','80mm'].map(s => (
                  <button key={s} onClick={() => set('paper_size', s)}
                    className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${settings['paper_size'] === s ? 'border-[#1a8eff] text-[#1a8eff] bg-blue-50' : 'border-gray-200 text-gray-600'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">System Printer</label>
              <select
                value={settings['printer_interface'] || ''}
                onChange={e => set('printer_interface', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              >
                <option value="">Use print dialog default</option>
                {printers.map(printer => (
                  <option key={printer.name} value={`system:${printer.name}`}>{printer.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Leave this blank to use the system print dialog default printer.
              </p>
            </div>
            {printerStatus && (
              <div className="border border-gray-200 rounded-xl p-4 mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">Status</span>
                  <span className={`text-sm font-bold ${printerStatus.connected ? 'text-green-500' : 'text-red-500'}`}>
                    {printerStatus.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {printerStatus.type && <p className="text-xs text-gray-500">Type: {printerStatus.type}</p>}
                {printerStatus.device && <p className="text-xs text-gray-500">Device: {printerStatus.device}</p>}
                {printerStatus.error && <p className="mt-1 text-xs text-red-500">{printerStatus.error}</p>}
              </div>
            )}
            <div className="pb-3">
              <p className="text-xs font-medium text-gray-600">Detected System Printers</p>
              {printers.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {printers.slice(0, 5).map(printer => (
                    <p key={printer.name} className="text-xs text-gray-500">{printer.name}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">No printers detected by Electron yet.</p>
              )}
            </div>
            <div className="flex gap-3 pb-3">
              <button onClick={handleTestPrint}
                className="flex-1 bg-green-500 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-green-600">
                🖨 Print Test Page
              </button>
            </div>
          </Section>

          {/* Variation Groups */}
          <Section title="Manage Variation Groups">
            {groups.map(g => (
              <div key={g.id} className="border-b border-gray-100 py-3 last:border-0">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-gray-800">{g.name}</h4>
                  <button onClick={() => handleDeleteGroup(g.id)} className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1">
                    <Trash2 size={14} /> Delete Group
                  </button>
                </div>
                {g.options?.map(opt => (
                  <OptionRow key={opt.id} opt={opt} onDelete={() => { handleDeleteOption(opt.id); }} onUpdate={handleUpdateOption} />
                ))}
                {/* Add option row */}
                <div className="flex gap-2 mt-2">
                  <input
                    value={newOption[g.id]?.name || ''}
                    onChange={e => setNewOption(n => ({ ...n, [g.id]: { ...n[g.id], name: e.target.value } }))}
                    placeholder="e.g., Large"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                  <input
                    value={newOption[g.id]?.price || ''}
                    onChange={e => setNewOption(n => ({ ...n, [g.id]: { ...n[g.id], price: e.target.value } }))}
                    placeholder="Price"
                    type="number"
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                  <input
                    value={newOption[g.id]?.cost || ''}
                    onChange={e => setNewOption(n => ({ ...n, [g.id]: { ...n[g.id], cost: e.target.value } }))}
                    placeholder="Cost"
                    type="number"
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                  <button onClick={() => handleAddOption(g.id)}
                    className="bg-[#1a8eff] text-white px-3 rounded-lg hover:bg-[#0077e6]"><Plus size={16} /></button>
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-3">
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                placeholder="New Group Name (e.g., Size)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                onKeyDown={e => e.key === 'Enter' && handleAddGroup()} />
              <button onClick={handleAddGroup}
                className="bg-green-500 text-white px-4 rounded-lg font-medium text-sm hover:bg-green-600">Add Group</button>
            </div>
          </Section>

          {/* Save button */}
          <button onClick={handleSave} disabled={saving}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-colors ${saved ? 'bg-green-500' : 'bg-[#1a8eff] hover:bg-[#0077e6]'} disabled:opacity-50`}>
            {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Settings'}
          </button>

          {/* Advanced */}
          <Section title="Advanced">
            <p className="text-xs text-gray-500 py-2">
              Use these tools for support and recovery. AI search maintenance is not implemented in this desktop build.
            </p>
            <div className="flex gap-2">
              <button onClick={() => window.api.backup.export()} className="flex-1 bg-[#1a8eff] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#0077e6]">
                Export Backup
              </button>
              <button onClick={() => window.api.backup.import(undefined as any)} className="flex-1 bg-gray-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-700">
                Import Backup
              </button>
            </div>
          </Section>

          <Section title="Account">
            <p className="py-3 text-sm text-gray-600">
              Disconnect this device from the current cloud account if you want to sign in with a different email.
            </p>
            <button
              onClick={handleSwitchAccount}
              className="mb-4 w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Switch Cloud Account
            </button>
          </Section>

          {/* Danger Zone */}
          <div className="border-2 border-red-200 rounded-xl p-4 bg-red-50">
            <p className="font-bold text-red-600 mb-1">Danger Zone</p>
            <p className="text-xs text-red-500 mb-3">These actions are permanent and cannot be undone. Please be certain before proceeding.</p>
            <button onClick={handleReset} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 flex items-center gap-2">
              ⚠ Reset Store Data
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 pb-4">Powered by Reyna Advanced POS</p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function SectionInner({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 py-2 last:border-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2 mb-1">{label}</p>
      {children}
    </div>
  )
}

function OptionRow({ opt, onDelete, onUpdate }: { opt: any; onDelete: () => void; onUpdate: (id: string, price: string, cost: string) => void }) {
  const [price, setPrice] = useState(String(opt.price))
  const [cost, setCost] = useState(String(opt.cost))

  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-sm text-gray-700 flex-1">{opt.name}</span>
      <span className="text-xs text-gray-400">₱</span>
      <input value={price} onChange={e => setPrice(e.target.value)} onBlur={() => onUpdate(opt.id, price, cost)}
        type="number" className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a8eff] text-right" />
      <span className="text-xs text-gray-400">₱</span>
      <input value={cost} onChange={e => setCost(e.target.value)} onBlur={() => onUpdate(opt.id, price, cost)}
        type="number" className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a8eff] text-right" />
      <button onClick={onDelete} className="text-red-400 hover:text-red-600"><X size={14} /></button>
    </div>
  )
}
