import { createContext, useContext } from 'react';
import type { BagSourceType, ProductBagStatus } from '@/src/api/StoreApi';

export type BagFlowProductInput = {
  id: string;
  name?: string;
  sourceType?: BagSourceType;
  sourceId?: string;
  selectedSize?: string | null;
  selectedColor?: string | null;
  quantity?: number;
};

type BagDefaultAction = ProductBagStatus['ui']['defaultAction'];

export type BagFlowContextValue = {
  openSelector: (product: BagFlowProductInput, status: ProductBagStatus) => void;
  openCustomFlow: (product: BagFlowProductInput, status: ProductBagStatus) => void;
  openFittings: (product: BagFlowProductInput, status: ProductBagStatus) => void;
  openStaleFittings: (product: BagFlowProductInput, status: ProductBagStatus) => void;
  openAuthPrompt: (
    product: BagFlowProductInput,
    action: BagDefaultAction,
    resume?: () => void | Promise<void>,
  ) => void;
  openExistingBag: (product: BagFlowProductInput, status: ProductBagStatus) => void;
  openMyBag: () => void;
  closeActiveFlow: () => void;
};

export const BagFlowContext = createContext<BagFlowContextValue | null>(null);

export function useBagFlow() {
  return useContext(BagFlowContext);
}
