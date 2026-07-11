import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { VariationGroup, UserPermissions } from '../../types'
import { Plus, Trash2, X, Upload, ChevronDown, ChevronUp, Archive } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { MODULE_ACCESS, normalizePermissions, serializePermissions } from '../../lib/access'

const PERMISSION_LABELS: Array<{ key: keyof UserPermissions; label: string; desc: string }> = MODULE_ACCESS
  .filter(module => module.permissionKey)
  .map(module => ({
    key: module.permissionKey!,
    label: module.label,
    desc: module.description,
  }))

export default function SettingsPage() {
  const navigate = useNavigate()
  const logout = useAuthStore(s => s.logout)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [groups, setGroups] = useState<VariationGroup[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newOption, setNewOption] = useState<Record<string, { name: string; price: string; cost: string }>>({})
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [printerStatus, setPrinterStatus] = useState<any>(null)
  const [printers, setPrinters] = useState<any[]>([])
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userPerms, setUserPerms] = useState<Record<string, UserPermissions>>({})
  const [savingPerms, setSavingPerms] = useState<string | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ name: '', pin: '', role: 'cashier' })
  const [newUserPermissions, setNewUserPermissions] = useState<UserPermissions>({ can_access_pos: true })
  const [addingUser, setAddingUser] = useState(false)
  const [addUserError, setAddUserError] = useState('')
  const [editingPin, setEditingPin] = useState<Record<string, string>>({})
  const [savingPin, setSavingPin] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<Record<string, string>>({})
  const [savingName, setSavingName] = useState<string | null>(null)
  const [deletingUser, setDeletingUser] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [smsCredits, setSmsCredits] = useState<number | null>(null)
  const [cloudEmail, setCloudEmail] = useState<string | null>(null)
  const [usbPrinterName, setUsbPrinterName] = useState<string | null>(null)
  const [usbConnecting, setUsbConnecting] = useState(false)
  const [usbError, setUsbError] = useState('')
  const usbSupported = typeof navigator !== 'undefined' && 'usb' in navigator
  const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform)
  const [blePrinterName, setBlePrinterName] = useState<string | null>(null)
  const [bleConnecting, setBleConnecting] = useState(false)
  const [bleError, setBleError] = useState('')
  const bleSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator
  const usbBlockedByWindows = isWindows && /windows is blocking/i.test(usbError)
  const [serialPrinterName, setSerialPrinterName] = useState<string | null>(null)
  const [serialConnecting, setSerialConnecting] = useState(false)
  const [serialError, setSerialError] = useState('')
  const [serialBaudRate, setSerialBaudRate] = useState(9600)
  const serialSupported = typeof navigator !== 'undefined' && 'serial' in navigator
  const [showZadigGuide, setShowZadigGuide] = useState(false)

  const persistSettings = async (nextSettings: Record<string, string>) => {
    const normalizedSettings = Object.fromEntries(
      Object.entries(nextSettings).map(([key, value]) => [key, value == null ? '' : String(value)])
    )

    await window.api.settings.setMany(normalizedSettings)
    await window.api.printer.setConfig({
      enabled: normalizedSettings['thermal_enabled'] === 'true',
      paperSize: normalizedSettings['paper_size'] || '58mm',
      interface: normalizedSettings['printer_interface'] || '',
    })

    return await window.api.settings.getAll()
  }

  // Auto-connect to previously authorized USB/BT/Serial printers on mount
  useEffect(() => {
    window.api.printer.autoConnectUsb?.().then((res: any) => {
      if (res?.connected && res?.device) {
        setUsbPrinterName(res.device)
        window.api.printer.getStatus().then(setPrinterStatus)
        window.api.printer.listPrinters().then((list: any[]) => setPrinters(Array.isArray(list) ? list : []))
      }
    }).catch(() => {})
    ;(window.api.printer as any).autoConnectBluetooth?.().then((res: any) => {
      if (res?.connected && res?.device) {
        setBlePrinterName(res.device)
        window.api.printer.getStatus().then(setPrinterStatus)
      }
    }).catch(() => {})
    ;(window.api.printer as any).autoConnectSerial?.().then((res: any) => {
      if (res?.connected && res?.device) {
        setSerialPrinterName(res.device)
        window.api.printer.getStatus().then(setPrinterStatus)
      }
    }).catch(() => {})
  }, [])

  const handleConnectUsb = async () => {
    setUsbConnecting(true)
    setUsbError('')
    const res = await window.api.printer.connectUsb?.()
    setUsbConnecting(false)
    if (res?.success) {
      setUsbPrinterName(res.device || 'USB Printer')
      setPrinterStatus(await window.api.printer.getStatus())
      setPrinters(await window.api.printer.listPrinters())
    } else {
      setUsbError(res?.error || 'Failed to connect.')
    }
  }

  const handleDisconnectUsb = async () => {
    await window.api.printer.disconnectUsb?.()
    setUsbPrinterName(null)
    setPrinterStatus(await window.api.printer.getStatus())
    setPrinters([])
  }

  const handleConnectBluetooth = async () => {
    setBleConnecting(true)
    setBleError('')
    const res = await (window.api.printer as any).connectBluetooth?.()
    setBleConnecting(false)
    if (res?.success) {
      setBlePrinterName(res.device || 'Bluetooth Printer')
      setPrinterStatus(await window.api.printer.getStatus())
    } else {
      setBleError(res?.error || 'Failed to connect.')
    }
  }

  const handleDisconnectBluetooth = async () => {
    await (window.api.printer as any).disconnectBluetooth?.()
    setBlePrinterName(null)
    setPrinterStatus(await window.api.printer.getStatus())
  }

  const handleConnectSerial = async () => {
    setSerialConnecting(true)
    setSerialError('')
    const res = await (window.api.printer as any).connectSerial?.(serialBaudRate)
    setSerialConnecting(false)
    if (res?.success) {
      setSerialPrinterName(res.device || 'Serial Printer')
      setPrinterStatus(await window.api.printer.getStatus())
      setPrinters(await window.api.printer.listPrinters())
    } else {
      setSerialError(res?.error || 'Failed to connect.')
    }
  }

  const handleDisconnectSerial = async () => {
    await (window.api.printer as any).disconnectSerial?.()
    setSerialPrinterName(null)
    setPrinterStatus(await window.api.printer.getStatus())
    setPrinters([])
  }

  const load = async () => {
    const [s, g, ps, printerList, sync, userList] = await Promise.all([
      window.api.settings.getAll(),
      window.api.variations.getGroups(),
      window.api.printer.getStatus(),
      window.api.printer.listPrinters(),
      window.api.sync.getStatus(),
      window.api.auth.getUsers(),
    ])
    setSettings(s)
    setGroups(g)
    setPrinterStatus(ps)
    setPrinters(Array.isArray(printerList) ? printerList : [])
    setSyncStatus(sync)
    setUsers(userList)
    const perms: Record<string, UserPermissions> = {}
    for (const u of userList) {
      try { perms[u.id] = normalizePermissions(u.permissions ? JSON.parse(u.permissions) : {}) }
      catch { perms[u.id] = normalizePermissions({}) }
    }
    setUserPerms(perms)
    window.api.sms.getCredits().then((res: any) => {
      if (res?.credits !== null && res?.credits !== undefined) setSmsCredits(res.credits)
    }).catch(() => {})
    // Load current cloud account email (web only)
    if (typeof (window.api.auth as any).getCloudEmail === 'function') {
      ;(window.api.auth as any).getCloudEmail().then((email: string | null) => {
        setCloudEmail(email)
      }).catch(() => {})
    }
  }

  const handleSavePermissions = async (userId: string) => {
    setSavingPerms(userId)
    await window.api.auth.updateUser(userId, { permissions: serializePermissions(userPerms[userId] || {}) })
    setSavingPerms(null)
  }

  const togglePerm = (userId: string, key: keyof UserPermissions) => {
    setUserPerms(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [key]: !prev[userId]?.[key] },
    }))
  }

  const handleAddUser = async () => {
    if (!newUserForm.name.trim() || !newUserForm.pin.trim()) return
    setAddingUser(true)
    setAddUserError('')
    const result = await window.api.auth.createUser({
      name: newUserForm.name.trim(),
      pin: newUserForm.pin.trim(),
      role: newUserForm.role,
      permissions: newUserForm.role === 'admin' ? undefined : serializePermissions(newUserPermissions),
    })
    setAddingUser(false)
    if (!result.success) {
      setAddUserError(result.error || 'Failed to create staff account.')
      return
    }
    setNewUserForm({ name: '', pin: '', role: 'cashier' })
    setNewUserPermissions({ can_access_pos: true })
    setAddUserError('')
    setShowAddUser(false)
    load()
  }

  const handleSavePin = async (userId: string) => {
    const pin = editingPin[userId]?.trim()
    if (!pin) return
    setSavingPin(userId)
    const result = await window.api.auth.updateUser(userId, { pin })
    setSavingPin(null)
    if (!result.success) {
      alert(result.error || 'Failed to update PIN.')
      return
    }
    setEditingPin(prev => { const next = { ...prev }; delete next[userId]; return next })
  }

  const handleSaveName = async (userId: string) => {
    const name = editingName[userId]?.trim()
    if (!name) return
    setSavingName(userId)
    const result = await window.api.auth.updateUser(userId, { name })
    setSavingName(null)
    if (!result.success) {
      alert(result.error || 'Failed to update name.')
      return
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, name } : u))
    setEditingName(prev => { const next = { ...prev }; delete next[userId]; return next })
  }

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Remove "${userName}"? This cannot be undone.`)) return
    setDeletingUser(userId)
    const result = await (window.api.auth as any).deleteUser(userId)
    setDeletingUser(null)
    if (!result.success) {
      alert(result.error || 'Failed to remove staff.')
      return
    }
    load()
  }

  const handleToggleActive = async (userId: string, current: number) => {
    await window.api.auth.updateUser(userId, { is_active: current ? 0 : 1 })
    load()
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const unsubscribe = window.api.on.syncStatus((status: any) => {
      setSyncStatus(status)
    })

    return unsubscribe
  }, [])

  const set = (key: string, value: string) => setSettings(s => ({ ...s, [key]: value }))

  const setAndSave = async (key: string, value: string) => {
    const nextSettings = { ...settings, [key]: value }
    setSettings(nextSettings)
    setSaving(true)
    try {
      const persistedSettings = await persistSettings(nextSettings)
      setSettings(persistedSettings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      setSettings(settings)
      alert(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set('store_logo_data', reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = () => {
    set('store_logo_data', '')
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const persistedSettings = await persistSettings(settings)
      setSettings(persistedSettings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      alert(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
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

  const handleUpdateOption = async (id: string, name: string, price: string, cost: string) => {
    await window.api.variations.updateOption(id, {
      name: name.trim() || undefined,
      price: parseFloat(price) || 0,
      cost: parseFloat(cost) || 0,
    })
  }

  const handleRenameGroup = async (id: string) => {
    if (!editingGroupName.trim()) return
    await window.api.variations.updateGroup(id, editingGroupName.trim())
    setEditingGroupId(null)
    setEditingGroupName('')
    load()
  }

  const handleTestPrint = async () => {
    const result = await window.api.printer.testPage()
    if (!result.success) {
      alert(result.error || 'Printer test failed.')
    }
    setPrinterStatus(await window.api.printer.getStatus())
  }

  const handleOpenDrawer = async () => {
    const result = await (window.api.printer as any).openDrawer?.()
    if (!result?.success) {
      alert(result?.error || 'Could not open drawer. Make sure a USB or Bluetooth printer is connected and the cash drawer is plugged into the printer.')
    }
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

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  const handleReset = async () => {
    setResetting(true)
    setResetError('')
    try {
      const result = await window.api.backup.reset()
      if (!result?.success) {
        setResetError(result?.error || 'Unknown error.')
        return
      }
      window.location.reload()
    } catch (err: any) {
      setResetError(err?.message || 'Unknown error.')
    } finally {
      setResetting(false)
    }
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
      <select value={settings[setting] ?? options[0]?.value ?? ''} onChange={e => setAndSave(setting, e.target.value)}
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
            {/* Logo upload */}
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">Store Logo</label>
              {settings['store_logo_data'] ? (
                <div className="flex items-center gap-3 mb-2">
                  <img src={settings['store_logo_data']} alt="Store logo" className="h-16 w-16 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                  <button onClick={handleRemoveLogo} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X size={12} /> Remove
                  </button>
                </div>
              ) : (
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-300">
                  <Upload size={20} />
                </div>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <button onClick={() => logoInputRef.current?.click()}
                className="text-sm text-[#1a8eff] hover:underline">
                {settings['store_logo_data'] ? 'Change Logo' : 'Upload Logo'}
              </button>
              <p className="mt-1 text-xs text-gray-500">Used on receipts and reports. PNG or JPG recommended.</p>
            </div>
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
              <input value={settings['store_name'] || ''} onChange={e => set('store_name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Address</label>
              <input value={settings['store_address'] || ''} onChange={e => set('store_address', e.target.value)}
                placeholder="123 Main St, Barangay..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">TIN (Tax Identification Number)</label>
              <input
                value={settings['store_tin'] || ''}
                onChange={e => {
                  // Strip non-digits, limit to 12 digits, auto-insert dashes: 000-000-000-000
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 12)
                  const formatted = digits
                    .replace(/^(\d{3})(\d)/, '$1-$2')
                    .replace(/^(\d{3}-\d{3})(\d)/, '$1-$2')
                    .replace(/^(\d{3}-\d{3}-\d{3})(\d)/, '$1-$2')
                  set('store_tin', formatted)
                }}
                placeholder="000-000-000-000"
                maxLength={15}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              <p className="mt-1 text-xs text-gray-500">Printed on official receipts.</p>
            </div>
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Contact Number</label>
              <input value={settings['store_phone'] || ''} onChange={e => set('store_phone', e.target.value)}
                placeholder="+639123456789"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              <p className="mt-1 text-xs text-gray-500">Used for your store profile and optional Pro SMS reminders if you subscribe later.</p>
            </div>
          </Section>

          {/* Receipt Customization */}
          <Section title="Receipt Customization">
            <p className="pt-3 text-xs text-gray-500">Store name, address, and TIN are pulled from the Store section above.</p>
            <div className="py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Footer Message</label>
              <input
                value={settings['receipt_footer'] || ''}
                onChange={e => set('receipt_footer', e.target.value)}
                placeholder="Thank you for shopping with us!"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
              <p className="mt-1 text-xs text-gray-500">Printed at the bottom of every receipt.</p>
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
              <Select setting="batch_pricing_enabled" label="Batch Price Management (Pro)" options={noYes} />
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
            <SectionInner label="VAT / Tax">
              <Select setting="vat_enabled" label="Enable VAT on Sales" options={noYes} />
              {settings['vat_enabled'] === 'true' && (
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-sm text-gray-700">VAT Rate (%)</span>
                    <p className="text-xs text-gray-400">Philippines standard VAT is 12%</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings['vat_rate'] || '12'}
                    onChange={e => set('vat_rate', e.target.value)}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                </div>
              )}
            </SectionInner>
            <SectionInner label="Loyalty / Sukipoints">
              <Select setting="loyalty_enabled" label="Enable Loyalty Program" options={noYes} />
              <div className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm text-gray-700">Points per ₱1 spent</span>
                  <p className="text-xs text-gray-400">e.g. 1 = earn 1 pt per peso</p>
                </div>
                <input
                  type="number"
                  value={settings['loyalty_rate'] || '1'}
                  onChange={e => set('loyalty_rate', e.target.value)}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm text-gray-700">Points to redeem ₱1</span>
                  <p className="text-xs text-gray-400">e.g. 10 = spend 10 pts to get ₱1 off</p>
                </div>
                <input
                  type="number"
                  value={settings['loyalty_redeem_rate'] || '1'}
                  onChange={e => set('loyalty_redeem_rate', e.target.value)}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
              </div>
            </SectionInner>
          </Section>

          {/* User Management */}
          <Section title="User Management">
            <div className="py-2 space-y-3">
              {users.map(u => (
                <div key={u.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${u.role === 'admin' ? 'bg-[#1a8eff]' : 'bg-slate-500'}`}>
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{u.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{u.role} {!u.is_active ? '· Inactive' : ''}</p>
                        {u.role !== 'admin' && (() => {
                          const perms = userPerms[u.id] || {}
                          const enabled = PERMISSION_LABELS.filter(p => perms[p.key]).map(p => p.label)
                          return enabled.length > 0
                            ? <p className="text-xs text-[#1a8eff] mt-0.5">{enabled.length}/{PERMISSION_LABELS.length} modules enabled</p>
                            : <p className="text-xs text-gray-300 mt-0.5">No module access</p>
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.role !== 'admin' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleActive(u.id, u.is_active) }}
                          className={`text-xs px-2 py-1 rounded-full font-medium ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}
                        >
                          {u.is_active ? 'Active' : 'Inactive'}
                        </button>
                      )}
                      {expandedUser === u.id
                        ? <ChevronUp size={16} className="text-gray-400" />
                        : <ChevronDown size={16} className="text-gray-400" />
                      }
                    </div>
                  </div>
                  {expandedUser === u.id && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                      {/* Module access — cashiers only */}
                      {u.role !== 'admin' && (
                        <>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Module Access</p>
                          {PERMISSION_LABELS.map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between py-1">
                              <div>
                                <p className="text-sm text-gray-700">{label}</p>
                                <p className="text-xs text-gray-400">{desc}</p>
                              </div>
                              <button
                                onClick={() => togglePerm(u.id, key)}
                                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${userPerms[u.id]?.[key] ? 'bg-[#1a8eff]' : 'bg-gray-200'}`}
                              >
                                <div className={`absolute w-4 h-4 bg-white rounded-full shadow top-0.5 transition-transform ${userPerms[u.id]?.[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => handleSavePermissions(u.id)}
                            disabled={savingPerms === u.id}
                            className="mt-2 w-full bg-[#1a8eff] text-white py-2 rounded-xl text-sm font-semibold hover:bg-[#0077e6] disabled:opacity-50"
                          >
                            {savingPerms === u.id ? 'Saving...' : 'Save Permissions'}
                          </button>
                        </>
                      )}

                      {/* Change Name — all users */}
                      <div className={u.role !== 'admin' ? 'pt-3 border-t border-gray-200 mt-1' : ''}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Change Name</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={u.name}
                            value={editingName[u.id] ?? ''}
                            onChange={e => setEditingName(prev => ({ ...prev, [u.id]: e.target.value }))}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                          />
                          <button
                            onClick={() => handleSaveName(u.id)}
                            disabled={savingName === u.id || !editingName[u.id]?.trim()}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-40"
                          >
                            {savingName === u.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      {/* Change PIN — all users including admins */}
                      <div className="pt-3 border-t border-gray-200 mt-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Change PIN</p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="New PIN"
                            value={editingPin[u.id] ?? ''}
                            onChange={e => setEditingPin(prev => ({ ...prev, [u.id]: e.target.value }))}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                          />
                          <button
                            onClick={() => handleSavePin(u.id)}
                            disabled={savingPin === u.id || !editingPin[u.id]?.trim()}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-40"
                          >
                            {savingPin === u.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      {/* Remove — all users (edge function guards last admin) */}
                      <div className="pt-3 border-t border-gray-200 mt-1">
                        <button
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          disabled={deletingUser === u.id}
                          className="w-full py-2 rounded-xl border-2 border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingUser === u.id ? 'Removing…' : `Remove ${u.role === 'admin' ? 'Admin' : 'Staff Member'}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add User */}
            {showAddUser ? (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                <p className="text-sm font-semibold text-gray-700">New Staff Account</p>
                <input
                  value={newUserForm.name}
                  onChange={e => setNewUserForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
                <input
                  value={newUserForm.pin}
                  onChange={e => setNewUserForm(f => ({ ...f, pin: e.target.value }))}
                  placeholder="PIN"
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
                <select
                  value={newUserForm.role}
                  onChange={e => {
                    const role = e.target.value
                    setNewUserForm(f => ({ ...f, role }))
                    if (role === 'admin') {
                      setNewUserPermissions({})
                    } else if (Object.keys(newUserPermissions).length === 0) {
                      setNewUserPermissions({ can_access_pos: true })
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                >
                  <option value="cashier">Cashier</option>
                  <option value="admin">Admin</option>
                </select>
                {newUserForm.role !== 'admin' && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Initial Module Access</p>
                    {PERMISSION_LABELS.map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between py-1">
                        <div className="pr-3">
                          <p className="text-sm text-gray-700">{label}</p>
                          <p className="text-xs text-gray-400">{desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewUserPermissions(prev => ({ ...prev, [key]: !prev[key] }))}
                          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${newUserPermissions[key] ? 'bg-[#1a8eff]' : 'bg-gray-200'}`}
                        >
                          <div className={`absolute w-4 h-4 bg-white rounded-full shadow top-0.5 transition-transform ${newUserPermissions[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {addUserError && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{addUserError}</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setShowAddUser(false); setAddUserError('') }} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">Cancel</button>
                  <button onClick={handleAddUser} disabled={addingUser} className="flex-1 bg-[#1a8eff] text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                    {addingUser ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddUser(true)}
                className="mt-2 flex items-center gap-2 text-sm text-[#1a8eff] hover:underline"
              >
                <Plus size={14} /> Add New Staff
              </button>
            )}
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

          {/* SMS Credits */}
          <Section title="SMS Credits">
            <div className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Available Credits</p>
                  <p className="mt-1 text-xs text-gray-500">Each SMS reminder sent to a debtor uses 1 credit.</p>
                </div>
                <span className={`text-2xl font-bold ${smsCredits === null ? 'text-gray-400' : smsCredits > 10 ? 'text-emerald-600' : smsCredits > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                  {smsCredits === null ? '—' : smsCredits}
                </span>
              </div>
              {smsCredits !== null && smsCredits <= 10 && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {smsCredits === 0 ? 'You have no SMS credits. Contact your provider to top up.' : `Low balance — only ${smsCredits} credit${smsCredits === 1 ? '' : 's'} remaining.`}
                </p>
              )}
            </div>
          </Section>

          {/* Receipt Printer */}
          <Section title="Receipt Printer">
            {/* Bluetooth Thermal Printer — Android Chrome */}
            <div className="py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-800 mb-1">Bluetooth Thermal Printer</p>
              <p className="text-xs text-gray-500 mb-3">
                Print receipts directly from your phone via Bluetooth. Works on Android Chrome.
              </p>
              {blePrinterName ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">🖨 {blePrinterName}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Connected via Bluetooth — printing directly to printer</p>
                  </div>
                  <button
                    onClick={handleDisconnectBluetooth}
                    className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleConnectBluetooth}
                    disabled={bleConnecting || !bleSupported}
                    className="w-full rounded-xl bg-[#1a8eff] text-white py-2.5 text-sm font-medium hover:bg-[#0077e6] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bleConnecting ? 'Connecting…' : '📶 Connect Bluetooth Printer'}
                  </button>
                  {!bleSupported && (
                    <p className="mt-2 text-xs text-amber-600">Bluetooth printing requires Android Chrome. Not supported on iOS.</p>
                  )}
                  {bleError && <p className="mt-2 text-xs text-red-500">{bleError}</p>}
                </>
              )}
            </div>

            {/* USB via COM Port (WebSerial) — works on Windows despite printer driver */}
            <div className="py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-800 mb-1">USB Thermal Printer via COM Port</p>
              <p className="text-xs text-gray-500 mb-3">
                Direct ESC/POS via serial port — works on Windows even if the printer driver blocks WebUSB. Requires Chrome or Edge on desktop.
              </p>
              {serialPrinterName ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">🖨 {serialPrinterName}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Connected via COM port — receipts print directly</p>
                  </div>
                  <button
                    onClick={handleDisconnectSerial}
                    className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Baud Rate</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[9600, 19200, 38400, 57600, 115200].map(rate => (
                        <button
                          key={rate}
                          onClick={() => setSerialBaudRate(rate)}
                          className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${serialBaudRate === rate ? 'border-[#1a8eff] bg-blue-50 text-[#1a8eff]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                        >
                          {rate.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">Try 9600 first — check your printer manual if it doesn't print.</p>
                  </div>
                  <button
                    onClick={handleConnectSerial}
                    disabled={serialConnecting || !serialSupported}
                    className="w-full rounded-xl bg-[#1a8eff] text-white py-2.5 text-sm font-medium hover:bg-[#0077e6] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {serialConnecting ? 'Connecting…' : '🔌 Connect via COM Port'}
                  </button>
                  {!serialSupported && (
                    <p className="mt-2 text-xs text-amber-600">Web Serial requires Chrome or Edge on desktop.</p>
                  )}
                  {serialError === 'No port selected.' ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <p className="font-semibold mb-1">No COM port appeared in the list?</p>
                      <p>Check <strong>Device Manager → Ports (COM &amp; LPT)</strong>. If your printer is listed there, try again and select it. If it's not listed, your printer doesn't have a serial interface — use Browser Print instead.</p>
                    </div>
                  ) : serialError ? (
                    <p className="mt-2 text-xs text-red-500">{serialError}</p>
                  ) : null}
                  {serialSupported && !serialPrinterName && !serialError && (
                    <p className="mt-2 text-xs text-gray-400">Pick the COM port your printer uses (e.g. COM3). Check Device Manager → Ports if unsure.</p>
                  )}
                </>
              )}
            </div>

            {/* USB Thermal Printer — Chrome/Edge direct WebUSB connection */}
            <div className="py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-800 mb-1">USB Thermal Printer (WebUSB)</p>
              <p className="text-xs text-gray-500 mb-3">
                Direct ESC/POS connection — no print dialog. Requires Chrome or Edge on desktop.
              </p>
              {isWindows && (
                <p className="mb-3 text-xs text-amber-700">
                  On Windows, try <strong>COM Port</strong> above first if this fails. Some printers block WebUSB when the OS driver is installed.
                </p>
              )}
              {usbPrinterName ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">🖨 {usbPrinterName}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Connected — receipts will print directly</p>
                  </div>
                  <button
                    onClick={handleDisconnectUsb}
                    className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleConnectUsb}
                    disabled={usbConnecting || !usbSupported}
                    className="w-full rounded-xl bg-[#1a8eff] text-white py-2.5 text-sm font-medium hover:bg-[#0077e6] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {usbConnecting ? 'Connecting…' : '🔌 Connect USB Thermal Printer'}
                  </button>
                  {!usbSupported && (
                    <p className="mt-2 text-xs text-amber-600">Web USB requires Chrome or Edge on desktop.</p>
                  )}
                  {usbError && (
                    <div className="mt-2">
                      <p className="text-xs text-red-500 mb-2">{usbError}</p>
                      {usbBlockedByWindows && (
                        <button
                          onClick={() => setShowZadigGuide(v => !v)}
                          className="text-xs font-medium text-[#1a8eff] underline underline-offset-2"
                        >
                          {showZadigGuide ? 'Hide fix guide ▲' : 'How to fix this on Windows ▼'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {usbBlockedByWindows && showZadigGuide && !usbPrinterName && (
              <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 space-y-3">
                <p className="text-sm font-semibold text-blue-900">Fix: Replace the printer driver with WinUSB (Zadig)</p>
                <p className="text-xs text-blue-800">
                  Windows blocks browser USB access when a regular printer driver is installed. Replacing it with WinUSB lets Chrome talk to the printer directly — no print dialog needed.
                </p>
                <ol className="space-y-2 text-xs text-blue-900 list-decimal list-inside">
                  <li>Download <strong>Zadig</strong> from <span className="font-mono bg-blue-100 px-1 rounded">zadig.akeo.ie</span> and open it (no install needed).</li>
                  <li>In Zadig, go to <strong>Options → List All Devices</strong> so your printer appears.</li>
                  <li>Select your thermal printer from the dropdown (look for the model name or "USB Printing Support").</li>
                  <li>Make sure the driver on the right says <strong>WinUSB</strong>. If it doesn't, click the arrows to select WinUSB.</li>
                  <li>Click <strong>Replace Driver</strong> and wait for it to finish (may take a minute).</li>
                  <li>Come back here and click <strong>Connect USB Thermal Printer</strong> — it should connect now.</li>
                </ol>
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <strong>Note:</strong> After replacing the driver, the printer will no longer appear in Windows "Printers &amp; Scanners" — it will only work via this app. To undo, open Device Manager, find the printer under "Universal Serial Bus devices", right-click → <em>Update driver</em> → <em>Search automatically</em>.
                </div>
              </div>
            )}

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

            {printerStatus && (
              <div className="border border-gray-200 rounded-xl p-4 mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">Status</span>
                  <span className={`text-sm font-bold ${usbPrinterName ? 'text-emerald-600' : blePrinterName ? 'text-emerald-600' : 'text-blue-500'}`}>
                    {usbPrinterName ? 'USB Direct' : blePrinterName ? 'Bluetooth Direct' : 'Browser Print'}
                  </span>
                </div>
                {printerStatus.type && <p className="text-xs text-gray-500">Mode: {printerStatus.type}</p>}
                {printerStatus.device && <p className="text-xs text-gray-500">Device: {printerStatus.device}</p>}
                {printerStatus.error && <p className="mt-1 text-xs text-red-500">{printerStatus.error}</p>}
                {!usbPrinterName && !blePrinterName && (
                  <p className="mt-1 text-xs text-gray-400">No hardware printer connected. Printing will open the browser print dialog.</p>
                )}
              </div>
            )}

            <div className="flex gap-3 pb-3">
              <button onClick={handleTestPrint}
                className="flex-1 bg-green-500 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-green-600">
                🖨 Print Test Page
              </button>
            </div>
          </Section>

          {/* Cash Drawer */}
          <Section title="Cash Drawer">
            <p className="text-xs text-gray-500 pb-3">
              Cash drawers connect to the receipt printer via an RJ11 cable. The printer sends a signal to pop the drawer when a payment is confirmed.
            </p>

            {/* Auto-open on cash */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Auto-open on cash payment</p>
                <p className="text-xs text-gray-400">Opens the drawer whenever cash is part of the payment</p>
              </div>
              <button
                onClick={() => set('auto_open_drawer', settings['auto_open_drawer'] === 'false' ? 'true' : 'false')}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings['auto_open_drawer'] === 'false' ? 'bg-gray-200' : 'bg-[#1a8eff]'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings['auto_open_drawer'] === 'false' ? 'left-0.5' : 'left-5'}`} />
              </button>
            </div>

            {/* Open on all payments */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Also open for GCash / Card</p>
                <p className="text-xs text-gray-400">Open drawer even when no cash changes hands</p>
              </div>
              <button
                onClick={() => set('drawer_open_on_all', settings['drawer_open_on_all'] === 'true' ? 'false' : 'true')}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings['drawer_open_on_all'] === 'true' ? 'bg-[#1a8eff]' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings['drawer_open_on_all'] === 'true' ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Drawer pin */}
            <div className="py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-1.5">Drawer cable pin</p>
              <p className="text-xs text-gray-400 mb-2">Most cash drawers use Pin 2. Try Pin 5 if Pin 2 doesn't work.</p>
              <div className="flex gap-2">
                {[{ label: 'Pin 2 (default)', value: '0' }, { label: 'Pin 5', value: '1' }].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set('drawer_pin', opt.value)}
                    className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${(settings['drawer_pin'] ?? '0') === opt.value ? 'border-[#1a8eff] text-[#1a8eff] bg-blue-50' : 'border-gray-200 text-gray-600'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual open button */}
            <div className="pt-3">
              <button
                onClick={handleOpenDrawer}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50"
              >
                <Archive size={15} /> Open Drawer Now
              </button>
              <p className="text-xs text-gray-400 text-center mt-1.5">Use this to open the drawer manually or to test the connection.</p>
            </div>
          </Section>

          {/* Variation Groups */}
          <Section title="Manage Variation Groups">
            {groups.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No variation groups yet. Add one below.</p>
            )}
            {groups.map(g => (
              <div key={g.id} className="border-b border-gray-100 py-3 last:border-0">
                {/* Group header */}
                <div className="flex justify-between items-center mb-2">
                  {editingGroupId === g.id ? (
                    <input
                      autoFocus
                      value={editingGroupName}
                      onChange={e => setEditingGroupName(e.target.value)}
                      onBlur={() => handleRenameGroup(g.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameGroup(g.id)
                        if (e.key === 'Escape') { setEditingGroupId(null); setEditingGroupName('') }
                      }}
                      className="flex-1 border border-[#1a8eff] rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none mr-2"
                    />
                  ) : (
                    <span
                      className="font-semibold text-gray-800 text-sm cursor-pointer hover:text-[#1a8eff]"
                      title="Click to rename"
                      onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name) }}
                    >
                      {g.name}
                    </span>
                  )}
                  <button onClick={() => handleDeleteGroup(g.id)} className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1 shrink-0">
                    <Trash2 size={14} /> Delete Group
                  </button>
                </div>

                {/* Options list */}
                {g.options?.map(opt => (
                  <OptionRow key={opt.id} opt={opt} onDelete={() => handleDeleteOption(opt.id)} onUpdate={handleUpdateOption} />
                ))}

                {/* Add option row */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    value={newOption[g.id]?.name || ''}
                    onChange={e => setNewOption(n => ({ ...n, [g.id]: { ...n[g.id], name: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddOption(g.id)}
                    placeholder="e.g., Large"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                  <span className="text-xs text-gray-400">₱</span>
                  <input
                    value={newOption[g.id]?.price || ''}
                    onChange={e => setNewOption(n => ({ ...n, [g.id]: { ...n[g.id], price: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddOption(g.id)}
                    placeholder="Price"
                    type="number"
                    className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                  <span className="text-xs text-gray-400">₱</span>
                  <input
                    value={newOption[g.id]?.cost || ''}
                    onChange={e => setNewOption(n => ({ ...n, [g.id]: { ...n[g.id], cost: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddOption(g.id)}
                    placeholder="Cost"
                    type="number"
                    className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                  <button onClick={() => handleAddOption(g.id)}
                    className="bg-[#1a8eff] text-white px-3 py-1.5 rounded-lg hover:bg-[#0077e6] shrink-0">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))}

            {/* Add group row */}
            <div className="flex gap-2 pt-3">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                placeholder="New Group Name (e.g., Size)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
              <button onClick={handleAddGroup}
                className="bg-green-500 text-white px-4 rounded-lg font-medium text-sm hover:bg-green-600 shrink-0">
                Add Group
              </button>
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
            {cloudEmail && (
              <div className="py-3 flex items-center gap-2 text-sm text-gray-700 border-b border-gray-100 mb-2">
                <span className="text-gray-400">Signed in as</span>
                <span className="font-semibold text-gray-900">{cloudEmail}</span>
              </div>
            )}
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
            <p className="text-xs text-red-500 mb-3">
              Permanently deletes all products, categories, orders, debtors, and expenses. Cashier/admin accounts and PINs are kept. This cannot be undone.
            </p>

            {resetError && (
              <div className="mb-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">
                Reset failed: {resetError}
              </div>
            )}

            {!showResetConfirm ? (
              <button
                onClick={() => { setShowResetConfirm(true); setResetError('') }}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 flex items-center gap-2"
              >
                ⚠ Reset Store Data
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-red-700">Are you absolutely sure? This is permanent.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {resetting ? 'Resetting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    disabled={resetting}
                    className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
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

function OptionRow({ opt, onDelete, onUpdate }: { opt: any; onDelete: () => void; onUpdate: (id: string, name: string, price: string, cost: string) => void }) {
  const [name, setName] = useState(String(opt.name))
  const [price, setPrice] = useState(String(opt.price))
  const [cost, setCost] = useState(String(opt.cost))
  const [editingName, setEditingName] = useState(false)

  const save = () => onUpdate(opt.id, name, price, cost)
  const saveName = () => { setEditingName(false); save() }

  return (
    <div className="flex items-center gap-2 mb-1.5">
      {editingName ? (
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') saveName() }}
          className="flex-1 border border-[#1a8eff] rounded px-1.5 py-1 text-sm focus:outline-none"
        />
      ) : (
        <span
          className="flex-1 text-sm text-gray-700 cursor-pointer hover:text-[#1a8eff] truncate"
          title="Click to edit name"
          onClick={() => setEditingName(true)}
        >
          {name}
        </span>
      )}
      <span className="text-xs text-gray-400 shrink-0">₱</span>
      <input value={price} onChange={e => setPrice(e.target.value)} onBlur={save}
        type="number" className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a8eff] text-right" />
      <span className="text-xs text-gray-400 shrink-0">₱</span>
      <input value={cost} onChange={e => setCost(e.target.value)} onBlur={save}
        type="number" className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a8eff] text-right" />
      <button onClick={onDelete} className="text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>
    </div>
  )
}
