/**
 * Bottom tab navigator with Ionicons and unread badge on Activity tab.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Radius } from '../theme';
import { useAlertContext } from '../contexts/AlertContext';

import DashboardScreen from '../screens/DashboardScreen';
import LiveCameraScreen from '../screens/LiveCamera';
import MembersScreen   from '../screens/MembersScreen';
import ActivityScreen  from '../screens/ActivityScreen';
import SettingsScreen  from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const ICON_MAP: Record<string, { focused: string; outline: string }> = {
  Home:     { focused: 'home',          outline: 'home-outline' },
  Camera:   { focused: 'videocam',      outline: 'videocam-outline' },
  Members:  { focused: 'people',        outline: 'people-outline' },
  Activity: { focused: 'time',          outline: 'time-outline' },
  Settings: { focused: 'settings',      outline: 'settings-outline' },
};

function TabIcon({ name, focused, badge }: { name: string; focused: boolean; badge?: number }) {
  const icons = ICON_MAP[name] || ICON_MAP.Home;
  const color = focused ? Colors.accent : Colors.textTertiary;

  return (
    <View style={styles.iconWrap}>
      <Ionicons name={focused ? icons.focused : icons.outline} size={22} color={color} />
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
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
        tabBarInactiveTintColor: Colors.textTertiary,
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
      <Tab.Screen name="Home"     component={DashboardScreen} />
      <Tab.Screen name="Camera"   component={LiveCameraScreen} />
      <Tab.Screen name="Members"  component={MembersScreen}   />
      <Tab.Screen name="Activity" component={ActivityScreen}  />
      <Tab.Screen name="Settings" component={SettingsScreen}  />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 26,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '800',
  },
});
