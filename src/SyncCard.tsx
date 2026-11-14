import { useState } from 'react'
import {
  autoSyncOn,
  clearSyncConfig,
  getSyncSecret,
  getSyncUrl,
  pullNow,
  setAutoSync,
  setSyncConfig,
  SyncError,
  testSync,
  type SyncStatus,
} from './lib/sync'

interface Props {
  sync: SyncStatus
  onSyncNow: (force: boolean) => Promise<void>
  onSyncConfigChanged: () => void
  onImported: () => void
}

const hhmm = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function SyncCard({ sync, onSyncNow, onSyncConfigChanged, onImported }: Props) {
  const [url, setUrl] = useState(getSyncUrl())
  const [secret, setSecret] = useState(getSyncSecret())
  const [auto, setAuto] = useState(autoSyncOn())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const saved = !!getSyncUrl() && !!getSyncSecret()
  const dirty = url.trim() !== getSyncUrl() || secret.trim() !== getSyncSecret()

  const fail = (e: unknown) =>
    setMsg({ ok: false, text: e instanceof SyncError ? e.message : 'Có lỗi xảy ra, thử lại nhé.' })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url.trim())) {
      setMsg({
        ok: false,
        text: 'Địa chỉ phải có dạng https://script.google.com/macros/s/…/exec (lấy ở bước Đăng tải trong Apps Script).',
      })
      return
    }
    if (secret.trim().length < 12) {
      setMsg({ ok: false, text: 'Mã bí mật quá ngắn. Hãy đặt ít nhất 20 ký tự và dùng đúng mã đã ghi trong mã Apps Script.' })
      return
    }
    setSyncConfig(url, secret)
    onSyncConfigChanged()
    setMsg({ ok: true, text: 'Đã lưu. Bấm "Thử kết nối" để kiểm tra.' })
  }

  const test = () =>
    run(async () => {
      const rows = await testSync()
      setMsg({ ok: true, text: `Kết nối tốt. Sheet đang có ${rows} khoản.` })
    })

  const push = (force: boolean) =>
    run(async () => {
      await onSyncNow(force)
      setMsg({ ok: true, text: force ? 'Đã ghi lại toàn bộ lên Sheet.' : 'Đã sao lưu.' })
    })

  const restore = () => {
    if (!window.confirm('Kéo dữ liệu từ Sheet về máy này? Dữ liệu đang có trong máy không bị xóa; khoản nào mới hơn thì được giữ.')) return
    void run(async () => {
      const r = await pullNow()
      onImported()
      onSyncConfigChanged()
      setMsg({ ok: true, text: `Đã khôi phục: thêm ${r.added} khoản, cập nhật ${r.updated}.` })
    })
  }

  const remove = () => {
    if (!window.confirm('Xóa địa chỉ và mã bí mật khỏi máy này? Dữ liệu trên Sheet vẫn còn nguyên.')) return
    clearSyncConfig()
    setUrl('')
    setSecret('')
    onSyncConfigChanged()
    setMsg({ ok: true, text: 'Đã xóa cấu hình sao lưu khỏi máy này.' })
  }

  const statusText =
    sync.phase === 'syncing'
      ? 'Đang sao lưu…'
      : sync.phase === 'error'
        ? `Lỗi: ${sync.msg}`
        : !saved
          ? 'Chưa cấu hình'
          : sync.pending > 0
            ? `Chờ sao lưu ${sync.pending} khoản${sync.msg ? ` (${sync.msg})` : ''}`
            : sync.at
              ? `Đã sao lưu lần cuối ${hhmm(sync.at)}`
              : 'Chưa sao lưu lần nào'

  return (
    <section className="card">
      <div className="card-head">
        <h2>Sao lưu lên Google Sheets</h2>
        <span className={sync.phase === 'error' ? 'chi' : saved ? 'thu' : 'muted'}>{saved ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>
      </div>
      <p className="muted small">
        App gửi các khoản thu chi tới Apps Script trong Google Drive của bạn, và Apps Script ghi mỗi khoản thành một dòng
        trong Sheet. Không cần đăng nhập Google trong app. Mất mạng thì app giữ lại và gửi sau.
      </p>

      <label className="field">
        Địa chỉ Apps Script
        <input
          className="note"
          placeholder="https://script.google.com/macros/s/…/exec"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          inputMode="url"
        />
      </label>
      <label className="field">
        Mã bí mật (giống mã trong Apps Script)
        <input
          type="password"
          className="note"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <button className="save thu" disabled={!url.trim() || !secret.trim() || !dirty} onClick={save}>
        Lưu cấu hình
      </button>

      <div className="row2">
        <button className="chip big" disabled={!saved || dirty || busy} onClick={() => void test()}>
          Thử kết nối
        </button>
        <button className="chip big" disabled={!saved || dirty || busy} onClick={() => void push(false)}>
          Sao lưu ngay
        </button>
      </div>
      <div className="row2">
        <button className="chip big" disabled={!saved || dirty || busy} onClick={restore}>
          Khôi phục từ Sheet
        </button>
        <button className="chip big" disabled={!saved || dirty || busy} onClick={() => void push(true)}>
          Ghi lại toàn bộ
        </button>
      </div>
      {msg && <div className={msg.ok ? 'msg ok' : 'msg bad'}>{msg.text}</div>}
      <div className="muted small sync-status">Trạng thái: {statusText}</div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAutoSync(e.target.checked)
            setAuto(e.target.checked)
          }}
        />
        <span>Tự sao lưu sau mỗi lần ghi và khi mở app</span>
      </label>
      {saved && (
        <button className="linkbtn danger-link" onClick={remove}>
          Xóa cấu hình khỏi máy này
        </button>
      )}
    </section>
  )
}
