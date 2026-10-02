/**
 * Macar algoritması: n x n maliyet matrisinde toplam maliyeti en düşük eşleşme.
 * Dönüş: res[i] = i. satırın (oyuncunun) atandığı sütun (slot).
 */
export function hungarian(C: number[][]): number[] {
  const n = C.length
  const INF = 1e18
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0)
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = INF, j1 = 0
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = C[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1 } while (j0)
  }
  const res = new Array<number>(n)
  for (let j = 1; j <= n; j++) if (p[j]) res[p[j] - 1] = j - 1
  return res
}
