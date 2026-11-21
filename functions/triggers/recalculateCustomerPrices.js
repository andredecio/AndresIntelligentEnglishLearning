import { getApps, initializeApp } from "firebase-admin/app";
import { REGION } from "../config.js"; 
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

// ONLY initialize the app if it hasn't been initialized by another file
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

// Helper function to round to 10 decimal places in pure JavaScript
const roundTo10Decimals = (num) => {
  return Number(num.toFixed(10));
};

/**
 * Triggered whenever the 'Pricing/CostAndProfit' document is updated.
 */
export const recalculateCustomerPrices = onDocumentUpdated({
  document: "Pricing/CostAndProfit",
  region: REGION
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  
  // ADD THIS TEMPORARY DEBUG LOG:
  console.log("DEBUG - Document data after update:", JSON.stringify(after));

  if (!after) return;

  // 1. Check if any base prices (including cached), or calculation factors changed
  const hasChanged = 
    before?.applicationGoogleTokenPrice !== after.applicationGoogleTokenPrice ||
    before?.inputGoogleTokenPrice !== after.inputGoogleTokenPrice ||
    before?.cachedInputGoogleTokenPrice !== after.cachedInputGoogleTokenPrice ||
    before?.outputGoogleTokenPrice !== after.outputGoogleTokenPrice ||
    before?.TopUpCostFactor !== after.TopUpCostFactor ||
    before?.MarkUpFactor !== after.MarkUpFactor;

  if (!hasChanged) return;

  // 2. Perform calculations
  const topUp = after.TopUpCostFactor ?? 1.1;
  const markup = after.MarkUpFactor ?? 1.5;

  const applicationTokenPriceToCustomer = roundTo10Decimals((after.applicationGoogleTokenPrice ?? 0) * topUp * markup);
  const inputTokenPriceToCustomer = roundTo10Decimals((after.inputGoogleTokenPrice ?? 0) * topUp * markup);
  const cachedInputTokenPriceToCustomer = roundTo10Decimals((after.cachedInputGoogleTokenPrice ?? 0) * topUp * markup);
  const outputTokenPriceToCustomer = roundTo10Decimals((after.outputGoogleTokenPrice ?? 0) * topUp * markup);

  // 3. Update the calculated customer fields
  await event.data?.after.ref.update({
    applicationTokenPriceToCustomer,
    inputTokenPriceToCustomer,
    cachedInputTokenPriceToCustomer,
    outputTokenPriceToCustomer
  });

  console.log("Successfully recalculated and updated customer prices (including cached input) in Pricing/CostAndProfit.");
});
