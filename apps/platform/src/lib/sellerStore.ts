'use client';
/**
 * sellerStore — carries the seller selection from the Sellers list to the
 * Seller detail / Seller feed screens. Zustand module store: both screens
 * read/write the same selectedSellerId without prop-drilling through the
 * shell. Row click in the list sets it, then onNavigate('contacts',
 * 'seller-detail') opens the tab that renders SellerDetailScreen.
 */
import { create } from 'zustand';

interface SellerStoreState {
  selectedSellerId: string | null;
  setSelectedSellerId: (id: string | null) => void;
}

export const useSellerStore = create<SellerStoreState>((set) => ({
  selectedSellerId: null,
  setSelectedSellerId: (id) => set({ selectedSellerId: id }),
}));
