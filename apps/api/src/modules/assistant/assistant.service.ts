import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { getInventoryHealth } from '../inventory/inventory.service';
import { approveRecommendation } from '../replenishment/replenishment.service';
import {
  getDashboard,
  getInventoryRisks,
  getProductByName,
  getPurchaseOrders,
  getReplenishmentRecommendations,
  mostCriticalWarehouse,
} from './assistant.tools';

type ToolResult = {
  tool: string;
  data: unknown;
};

type Confirmation = {
  id: string;
  organizationId: string;
  userId: string;
  action: 'approve_recommendations';
  ids: string[];
  expiresAt: number;
};

const confirmations = new Map<string, Confirmation>();

function numbersIn(text: string): string[] {
  return text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? [];
}

function isGrounded(reply: string, payload: unknown): boolean {
  const allowed = new Set(numbersIn(JSON.stringify(payload)));
  return numbersIn(reply).every((value) => allowed.has(value) || allowed.has(String(Number(value))));
}

async function narrate(question: string, payload: unknown, fallback: string): Promise<string> {
  if (!env.AI_API_KEY) {
    return fallback;
  }
  try {
    const response = await fetch(`${env.AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You explain inventory operations using only the JSON facts provided. Do not invent quantities, risks, or orders. If a number is not in the JSON, do not mention it. Keep the answer under 160 words.',
          },
          {
            role: 'user',
            content: JSON.stringify({ question, facts: payload }),
          },
        ],
      }),
    });
    if (!response.ok) {
      return fallback;
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content || !isGrounded(content, payload)) {
      logger.warn('Assistant reply was not grounded in tool data; using deterministic summary');
      return fallback;
    }
    return content;
  } catch (error) {
    logger.warn({ err: error }, 'Assistant model call failed');
    return fallback;
  }
}

function formatRecommendations(rows: Awaited<ReturnType<typeof getReplenishmentRecommendations>>): string {
  if (rows.length === 0) {
    return 'There are no pending replenishment recommendations. Generate recommendations from the latest forecast before ordering.';
  }
  const lines = rows.slice(0, 8).map(
    (row) =>
      `${row.sku} at ${row.city}: order ${row.recommendedQty} (stock ${row.currentStock}, horizon forecast ${row.forecastDemand}, safety stock ${row.safetyStock}, MOQ ${row.moq}, risk ${row.riskLevel}).`,
  );
  return `I found ${rows.length} pending recommendations. ${lines.join(' ')} I will not approve them unless you confirm.`;
}

export async function chat(organizationId: string, userId: string, message: string) {
  const text = message.trim();
  const tools: ToolResult[] = [];

  if (/\bapprove all\b/i.test(text)) {
    const recommendations = await getReplenishmentRecommendations(organizationId);
    tools.push({ tool: 'getReplenishmentRecommendations', data: recommendations });
    if (recommendations.length === 0) {
      return {
        reply: 'There are no pending recommendations to approve.',
        toolsUsed: tools.map((tool) => tool.tool),
        confirmation: null,
      };
    }
    const confirmation: Confirmation = {
      id: randomUUID(),
      organizationId,
      userId,
      action: 'approve_recommendations',
      ids: recommendations.map((row) => row.id),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    confirmations.set(confirmation.id, confirmation);
    return {
      reply: `I found ${recommendations.length} recommendations requiring attention. Approving them will create purchase orders. Confirm if you want me to approve all of them.`,
      toolsUsed: tools.map((tool) => tool.tool),
      confirmation: {
        id: confirmation.id,
        action: confirmation.action,
        count: recommendations.length,
      },
    };
  }

  if (/what should i order|order today/i.test(text)) {
    const recommendations = await getReplenishmentRecommendations(organizationId);
    tools.push({ tool: 'getReplenishmentRecommendations', data: { count: recommendations.length, recommendations } });
    const fallback = formatRecommendations(recommendations);
    return {
      reply: await narrate(text, tools[0]?.data, fallback),
      toolsUsed: ['getReplenishmentRecommendations'],
      confirmation: null,
    };
  }

  if (/pending purchase|pending po|purchase orders/i.test(text)) {
    const orders = await getPurchaseOrders(organizationId, 'PENDING_APPROVAL');
    tools.push({ tool: 'getPurchaseOrders', data: { count: orders.length, orders } });
    const fallback =
      orders.length === 0
        ? 'There are no purchase orders waiting for approval.'
        : `There are ${orders.length} purchase orders pending approval: ${orders
            .map((order) => `${order.poNumber} from ${order.supplier} (${order.quantity} units)`)
            .join('; ')}.`;
    return {
      reply: await narrate(text, tools[0]?.data, fallback),
      toolsUsed: ['getPurchaseOrders'],
      confirmation: null,
    };
  }

  if (/which warehouse/i.test(text)) {
    const risks = await getInventoryRisks(organizationId);
    const ranking = mostCriticalWarehouse(risks);
    const top = ranking[0];
    tools.push({ tool: 'getInventoryRisks', data: { warehouses: ranking, count: ranking.length } });
    const fallback = top
      ? `${top.warehouse} in ${top.city} has the most critical inventory: ${top.critical} critical and ${top.high} high-risk positions.`
      : 'No warehouse risk data is available yet.';
    return {
      reply: await narrate(text, tools[0]?.data, fallback),
      toolsUsed: ['getInventoryRisks'],
      confirmation: null,
    };
  }

  if (/why is/i.test(text)) {
    const name = text.replace(/.*why is/i, '').replace(/\?|marked.*|high risk.*/i, '').trim();
    const products = await getProductByName(organizationId, name || text);
    const risks = await getInventoryRisks(organizationId);
    const matches = risks.filter((row) =>
      products.some((product) => product.sku === row.sku) ||
      row.productName.toLowerCase().includes((name || '').toLowerCase()) ||
      row.sku.toLowerCase().includes((name || '').toLowerCase()),
    );
    const focus = matches.slice(0, 3);
    tools.push({ tool: 'getProduct', data: products });
    tools.push({ tool: 'getInventoryRisks', data: { matches: focus, count: focus.length } });
    const fallback =
      focus.length === 0
        ? `I could not find a product matching "${name}" in this organization.`
        : focus
            .map(
              (row) =>
                `${row.productName} at ${row.city} is ${row.riskLevel}. On-hand stock is ${row.currentStock}, average daily demand is ${row.averageDailyDemand}, days of cover is ${row.daysOfInventory ?? 'unbounded'}, lead time is ${row.leadTimeDays} days, and stockout probability is ${row.stockoutProbability}.`,
            )
            .join(' ');
    return {
      reply: await narrate(text, { products, matches: focus }, fallback),
      toolsUsed: ['getProduct', 'getInventoryRisks'],
      confirmation: null,
    };
  }

  if (/stockout|at risk/i.test(text)) {
    const risks = (await getInventoryRisks(organizationId)).filter(
      (row) => row.riskLevel === 'HIGH' || row.riskLevel === 'CRITICAL',
    );
    tools.push({ tool: 'getInventoryRisks', data: { count: risks.length, risks: risks.slice(0, 8) } });
    const fallback =
      risks.length === 0
        ? 'No high or critical stockout risks are open right now.'
        : `${risks.length} positions are high or critical risk. ${risks
            .slice(0, 6)
            .map(
              (row) =>
                `${row.sku} in ${row.city} is ${row.riskLevel} with ${row.currentStock} on hand and ${row.daysOfInventory ?? 'no'} days of cover`,
            )
            .join('; ')}.`;
    return {
      reply: await narrate(text, tools[0]?.data, fallback),
      toolsUsed: ['getInventoryRisks'],
      confirmation: null,
    };
  }

  const summary = await getDashboard(organizationId);
  tools.push({ tool: 'getDashboardSummary', data: summary });
  const fallback = `Today's inventory situation: inventory value ${summary.inventoryValue}, 30-day revenue ${summary.revenue30Days}, ${summary.criticalStockCount} critical positions, ${summary.stockoutCount} stockout risks, ${summary.pendingRecommendations} pending recommendations, and ${summary.pendingPurchaseOrders} purchase orders awaiting approval.`;
  return {
    reply: await narrate(text, summary, fallback),
    toolsUsed: ['getDashboardSummary'],
    confirmation: null,
  };
}

export async function confirmAction(
  organizationId: string,
  userId: string,
  confirmationId: string,
  confirm: boolean,
) {
  const pending = confirmations.get(confirmationId);
  if (!pending || pending.organizationId !== organizationId || pending.userId !== userId) {
    return { executed: false, reply: 'That confirmation is no longer valid.' };
  }
  if (pending.expiresAt < Date.now()) {
    confirmations.delete(confirmationId);
    return { executed: false, reply: 'That confirmation expired. Ask again if you still want to approve.' };
  }
  confirmations.delete(confirmationId);
  if (!confirm) {
    return { executed: false, reply: 'Cancelled. No recommendations were approved.' };
  }
  const results: Array<{ id: string; poNumber?: string; error?: string }> = [];
  for (const id of pending.ids.slice(0, 25)) {
    try {
      const approved = await approveRecommendation(organizationId, userId, id, {});
      results.push({ id, poNumber: approved.poNumber });
    } catch (error) {
      results.push({ id, error: error instanceof Error ? error.message : 'Approval failed' });
    }
  }
  const created = results.filter((row) => row.poNumber).length;
  return {
    executed: true,
    reply: `Approved ${created} of ${results.length} recommendations and created the matching purchase orders.`,
    results,
  };
}

export async function explainTarget(organizationId: string, target: 'recommendation' | 'inventory', id: string) {
  if (target === 'recommendation') {
    const row = await prisma.replenishmentRecommendation.findFirst({
      where: { id, organizationId },
      include: { product: { select: { sku: true, name: true } }, warehouse: { select: { city: true, name: true } } },
    });
    if (!row) {
      return null;
    }
    const facts = {
      sku: row.product.sku,
      productName: row.product.name,
      warehouse: row.warehouse.name,
      city: row.warehouse.city,
      currentStock: row.currentStock,
      forecastDemand: Number(row.forecastDemand),
      safetyStock: row.safetyStock,
      leadTimeDays: row.leadTimeDays,
      moq: row.moq,
      rawOrderQuantity: row.rawOrderQuantity,
      recommendedQty: row.recommendedQty,
      riskLevel: row.riskLevel,
      stockoutProbability: Number(row.stockoutProbability),
    };
    const fallback = `${facts.productName} at ${facts.city} is ${facts.riskLevel} risk. Current stock is ${facts.currentStock}. The planning-horizon forecast is ${facts.forecastDemand}, safety stock is ${facts.safetyStock}, and lead time is ${facts.leadTimeDays} days. Required replenishment before MOQ rounding is ${facts.rawOrderQuantity}. The supplier MOQ is ${facts.moq}, so the recommended order is ${facts.recommendedQty}. These figures come from the deterministic replenishment calculation and were not adjusted.`;
    return {
      facts,
      explanation: await narrate('Why is this recommendation sized this way?', facts, fallback),
      source: env.AI_API_KEY ? 'model-or-template' : 'template',
    };
  }

  const inventory = await prisma.inventory.findFirst({
    where: { id, organizationId },
    select: { productId: true, warehouseId: true },
  });
  if (!inventory) {
    return null;
  }
  const risks = await getInventoryHealth(organizationId, {
    productId: inventory.productId,
    warehouseId: inventory.warehouseId,
  });
  const row = risks[0];
  if (!row) {
    return null;
  }
  const facts = {
    sku: row.sku,
    productName: row.productName,
    city: row.city,
    currentStock: row.quantity,
    availableStock: row.availableQty,
    averageDailyDemand: row.averageDailyDemand,
    daysOfInventory: row.daysOfInventory,
    leadTimeDays: row.leadTimeDays,
    leadTimeDemand: row.forecastDemand,
    stockoutProbability: row.stockoutProbability,
    riskLevel: row.riskLevel,
  };
  const fallback = `${facts.productName} in ${facts.city} is ${facts.riskLevel}. Available stock is ${facts.availableStock} against average daily demand of ${facts.averageDailyDemand}, which is ${facts.daysOfInventory ?? 'more than the measured'} days of cover. Lead time is ${facts.leadTimeDays} days and expected demand over that lead time is ${facts.leadTimeDemand}. Stockout probability is ${facts.stockoutProbability}.`;
  return {
    facts,
    explanation: await narrate('Why is this SKU at risk?', facts, fallback),
    source: env.AI_API_KEY ? 'model-or-template' : 'template',
  };
}
