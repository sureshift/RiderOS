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
  const goalEarnings = (deliveredOrders ?? []).reduce((sum, order) => {
    const deliveredAt = new Date(order.delivered_at || order.created_at);
    return deliveredAt >= start && (!deadline || deliveredAt <= deadline) ? sum + Number(order.earning || 0) : sum;
  }, 0);
  const progress = Math.min(target, saved + goalEarnings);
  const remaining = Math.max(0, target - progress);
  const daysRemaining = deadline
    ? Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / 86400000))
    : 1;
  const elapsedDays = deadline
    ? Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000))
    : 1;
  const totalDays = Math.max(1, elapsedDays + daysRemaining);
  const expectedProgress = Math.min(target, target * elapsedDays / totalDays);
  const shortfall = Math.max(0, expectedProgress - progress);
  const adjustedRemaining = remaining + shortfall;
  const todayTarget = Math.ceil(adjustedRemaining / daysRemaining);
  const shiftEndHour = 22;
  const hoursRemaining = Math.max(1, shiftEndHour - now.getHours() - (now.getMinutes() / 60));
  const hourlyTarget = Math.ceil(todayTarget / hoursRemaining);

  return {
    id: goal.id,
    target,
    progress,
    remaining,
    todayTarget,
    hourlyTarget,
    shortfall,
    daysRemaining,
    hoursRemaining,
    behind: shortfall > 0
  };
}

export function rankOrders(orders, goals, deliveredOrders, now = new Date()) {
  const openOrders = orders ?? [];
  const activeGoals = (goals ?? []).filter(goal => Boolean(goal.active));
  const metrics = activeGoals.map(goal => getGoalMetrics(goal, deliveredOrders, now));
  const mostPressured = metrics
    .filter(metric => metric.remaining > 0)
    .sort((a, b) => b.hourlyTarget - a.hourlyTarget)[0] ?? null;
  const intensity = getOrderIntensity(openOrders.length);

  return openOrders
    .map((order, index) => {
      const earning = Math.max(0, Number(order.earning || 0));
      const distance = Math.max(0, Number(order.distance_km || 0));
      const efficiency = distance > 0 ? earning / distance : earning;
      const ageMinutes = Math.max(0, (now.getTime() - new Date(order.created_at).getTime()) / 60000);
      const ageScore = Math.min(20, ageMinutes / 10);
      const earningScore = Math.min(60, earning);
      const efficiencyScore = Math.min(25, efficiency * 2);
      const pressureScore = mostPressured
        ? Math.min(50, earning / Math.max(1, mostPressured.hourlyTarget) * 50)
        : 0;
      const intensityBonus = intensity.level >= 3 ? Math.min(15, earning / 10) : 0;
      const score = earningScore + efficiencyScore + ageScore + pressureScore + intensityBonus;

      return {
        ...order,
        allocationScore: score,
        allocationReason: mostPressured?.behind
          ? `Helps close today's ₹${mostPressured.shortfall.toLocaleString('en-IN')} shortfall`
          : 'Best available earning opportunity'
      };
    })
    .sort((a, b) => b.allocationScore - a.allocationScore || a.created_at.localeCompare(b.created_at))
    .map((order, index) => ({ ...order, allocationRank: index + 1 }));
}
