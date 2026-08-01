import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

const MAX_NAME_LENGTH = 24;

interface EditNameModalProps {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function EditNameModal({
  visible,
  initialName,
  onClose,
  onSave,
}: EditNameModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setError(null);
      setSaving(false);
    }
  }, [visible, initialName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("profile.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed.slice(0, MAX_NAME_LENGTH));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("profile.editName")}</Text>
          <Text style={styles.subtitle}>{t("profile.editNameSubtitle")}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t("common.usernamePlaceholder")}
            placeholderTextColor="#64748b"
            maxLength={MAX_NAME_LENGTH}
            autoCapitalize="words"
            autoFocus
            editable={!saving}
            onSubmitEditing={handleSave}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Text style={styles.saveText}>{t("profile.save")}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#94a3b8",
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  error: {
    marginTop: 8,
    color: "#f87171",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  cancelBtn: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
  },
  cancelText: {
    color: "#94a3b8",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: "#fbbf24",
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: "#0f172a",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
});
