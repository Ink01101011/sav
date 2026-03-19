export interface MediaAssetDTO {
  name: string;
  file: File;
  preview: Blob;
}

export interface PublishingWindowDTO {
  startsAt: Date;
  endsAt: Date;
}

export interface AnalyticsBucketDTO {
  scoresByChannel: Record<"seo" | "email" | "ads", number>;
  reviewers: Set<string>;
  weights: Map<string, number>;
}

export interface AdvancedCasesDTO {
  /** @sav minLength(3), maxLength(80) */
  title: string;

  /** @sav optional */
  subtitle: string;

  isFeatured: boolean;
  publishWindow: PublishingWindowDTO;
  media: MediaAssetDTO;
  analytics: AnalyticsBucketDTO;
  tags: ReadonlyArray<string>;
  coordinates: [number, number];
  state: "draft" | "scheduled" | "published";
}