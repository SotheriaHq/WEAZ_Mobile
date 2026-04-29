export type {
  CartState,
  CustomBagState,
  ProductBagStatus,
} from '@/src/api/StoreApi';

export type MobileBagMutationState = {
  standardCount: number;
  customCount: number;
  combinedCount: number;
};
