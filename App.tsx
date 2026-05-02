import React from 'react';
import { StatusBar, SafeAreaView, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import Toast, { BaseToast, ErrorToast, BaseToastProps } from 'react-native-toast-message';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors, Radius } from './src/theme';
import { AlertProvider } from './src/contexts/AlertContext';

/*
 * Custom toast styles to match the dark theme.
 */
const toastConfig = {
  success: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: Colors.green, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderLeftWidth: 4 }}
      contentContainerStyle={{ paddingHorizontal: 16 }}
      text1Style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}
      text2Style={{ fontSize: 12, color: Colors.textSecondary }}
    />
  ),
  error: (props: BaseToastProps) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: Colors.red, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderLeftWidth: 4 }}
      contentContainerStyle={{ paddingHorizontal: 16 }}
      text1Style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}
      text2Style={{ fontSize: 12, color: Colors.textSecondary }}
    />
  ),
};

export default function App() {
  return (
    <AlertProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <SafeAreaView style={styles.root}>
          <AppNavigator />
        </SafeAreaView>
        <Toast config={toastConfig} topOffset={60} />
      </NavigationContainer>
    </AlertProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
});
