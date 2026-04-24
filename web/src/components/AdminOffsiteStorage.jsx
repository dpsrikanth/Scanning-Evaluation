import { useState, useEffect } from 'react';
import {
  CloudUpload, CheckCircle2, AlertCircle, Plug, Loader2, HardDrive,
} from 'lucide-react';
import { api } from '../services/api';

const emptyForm = {
  mirrorEnabled: false,
  mirrorMode: 'none',
  sftpHost: '',
  sftpPort: 22,
  sftpUsername: '',
  sftpPassword: '',
  sftpRemotePath: '',
  networkPath: '',
};

export default function AdminOffsiteStorage({ flash }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sftpPasswordSet, setSftpPasswordSet] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [testMsg, setTestMsg] = useState({ text: '', ok: true });

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.scanadmin.getMirrorConfig();
      setForm({
        ...emptyForm,
        mirrorEnabled: !!d.mirrorEnabled,
        mirrorMode: d.mirrorMode || 'none',
        sftpHost: d.sftpHost || '',
        sftpPort: d.sftpPort != null ? Number(d.sftpPort) : 22,
        sftpUsername: d.sftpUsername || '',
        sftpPassword: '',
        sftpRemotePath: d.sftpRemotePath || '',
        networkPath: d.networkPath || '',
      });
      setSftpPasswordSet(!!d.sftpPasswordSet);
      setTestMsg({ text: '', ok: true });
    } catch (e) {
      flash('Error loading offsite settings: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const port = form.sftpPort === '' || form.sftpPort == null
        ? 22
        : Math.max(1, Math.min(65535, parseInt(String(form.sftpPort), 10) || 22));
      const body = {
        mirrorEnabled: form.mirrorEnabled,
        mirrorMode: form.mirrorMode,
        sftpHost: form.sftpHost,
        sftpPort: port,
        sftpUsername: form.sftpUsername,
        sftpRemotePath: form.sftpRemotePath,
        networkPath: form.networkPath,
      };
      if (form.sftpPassword && String(form.sftpPassword).trim().length > 0) {
        body.sftpPassword = form.sftpPassword;
      }
      await api.scanadmin.updateMirrorConfig(body);
      flash('Offsite storage settings saved');
      setForm((f) => ({ ...f, sftpPassword: '' }));
      await load();
    } catch (e) {
      flash('Error: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestMsg({ text: '', ok: true });
    try {
      const port = form.sftpPort === '' || form.sftpPort == null
        ? 22
        : Math.max(1, Math.min(65535, parseInt(String(form.sftpPort), 10) || 22));
      const body = {
        mirrorMode: form.mirrorMode,
        sftpHost: form.sftpHost,
        sftpPort: port,
        sftpUsername: form.sftpUsername,
        sftpRemotePath: form.sftpRemotePath,
        networkPath: form.networkPath,
      };
      if (form.sftpPassword && String(form.sftpPassword).trim().length > 0) {
        body.sftpPassword = form.sftpPassword;
      }
      const res = await api.scanadmin.testMirrorConfig(body);
      const base = res?.message || 'Connection and path check succeeded';
      const extra = [res?.path, res?.resolved, res?.entryCount != null ? `entries: ${res.entryCount}` : null]
        .filter(Boolean)
        .join(' — ');
      setTestMsg({ text: extra ? `${base} — ${extra}` : base, ok: true });
    } catch (e) {
      setTestMsg({ text: e.message || 'Test failed', ok: false });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading" style={{ padding: 32 }}>
        <Loader2 size={20} className="spin" /> Loading offsite storage settings…
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <CloudUpload size={15} className="settings-section-icon" />
        <h3>Offsite booklet copy</h3>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
        After a scan upload completes, the server can mirror the saved booklet folder to an SFTP site or a network share path
        (in addition to the local scan output path). Booklets are written under a <code>booklets/&lt;id&gt;</code> subfolder.
      </p>
      <div className="settings-form-body">
        <div className="toggle-row" style={{ marginBottom: 16 }}>
          <div className="toggle-row-info">
            <span className="toggle-label">Enable offsite copy</span>
            <span className="toggle-desc">When off, only the local path from Scan output paths is used</span>
          </div>
          <button
            type="button"
            className={`toggle-switch ${form.mirrorEnabled ? 'on' : ''}`}
            onClick={() => setField('mirrorEnabled', !form.mirrorEnabled)}
          />
        </div>

        <div className="field-group" style={{ marginBottom: 14 }}>
          <label className="field-label">Destination</label>
          <select
            className="field-input"
            style={{ maxWidth: 360 }}
            value={form.mirrorMode}
            onChange={(e) => setField('mirrorMode', e.target.value)}
          >
            <option value="none">None (local only)</option>
            <option value="sftp">SFTP</option>
            <option value="network">Network / shared folder</option>
          </select>
        </div>

        {form.mirrorMode === 'sftp' && (
          <div className="settings-grid">
            <div className="field-group">
              <label className="field-label">Host or IP</label>
              <input
                className="field-input"
                value={form.sftpHost}
                placeholder="sftp.example.com"
                onChange={(e) => setField('sftpHost', e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Port</label>
              <input
                className="field-input"
                type="number"
                min={1}
                max={65535}
                value={form.sftpPort === '' || form.sftpPort == null ? '' : form.sftpPort}
                onChange={(e) => {
                  const v = e.target.value;
                  setField('sftpPort', v === '' ? '' : parseInt(v, 10) || 0);
                }}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Username</label>
              <input
                className="field-input"
                value={form.sftpUsername}
                onChange={(e) => setField('sftpUsername', e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                className="field-input"
                type="password"
                autoComplete="new-password"
                value={form.sftpPassword}
                placeholder={sftpPasswordSet ? '(unchanged if left empty)' : ''}
                onChange={(e) => setField('sftpPassword', e.target.value)}
              />
              {sftpPasswordSet && (
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>A password is already stored; enter a new one to replace it</span>
              )}
            </div>
            <div className="field-group" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">Remote base path</label>
              <input
                className="field-input"
                value={form.sftpRemotePath}
                placeholder="/incoming/scans"
                onChange={(e) => setField('sftpRemotePath', e.target.value)}
              />
            </div>
          </div>
        )}

        {form.mirrorMode === 'network' && (
          <div className="field-group" style={{ marginBottom: 14 }}>
            <label className="field-label">Network / UNC path</label>
            <input
              className="field-input"
              value={form.networkPath}
              placeholder="\\\\fileserver\\share\\scans or D:\\Shared\\Scans"
              onChange={(e) => setField('networkPath', e.target.value)}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginTop: 6 }}>
              This must be readable and writable by the API process. A probe file is created and removed when you run Test.
            </span>
          </div>
        )}

        <div className="settings-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><Loader2 size={13} className="spin" /> Saving…</> : <><CheckCircle2 size={13} /> Save</>}
          </button>
          {form.mirrorMode !== 'none' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={test}
              disabled={testing}
            >
              {testing ? <><Loader2 size={13} className="spin" /> Testing…</> : <><Plug size={13} /> Test connection &amp; path</>}
            </button>
          )}
          {testMsg.text && (
            <span className={`badge ${testMsg.ok ? 'badge-green' : 'badge-red'}`} style={{ maxWidth: '100%', whiteSpace: 'normal', lineHeight: 1.3 }}>
              {testMsg.ok ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
              {testMsg.text}
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 20,
            padding: 12,
            background: 'var(--color-surface, #f8fafc)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--color-text-muted)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <HardDrive size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            Local storage is still configured under <strong>Scan settings → Scan output paths</strong>. This screen only
            adds an extra SFTP or network copy after each successful upload.
          </div>
        </div>
      </div>
    </div>
  );
}
