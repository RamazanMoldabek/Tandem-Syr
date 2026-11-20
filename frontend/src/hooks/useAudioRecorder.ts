import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioRecorderOptions {
  onRecorded?: (blob: Blob) => void;
}

export function useAudioRecorder({ onRecorded }: UseAudioRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(() => Array(24).fill(0.08));
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardOnStopRef = useRef<boolean>(false);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const releaseMediaResources = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setWaveform(Array(24).fill(0.08));
  }, []);

  // При размонтировании (например, при переключении вкладки на «Тыныс ойыны»)
  // гарантированно останавливаем MediaRecorder и освобождаем микрофон.
  useEffect(() => {
    return () => {
      discardOnStopRef.current = true;
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorderRef.current = null;
      releaseMediaResources();
    };
  }, [releaseMediaResources]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      releaseMediaResources();
    }
    setIsRecording(false);
  }, [releaseMediaResources]);

  const startRecording = useCallback(async () => {
    setError(null);
    discardOnStopRef.current = false;
    // На случай если предыдущий поток ещё не был закрыт
    releaseMediaResources();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateWave = () => {
        analyser.getByteFrequencyData(dataArray);
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(dataArray.length / 24));
        for (let i = 0; i < 24; i++) {
          const val = dataArray[i * step] / 255;
          bars.push(Math.max(0.08, Math.min(1, val)));
        }
        setWaveform(bars);
        rafRef.current = requestAnimationFrame(updateWave);
      };
      updateWave();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        releaseMediaResources();
        setIsRecording(false);

        if (!discardOnStopRef.current && blob.size > 0 && onRecordedRef.current) {
          onRecordedRef.current(blob);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      releaseMediaResources();
      setIsRecording(false);
      setError(err instanceof Error ? err.message : "Microphone access denied");
    }
  }, [releaseMediaResources]);

  return {
    isRecording,
    waveform,
    error,
    startRecording,
    stopRecording,
  };
}
