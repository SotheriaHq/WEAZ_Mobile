export type MessageContextType = 'DIRECT' | 'INQUIRY' | 'STANDARD_ORDER' | 'CUSTOM_ORDER';

export type MessageThreadStatus = 'OPEN' | 'READ_ONLY' | 'ARCHIVED' | 'BLOCKED';

export type MessageParticipantRole = 'BUYER' | 'BRAND_OWNER' | 'ADMIN' | 'SYSTEM';

export type MessageKind = 'USER' | 'SYSTEM' | 'MODERATION_NOTICE';

export type MessageVisibilityState = 'VISIBLE' | 'HIDDEN' | 'REDACTED';

export type MessageDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ';

export type MessageAttachmentKind = 'IMAGE' | 'DOCUMENT';

export type MessageContextParams = {
  threadId?: string | null;
  conversationId?: string | null;
  orderId?: string | null;
  customOrderId?: string | null;
  messageId?: string | null;
  brandId?: string | null;
  customerId?: string | null;
  designId?: string | null;
  productId?: string | null;
};

export type ConversationParticipant = {
  id: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export type MessageAttachment = {
  id: string;
  kind: MessageAttachmentKind | null;
  file: {
    id: string | null;
    url: string | null;
    originalName: string | null;
    mimeType: string | null;
    size: number | null;
  };
};

export type MessageItem = {
  id: string;
  threadId: string;
  conversationId: string;
  senderUserId: string | null;
  senderRole: MessageParticipantRole;
  kind: MessageKind;
  visibilityState: MessageVisibilityState;
  bodyText: string | null;
  createdAt: string | null;
  deliveryStatus: MessageDeliveryStatus | null;
  sender: ConversationParticipant | null;
  attachments: MessageAttachment[];
};

export type MessagingCursor = {
  createdAt: string;
  id: string;
};

export type ConversationSummary = {
  threadId: string;
  conversationId: string;
  contextType: MessageContextType;
  context: MessageContextParams;
  orderId: string | null;
  customOrderId: string | null;
  inquiryId: string | null;
  title: string;
  subtitle: string | null;
  participant: ConversationParticipant | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  unreadCount: number;
  hasUnread: boolean;
  mutedUntil: string | null;
  archivedAt: string | null;
  targetUrl: string | null;
  orderDetailUrl: string | null;
};

export type ConversationListResponse = {
  items: ConversationSummary[];
  hasNextPage: boolean;
  endCursor: {
    cursorLastMessageAt: string;
    cursorThreadId: string;
  } | null;
};

export type MessageUnreadCountResponse = {
  unreadCount: number;
};

export type ConversationThread = {
  threadId: string;
  conversationId: string;
  status: MessageThreadStatus | null;
  messages: MessageItem[];
  hasNextPage: boolean;
  endCursor: MessagingCursor | null;
};

export type SendMessagePayload = {
  bodyText?: string;
  clientMessageId: string;
  attachmentFileIds?: string[];
};

export type StartConversationPayload = {
  brandId?: string | null;
  orderId?: string | null;
  customOrderId?: string | null;
  customerId?: string | null;
  designId?: string | null;
  productId?: string | null;
  bodyText?: string;
  clientMessageId: string;
  attachmentFileIds?: string[];
};

export type MessageSendTarget = MessageContextParams;

export type MessageSendResponse = {
  threadId: string | null;
  conversationId: string | null;
  message: MessageItem | null;
  replay: boolean;
};

export type UploadedMessageAttachment = {
  id: string;
  url: string | null;
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
};

export type NativeMessageUpload = {
  uri: string;
  name: string;
  type: string;
};

export type ResolvedConversationRoute = {
  threadId: string;
  conversationId: string;
  contextType: MessageContextType;
  context: MessageContextParams;
  orderId: string | null;
  customOrderId: string | null;
  inquiryType: string | null;
  targetUrl: string | null;
  orderDetailUrl: string | null;
};

export type ThreadOrderItem = {
  id: string;
  type: 'STANDARD_ORDER' | 'CUSTOM_ORDER';
  status: string;
  state: 'active' | 'closed' | 'cancelled' | 'disputed';
  title: string;
  totalAmount: number;
  currency: string | null;
  createdAt: string | null;
  orderDetailUrl: string | null;
  canView: boolean;
  canDispute: boolean;
  canCancel: boolean;
};
