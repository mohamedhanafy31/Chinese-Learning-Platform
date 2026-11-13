'use client';

import { ImagePlus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  MAX_IMAGE_UPLOAD_BYTES,
  uploadedImageSchema,
  type ImageRef,
} from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import {
  StatusLine,
  labelClass,
  secondaryButton,
} from '@/components/admin/controls';
import { failureKey } from '@/lib/admin-client';
import { apiFetchParsed } from '@/lib/api-client';

export interface AttachedImage extends ImageRef {
  id: string;
}

interface ImageUploadProps {
  id: string;
  label: string;
  helper: string;
  value: AttachedImage | null;
  onChange: (image: AttachedImage | null) => void;
  /** Called when the session has ended so the caller can redirect. */
  onUnauthenticated: () => void;
}

/**
 * File input with preview and remove. The upload happens immediately and only
 * yields an asset id; attaching it to the level or lesson happens on Save.
 */
export function ImageUpload({
  helper,
  id,
  label,
  onChange,
  onUnauthenticated,
  value,
}: ImageUploadProps): React.JSX.Element {
  const t = useTranslations('Admin.form');
  const tErrors = useTranslations('Admin.errors');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    setStatus(null);
    setErrorMessage(null);
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setErrorMessage(tErrors('imageTooLarge'));
      return;
    }

    setUploading(true);
    const body = new FormData();
    body.append('file', file);
    const result = await apiFetchParsed(
      '/api/v1/admin/media/images',
      uploadedImageSchema,
      { method: 'POST', body },
    );
    setUploading(false);

    if (!result.ok) {
      if (result.kind === 'invalid') {
        setErrorMessage(tErrors('retry'));
        return;
      }
      const key = await failureKey(result);
      if (key === 'unauthenticated') return onUnauthenticated();
      setErrorMessage(tErrors(key));
      return;
    }
    const { height, id: assetId, url, width } = result.data;
    onChange({ id: assetId, url, width, height });
    setStatus(t('uploaded'));
  }

  function remove() {
    onChange(null);
    setStatus(t('removed'));
    inputRef.current?.focus();
  }

  const describedBy = `${id}-helper`;

  return (
    <div>
      <p id={`${id}-label`} className={labelClass}>
        {label}
      </p>
      <div className="flex flex-wrap items-start gap-6">
        <div className="grid h-40 w-40 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-unfired bg-glaze-bright">
          {value ? (
            <img
              src={value.url}
              alt={t('previewAlt')}
              width={value.width}
              height={value.height}
              className="size-full object-cover"
            />
          ) : (
            <span className="px-3 text-center text-sm text-unfired-ink">
              {t('noImage')}
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void onFile(event)}
            disabled={uploading}
            aria-labelledby={`${id}-label`}
            aria-describedby={describedBy}
            className="sr-only"
          />
          <button
            type="button"
            disabled={uploading}
            aria-busy={uploading}
            onClick={() => inputRef.current?.click()}
            className={`${secondaryButton} gap-2`}
          >
            <ImagePlus aria-hidden="true" className="size-5" />
            {uploading
              ? t('uploading')
              : value
                ? t('replaceImage')
                : t('chooseImage')}
          </button>
          {value ? (
            <button
              type="button"
              disabled={uploading}
              onClick={remove}
              className={`${secondaryButton} gap-2`}
            >
              <Trash2 aria-hidden="true" className="size-5" />
              {t('removeImage')}
            </button>
          ) : null}
        </div>
      </div>
      <p id={describedBy} className="mt-2 text-sm text-cobalt">
        {helper}
      </p>
      {errorMessage ? (
        <div className="mt-3">
          <FormAlert>{errorMessage}</FormAlert>
        </div>
      ) : null}
      <StatusLine message={status} />
    </div>
  );
}
