/**
 * Bottom tab navigator with custom View-based icons for a consistent,
 * native look across all tabs.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors, Radius } from '../theme';
import { useAlertContext } from '../contexts/AlertContext';

import DashboardScreen from '../screens/DashboardScreen';
import LiveCameraScreen from '../screens/LiveCamera';
import MembersScreen   from '../screens/MembersScreen';
import ActivityScreen  from '../screens/ActivityScreen';
import SettingsScreen  from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const S = 22;

function HomeIcon({ color }: { color: string }) {
  return (
    <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* Roof */}
      <View style={{
        width: 0, height: 0, position: 'absolute', top: 0,
        borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 9,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: color,
      }} />
      {/* Body */}
      <View style={{ width: 16, height: 11, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 20, height: 15, borderRadius: 4, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

function MembersIcon({ color }: { color: string }) {
  return (
    <View style={{ width: S, height: S, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {/* Left person */}
      <View style={{ alignItems: 'center', marginRight: -3 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        <View style={{ width: 11, height: 6, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: color, marginTop: 1 }} />
      </View>
      {/* Right person */}
      <View style={{ alignItems: 'center', marginLeft: -3 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        <View style={{ width: 11, height: 6, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: color, marginTop: 1 }} />
      </View>
    </View>
  );
}

function ActivityIcon({ color }: { color: string }) {
  return (
    <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        {/* Clock hands */}
        <View style={{ position: 'absolute', width: 2, height: 5, backgroundColor: color, borderRadius: 1, top: 3 }} />
        <View style={{ position: 'absolute', width: 4, height: 2, backgroundColor: color, borderRadius: 1, right: 3, top: 6 }} />
      </View>
    </View>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
      {/* Gear notches — top and bottom */}
      <View style={{ position: 'absolute', top: 0, width: 4, height: 3, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ position: 'absolute', bottom: 0, width: 4, height: 3, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ position: 'absolute', left: 0, width: 3, height: 4, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ position: 'absolute', right: 0, width: 3, height: 4, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

const ICON_MAP: Record<string, React.FC<{ color: string }>> = {
  Home: HomeIcon,
  Camera: CameraIcon,
  Members: MembersIcon,
  Activity: ActivityIcon,
  Settings: SettingsIcon,
};

function TabIcon({ name, focused, badge }: { name: string; focused: boolean; badge?: number }) {
  const Icon = ICON_MAP[name] || HomeIcon;
  const color = focused ? Colors.accent : Colors.textTertiary;

  return (
    <View style={styles.iconWrap}>
      <Icon color={color} />
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
    height: Platform.OS === 'ios' ? 84 : 68,
    paddingTop: 6,
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
