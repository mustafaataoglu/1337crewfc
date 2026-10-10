import type { Pos } from '@/types'
import type { Slot } from '@/lib/oneri'

// Dizilişler: her slotun sahadaki yeri (yüzde), mevkisi ve kısa adı. Sunucudaki (api/oy.php) mevki sayılarıyla aynı.
const RAW: Record<string, [number, number, Pos, string][]> = {
  '4-2-3-1': [[50, 90, 'K', 'KL'], [15, 72, 'S', 'SLB'], [38, 76, 'S', 'STP'], [62, 76, 'S', 'STP'], [85, 72, 'S', 'SĞB'], [36, 57, 'O', 'ÖL'], [64, 57, 'O', 'ÖL'], [16, 37, 'O', 'SLK'], [50, 39, 'O', '10'], [84, 37, 'O', 'SĞK'], [50, 15, 'F', 'FV']],
  '4-3-3': [[50, 90, 'K', 'KL'], [15, 72, 'S', 'SLB'], [38, 76, 'S', 'STP'], [62, 76, 'S', 'STP'], [85, 72, 'S', 'SĞB'], [50, 58, 'O', 'ÖL'], [28, 48, 'O', 'OS'], [72, 48, 'O', 'OS'], [18, 22, 'F', 'SLA'], [50, 15, 'F', 'FV'], [82, 22, 'F', 'SĞA']],
  // Elmas orta saha: ön libero, iki iç orta saha, 10 numara, iki forvet
  '4-1-2-1-2': [[50, 90, 'K', 'KL'], [15, 72, 'S', 'SLB'], [38, 76, 'S', 'STP'], [62, 76, 'S', 'STP'], [85, 72, 'S', 'SĞB'], [50, 60, 'O', 'ÖL'], [27, 47, 'O', 'OS'], [73, 47, 'O', 'OS'], [50, 35, 'O', '10'], [36, 17, 'F', 'FV'], [64, 17, 'F', 'FV']],
  '4-4-2': [[50, 90, 'K', 'KL'], [15, 72, 'S', 'SLB'], [38, 76, 'S', 'STP'], [62, 76, 'S', 'STP'], [85, 72, 'S', 'SĞB'], [15, 46, 'O', 'SLO'], [38, 51, 'O', 'OS'], [62, 51, 'O', 'OS'], [85, 46, 'O', 'SĞO'], [36, 17, 'F', 'FV'], [64, 17, 'F', 'FV']],
  '3-5-2': [[50, 90, 'K', 'KL'], [27, 75, 'S', 'STP'], [50, 78, 'S', 'STP'], [73, 75, 'S', 'STP'], [10, 50, 'O', 'SLK'], [35, 55, 'O', 'OS'], [50, 44, 'O', '10'], [65, 55, 'O', 'OS'], [90, 50, 'O', 'SĞK'], [36, 17, 'F', 'FV'], [64, 17, 'F', 'FV']],
  '3-4-3': [[50, 90, 'K', 'KL'], [27, 75, 'S', 'STP'], [50, 78, 'S', 'STP'], [73, 75, 'S', 'STP'], [13, 50, 'O', 'SLK'], [38, 54, 'O', 'OS'], [62, 54, 'O', 'OS'], [87, 50, 'O', 'SĞK'], [20, 22, 'F', 'SLA'], [50, 15, 'F', 'FV'], [80, 22, 'F', 'SĞA']],
  '5-3-2': [[50, 90, 'K', 'KL'], [9, 66, 'S', 'SLKB'], [30, 75, 'S', 'STP'], [50, 78, 'S', 'STP'], [70, 75, 'S', 'STP'], [91, 66, 'S', 'SĞKB'], [28, 48, 'O', 'OS'], [50, 52, 'O', 'ÖL'], [72, 48, 'O', 'OS'], [36, 17, 'F', 'FV'], [64, 17, 'F', 'FV']],
}
export const F: Record<string, Slot[]> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [k, v.map(([x, y, g, label]) => ({ x, y, g, label }))]),
)
// Tüm zamanların 11'i oylamasının sunucudaki kimliği
export const EFSANE = 'tum-zamanlar'
