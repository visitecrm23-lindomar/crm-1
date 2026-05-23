import Stripe from "stripe";

const PLANS = [
  {
    name: "Pro",
    slug: "pro",
    description: "Para agências em crescimento",
    monthlyPriceBRL: 9700,
    annualPriceBRL: 97000,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description: "Para grandes operadoras",
    monthlyPriceBRL: 39700,
    annualPriceBRL: 397000,
  },
];

async function main() {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is required. Set it before running this script."
    );
  }

  const stripe = new Stripe(secretKey);
  console.log("Seeding Stripe products and prices for VisiteCRM plans...");

  for (const plan of PLANS) {
    const productName = `VisiteCRM ${plan.name}`;

    const existing = await stripe.products.search({
      query: `name:'${productName}' AND active:'true'`,
    });

    let product: Stripe.Product;
    if (existing.data.length > 0) {
      product = existing.data[0]!;
      console.log(`Product already exists: ${productName} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: productName,
        description: plan.description,
        metadata: { slug: plan.slug },
      });
      console.log(`Created product: ${productName} (${product.id})`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });

    const hasMonthly = prices.data.some(
      (p) =>
        p.recurring?.interval === "month" &&
        p.unit_amount === plan.monthlyPriceBRL &&
        p.currency === "brl"
    );
    if (!hasMonthly) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthlyPriceBRL,
        currency: "brl",
        recurring: { interval: "month" },
        metadata: { slug: plan.slug, cycle: "monthly" },
      });
      console.log(
        `  Created monthly price: R$${(plan.monthlyPriceBRL / 100).toFixed(2)}/mês (${price.id})`
      );
    } else {
      console.log(`  Monthly price already exists.`);
    }

    const hasAnnual = prices.data.some(
      (p) =>
        p.recurring?.interval === "year" &&
        p.unit_amount === plan.annualPriceBRL &&
        p.currency === "brl"
    );
    if (!hasAnnual) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.annualPriceBRL,
        currency: "brl",
        recurring: { interval: "year" },
        metadata: { slug: plan.slug, cycle: "annual" },
      });
      console.log(
        `  Created annual price: R$${(plan.annualPriceBRL / 100).toFixed(2)}/ano (${price.id})`
      );
    } else {
      console.log(`  Annual price already exists.`);
    }
  }

  console.log("\nDone! Stripe products and prices are ready.");
  console.log(
    "Set STRIPE_WEBHOOK_SECRET after creating a webhook endpoint that points to /api/webhooks/stripe."
  );
}

main().catch((err) => {
  console.error("seed-stripe-plans failed:", err);
  process.exit(1);
});
