import { useSyncExternalStore } from 'react'

// Enrutado mínimo por hash (#/seccion/sub): la app es una sola página servida por FastAPI y no necesita más.
function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function navigate(path: string) {
  window.location.hash = `/${path.replace(/^\/+/, '')}`
}

export function useHashRoute() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return {
    section: parts[0] ?? 'inicio',
    sub: parts[1] ?? null,
    navigate,
  }
}
