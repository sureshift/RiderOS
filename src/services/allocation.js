export function getOrderIntensity(openOrderCount) {
  if (openOrderCount >= 20) return { label: 'Very High', level: 4 };
  if (openOrderCount >= 10) return { label: 'High', level: 3 };
  if (openOrderCount >= 5) return { label: 'Normal', level: 2 };
  return { label: 'Low', level: 1 };
}

export function getGoalMetrics(goal, deliveredOrders, now = new Date()) {
  const target = Number(goal.target || 0);
  const saved = Number(goal.saved || 0);
  const start = new Date(goal.created_at || now.toISOString());
  const deadline = goal.deadline ? new Date(`${goal.deadline}T23:59:59`) : null;
  const goalOrders = (deliveredOrders ?? []).filter(order => {
    const deliveredAt = new Date(order.delivered_at || order.created_at);
    return deliveredAt >= start && (!deadline || deliveredAt <= deadline);
  });
  const goalEarnings = goalOrders.reduce((sum, order) => sum + Number(order.earning || 0), 0);
  const progress = Math.min(target, saved + goalEarnings);
  const remaining = Math.max(0, target - progress);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEarnings = goalOrders.reduce((sum, order) => {
    const deliveredAt = new Date(order.delivered_at || order.created_at);
    return deliveredAt >= todayStart && deliveredAt <= now ? sum + Number(order.earning || 0) : sum;
  }, 0);
  const daysRemaining = deadline
    ? Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / 86400000))
    : 1;
  const requiredPerDay = Math.ceil(remaining / daysRemaining);
  const todayRemaining = Math.max(0, Math.min(remaining, requiredPerDay) - todayEarnings);

  return {
    id: goal.id,
    target,
    progress,
    remaining,
    todayEarnings,
    requiredPerDay,
    todayTarget: Math.min(remaining, requiredPerDay),
    todayRemaining,
    daysRemaining,
    behind: todayRemaining > 0
  };
}

// Orders are manually entered only after the rider has accepted them.
// Never reorder the rider's work queue in the single-rider workflow.
export function rankOrders(orders) {
  return (orders ?? []).map((order, index) => ({
    ...order,
    allocationRank: index + 1,
    allocationScore: 0,
    allocationReason: 'Manually accepted order'
  }));
}
