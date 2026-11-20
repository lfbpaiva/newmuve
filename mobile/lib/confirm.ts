import { Alert, Platform } from "react-native";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function avisar(title: string, message: string, onClose: () => void) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    onClose();
    return;
  }
  Alert.alert(title, message, [{ text: "Entendi", onPress: onClose }], { cancelable: false });
}

export function confirmAction({ title, message, confirmLabel = "Confirmar", cancelLabel = "Voltar", destructive = true, onConfirm }: ConfirmOptions) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
