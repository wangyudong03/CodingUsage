export interface TraeUsageData {
    advanced_model_amount: number;
    advanced_model_request_usage: number;
    auto_completion_amount: number;
    auto_completion_usage: number;
    is_flash_consuming: boolean;
    premium_model_fast_amount: number;
    premium_model_fast_request_usage: number;
    premium_model_slow_amount: number;
    premium_model_slow_request_usage: number;
}

export interface TraeQuotaData {
    advanced_model_request_limit: number;
    auto_completion_limit: number;
    premium_model_fast_request_limit: number;
    premium_model_slow_request_limit: number;
}

export interface TraeEntitlementPack {
    entitlement_base_info: {
        end_time: number;
        quota: TraeQuotaData;
        user_id: string;
        start_time: number;
        product_type?: number;
        entitlement_id?: string;
        charge_amount?: number;
        currency?: number;
        product_extra?: any;
    };
    usage: TraeUsageData;
    status: number;
    expire_time?: number;
    is_last_period?: boolean;
    next_billing_time?: number;
    source_id?: string;
    yearly_expire_time?: number;
}

export interface TraeApiResponse {
    code?: number;
    message?: string;
    is_pay_freshman: boolean;
    user_entitlement_pack_list: TraeEntitlementPack[];
}

export interface TraeTokenResponse {
    ResponseMetadata: {
        RequestId: string;
        TraceID: string;
        Action: string;
        Version: string;
        Source: string;
        Service: string;
        Region: string;
        WID: null;
        OID: null;
        Error?: {
            Code: string;
            Message: string;
        };
    };
    Result: {
        Token: string;
        ExpiredAt: string;
        UserID: string;
        TenantID: string;
    };
}

export interface TraeUsageStats {
    totalUsage: number;
    totalLimit: number;
    hasValidPacks: boolean;
}

export interface TraeSecondaryAccountData {
    usageData: TraeApiResponse;
    sessionId: string;
}























