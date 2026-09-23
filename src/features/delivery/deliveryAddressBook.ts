import type { SavedDeliveryAddress } from '@/src/api/ProfileApi';
import { isValidPhone, normalizePhoneToE164 } from '@/src/utils/phoneNumber';

/**
 * The shopper's saved delivery addresses — the same book web uses.
 *
 * The server stores one list per account and replaces it whole on save
 * (`PUT /users/me/delivery-addresses`), so every change here is "compute the
 * next list, send all of it". These helpers are the list maths, kept pure so
 * they can be tested without a device.
 */

/** The server keeps at most this many; the oldest drop off first. */
export const MAX_DELIVERY_ADDRESSES = 10;

export type DeliveryAddressDraft = {
  id?: string;
  customerName: string;
  contactEmail: string;
  phone: string;
  street: string;
  apartment: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export const emptyAddressDraft = (
  defaults?: Partial<Pick<DeliveryAddressDraft, 'customerName' | 'contactEmail' | 'phone' | 'country'>>,
): DeliveryAddressDraft => ({
  customerName: defaults?.customerName ?? '',
  contactEmail: defaults?.contactEmail ?? '',
  phone: defaults?.phone ?? '',
  street: '',
  apartment: '',
  city: '',
  state: '',
  postalCode: '',
  country: defaults?.country || 'Nigeria',
});

export const draftFromAddress = (address: SavedDeliveryAddress): DeliveryAddressDraft => ({
  id: address.id,
  customerName: displayNameOf(address),
  contactEmail: address.contactEmail,
  phone: address.phone,
  street: address.street,
  apartment: address.apartment,
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  country: address.country || 'Nigeria',
});

export const displayNameOf = (address: Pick<SavedDeliveryAddress, 'customerName' | 'firstName' | 'lastName'>) =>
  (address.customerName || [address.firstName, address.lastName].filter(Boolean).join(' ')).trim();

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export type DraftField = keyof Omit<DeliveryAddressDraft, 'id' | 'apartment' | 'postalCode'>;

/**
 * What stops this draft from being saved, per field. Mirrors what the server
 * keeps (name, street, city, state, phone) plus the email web also requires,
 * so an address never saves here and silently vanishes on the next read.
 */
export function validateAddressDraft(draft: DeliveryAddressDraft): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {};
  if (draft.customerName.trim().length < 3) errors.customerName = 'Enter the full name for delivery';
  if (!isValidEmail(draft.contactEmail)) errors.contactEmail = 'Enter a valid email';
  if (!isValidPhone(draft.phone.trim())) errors.phone = 'Enter a valid phone number';
  if (!draft.street.trim()) errors.street = 'Enter the street address';
  if (!draft.city.trim()) errors.city = 'Choose a city';
  if (!draft.state.trim()) errors.state = 'Choose a state';
  if (!draft.country.trim()) errors.country = 'Choose a country';
  return errors;
}

const newAddressId = () =>
  `addr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const sortNewestFirst = (addresses: SavedDeliveryAddress[]) =>
  [...addresses].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

/** The draft as a stored address, stamped now. */
export function toSavedAddress(draft: DeliveryAddressDraft, now = new Date()): SavedDeliveryAddress {
  const customerName = draft.customerName.trim().replace(/\s+/g, ' ');
  const [firstName = '', ...rest] = customerName.split(' ');
  return {
    id: draft.id || newAddressId(),
    firstName,
    lastName: rest.join(' '),
    customerName,
    contactEmail: draft.contactEmail.trim(),
    phone: normalizePhoneToE164(draft.phone) ?? draft.phone.trim(),
    street: draft.street.trim(),
    apartment: draft.apartment.trim(),
    city: draft.city.trim(),
    state: draft.state.trim(),
    postalCode: draft.postalCode.trim(),
    country: draft.country.trim() || 'Nigeria',
    updatedAt: now.toISOString(),
  };
}

/** Add or replace one address; the saved one becomes the newest. */
export function upsertAddress(
  book: SavedDeliveryAddress[],
  saved: SavedDeliveryAddress,
): SavedDeliveryAddress[] {
  const others = book.filter((entry) => entry.id !== saved.id);
  return sortNewestFirst([saved, ...others]).slice(0, MAX_DELIVERY_ADDRESSES);
}

export function removeAddress(book: SavedDeliveryAddress[], id: string): SavedDeliveryAddress[] {
  return book.filter((entry) => entry.id !== id);
}

/** One line for a card: street, area, state, country. */
export function formatAddressLine(address: Pick<SavedDeliveryAddress, 'street' | 'apartment' | 'city' | 'state' | 'country'>) {
  return [
    [address.street, address.apartment].filter(Boolean).join(', '),
    address.city,
    address.state,
    address.country,
  ]
    .filter(Boolean)
    .join(', ');
}
