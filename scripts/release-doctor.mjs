import fs from 'fs'
import path from 'path'

const root = process.cwd()

const checks = [
  {
    label: 'macOS icon',
    path: 'assets/icons/icon.icns',
    required: true,
  },
  {
    label: 'Windows icon',
    path: 'assets/icons/icon.ico',
    required: true,
  },
  {
    label: 'Linux/app icon',
    path: 'assets/icons/icon.png',
    required: true,
  },
  {
    label: 'macOS entitlements',
    path: 'build/entitlements.mac.plist',
    required: true,
  },
]

const warnings = []
const failures = []

for (const check of checks) {
  const fullPath = path.join(root, check.path)
  if (!fs.existsSync(fullPath)) {
    failures.push(`${check.label} missing at ${check.path}`)
  }
}

const builderConfigPath = path.join(root, 'electron-builder.config.js')
if (fs.existsSync(builderConfigPath)) {
  const configText = fs.readFileSync(builderConfigPath, 'utf8')
  if (configText.includes("owner: 'your-org'")) {
    warnings.push('Auto-update GitHub publish owner is still set to the placeholder value "your-org".')
  }
}

const readmePath = path.join(root, 'README.md')
if (fs.existsSync(readmePath)) {
  const readmeText = fs.readFileSync(readmePath, 'utf8')
  if (!readmeText.includes('Release Checklist')) {
    warnings.push('README.md does not include a release checklist.')
  }
}

if (failures.length === 0) {
  console.log('Release doctor: PASS')
} else {
  console.log('Release doctor: FAIL')
  for (const failure of failures) {
    console.log(`- ${failure}`)
  }
}

if (warnings.length > 0) {
  console.log('Warnings:')
  for (const warning of warnings) {
    console.log(`- ${warning}`)
  }
}

if (failures.length > 0) {
  process.exit(1)
}
