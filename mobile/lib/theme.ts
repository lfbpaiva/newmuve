import { StyleSheet } from "react-native";

export const fonts = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
};

export const colors = {
  bg: "#09090d",
  surface: "#111117",
  surface2: "#17171f",
  surface3: "#20202a",
  line: "#262631",
  hairline: "rgba(255,255,255,0.07)",
  ink: "#f5f5f7",
  ink2: "#a3a3b0",
  ink3: "#7b7b88",
  accent: "#7c4de1",
  accentPressed: "#6a3dcc",
  accentBright: "#8b6bff",
  accentSoft: "rgba(139,107,255,0.14)",
  onAccent: "#ffffff",
  accentText: "#ac94ff",
  error: "#ff7a87",
  errorBg: "rgba(255,122,135,0.1)",
  success: "#6ee7a0",
  successBg: "rgba(110,231,160,0.1)",
  warning: "#f6c46b",
  warningBg: "rgba(246,196,107,0.1)",
  star: "#ffd166",
};

export const gradients = {
  brilho: ["rgba(124,77,225,0.22)", "rgba(124,77,225,0)"] as const,
  superficie: ["#16161e", "#111117"] as const,
};

const numeros = { fontVariant: ["tabular-nums" as const] };

export const type = StyleSheet.create({
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 38, letterSpacing: -1.2, color: colors.ink },
  headline: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 29, letterSpacing: -0.7, color: colors.ink },
  title: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: colors.ink },
  titleSmall: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.ink },
  bodySmall: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.ink2 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, letterSpacing: -0.1, color: colors.ink },
  labelSmall: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.7, textTransform: "uppercase", color: colors.ink3 },
  price: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 28, letterSpacing: -0.8, color: colors.ink, ...numeros },
  stat: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 44, letterSpacing: -1.6, color: colors.ink, ...numeros },
});

export const stackOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 16 },
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: colors.bg },
  animation: "slide_from_right",
} as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 };

export const motion = { rapido: 160, base: 260, lento: 420 };

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 120, gap: space.xl },
  section: { gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, padding: space.lg, gap: space.sm },
  cardRaised: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, padding: space.lg, gap: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  rule: { height: 1, backgroundColor: colors.hairline },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.sm, paddingHorizontal: 14, minHeight: 50, paddingVertical: 12, color: colors.ink, fontFamily: fonts.regular, fontSize: 16 },
  inputFocused: { borderColor: colors.accentBright, backgroundColor: colors.surface2 },
  inputError: { borderColor: colors.error },
  alertError: { backgroundColor: colors.errorBg, borderRadius: radius.sm, padding: space.md },
  alertSuccess: { backgroundColor: colors.successBg, borderRadius: radius.sm, padding: space.md },
  alertInfo: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: space.md },
  empty: { paddingVertical: space.xxl, gap: space.md },
});
