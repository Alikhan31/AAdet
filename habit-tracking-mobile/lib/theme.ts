export const colors = {
  background: "#F7F9FB",
  card: "#FFFFFF",
  foreground: "#181D26",
  primary: "#2EB87A",
  primaryFg: "#FFFFFF",
  muted: "#EEF1F4",
  mutedFg: "#6B7280",
  accent: "#F5A623",
  border: "#DDE3EA",
  secondary: "#E8ECF0",
  destructive: "#D93025",
  chart1: "#2EB87A",
  chart2: "#0BAAE0",
  chart3: "#F5A623",
  chart4: "#A855C8",
  chart5: "#D93025",
};

export const radius = { sm: 8, md: 10, lg: 12, xl: 16, full: 9999 };

export const card = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
};

export const banner = {
  backgroundColor: colors.primary,
  borderRadius: radius.lg,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 4,
};

export const avatarColors = [
  colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5,
];
