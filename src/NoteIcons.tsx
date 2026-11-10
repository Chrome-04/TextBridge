import type { ReactNode } from 'react'

function NoteIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}
export function BookmarkIcon() {
  return (
    <NoteIcon>
      <path d="M6 3h12v18l-6-4-6 4V3Z" />
    </NoteIcon>
  )
}
export function PinIcon() {
  return (
    <NoteIcon>
      <path d="M16 9V3H8v6l-3 3v2h14v-2l-3-3ZM12 14v7" />
    </NoteIcon>
  )
}
export function GridIcon() {
  return (
    <NoteIcon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </NoteIcon>
  )
}
export function ListIcon() {
  return (
    <NoteIcon>
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="14" width="18" height="6" rx="1" />
    </NoteIcon>
  )
}
export function SearchIcon() {
  return (
    <NoteIcon>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </NoteIcon>
  )
}
export function MenuIcon() {
  return (
    <NoteIcon>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </NoteIcon>
  )
}

export function ProfileIcon() {
  return (
    <NoteIcon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
    </NoteIcon>
  )
}

export function LogOutIcon() {
  return (
    <NoteIcon>
      <path d="M10 4H5v16h5m-1-8h11m-4-4 4 4-4 4" />
    </NoteIcon>
  )
}
