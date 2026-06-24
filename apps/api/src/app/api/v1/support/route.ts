import { eq } from 'drizzle-orm';
import { merchants } from '@lumina/db';
import { SupportRequestSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { emailSenderFromEnv } from '@/lib/email';
import { createSupportLimiter } from '@/lib/ratelimit';
import { sendSupportRequest } from '@/lib/support/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where support tickets are delivered (overridable via env). */
function supportAddress(): string {
  return process.env.SUPPORT_EMAIL ?? 'support@rdlabs.digital';
}

/** POST /v1/support — relay a merchant's technical-support request to the YuzuView team by email. */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }

  const limiter = createSupportLimiter(process.env);
  if (!(await limiter.check(guard.merchantId))) {
    return errorResponse('rate_limited', 'Too many support requests — please try again later.');
  }

  const parsed = SupportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Enter a subject (3+ chars) and a message (10+ chars).');
  }

  const [merchant] = await guard.db
    .select({ name: merchants.name, plan: merchants.plan })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);

  try {
    await sendSupportRequest(
      { email: emailSenderFromEnv(process.env), supportAddress: supportAddress() },
      {
        merchantId: guard.merchantId,
        merchantName: merchant?.name,
        plan: merchant?.plan,
        userEmail: guard.user.email,
        category: parsed.data.category,
        subject: parsed.data.subject,
        message: parsed.data.message,
      },
    );
  } catch {
    return serverError('Could not send your support request. Please try again.');
  }

  return jsonResponse({ ok: true });
}
