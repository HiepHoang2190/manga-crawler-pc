import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import {
  BACKUP_SECTION_IDS,
  buildBackupPayload,
  parseBackupJson,
  encryptBackupPayload,
  decryptBackupEnvelope,
  applyBackupPayload,
  downloadBackupBlob,
  BACKUP_FORMAT_ENCRYPTED,
} from '../../utils/userDataBackup';
import { clearAutoBackupScheduleMeta } from '../../utils/autoBackup';

function SectionCheckbox({ id, label, checked, onChange, disabled }) {
  return (
    <label
      className={`flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-surface-container-high/50 ${
        disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(id, e.target.checked)}
        disabled={disabled}
        className="size-4 rounded border-outline-variant accent-primary shrink-0"
      />
      <span className="text-sm text-on-surface">{label}</span>
    </label>
  );
}

export default function UserDataBackupSection() {
  const { t } = useI18n();
  const fileRef = useRef(null);
  const [sections, setSections] = useState(() =>
    BACKUP_SECTION_IDS.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {})
  );
  const [encrypt, setEncrypt] = useState(false);
  const [encPassword, setEncPassword] = useState('');
  const [encPassword2, setEncPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [importPassword, setImportPassword] = useState('');

  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI?.getSavedDownloadPath;
  const [autoBackupPath, setAutoBackupPath] = useState('');

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.getAutoBackupPath) return;
    api
      .getAutoBackupPath()
      .then((p) => setAutoBackupPath(typeof p === 'string' ? p : ''))
      .catch(() => setAutoBackupPath(''));
  }, []);

  const toggleSection = useCallback((id, on) => {
    setSections((prev) => ({ ...prev, [id]: on }));
  }, []);

  const selectedIds = BACKUP_SECTION_IDS.filter((id) => sections[id]);

  const runExport = useCallback(async () => {
    setMsg('');
    if (!selectedIds.length) {
      setMsg(t('settings.backup.errNoSection'));
      return;
    }
    if (encrypt) {
      if (encPassword.length < 4) {
        setMsg(t('settings.backup.errPasswordShort'));
        return;
      }
      if (encPassword !== encPassword2) {
        setMsg(t('settings.backup.errPasswordMismatch'));
        return;
      }
    }
    setBusy(true);
    try {
      const payload = await buildBackupPayload(selectedIds);
      const stamp = new Date().toISOString().slice(0, 10);
      let text;
      let name;
      if (encrypt) {
        const envelope = await encryptBackupPayload(payload, encPassword);
        text = JSON.stringify(envelope, null, 2);
        name = `manga-clawer-backup-${stamp}.encrypted.json`;
      } else {
        text = JSON.stringify(payload, null, 2);
        name = `manga-clawer-backup-${stamp}.json`;
      }
      downloadBackupBlob(text, name);
      setMsg(t('settings.backup.exportDone'));
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [selectedIds, encrypt, encPassword, encPassword2, t]);

  const onPickFile = useCallback(() => {
    setMsg('');
    setPendingImport(null);
    setImportPassword('');
    fileRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setMsg('');
      setPendingImport(null);
      setImportPassword('');
      try {
        const text = await file.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          setMsg(t('settings.backup.errInvalidJson'));
          return;
        }
        if (data?.format === BACKUP_FORMAT_ENCRYPTED) {
          setPendingImport({ kind: 'encrypted', raw: text, fileName: file.name });
          return;
        }
        const parsed = parseBackupJson(data);
        if (!parsed.ok) {
          setMsg(t('settings.backup.errNotBackup'));
          return;
        }
        setPendingImport({ kind: 'plain', payload: parsed.payload, fileName: file.name });
      } catch (err) {
        setMsg(String(err?.message || err));
      }
    },
    [t]
  );

  const runImport = useCallback(async () => {
    if (!pendingImport) return;
    setMsg('');
    setBusy(true);
    try {
      let payload;
      if (pendingImport.kind === 'plain') {
        payload = pendingImport.payload;
      } else {
        const dec = await decryptBackupEnvelope(pendingImport.raw, importPassword);
        if (!dec.ok) {
          setMsg(dec.error === 'password' ? t('settings.backup.errDecrypt') : t('settings.backup.errNotBackup'));
          setBusy(false);
          return;
        }
        payload = dec.payload;
      }
      if (!window.confirm(t('settings.backup.importConfirm'))) {
        setBusy(false);
        return;
      }
      await applyBackupPayload(payload);
      clearAutoBackupScheduleMeta();
      setPendingImport(null);
      setImportPassword('');
      setMsg(t('settings.backup.importReloading'));
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [pendingImport, importPassword, t]);

  const cancelImport = useCallback(() => {
    setPendingImport(null);
    setImportPassword('');
    setMsg('');
  }, []);

  return (
    <div className="space-y-3">
      {autoBackupPath ? (
        <p className="text-sm text-on-surface-variant leading-snug max-w-2xl">
          {t('settings.backup.auto', { path: autoBackupPath })}
        </p>
      ) : null}

      <div className="space-y-2 max-w-xl">
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
          {t('settings.backup.include')}
        </p>
        <div className="space-y-0.5">
          <SectionCheckbox
            id="favorites"
            label={t('settings.backup.sec.favorites')}
            checked={sections.favorites}
            onChange={toggleSection}
          />
          <SectionCheckbox
            id="history"
            label={t('settings.backup.sec.history')}
            checked={sections.history}
            onChange={toggleSection}
          />
          <SectionCheckbox
            id="queue"
            label={t('settings.backup.sec.queue')}
            checked={sections.queue}
            onChange={toggleSection}
          />
          <SectionCheckbox
            id="ui"
            label={t('settings.backup.sec.ui')}
            checked={sections.ui}
            onChange={toggleSection}
          />
          <SectionCheckbox
            id="appSettings"
            label={t('settings.backup.sec.appSettings')}
            checked={sections.appSettings}
            onChange={toggleSection}
          />
          <SectionCheckbox
            id="offlineLibrary"
            label={t('settings.backup.sec.offlineLibrary')}
            checked={sections.offlineLibrary}
            onChange={toggleSection}
          />
          <SectionCheckbox
            id="electron"
            label={t('settings.backup.sec.electron')}
            checked={sections.electron}
            onChange={toggleSection}
            disabled={!hasElectron}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 max-w-xl">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={encrypt}
            onChange={(e) => setEncrypt(e.target.checked)}
            className="mt-0.5 size-4 rounded border-outline-variant accent-primary shrink-0"
          />
          <span className="text-sm text-on-surface leading-snug">{t('settings.backup.encryptLabel')}</span>
        </label>
        {encrypt ? (
          <div className="grid gap-2 sm:grid-cols-2 max-w-md">
            <input
              type="password"
              autoComplete="new-password"
              value={encPassword}
              onChange={(e) => setEncPassword(e.target.value)}
              placeholder={t('settings.backup.password')}
              className="bg-surface-container-highest border-none rounded-md text-sm h-10 px-3 focus:ring-1 focus:ring-primary outline-none"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={encPassword2}
              onChange={(e) => setEncPassword2(e.target.value)}
              placeholder={t('settings.backup.passwordAgain')}
              className="bg-surface-container-highest border-none rounded-md text-sm h-10 px-3 focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runExport()}
            className="shrink-0 min-h-10 px-4 rounded-md text-sm inline-flex items-center justify-center gap-1.5 bg-primary text-on-primary font-medium hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">download</span>
            {t('settings.backup.export')}
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFileChange} />
          <button
            type="button"
            disabled={busy}
            onClick={onPickFile}
            className="shrink-0 min-h-10 px-4 rounded-md text-sm inline-flex items-center justify-center gap-1.5 bg-surface-container-high text-on-surface font-medium hover:bg-surface-bright transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">upload</span>
            {t('settings.backup.importPick')}
          </button>
        </div>

        {pendingImport ? (
          <div className="rounded-md bg-surface-container-highest/80 px-3 py-3 space-y-2 text-sm">
            <p className="text-on-surface">
              <span className="text-on-surface-variant">{t('settings.backup.pendingFile')}: </span>
              {pendingImport.fileName}
            </p>
            {pendingImport.kind === 'encrypted' ? (
              <input
                type="password"
                autoComplete="off"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder={t('settings.backup.passwordDecrypt')}
                className="w-full max-w-md bg-surface-container-highest border-none rounded-md text-sm h-10 px-3 focus:ring-1 focus:ring-primary outline-none"
              />
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={busy || (pendingImport.kind === 'encrypted' && importPassword.length < 1)}
                onClick={() => void runImport()}
                className="min-h-9 px-3 rounded-md text-sm bg-primary text-on-primary font-medium hover:opacity-90 disabled:opacity-50"
              >
                {t('settings.backup.applyImport')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={cancelImport}
                className="min-h-9 px-3 rounded-md text-sm bg-surface-container-high text-on-surface"
              >
                {t('settings.backup.cancelImport')}
              </button>
            </div>
          </div>
        ) : null}

        {msg ? <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{msg}</p> : null}

        <p className="text-xs text-on-surface-variant/90 leading-snug max-w-2xl">{t('settings.backup.note')}</p>
      </div>
    </div>
  );
}
