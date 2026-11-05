import { useCallback, useEffect, useState } from "react";
import { countUnreadNotifications, subscribeToNotifications } from "../../shared/client/notifications.ts";
import { useRefreshOnFocus } from "./useRefreshOnFocus";

export function useUnreadNotifications(userId: string): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => void countUnreadNotifications().then(setCount, () => {}), []);
  useRefreshOnFocus(refresh);

  useEffect(() => {
    refresh();
    return subscribeToNotifications(userId, refresh);
  }, [userId, refresh]);

  return count;
}
