import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TOKENS } from '../../../../constants/tokens';
import { useGetOrderItems } from '../../../../hooks/useOrders';
import { styles } from '../styles';
import { money } from '../../../../utils/money';

export const OrderItemsList: React.FC<{ orderId: string }> = ({ orderId }) => {
  const { data: items = [], isLoading } = useGetOrderItems(orderId);

  if (isLoading) {
    return <ActivityIndicator size="small" color={TOKENS.primary} style={{ marginVertical: 8 }} />;
  }

  return (
    <>
      {items.map((item: any) => (
        <View key={item.id} style={styles.expandedItemRow}>
          <Text style={styles.expandedItemName}>{item.name}</Text>
          <Text style={styles.expandedItemQty}>
            {item.quantity} x Rs. {money(item.price)}
          </Text>
          <Text style={styles.expandedItemSubtotal}>Rs. {money(item.quantity * item.price)}</Text>
        </View>
      ))}
    </>
  );
};

export const OrderCardHeaderRight: React.FC<{ orderId: string; isExpanded: boolean }> = ({
  orderId,
  isExpanded,
}) => {
  const { data: items = [] } = useGetOrderItems(orderId);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Text style={styles.historyItemCount}>{items.length} items</Text>
      <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={TOKENS.muted} />
    </View>
  );
};
