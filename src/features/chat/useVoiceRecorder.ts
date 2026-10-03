import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MAX_AUDIO_SECONDS } from '../../lib/audio';

const MIN_MS = 700;

export type RecorderState = 'idle' | 'starting' | 'recording';

/**
 * Gravação do áudio: um toque começa, outro toque encerra e entrega o áudio.
 * Para sozinha em 1 minuto. O microfone é liberado assim que a gravação acaba.
 */
export function useVoiceRecorder(onDone: (blob: Blob) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Este navegador não grava áudio. Digite o gasto ou use outro navegador.');
      return;
    }
    setState('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setState('idle');
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      toast.error(denied ? 'Permita o uso do microfone para lançar gastos por áudio.' : 'Não encontrei um microfone neste aparelho.');
      return;
    }
    if (!mounted.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    const startedAt = Date.now();
    cancelled.current = false;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setState('idle');
      setSeconds(0);
      if (cancelled.current) return;
      if (Date.now() - startedAt < MIN_MS) {
        toast.message('Áudio muito curto. Toque no microfone, fale o gasto e toque de novo para enviar.');
        return;
      }
      onDoneRef.current(new Blob(chunks, { type: rec.mimeType }));
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState('recording');
  }, [state]);

  // Cronômetro e limite de 1 minuto.
  useEffect(() => {
    if (state !== 'recording') return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSeconds(s);
      if (s >= MAX_AUDIO_SECONDS) stop();
    }, 250);
    return () => window.clearInterval(id);
  }, [state, stop]);

  // Saiu da tela no meio da gravação: descarta e libera o microfone.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);

  const toggle = useCallback(() => (state === 'recording' ? stop() : void start()), [state, start, stop]);

  return { state, seconds, toggle, cancel };
}
