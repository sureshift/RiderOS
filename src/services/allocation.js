export function getOrderIntensity(openOrderCount) {
  if (openOrderCount >= 20) return { label: 'Very High', level: 4 };
  if (openOrderCount >= 10) return { label: 'High', level: 3 };
  if (openOrderCount >= 5) return { label: 'Normal', level: 2 };
  return { label: 'Low', level: 1 };
}

export function getGoalMetrics(goal, deliveredOrders, now = new Date(), allGoals = [goal]) {
  const target = Number(goal.target || 0);
  const saved = Number(goal.saved || 0);
  const deadline = goal.deadline ? new Date(`${goal.deadline}T23:59:59`) : null;
  const allocations = calculateGoalAllocations(allGoals, deliveredOrders, now);
  const goalAllocation = allocations.get(goal.id) || { total: 0, today: 0 };
  const progress = Math.min(target, saved + goalAllocation.total);
  const remaining = Math.max(0, target - progress);
  const todayEarnings = Math.min(goalAllocation.today, remaining + goalAllocation.today);
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

function calculateGoalAllocations(goals, deliveredOrders, now) {
  const balances = new Map((goals ?? []).map(goal => [goal.id, Number(goal.saved || 0)]));
  const totals = new Map((goals ?? []).map(goal => [goal.id, { total: 0, today: 0 }]));
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const orders = [...(deliveredOrders ?? [])].sort((a, b) => {
    return new Date(a.delivered_at || a.created_at) - new Date(b.delivered_at || b.created_at);
  });

  for (const order of orders) {
    const amount = Math.max(0, Number(order.earning || 0));
    if (!amount) continue;
    const deliveredAt = new Date(order.delivered_at || order.created_at);
    const candidates = (goals ?? [])
      .filter(goal => {
        const goalStart = new Date(goal.created_at || deliveredAt.toISOString());
        const goalDeadline = goal.deadline ? new Date(`${goal.deadline}T23:59:59`) : null;
        const remaining = Number(goal.target || 0) - (balances.get(goal.id) || 0);
        return deliveredAt >= goalStart && (!goalDeadline || deliveredAt <= goalDeadline) && remaining > 0;
      })
      .map(goal => {
        const goalDeadline = goal.deadline ? new Date(`${goal.deadline}T23:59:59`) : null;
        const daysLeft = goalDeadline
          ? Math.max(1, Math.ceil((goalDeadline.getTime() - deliveredAt.getTime()) / 86400000))
          : 3650;
        const remaining = Math.max(0, Number(goal.target || 0) - (balances.get(goal.id) || 0));
        const fundingPressure = remaining / Math.max(1, Number(goal.target || 0));
        const deadlineUrgency = 1 / daysLeft;
        return { goal, remaining, score: deadlineUrgency * (0.7 + fundingPressure * 0.3) };
      });

    let unallocated = amount;
    let remainingCandidates = candidates;
    while (unallocated > 0.000001 && remainingCandidates.length) {
      const totalScore = remainingCandidates.reduce((sum, item) => sum + item.score, 0);
      if (!totalScore) break;
      let distributed = 0;
      const nextCandidates = [];
      for (const item of remainingCandidates) {
        const share = unallocated * (item.score / totalScore);
        const allocation = Math.min(item.remaining, share);
        if (allocation > 0) {
          balances.set(item.goal.id, (balances.get(item.goal.id) || 0) + allocation);
          const entry = totals.get(item.goal.id) || { total: 0, today: 0 };
          entry.total += allocation;
          if (deliveredAt >= todayStart && deliveredAt <= now) entry.today += allocation;
          totals.set(item.goal.id, entry);
          distributed += allocation;
        }
        if (allocation + 0.000001 < share) continue;
        nextCandidates.push({ ...item, remaining: item.remaining - allocation });
      }
      if (!distributed) break;
      unallocated -= distributed;
      remainingCandidates = nextCandidates.filter(item => item.remaining > 0.000001);
    }
  }

  return totals;
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
