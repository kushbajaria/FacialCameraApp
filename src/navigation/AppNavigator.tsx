import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme';
import { useAlertContext } from '../contexts/AlertContext';

import DashboardScreen from '../screens/DashboardScreen';
import LiveCameraScreen from '../screens/LiveCamera';
import MembersScreen   from '../screens/MembersScreen';
import ActivityScreen  from '../screens/ActivityScreen';
import SettingsScreen  from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// Simple SVG-free tab icons using Unicode / emoji
const ICONS: Record<string, string> = {
  Dashboard: '🏡',
  Camera:    '📹',
  Members:   '👤',
  Activity:  '🧭',
  Settings:  '⚙',
};

function TabIcon({ name, focused, badge }: { name: string; focused: boolean; badge?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ position: 'relative' }}>
        <Text style={{ fontSize: 20, color: focused ? Colors.accent : Colors.textDim }}>
          {ICONS[name]}
        </Text>
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const { unreadCount } = useAlertContext();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor:   Colors.accent,
        tabBarInactiveTintColor: Colors.textDim,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <TabIcon 
            name={route.name} 
            focused={focused} 
            badge={route.name === 'Activity' ? unreadCount : undefined}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Camera"    component={LiveCameraScreen} />
      <Tab.Screen name="Members"   component={MembersScreen}   />
      <Tab.Screen name="Activity"  component={ActivityScreen}  />
      <Tab.Screen name="Settings"  component={SettingsScreen}  />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar:    { backgroundColor: Colors.surface, borderTopColor: Colors.border, borderTopWidth: 1, height: 72, paddingBottom: 10, paddingTop: 8 },
  tabLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 },
  badge:     { position: 'absolute', top: -4, right: -8, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surface },
  badgeText: { fontSize: 8, color: '#fff', fontWeight: '800' },
});
