import { useState } from 'react'
import { loadTxns } from './lib/db'
import {
  autoSyncOn,
  clearSyncConfig,
  getSyncSecret,
  getSyncUrl,
  isSyncUrl,
  makeSetupCode,
  parseSetupCode,
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

  const [codeIn, setCodeIn] = useState('')

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(makeSetupCode())
      setMsg({
        ok: true,
        text: 'Đã sao chép mã cài đặt. Dán vào Bitwarden hoặc Ghi chú để chuyển sang iPhone. Mã này chứa mã bí mật nên coi như mật khẩu, dùng xong hãy xóa khỏi Ghi chú.',
      })
    } catch {
      setMsg({ ok: false, text: 'Không sao chép được. Hãy thử lại hoặc cho phép dán trong trình duyệt.' })
    }
  }

  /** Dán mã cài đặt từ máy tính: điền địa chỉ và mã, kết nối, và nếu máy này còn trống thì kéo lịch sử về luôn. */
  const applyCode = () => {
    const parsed = parseSetupCode(codeIn)
    if (!parsed) {
      setMsg({ ok: false, text: 'Mã cài đặt chưa đúng. Mã bắt đầu bằng "thuchi1:" và phải dán đủ, không thiếu ký tự.' })
      return
    }
    setUrl(parsed.url)
    setSecret(parsed.secret)
    setSyncConfig(parsed.url, parsed.secret)
    setCodeIn('')
    onSyncConfigChanged()
    void run(async () => {
      const rows = await testSync()
      if ((await loadTxns()).length === 0) {
        const r = await pullNow()
        onImported()
        onSyncConfigChanged()
        setMsg({ ok: true, text: `Đã kết nối và khôi phục ${r.added} khoản từ Sheet (Sheet có ${rows} khoản).` })
      } else {
        await onSyncNow(false)
        setMsg({ ok: true, text: `Đã kết nối (Sheet có ${rows} khoản). Dữ liệu trong máy được giữ nguyên và đã sao lưu.` })
      }
    })
  }

  const save = () => {
    if (!isSyncUrl(url)) {
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
    // Lưu xong thì kiểm tra kết nối và sao lưu lần đầu luôn, không cần bấm thêm nút nào.
    void run(async () => {
      const rows = await testSync()
      await onSyncNow(false)
      setMsg({
        ok: true,
        text: `Đã kết nối (Sheet đang có ${rows} khoản) và sao lưu xong. Từ giờ app tự sao lưu, bạn không cần bấm gì nữa.`,
      })
    })
  }

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

      {!saved && (
        <div className="code-box">
          <div className="code-title">Có mã cài đặt từ máy tính?</div>
          <p className="muted small">
            Trên máy tính, mở mục này và bấm "Sao chép mã cài đặt cho điện thoại". Dán mã vào đây là xong, khỏi nhập từng ô.
          </p>
          <input
            className="note"
            placeholder="thuchi1:..."
            value={codeIn}
            onChange={(e) => setCodeIn(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
          />
          <button className="save thu" disabled={!codeIn.trim() || busy} onClick={applyCode}>
            {busy ? 'Đang kết nối…' : 'Áp dụng mã cài đặt'}
          </button>
        </div>
      )}

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
      <button className="save thu" disabled={!url.trim() || !secret.trim() || busy} onClick={save}>
        {busy ? 'Đang kết nối…' : saved && !dirty ? 'Kiểm tra lại kết nối' : 'Lưu và kết nối'}
      </button>
      {saved && !dirty && (
        <button className="chip big copy-code" disabled={busy} onClick={() => void copyCode()}>
          Sao chép mã cài đặt cho điện thoại
        </button>
      )}
      {msg && <div className={msg.ok ? 'msg ok' : 'msg bad'}>{msg.text}</div>}
      <div className="muted small sync-status">Trạng thái: {statusText}</div>

      <details className="adv">
        <summary>Nâng cao</summary>
        <p className="muted small">
          Bình thường bạn không cần dùng các nút này vì app tự sao lưu. Chỉ dùng khi muốn sao lưu ngay lập tức, đổi
          điện thoại, hoặc sau khi mình đổi cách ghép nội dung.
        </p>
        <div className="row2">
          <button className="chip big" disabled={!saved || dirty || busy} onClick={() => void push(false)}>
            Sao lưu ngay
          </button>
          <button className="chip big" disabled={!saved || dirty || busy} onClick={restore}>
            Khôi phục từ Sheet
          </button>
        </div>
        <div className="row2">
          <button className="chip big" disabled={!saved || dirty || busy} onClick={() => void push(true)}>
            Ghi lại toàn bộ
          </button>
        </div>
      </details>

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
