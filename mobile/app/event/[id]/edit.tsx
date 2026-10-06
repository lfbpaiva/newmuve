import { useLocalSearchParams, useRouter } from "expo-router";
import { fetchEvent, fetchEventAddress } from "../../../../shared/client/events.ts";
import { useAsync } from "../../../../shared/client/useAsync.ts";
import EventForm from "../../../components/EventForm";
import { ErrorState, Loading, Screen } from "../../../components/ui";

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const existing = useAsync(`event-form:${id}`, async () => {
    const [event, endereco] = await Promise.all([fetchEvent(id), fetchEventAddress(id)]);
    return { ...event, endereco };
  });

  if (existing.error) return <Screen><ErrorState message={existing.error} onRetry={existing.reload}/></Screen>;
  if (!existing.data) return <Screen><Loading/></Screen>;
  return <Screen><EventForm event={existing.data} onSaved={() => router.back()}/></Screen>;
}
