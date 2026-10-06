import { useRouter } from "expo-router";
import EventForm from "../../components/EventForm";
import { Screen } from "../../components/ui";

export default function NewEventScreen() {
  const router = useRouter();
  return <Screen><EventForm event={null} onSaved={(id) => router.replace(`/event/${id}`)}/></Screen>;
}
