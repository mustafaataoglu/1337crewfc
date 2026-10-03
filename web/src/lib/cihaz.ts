let gecici: string | null = null
/** Bu tarayıcının oy kimliği: maç başına tek oy ve "oy verdin, sonuçları gör" için. Kişiyi tanımlamaz. */
export function deviceId() {
  try {
    let id = localStorage.getItem('1337-cihaz')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('1337-cihaz', id) }
    return id
  } catch { return (gecici ??= 'gecici-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)) }
}
