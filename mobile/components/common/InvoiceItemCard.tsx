import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TOKENS } from '../../constants/tokens';
import { ProductImage } from './ProductImage';
import { CartItem, cartState } from '../data/cartState';
import { money } from '../../utils/money';

interface InvoiceItemCardProps {
  item: CartItem;
}

export const InvoiceItemCard: React.FC<InvoiceItemCardProps> = ({ item }) => {
  return (
    <View style={styles.itemCard}>
      <ProductImage icon={item.icon} recyclingKey={item.id} size={58} style={styles.itemIconBox} />
      <View style={styles.itemMainInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemQuantities}>
          {item.quantity} × Rs. {money(item.price)}
        </Text>
      </View>

      <View style={styles.itemRightRow}>
        <Text style={styles.itemTotal}>Rs. {money(item.price * item.quantity)}</Text>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.smallActionBtn}
            activeOpacity={0.7}
            onPress={() => cartState.updateQuantity(item.id, -1)}
          >
            <Feather name="minus" size={12} color={TOKENS.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.smallActionBtn}
            activeOpacity={0.7}
            onPress={() => cartState.updateQuantity(item.id, 1)}
          >
            <Feather name="plus" size={12} color={TOKENS.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.border,
    paddingRight: 16,
    paddingLeft: 3,
    paddingTop: 3,
    paddingBottom: 3,
    boxShadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.03)',
  },
  itemIconBox: {
    width: 58,
    height: 58,
    borderRadius: 10,
    marginRight: 12,
  },
  itemMainInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  itemQuantities: {
    fontSize: 12,
    color: TOKENS.muted,
    marginTop: 4,
  },
  itemRightRow: {
    alignItems: 'flex-end',
    gap: 6,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
