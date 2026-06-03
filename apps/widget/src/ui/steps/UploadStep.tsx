import { useEffect, useRef, useState } from 'preact/hooks';
import type { WidgetLimits } from '@lumina/shared';
import type { Translate } from '../../core/i18n.js';

/**
 * Step 1 — room photo (§3): drag/drop + file picker + camera (getUserMedia with a mobile `capture`
 * fallback) with client-side validation against the merchant's limits. Valid files are handed to
 * `onSelectRoom`; the controller does the downscale/EXIF/re-encode.
 */
export interface UploadRejection {
  reason: 'too_large' | 'not_image';
}

/** Pure pre-upload validation against the configured limits. */
export function validateUpload(
  file: { size: number; type: string },
  limits: WidgetLimits,
): UploadRejection | null {
  if (!file.type.startsWith('image/')) return { reason: 'not_image' };
  if (file.size > limits.maxUploadBytes) return { reason: 'too_large' };
  return null;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export interface UploadStepProps {
  t: Translate;
  limits: WidgetLimits;
  onSelectRoom: (file: Blob, source: 'file' | 'camera') => void;
}

export function UploadStep({ t, limits, onSelectRoom }: UploadStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (file: File | undefined, source: 'file' | 'camera'): void => {
    if (!file) return;
    if (validateUpload(file, limits)) {
      setError(t('error.bad_image.body'));
      return;
    }
    setError(null);
    onSelectRoom(file, source);
  };

  const cameraSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  if (camera && cameraSupported) {
    return (
      <CameraCapture
        t={t}
        onCancel={() => setCamera(false)}
        onCapture={(blob) => {
          setCamera(false);
          accept(new File([blob], 'camera.jpg', { type: 'image/jpeg' }), 'camera');
        }}
      />
    );
  }

  return (
    <div
      class="lumina-state lumina-upload"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        accept(e.dataTransfer?.files?.[0], 'file');
      }}
    >
      <h2 class="lumina-title">{t('upload.title')}</h2>
      <button class="lumina-dropzone" type="button" onClick={() => inputRef.current?.click()}>
        <p>
          {t('upload.drop')} <span class="lumina-link">{t('upload.browse')}</span>
        </p>
        <p class="lumina-muted">{t('upload.hint', { max: formatBytes(limits.maxUploadBytes) })}</p>
      </button>
      <button class="lumina-btn" type="button" onClick={() => setCamera(true)}>
        {t('upload.camera')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => accept((e.target as HTMLInputElement).files?.[0], 'file')}
      />
      {error ? (
        <p class="lumina-error-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CameraCapture({
  t,
  onCapture,
  onCancel,
}: {
  t: Translate;
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = (): void => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && onCapture(blob), 'image/jpeg', 0.9);
  };

  if (failed) {
    return (
      <div class="lumina-state">
        <p class="lumina-error-text" role="alert">
          {t('error.bad_image.body')}
        </p>
        <button class="lumina-btn" type="button" onClick={onCancel}>
          {t('close')}
        </button>
      </div>
    );
  }

  return (
    <div class="lumina-state lumina-camera">
      <video ref={videoRef} class="lumina-camera-video" playsInline muted />
      <div class="lumina-actions">
        <button class="lumina-btn" type="button" onClick={onCancel}>
          {t('close')}
        </button>
        <button class="lumina-btn lumina-btn-primary" type="button" onClick={capture}>
          {t('upload.camera')}
        </button>
      </div>
    </div>
  );
}
