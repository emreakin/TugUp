import { StyleSheet } from "react-native";

import { theme, type } from "@/constants/theme";

/** Shared screen chrome — import & spread into local StyleSheets */
export const ui = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 2,
  },
  headerTitle: {
    ...type.screenTitle,
    flex: 1,
  },
  backBtn: {
    padding: 10,
  },
  backText: {
    ...type.back,
  },
  headerSpacer: {
    width: 48,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  cardRaised: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 20,
  },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    color: theme.text,
    fontSize: 18,
    fontFamily: theme.fonts.semiBold,
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnPrimary: {
    backgroundColor: theme.ember,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.emberDeep,
  },
  btnPrimaryText: {
    ...type.button,
  },
  btnSecondary: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnSecondaryText: {
    ...type.buttonSecondary,
  },
  btnGhost: {
    paddingVertical: 14,
    alignItems: "center",
  },
  btnGhostText: {
    ...type.buttonSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  emptyTitle: {
    ...type.sectionTitle,
    fontSize: 18,
  },
  emptyBody: {
    ...type.body,
    textAlign: "center",
    marginTop: 8,
  },
});
