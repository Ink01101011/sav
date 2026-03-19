interface EmailChannelDTO {
  /** @sav email */
  address: string;
}

interface SmsChannelDTO {
  phoneNumber: string;
}

interface AuditInfoDTO {
  createdAt: Date;
  createdBy: string;
}

interface RevisionInfoDTO {
  revision: number;
}

export interface NotificationRuleDTO {
  channel: EmailChannelDTO | SmsChannelDTO;
  metadata: AuditInfoDTO & RevisionInfoDTO;
  retries: Array<number>;
  deliveryWindow: [Date, Date];
  mode: "immediate" | "digest";
}