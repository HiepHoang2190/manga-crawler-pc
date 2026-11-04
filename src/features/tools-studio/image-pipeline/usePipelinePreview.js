import { useEffect, useRef, useState } from 'react';

export default function usePipelinePreview({
  api,
  filePath,
  fileIndex = null,
  actions,
  fileOverrides,
  upToStep = null,
  mode = 'final',
  frameIndex = null,
  output,
  enabled = true,
  delay = 150,
}) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const reqRef = useRef(0);
  const payloadKey = JSON.stringify({ filePath, fileIndex, actions, fileOverrides, upToStep, mode, frameIndex, output });

  useEffect(() => {
    if (!enabled || !filePath || !api?.pipelinePreview) {
      reqRef.current += 1;
      setState({ loading: false, data: null, error: null });
      return undefined;
    }
    const reqId = ++reqRef.current;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await api.pipelinePreview(JSON.parse(payloadKey));
        if (reqId !== reqRef.current) return;
        setState(res?.ok ? { loading: false, data: res, error: null } : { loading: false, data: null, error: res?.error || 'PREVIEW_FAILED' });
      } catch (err) {
        if (reqId === reqRef.current) setState({ loading: false, data: null, error: String(err?.message || err) });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [api, enabled, filePath, payloadKey, delay]);

  return state;
}
