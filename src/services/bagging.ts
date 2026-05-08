import { MobileStoreApi, type BagCount, type BagSourceType, type ProductBagStatus } from '@/src/api/StoreApi';

export type AddStandardBagPayload = {
  productId: string;
  size?: string;
  color?: string;
  qty?: number;
};

export type AddCustomOrderBagPayload = {
  checkoutIntentId: string;
  configurationId: string;
  configurationVersionId?: string;
  measurementValues: Record<string, number>;
  shippingAddress: Record<string, unknown>;
  contactInfo: Record<string, unknown>;
  customerName: string;
  noDirectMatchAcknowledged?: boolean;
};

export async function prepareBag(productId: string): Promise<ProductBagStatus> {
  return MobileStoreApi.getProductBagStatus(productId);
}

export async function prepareSourceBag(sourceType: BagSourceType, sourceId: string): Promise<ProductBagStatus> {
  return MobileStoreApi.getSourceBagStatus(sourceType, sourceId);
}

export async function getBagCount(): Promise<BagCount> {
  return MobileStoreApi.getBagCount();
}

export async function addStandard({ productId, size, color, qty = 1 }: AddStandardBagPayload) {
  return MobileStoreApi.addToCart({
    productId,
    quantity: qty,
    selectedSize: size,
    selectedColor: color,
  });
}

export async function addCustomOrder(config: AddCustomOrderBagPayload) {
  return MobileStoreApi.addCustomOrderToBag(config);
}

export const baggingService = {
  prepareBag,
  prepareSourceBag,
  getBagCount,
  addStandard,
  addCustomOrder,
};

export default baggingService;
