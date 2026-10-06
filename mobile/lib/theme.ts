import { StyleSheet } from "react-native";

// Tema do Muve: editorial e esportivo. Preto quase puro, branco, um único
// acento (lima) para ação e destaque, tipografia display em caixa alta.
// A logo roxa aparece em branco sobre este fundo.

export const colors = {
  bg: "#0a0a0c",
  surface: "#111114",
  surface2: "#19191e",
  surface3: "#222228",
  line: "#2a2a31",
  ink: "#ffffff",
  ink2: "#b9b9c2",
  ink3: "#7d7d88",
  accent: "#d4ff3f",
  onAccent: "#0a0a0c",
  accentDim: "#2e3a0f",
  error: "#ff6b7a",
  errorBg: "#2a1217",
  success: "#8de08b",
  successBg: "#13261a",
  star: "#ffd166",
};

// Display: Archivo Black em caixa alta, bem justo. Texto: Manrope.
export const type = StyleSheet.create({
  display: { fontFamily: "Archivo_900Black", fontSize: 40, lineHeight: 40, letterSpacing: -1.2, textTransform: "uppercase", color: colors.ink },
  headline: { fontFamily: "Archivo_900Black", fontSize: 26, lineHeight: 27, letterSpacing: -0.6, textTransform: "uppercase", color: colors.ink },
  title: { fontFamily: "Archivo_800ExtraBold", fontSize: 18, lineHeight: 22, letterSpacing: -0.2, textTransform: "uppercase", color: colors.ink },
  titleSmall: { fontFamily: "Manrope_800ExtraBold", fontSize: 16, lineHeight: 21, color: colors.ink },
  body: { fontFamily: "Manrope_500Medium", fontSize: 15, lineHeight: 22, color: colors.ink },
  bodySmall: { fontFamily: "Manrope_500Medium", fontSize: 13, lineHeight: 19, color: colors.ink2 },
  label: { fontFamily: "Manrope_800ExtraBold", fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: "uppercase", color: colors.ink },
  labelSmall: { fontFamily: "Manrope_800ExtraBold", fontSize: 10, lineHeight: 13, letterSpacing: 1.4, textTransform: "uppercase", color: colors.ink3 },
  price: { fontFamily: "Archivo_900Black", fontSize: 26, lineHeight: 28, letterSpacing: -0.6, color: colors.ink },
  stat: { fontFamily: "Archivo_900Black", fontSize: 44, lineHeight: 44, letterSpacing: -1.5, color: colors.ink },
});

export const radius = { xs: 2, sm: 4, md: 8, lg: 12, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 };

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 110, gap: space.xl },
  section: { gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  // Blocos editoriais: fundo um tom acima, cantos quase retos.
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  cardRaised: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  // Linhas finas separam itens; nada de caixas dentro de caixas.
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  rule: { height: 1, backgroundColor: colors.ink, opacity: 0.9 },
  input: { backgroundColor: "transparent", borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 0, minHeight: 48, paddingVertical: 12, color: colors.ink, fontFamily: "Manrope_500Medium", fontSize: 16 },
  inputFocused: { borderBottomColor: colors.accent },
  inputError: { borderBottomColor: colors.error },
  alertError: { backgroundColor: colors.errorBg, borderRadius: radius.sm, padding: space.md },
  alertSuccess: { backgroundColor: colors.successBg, borderRadius: radius.sm, padding: space.md },
  alertInfo: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: space.md },
  empty: { paddingVertical: space.xxl, gap: space.md },
});
