import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates the next Monday at 8:00 AM (São Paulo timezone)
 * when prizes/spins can be delivered/claimed
 */
export function getNextMondayDeliveryTime(): Date {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const deliveryDate = new Date(now);
  deliveryDate.setHours(8, 0, 0, 0);

  // If today is Monday (1)
  if (currentDay === 1) {
    // If time hasn't reached 8:00 AM yet, delivery is today at 8:00 AM
    if (currentHour < 8 || (currentHour === 8 && currentMinute === 0)) {
      return deliveryDate;
    }
    // If time is past 8:00 AM, delivery is next Monday (in 7 days)
    deliveryDate.setDate(deliveryDate.getDate() + 7);
    return deliveryDate;
  }

  // Calculate days until next Monday
  const daysUntilMonday = (1 - currentDay + 7) % 7;
  deliveryDate.setDate(deliveryDate.getDate() + daysUntilMonday);
  return deliveryDate;
}
