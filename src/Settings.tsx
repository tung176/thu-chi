import { useRef, useState } from 'react'
import {
  AiError,
  clearKey,
  getKey,
  getUsage,
  isEnabled,
  resetUsage,
  setEnabled,
  setKey,
  testConnection,
  type Usage,
} from './lib/ai'
import { exportFile, importBackup } from './lib/backup'
import type { SyncStatus } from './lib/sync'
import { SyncCard } from './SyncCard'

const mask = (k: string) => (k ? `••••••••${k.slice(-4)}` : 'Chưa có key')

interface Props {
  onImported: () => void
  sync: SyncStatus
  onSyncNow: (force: boolean) => Promise<void>
  onSyncConfigChanged: () => void
}

export function Settings({ onImported, sync, onSyncNow, onSyncConfigChanged }: Props) {
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    try {
      const r = await exportFile()
      setBackupMsg({ ok: true, text: `Đã tạo file ${r.name} (${r.count} khoản). Chọn "Lưu vào Tệp" hoặc Drive để cất đi.` })
    } catch {
      setBackupMsg({ ok: false, text: 'Không xuất được file. Thử lại nhé.' })
    }
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const r = await importBackup(await file.text())
      onImported()
      setBackupMsg({
        ok: true,
        text: `Đã nhập: thêm ${r.added} khoản, cập nhật ${r.updated}${r.skipped ? `, bỏ qua ${r.skipped} dòng lỗi` : ''}. Dữ liệu đang có trong máy không bị xóa.`,
      })
    } catch (e) {
      setBackupMsg({ ok: false, text: (e as Error).message })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const [pasted, setPasted] = useState('')
  const doPaste = async () => {
    try {
      const r = await importBackup(pasted)
      onImported()
      setPasted('')
      setBackupMsg({ ok: true, text: `Đã nhập: thêm ${r.added} khoản, cập nhật ${r.updated}${r.skipped ? `, bỏ qua ${r.skipped} dòng lỗi` : ''}.` })
    } catch (e) {
      setBackupMsg({ ok: false, text: (e as Error).message })
    }
  }

  const [key, setKeyState] = useState(getKey())
  const [draft, setDraft] = useState('')
  const [enabled, setEnabledState] = useState(isEnabled())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<Usage>(getUsage())

  const save = () => {
    const k = draft.trim()
    if (!k) return
    if (/\s/.test(k)) {
      setMsg({ ok: false, text: 'Key không có khoảng trắng. Bạn kiểm tra lại, hoặc copy lại từ nơi đã lưu.' })
      return
    }
    setKey(k)
    setKeyState(k)
    setDraft('')
    setMsg({
      ok: true,
      text: k.startsWith('sk-ant-')
        ? 'Đã lưu key. Bấm "Thử kết nối" để kiểm tra.'
        : 'Đã lưu, nhưng key thường bắt đầu bằng "sk-ant-". Bấm "Thử kết nối" để kiểm tra.',
    })
  }

  const test = async () => {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ ok: true, text: await testConnection() })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof AiError ? e.message : 'Không thử được.' })
    } finally {
      setBusy(false)
      setUsage(getUsage())
    }
  }

  const remove = () => {
    if (!window.confirm('Xóa key khỏi điện thoại này?')) return
    clearKey()
    setKeyState('')
    setMsg({ ok: true, text: 'Đã xóa key khỏi máy này. Nhớ xóa luôn key trong Console nếu không dùng nữa.' })
  }

  return (
    <div className="page settings">
      <section className="card">
        <div className="card-head">
          <h2>AI xếp danh mục</h2>
          <span className={key ? 'thu' : 'muted'}>{key ? 'Đã có key' : 'Chưa có key'}</span>
        </div>
        <p className="muted small">
          Khi từ điển trong máy không xếp được một khoản, app nhờ Claude chọn mục phù hợp. Không có mạng hoặc tắt AI
          thì app vẫn ghi bình thường bằng từ điển.
        </p>

        <label className="field">
          Key hiện tại
          <div className="mono">{mask(key)}</div>
        </label>

        <label className="field">
          Dán key mới
          <input
            type="password"
            className="note"
            placeholder="sk-ant-..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <button className="save thu" disabled={!draft.trim()} onClick={save}>
          Lưu key
        </button>

        <div className="row2">
          <button className="chip big" disabled={!key || busy} onClick={test}>
            {busy ? 'Đang thử…' : 'Thử kết nối'}
          </button>
          <button className="chip big danger" disabled={!key} onClick={remove}>
            Xóa key
          </button>
        </div>
        {msg && <div className={msg.ok ? 'msg ok' : 'msg bad'}>{msg.text}</div>}

        <label className="toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked)
              setEnabledState(e.target.checked)
            }}
          />
          <span>Bật AI khi gõ nhanh</span>
        </label>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Đã dùng</h2>
          <button
            className="linkbtn"
            onClick={() => {
              resetUsage()
              setUsage(getUsage())
            }}
          >
            Đặt lại
          </button>
        </div>
        <div className="usage">
          <div>
            <b>{usage.calls}</b>
            <span className="muted"> lần gọi</span>
          </div>
          <div>
            <b>{usage.input.toLocaleString('vi-VN')}</b>
            <span className="muted"> token vào</span>
          </div>
          <div>
            <b>{usage.output.toLocaleString('vi-VN')}</b>
            <span className="muted"> token ra</span>
          </div>
        </div>
        <p className="muted small">Số này đếm trên máy này từ lần đặt lại gần nhất, dùng để ước lượng chi phí.</p>
      </section>

      <SyncCard sync={sync} onSyncNow={onSyncNow} onSyncConfigChanged={onSyncConfigChanged} onImported={onImported} />

      <section className="card">
        <h2>Sao lưu thủ công</h2>
        <p className="muted small">
          Xuất toàn bộ khoản thu chi ra một file để cất vào Tệp hoặc Drive. Nhập file lại khi đổi điện thoại. Nhập
          file chỉ thêm hoặc cập nhật khoản, không xóa gì đang có.
        </p>
        <div className="row2">
          <button className="chip big" onClick={() => void doExport()}>
            Xuất file sao lưu
          </button>
          <button className="chip big" onClick={() => fileRef.current?.click()}>
            Nhập từ file
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void doImport(e.target.files?.[0])}
        />
        <details className="adv">
          <summary>Hoặc dán nội dung sao lưu</summary>
          <textarea
            className="note ms-text"
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='{"app":"thu-chi", ...}'
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="save thu" disabled={!pasted.trim()} onClick={() => void doPaste()}>
            Nhập nội dung đã dán
          </button>
        </details>
        {backupMsg && <div className={backupMsg.ok ? 'msg ok' : 'msg bad'}>{backupMsg.text}</div>}
      </section>

      <section className="card">
        <h2>Quyền riêng tư</h2>
        <p className="muted small">
          Mỗi lần gọi chỉ gửi <b>nội dung ghi chú</b> bạn vừa gõ (không có số tiền) và <b>tên các danh mục</b>. Không
          gửi lịch sử, tổng thu chi hay số dư. Key chỉ nằm trong trình duyệt của điện thoại này, không đưa lên GitHub.
        </p>
      </section>
    </div>
  )
}
