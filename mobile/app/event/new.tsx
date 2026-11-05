import { useRouter } from "expo-router";
import EventForm from "../../components/EventForm";
import { Screen } from "../../components/ui";
import { useMe } from "../../lib/useMe";

export default function NewEventScreen() {
  const router = useRouter();
  const me = useMe();
  return <Screen><EventForm event={null} local={me} onSaved={(id) => router.replace(`/event/${id}`)}/></Screen>;
}
