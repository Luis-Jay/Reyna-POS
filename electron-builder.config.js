module.exports = {
  appId: 'com.reyna.pos',
  productName: 'Reyna POS',
  copyright: 'Copyright © 2025 Reyna',

  directories: {
    output: 'dist-packages',
    buildResources: 'assets',
  },

  files: [
    'dist/renderer/**/*',
    'electron/dist/**/*',
    'node_modules/**/*',
    'package.json',
  ],

  // macOS
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64'] },
      { target: 'zip', arch: ['arm64'] },
    ],
    icon: 'assets/icons/icon.icns',
    category: 'public.app-category.business',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
  },

  dmg: {
    title: 'Reyna POS',
    window: { width: 540, height: 380 },
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  // Windows
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
    icon: 'assets/icons/icon.ico',
    requestedExecutionLevel: 'asInvoker',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Reyna POS',
    installerIcon: 'assets/icons/icon.ico',
    uninstallerIcon: 'assets/icons/icon.ico',
  },

  // Linux (AppImage for portability)
  linux: {
    target: 'AppImage',
    icon: 'assets/icons/icon.png',
    category: 'Office',
  },

  // Auto-update via GitHub releases
  publish: [
    {
      provider: 'github',
      owner: 'Luis-Jay',
      repo: 'Reyna-POS',
    },
  ],

  // Rebuild native modules (better-sqlite3) against Electron's Node
  npmRebuild: true,
}
