import type { VideoProvider as VideoProviderKind } from '@app/shared';

/** The slice of a VideoAsset row that providers need. */
export interface VideoAssetRef {
  id: string;
  provider: VideoProviderKind;
  localKey: string | null;
  mime: string | null;
  bunnyVideoId?: string | null;
  bunnyLibraryId?: string | null;
}

/** What a provider hands back when an upload is about to start. */
export interface UploadTicket {
  assetId: string;
  provider: VideoProviderKind;
}

export interface FinalizeUploadInput {
  assetId: string;
  /** A finished upload on local disk (the local provider only). */
  tempPath: string;
}

export interface FinalizedUpload {
  /** The local provider's file name; null for remote providers. */
  localKey: string | null;
  mime: string;
  sizeBytes: number;
}

export type PlaybackDescriptor =
  | {
      provider: 'LOCAL';
      /** Same-origin URL of the access-checked stream route. */
      src: string;
      mime: string | null;
    }
  | {
      provider: 'BUNNY';
      /** Signed, expiring embed URL for an iframe. */
      embedUrl: string;
      expiresAt: string;
    };

/**
 * What a video backend implements. Every asset keeps the provider that
 * created it, so a LOCAL asset still streams after Bunny is configured.
 *
 * - `LocalProvider` stores files on the API's disk (development only) and
 *   also offers `finalize`, which moves a finished multipart upload into place.
 * - `BunnyProvider` creates a Bunny video plus a signed TUS upload. Its
 *   uploads are finalized by the Bunny webhook or the reconcile job (see
 *   `BunnyVideoService`), never by the request that created them.
 */
export interface VideoProvider {
  readonly kind: VideoProviderKind;
  playback(asset: VideoAssetRef): PlaybackDescriptor;
  delete(asset: VideoAssetRef): Promise<void>;
}
