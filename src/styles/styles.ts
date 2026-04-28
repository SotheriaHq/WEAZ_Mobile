import { StyleSheet } from 'react-native';
import { tokens } from './tokens';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.colors.dark,
    padding: tokens.spacing.lg,
  },
  title: {
    color: tokens.colors.lightGray,
    marginBottom: tokens.spacing.sm,
  },
  body: {
    color: tokens.colors.lightGray,
  },
});
