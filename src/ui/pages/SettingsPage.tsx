import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { exportState, ImportError, parseImport } from '../../state/store';

export function SettingsPage() {
  const app = useApp();
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const exported = exportState(app.state);

  const download = () => {
    const blob = new Blob([exported], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parloa-integration-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = (text: string) => {
    try {
      const next = parseImport(text);
      app.replaceState(next);
      setMessage({ kind: 'success', text: `Imported ${Object.keys(next.workflows).length} workflow draft(s) and progress for ${Object.keys(next.progress.modules).length} module(s).` });
      setImportText('');
    } catch (err) {
      setMessage({ kind: 'danger', text: err instanceof ImportError ? err.message : `Import failed: ${(err as Error).message}` });
    }
  };

  return (
    <main className="page narrow">
      <h1>Settings &amp; backup</h1>
      <div className="card">
        <h2>Export</h2>
        <p className="small muted">
          Your lesson progress, workflow drafts and settings are saved in this browser automatically. Export them to move to another machine or to keep
          a backup. The export contains no secrets (sandbox credentials are public practice values).
        </p>
        <div className="row">
          <button className="primary" onClick={download}>
            Download backup JSON
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(exported);
              setMessage({ kind: 'success', text: 'Copied the backup JSON to the clipboard.' });
            }}
          >
            Copy to clipboard
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          If your environment blocks downloads (some hosted previews do), use <em>Copy to clipboard</em> or copy the text from the preview below and save it as a
          .json file.
        </p>
        <details className="plain" style={{ marginTop: 4 }}>
          <summary>Preview</summary>
          <textarea className="code" readOnly value={exported} style={{ minHeight: 200 }} />
        </details>
      </div>
      <div className="card">
        <h2>Import</h2>
        <p className="small muted">Paste a backup or choose a file. The current progress and drafts are replaced.</p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            file.text().then(doImport);
            e.target.value = '';
          }}
        />
        <textarea className="code" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="…or paste the backup JSON here" style={{ minHeight: 120, marginTop: 8 }} />
        <div className="row" style={{ marginTop: 8 }}>
          <button disabled={!importText.trim()} onClick={() => doImport(importText)}>
            Import pasted JSON
          </button>
        </div>
      </div>
      {message ? <div className={`notice ${message.kind}`}>{message.text}</div> : null}
      <div className="card">
        <h2>Execution settings</h2>
        <label className="field">
          <span>Practice systems transport</span>
          <select value={app.state.settings.transport} onChange={(e) => app.updateSettings({ transport: e.target.value as 'virtual' | 'http' })}>
            <option value="virtual">In-browser (default, no server needed)</option>
            <option value="http">Local HTTP server (npm run api)</option>
          </select>
        </label>
        {app.state.settings.transport === 'http' ? (
          <>
            <label className="field">
              <span>HTTP server origin</span>
              <input type="text" className="code" value={app.state.settings.httpOrigin} onChange={(e) => app.updateSettings({ httpOrigin: e.target.value })} />
            </label>
            <p className="small muted">
              Also switch each workflow's environment to the HTTP base URLs (Lab → Environment → "Use local HTTP server"). Graded scenario runs always use the
              in-browser systems so results stay deterministic.
            </p>
          </>
        ) : null}
        <label className="field">
          <span>Simulation speed</span>
          <select value={app.state.settings.speed} onChange={(e) => app.updateSettings({ speed: e.target.value as 'instant' | 'realistic' })}>
            <option value="realistic">Realistic (short pauses so you can watch)</option>
            <option value="instant">Instant</option>
          </select>
        </label>
        <label className="field">
          <span>Theme</span>
          <select value={app.state.settings.theme} onChange={(e) => app.updateSettings({ theme: e.target.value as 'system' | 'light' | 'dark' })}>
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
      <div className="card">
        <h2>Reset</h2>
        <p className="small muted">Deletes all progress and drafts from this browser. Export first if you might want them back.</p>
        <button
          className="danger"
          onClick={() => {
            if (window.confirm('Delete all progress and workflow drafts from this browser?')) app.resetAll();
          }}
        >
          Reset everything
        </button>
      </div>
    </main>
  );
}
