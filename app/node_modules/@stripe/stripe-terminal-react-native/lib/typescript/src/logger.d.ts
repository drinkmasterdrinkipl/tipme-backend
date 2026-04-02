interface Trace {
    origin_role: string;
    origin_id: string;
    trace: {
        action_id: string;
        request_info: {
            user_agent: string;
        };
        start_time_ms: number;
        total_time_ms: number;
        service: string;
        method: string;
        request: string;
        response?: string;
        exception?: string;
        version_info: {
            client_type: string;
            client_version: string;
        };
        traces: string[];
        additional_context: {
            action_id: string;
            session_id: string;
            serial_number: string;
        };
    };
}
/**
 * A singleton class whose instance exists for the lifetime of the RN SDK.
 * This class batches traces and sends them to Client-Logger, a Stripe-internal
 * analytics service.
 *
 * The instance holds onto traces, and holds a timer that flushes the collected
 * traces (currently every 10 seconds).
 */
export default class Logger {
    static instance: Logger | null;
    static posId: string;
    _traces: Array<Trace>;
    static getInstance(): Logger;
    constructor();
    /**
     * A method that traces that an inner function (`fn`) was called. This should
     * wrap the entire method body of a public facing Terminal SDK method.
     * This method logs the function parameters with which the function was called,
     * and the response that gets sent back to the user.
     *
     * @param fn The inner function that should be called and traced.
     * @param methodName The name of the SDK method that's getting traced.
     * @returns A function that should be called with `fn`'s args.
     */
    static traceSdkMethod(fn: (...args: any[]) => any | Promise<any>, methodName: string): (this: any, ...args: any[]) => any;
    private static flushTraces;
    private static getEventPayload;
    private static tracePromise;
    private static traceSuccess;
    private static traceError;
    private static traceException;
}
export {};
