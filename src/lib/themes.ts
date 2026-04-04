import type React from 'react'

export interface Theme {
  id: string
  name: string
  primary: string
  primaryDark: string
  primaryLight: string
  primaryMuted: string
  accent: string
  accentHover: string
}

export const THEMES: Theme[] = [
  {
    id: 'fieldday',
    name: 'FieldDay Red',
    primary: '#00013a',
    primaryDark: '#000128',
    primaryLight: '#b0c0e0',
    primaryMuted: '#8898c0',
    accent: '#cd163f',
    accentHover: '#b01235',
  },
  {
    id: 'forest',
    name: 'Forest',
    primary: '#14291e',
    primaryDark: '#0d1f16',
    primaryLight: '#a7c9b4',
    primaryMuted: '#6fa888',
    accent: '#16a34a',
    accentHover: '#15803d',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    primary: '#0c2340',
    primaryDark: '#071a30',
    primaryLight: '#93c5fd',
    primaryMuted: '#60a5fa',
    accent: '#0284c7',
    accentHover: '#0369a1',
  },
  {
    id: 'royal',
    name: 'Royal',
    primary: '#1e1b4b',
    primaryDark: '#13114a',
    primaryLight: '#c4b5fd',
    primaryMuted: '#a78bfa',
    accent: '#7c3aed',
    accentHover: '#6d28d9',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    primary: '#1c1917',
    primaryDark: '#0c0a09',
    primaryLight: '#d6d3d1',
    primaryMuted: '#a8a29e',
    accent: '#ea580c',
    accentHover: '#c2410c',
  },
  {
    id: 'midnight',
    name: 'Midnight Gold',
    primary: '#09090b',
    primaryDark: '#000000',
    primaryLight: '#d4d4d8',
    primaryMuted: '#a1a1aa',
    accent: '#d97706',
    accentHover: '#b45309',
  },
]

export const DEFAULT_THEME = THEMES[0]

export function getTheme(id?: string): Theme {
  if (!id) return DEFAULT_THEME
  return THEMES.find(t => t.id === id) ?? DEFAULT_THEME
}

export function buildThemeVars(t: Theme): React.CSSProperties {
  return {
    '--fd-primary': t.primary,
    '--fd-primary-dark': t.primaryDark,
    '--fd-primary-light': t.primaryLight,
    '--fd-primary-muted': t.primaryMuted,
    '--fd-accent': t.accent,
    '--fd-accent-hover': t.accentHover,
  } as React.CSSProperties
}
