// Gọi Claude để xếp danh mục khi từ điển trong máy không xếp được.
// Key do bạn tự dán vào màn Cài đặt, chỉ lưu trong trình duyệt của máy này, không lên GitHub.
// Mỗi lần chỉ gửi: nội dung ghi chú (không có số tiền) và tên các danh mục.
import type { Category, Kind } from '../types'
import { pathOf, selectable } from './entry'

const MODEL = 'claude-haiku-5-5'
const API_URL = 'https://api.anthropic.com/v1/messages'
// Tài liệu hiện nêu phiên bản 2026-10-21; thử bản cũ nếu máy chủ không nhận.
const VERSIONS = ['2026-10-21', '2023-06-01']
const TIMEOUT_MS = 7000

const K_KEY = 'thu-chi-ai-key'
const K_ON = 'thu-chi-ai-on'
const K_USE = 'thu-chi-ai-usage'

function read(k: string): string {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
function write(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // trình duyệt chặn lưu: bỏ qua, app vẫn chạy bằng từ điển
  }
}

export const getKey = () => read(K_KEY)
export const setKey = (k: string) => write(K_KEY, k.trim())
export const clearKey = () => write(K_KEY, null)
export const isEnabled = () => read(K_ON) !== 'off'
export const setEnabled = (on: boolean) => write(K_ON, on ? 'on' : 'off')

/** AI dùng được khi có key, đang bật và có mạng. */
export const aiReady = () => !!getKey() && isEnabled() && navigator.onLine

export interface Usage {
  calls: number
  input: number
  output: number
}
export function getUsage(): Usage {
  try {
    const u = JSON.parse(read(K_USE) || '{}') as Partial<Usage>
    return { calls: u.calls ?? 0, input: u.input ?? 0, output: u.output ?? 0 }
  } catch {
    return { calls: 0, input: 0, output: 0 }
  }
}
export const resetUsage = () => write(K_USE, null)
function addUsage(input: number, output: number) {
  const u = getUsage()
  write(K_USE, JSON.stringify({ calls: u.calls + 1, input: u.input + input, output: u.output + output }))
}

export class AiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Đổi lỗi của máy chủ thành câu tiếng Việt dễ hiểu. */
function friendly(status: number, apiMsg: string): string {
  const m = apiMsg.toLowerCase()
  if (status === 401) {
    if (m.includes('cors')) return 'Tài khoản này không cho gọi AI trực tiếp từ điện thoại.'
    return 'Key không đúng, đã bị xóa hoặc đã hết hạn. Hãy tạo key mới.'
  }
  if (status === 402 || m.includes('credit balance')) return 'Tài khoản API hết credit hoặc chưa thanh toán. Kiểm tra trang Billing.'
  if (status === 429) return 'Đang vượt giới hạn dùng hoặc hạn mức tháng. Thử lại sau.'
  if (status === 529 || status >= 500) return 'Máy chủ AI đang bận, thử lại sau.'
  if (m.includes('spend limit')) return 'Đã chạm hạn mức chi tiêu tháng của workspace.'
  return apiMsg || `Lỗi ${status}`
}

interface ApiResponse {
  content?: { type: string; text?: string; input?: unknown }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function call(body: Record<string, unknown>): Promise<ApiResponse> {
  const key = getKey()
  if (!key) throw new AiError(0, 'Chưa có key.')
  let lastErr: AiError | null = null

  for (const version of VERSIONS) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': version,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: MODEL, ...body }),
      })
    } catch (e) {
      throw new AiError(0, (e as Error).name === 'AbortError' ? 'AI trả lời quá chậm.' : 'Không kết nối được (mất mạng?).')
    } finally {
      clearTimeout(timer)
    }

    if (res.ok) {
      const data = (await res.json()) as ApiResponse
      addUsage(data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0)
      return data
    }

    let msg = ''
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      // không đọc được nội dung lỗi
    }
    lastErr = new AiError(res.status, friendly(res.status, msg))
    // Chỉ thử phiên bản khác khi lỗi nói về phiên bản.
    if (res.status === 400 && /version/i.test(msg)) continue
    throw lastErr
  }
  throw lastErr ?? new AiError(0, 'Không gọi được AI.')
}

/** Thử kết nối: báo kết quả cho màn Cài đặt. */
export async function testConnection(): Promise<string> {
  const data = await call({
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Trả lời đúng một chữ: ok' }],
  })
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim() ?? ''
  return text ? `Kết nối tốt. AI trả lời: "${text}"` : 'Kết nối tốt.'
}

export type AiResult =
  | { type: 'existing'; category: Category }
  | { type: 'new'; name: string; parentId: string; kind: Kind }

const TOOL = {
  name: 'ghi_khoan',
  description: 'Xếp ghi chú thu chi vào danh mục.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['existing', 'new'], description: 'existing: chọn mục có sẵn. new: đề xuất mục mới.' },
      category_id: { type: 'string', description: 'Id mục có sẵn (khi action=existing).' },
      new_name: { type: 'string', description: 'Tên mục mới, ngắn gọn tiếng Việt (khi action=new).' },
      parent_id: { type: 'string', description: 'Id của một NHÓM chứa mục mới (khi action=new).' },
      kind: { type: 'string', enum: ['thu', 'chi'], description: 'thu nếu tiền đi vào, chi nếu tiền đi ra.' },
    },
    required: ['action', 'kind'],
  },
}

const SYSTEM = `Bạn giúp ứng dụng thu chi cá nhân của một người Việt xếp một khoản vào danh mục.
Bạn nhận một ghi chú ngắn (không có số tiền). Hãy gọi công cụ ghi_khoan.
- Ưu tiên chọn một mục có sẵn trong danh sách MỤC (action=existing, category_id đúng id trong danh sách).
- Chỉ khi thật sự không mục nào hợp mới đề xuất mục mới (action=new): đặt tên ngắn gọn bằng tiếng Việt (new_name) và chọn parent_id là id của một NHÓM trong danh sách NHÓM, cùng loại thu/chi.
- Không bịa id.`

/**
 * Nhờ AI xếp một ghi chú. Trả null nếu AI trả lời không hợp lệ.
 * Ném AiError khi lỗi mạng, key sai, hết credit...
 */
export async function classifyWithAI(note: string, categories: Category[]): Promise<AiResult | null> {
  const leaves = [...selectable(categories, 'chi'), ...selectable(categories, 'thu')]
  const groups = categories.filter((c) => c.container && !c.archived)
  const leafIds = new Map(leaves.map((c) => [c.id, c]))
  const groupIds = new Map(groups.map((c) => [c.id, c]))

  const prompt =
    `NHÓM (nơi đặt mục mới):\n${groups.map((g) => `${g.id} | ${g.kind} | ${g.name}`).join('\n')}\n\n` +
    `MỤC có sẵn:\n${leaves.map((c) => `${c.id} | ${c.kind} | ${pathOf(c, categories)}`).join('\n')}\n\n` +
    `Ghi chú: ${JSON.stringify(note)}`

  const data = await call({
    max_tokens: 200,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: prompt }],
  })

  const block = data.content?.find((b) => b.type === 'tool_use')
  const input = block?.input as
    | { action?: string; category_id?: string; new_name?: string; parent_id?: string; kind?: string }
    | undefined
  if (!input) return null

  if (input.action === 'existing' && input.category_id && leafIds.has(input.category_id))
    return { type: 'existing', category: leafIds.get(input.category_id)! }

  if (input.action === 'new' && input.parent_id && groupIds.has(input.parent_id)) {
    const parent = groupIds.get(input.parent_id)!
    const name = (input.new_name ?? '').trim()
    if (name) return { type: 'new', name, parentId: parent.id, kind: parent.kind }
  }
  return null
}
