import type { PaymentMethodDetails } from './';
export declare namespace Refund {
    type Props = {
        id: string;
        amount?: number;
        balanceTransaction?: string;
        chargeId?: string;
        created?: string;
        currency?: string;
        description?: string;
        failureBalanceTransaction?: string;
        failureReason?: string;
        metadata?: Record<string, string>;
        paymentIntentId?: string;
        paymentMethodDetails?: PaymentMethodDetails;
        reason?: string;
        receiptNumber?: string;
        sourceTransferReversal?: string;
        status?: Status;
        transferReversal?: string;
    };
    type Status = 'succeeded' | 'failed' | 'pending' | 'unknown';
}
