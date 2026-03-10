import React from 'react';
import { StatusBar, SafeAreaView, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/theme';
import { AlertProvider } from './src/contexts/AlertContext';

export default function App() {
  return (
    <AlertProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <SafeAreaView style={styles.root}>
          <AppNavigator />
        </SafeAreaView>
      </NavigationContainer>
    </AlertProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
});
