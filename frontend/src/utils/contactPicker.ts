// Wrapper around the Contact Picker API (navigator.contacts.select).
//
// Privacy: this API never exposes the address book. The OS shows its own
// picker, and the page only receives the contacts the user explicitly ticks.
// It must be triggered by a user tap and only works in a secure context.
// Support today: Chrome / Edge / Samsung Internet on Android. Not available on
// desktop browsers, Firefox, or iOS Safari (only behind an experimental flag).
import { fromPicker, type PickedContact, type RawContact } from "./contactImport";

interface ContactsManagerLike {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<PickedContact[]>;
  getProperties?: () => Promise<string[]>;
}

type NavLike = { contacts?: ContactsManagerLike };

export type PickerSupport =
  | { supported: true }
  | { supported: false; reason: "insecure" | "unsupported" };

export function contactPickerSupport(
  nav: unknown = typeof navigator !== "undefined" ? navigator : undefined,
  secure: boolean = typeof window !== "undefined" ? window.isSecureContext : false
): PickerSupport {
  const n = nav as NavLike | undefined;
  if (!n?.contacts || typeof n.contacts.select !== "function")
    return { supported: false, reason: "unsupported" };
  if (!secure) return { supported: false, reason: "insecure" };
  return { supported: true };
}

export class PickerError extends Error {}

/** Open the native picker (multi-select). Returns [] if the user cancels. */
export async function pickContacts(
  nav: unknown = typeof navigator !== "undefined" ? navigator : undefined
): Promise<RawContact[]> {
  const n = nav as NavLike | undefined;
  if (!n?.contacts || typeof n.contacts.select !== "function")
    throw new PickerError("Contact picker isn't available in this browser.");
  let props = ["name", "tel"];
  try {
    const available = (await n.contacts.getProperties?.()) ?? props;
    if (!available.includes("tel"))
      throw new PickerError("This device's contact picker can't share phone numbers. Use a file import instead.");
    props = props.filter((p) => available.includes(p));
  } catch (e) {
    if (e instanceof PickerError) throw e;
    // getProperties failing isn't fatal — try the picker anyway.
  }
  try {
    const picked = await n.contacts.select(props, { multiple: true });
    return fromPicker(picked ?? []);
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "AbortError") return []; // user closed the picker
    if (name === "SecurityError" || name === "NotAllowedError")
      throw new PickerError("The browser blocked the contact picker. Tap the button again, or use a file import.");
    if (name === "InvalidStateError")
      throw new PickerError("The contact picker is already open.");
    throw new PickerError("Couldn't open your contacts. Try again, or use a file import.");
  }
}
