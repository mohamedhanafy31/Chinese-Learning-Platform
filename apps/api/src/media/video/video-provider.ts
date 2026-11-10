import type { VideoProvider as VideoProviderKind } from '@app/shared';

/** The slice of a VideoAsset row that providers need. */
export interface VideoAssetRef {
  id: string;
  provider: VideoProviderKind;
  localKey: string | null;
  mime: string | null;
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

export interface PlaybackDescriptor {
  provider: VideoProviderKind;
  /** Same-origin or absolute URL the player loads. */
  src: string;
  mime: string | null;
}

/**
 * What a video backend implements. `LocalProvider` stores files on the API's
 * disk (development only). M7's `BunnyProvider` implements the same four
 * operations against Bunny Stream: create the video and a signed TUS upload,
 * finalize from the webhook or reconcile job, hand out a signed embed, delete.
 */
export interface VideoProvider {
  readonly kind: VideoProviderKind;
  createUpload(): UploadTicket;
  finalize(input: FinalizeUploadInput): Promise<FinalizedUpload>;
  playback(asset: VideoAssetRef): PlaybackDescriptor;
  delete(asset: VideoAssetRef): Promise<void>;
}
