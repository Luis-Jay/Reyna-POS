export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

export function formatCurrency(amount: number): string {
  return `₱${amount.toFixed(2)}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    timeZone: 'Asia/Manila',
  })
}
